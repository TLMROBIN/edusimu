#!/usr/bin/env python3
"""Inspect or incrementally release prepared courseware content to production."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pwd
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, engine, settings  # noqa: E402
from app.models import Animation, Subject, TextbookNode, User  # noqa: E402
from app.routers.animations import (  # noqa: E402
    process_courseware_upload,
    remove_courseware_path,
    validate_courseware,
    validate_required_textbook_node,
)

AUTHOR = "莞高物理邱老师：动境物理"
MARKER = "[QuestionScope Future import]"
SOURCE_HOST = "https://questionscope.cn"
PROCESSED_DIR = ROOT / "tmp/questionscope-future/processed"
OPTIMIZED_DIR = ROOT / "tmp/questionscope-future/optimized"
FUTURE_THUMBNAIL_DIR = ROOT / "tmp/questionscope-future/thumbnails"
THUMBNAIL_DIR = ROOT / "tmp/courseware-thumbnails/final"
MANIFEST_PATH = ROOT / "tmp/courseware-thumbnails/manifest.json"
NGINX_SOURCE = ROOT / "nginx/edusimu.conf"
NGINX_LIVE = Path("/etc/nginx/sites-available/edusimu.conf")
BACKUP_ROOT = Path("/var/www/edusimu/backups")
REPORT_PATH = ROOT / "tmp/production-courseware-release-report.json"

CATALOG = [
    {"id": "drinking-bird", "title": "饮水鸟", "category": "热学", "node": "4. 热力学第二定律", "description": "它真的停不下来吗？亲手拆穿一只“永动”鸟。", "keywords": "未来课件,热学,热力学第二定律,饮水鸟"},
    {"id": "double-slit", "title": "双缝", "category": "光学", "node": "4. 实验：用双缝干涉测量光的波长", "description": "沉浸式实验：亲手转手轮测出波长。", "keywords": "未来课件,光学,双缝干涉,波长测量"},
    {"id": "four-pins", "title": "四枚针", "category": "光学", "node": "1. 光的折射", "description": "趴下看针、亲手作图，测出折射率 n。", "keywords": "未来课件,光学,光的折射,折射率"},
    {"id": "planet-scoop", "title": "饕餮的一勺", "category": "力学", "node": "2. 万有引力定律", "description": "挖掉一勺，引力还剩多少。", "keywords": "未来课件,力学,万有引力,引力场"},
    {"id": "gravity-weight", "title": "苹果有多重", "category": "力学", "node": "2. 万有引力定律", "description": "重力只是引力的一个分力。", "keywords": "未来课件,力学,万有引力,重力"},
    {"id": "snell-window", "title": "水獭的视锥", "category": "光学", "node": "2. 全反射", "description": "水下抬头看见的圆窗。", "keywords": "未来课件,光学,全反射,斯涅尔窗口"},
    {"id": "hydrogen-levels", "title": "原子的台阶", "category": "近代物理", "node": "4. 氢原子光谱和玻尔的原子模型", "description": "氢原子能级与光谱。", "keywords": "未来课件,近代物理,氢原子,能级,光谱"},
    {"id": "chain-reaction", "title": "链式反应", "category": "近代物理", "node": "4. 核裂变与核聚变", "description": "裂变、临界与反应堆。", "keywords": "未来课件,近代物理,核裂变,链式反应,反应堆"},
    {"id": "mechanical-waves", "title": "振动的接力", "category": "力学", "node": "1. 波的形成", "description": "波的形成与驻波。", "keywords": "未来课件,力学,机械波,波的形成,驻波"},
    {"id": "invisible-orbits", "title": "看不见的轨道", "category": "力学", "node": "4. 宇宙航行", "description": "卫星怎样绕地球。", "keywords": "未来课件,力学,万有引力,宇宙航行,卫星轨道"},
    {"id": "instrument-reading", "title": "读数大师", "category": "综合", "node": "5. 实验：练习使用多用电表", "description": "十四件仪器读数。", "keywords": "未来课件,综合,物理实验,仪器读数"},
    {"id": "thin-film-flatness", "title": "劈尖干涉", "category": "光学", "node": "3. 光的干涉", "description": "用劈尖干涉检查平面平整度。", "keywords": "未来课件,光学,劈尖干涉,薄膜干涉"},
    {"id": "printer-feed-friction", "title": "打印机进纸", "category": "力学", "node": "2. 摩擦力", "description": "叠放体进纸与摩擦力。", "keywords": "未来课件,力学,摩擦力,打印机进纸"},
    {"id": "optical-fiber", "title": "光导纤维", "category": "光学", "node": "2. 全反射", "description": "全反射导光。", "keywords": "未来课件,光学,全反射,光导纤维"},
]


def source_url(slug: str) -> str:
    return f"{SOURCE_HOST}/experiments/{slug}"


def runtime_url(slug: str) -> str:
    return f"{SOURCE_HOST}/api/experiments/{slug}/runtime"


def relative_upload_url(file_path: str) -> str | None:
    if "/uploads/" not in file_path:
        return None
    return "/uploads/" + file_path.split("/uploads/", 1)[1]


def existing_sources(db) -> dict[str, Animation]:
    result = {}
    rows = db.query(Animation).filter(Animation.description.contains(MARKER)).all()
    for animation in rows:
        description = animation.description or ""
        if "Source: " in description:
            url = description.split("Source: ", 1)[1].split("\n", 1)[0]
            result[url] = animation
    return result


def match_thumbnails(db, animations: list[Animation]) -> tuple[list[dict], list[dict]]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_url = {}
    for animation in animations:
        url = relative_upload_url(animation.file_path)
        if url:
            by_url.setdefault(url, []).append(animation)
    local_title_counts = Counter(item["title"] for item in manifest)
    production_title_counts = Counter(animation.title for animation in animations)
    matches = []
    unmatched = []
    production_hashes = {}
    for item in manifest:
        candidates = by_url.get(item["url_path"], [])
        method = "relative_path"
        if len(candidates) != 1 and local_title_counts[item["title"]] == 1 and production_title_counts[item["title"]] == 1:
            candidates = [a for a in animations if a.title == item["title"]]
            method = "unique_title"
        source_html = MANIFEST_PATH.parent / "source" / f"courseware-{item['id']:04d}.html"
        if len(candidates) != 1 and source_html.is_file():
            digest = hashlib.sha256(source_html.read_bytes()).digest()
            content_candidates = []
            for animation in animations:
                if animation.id not in production_hashes:
                    try:
                        path = Path(animation.file_path)
                        production_hashes[animation.id] = hashlib.sha256(path.read_bytes()).digest() if path.is_file() else None
                    except OSError:
                        production_hashes[animation.id] = None
                if production_hashes[animation.id] == digest:
                    content_candidates.append(animation)
            candidates = content_candidates
            method = "content_sha256"
        source = THUMBNAIL_DIR / f"courseware-{item['id']:04d}.webp"
        if len(candidates) != 1 or not source.is_file():
            unmatched.append({"title": item["title"], "url_path": item["url_path"], "reason": "no unique production match" if len(candidates) != 1 else "thumbnail missing"})
            continue
        matches.append({"item": item, "animation": candidates[0], "source": source, "method": method})
    return matches, unmatched


def inspect(db) -> dict:
    animations = db.query(Animation).all()
    matches, unmatched = match_thumbnails(db, animations)
    subject_rows = db.execute(text(
        "SELECT s.display_name, COUNT(a.id), SUM(CASE WHEN a.thumbnail IS NOT NULL THEN 1 ELSE 0 END) "
        "FROM animations a JOIN subjects s ON s.id=a.subject_id "
        "GROUP BY s.id, s.display_name ORDER BY s.sort_order"
    )).all()
    node_results = []
    for name in sorted({item["node"] for item in CATALOG}):
        nodes = db.query(TextbookNode).filter(TextbookNode.subject_id == 4, TextbookNode.name == name).all()
        node_results.append({"name": name, "matches": [{"id": node.id, "parent_id": node.parent_id, "node_type": node.node_type} for node in nodes]})
    return {
        "mode": "inspect",
        "production_total": len(animations),
        "with_thumbnail": sum(bool(a.thumbnail) for a in animations),
        "questionscope_existing": len(existing_sources(db)),
        "max_id": max((a.id for a in animations), default=0),
        "physics_nodes": db.query(TextbookNode).filter(TextbookNode.subject_id == 4).count(),
        "subjects": [{"name": row[0], "total": row[1], "with_thumbnail": row[2] or 0} for row in subject_rows],
        "thumbnail_manifest_total": len(matches) + len(unmatched),
        "thumbnail_matches": len(matches),
        "thumbnail_path_matches": sum(m["method"] == "relative_path" for m in matches),
        "thumbnail_title_matches": sum(m["method"] == "unique_title" for m in matches),
        "thumbnail_unmatched": unmatched,
        "courseware_nodes": node_results,
        "prepared_html_files": len(list(PROCESSED_DIR.glob("*.html"))),
        "prepared_thumbnails": len(list(FUTURE_THUMBNAIL_DIR.glob("*.webp"))) + len(list(THUMBNAIL_DIR.glob("*.webp"))),
        "nginx_source_present": NGINX_SOURCE.is_file(),
    }


def validate_webp(path: Path) -> bytes:
    data = path.read_bytes()
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise RuntimeError(f"无效 WebP：{path}")
    return data


def own_for_web(path: Path) -> None:
    try:
        account = pwd.getpwnam("www-data")
    except KeyError:
        return
    paths = [path]
    if path.is_dir():
        paths.extend(Path(root) / name for root, dirs, files in os.walk(path) for name in dirs + files)
    for item in paths:
        os.chown(item, account.pw_uid, account.pw_gid)


def install_thumbnail(animation: Animation, source: Path, prefix: str) -> dict:
    data = validate_webp(source)
    digest = hashlib.sha256(data).hexdigest()[:12]
    target_name = f"{prefix}-{animation.id}-{digest}.webp"
    target = Path(settings.upload_dir) / "thumbnails" / target_name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes(data)
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
    own_for_web(target)
    url = f"/uploads/thumbnails/{target_name}"
    changed = animation.thumbnail != url
    animation.thumbnail = url
    return {"animation_id": animation.id, "title": animation.title, "thumbnail": url, "bytes": len(data), "changed": changed}


def backup_database(destination: Path) -> None:
    url = engine.url
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("生产备份仅支持 PostgreSQL")
    command = ["pg_dump", "--format=custom", "--file", str(destination)]
    if url.host:
        command.extend(["--host", url.host])
    if url.port:
        command.extend(["--port", str(url.port)])
    if url.username:
        command.extend(["--username", url.username])
    command.append(url.database or "")
    environment = os.environ.copy()
    if url.password:
        environment["PGPASSWORD"] = url.password
    subprocess.run(command, check=True, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if not destination.is_file() or destination.stat().st_size == 0:
        raise RuntimeError("数据库备份未生成有效文件")


def preflight(db) -> dict[int, TextbookNode]:
    if not db.query(Subject).filter(Subject.id == 4).first():
        raise RuntimeError("生产物理学科不存在")
    if not db.query(User).filter(User.username == "admin").first():
        raise RuntimeError("生产 admin 用户不存在")
    resolved = {}
    for name in {item["node"] for item in CATALOG}:
        nodes = db.query(TextbookNode).filter(TextbookNode.subject_id == 4, TextbookNode.name == name).all()
        if len(nodes) != 1:
            raise RuntimeError(f"教材节点无法唯一匹配：{name}（{len(nodes)} 个）")
        validate_required_textbook_node(db, 4, nodes[0].id)
        resolved[nodes[0].id] = nodes[0]
    for item in CATALOG:
        content_path = OPTIMIZED_DIR / f"{item['id']}.html" if item["id"] == "invisible-orbits" else PROCESSED_DIR / f"{item['id']}.html"
        content = content_path.read_bytes()
        _, _, errors, _ = validate_courseware(content)
        if errors:
            raise RuntimeError(f"课件校验失败：{item['title']}：{'；'.join(errors)}")
        validate_webp(FUTURE_THUMBNAIL_DIR / f"questionscope-{item['id']}.webp")
    return resolved


def apply(db) -> dict:
    resolved_nodes = preflight(db)
    before_total = db.query(Animation).count()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / f"courseware-content-{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    database_backup = backup_dir / "edusimu-postgresql.dump"
    backup_database(database_backup)
    if NGINX_LIVE.is_file():
        shutil.copy2(NGINX_LIVE, backup_dir / "edusimu.conf")

    report = {
        "mode": "apply",
        "started_at": timestamp,
        "production_total_before": before_total,
        "backup_dir": str(backup_dir),
        "database_backup": str(database_backup),
        "imported": [],
        "skipped": [],
        "failed": [],
        "future_thumbnails": [],
        "other_thumbnails": [],
        "other_thumbnails_unmatched": [],
    }
    sources = existing_sources(db)
    creator = db.query(User).filter(User.username == "admin").first()
    node_by_name = {node.name: node for node in resolved_nodes.values()}

    for item in CATALOG:
        slug = item["id"]
        page_url = source_url(slug)
        animation = sources.get(page_url)
        try:
            if animation:
                report["skipped"].append({"id": slug, "animation_id": animation.id, "reason": "already imported"})
            else:
                content_path = OPTIMIZED_DIR / f"{slug}.html" if slug == "invisible-orbits" else PROCESSED_DIR / f"{slug}.html"
                content = content_path.read_bytes()
                file_path = None
                try:
                    file_path, saved_size, validation_status, summary, upload_errors, upload_warnings = process_courseware_upload(content, f"questionscope-{slug}.html", 4)
                    node = node_by_name[item["node"]]
                    description = (
                        f"{item['description']}\n\n{MARKER}\nSource: {page_url}\nRuntime: {runtime_url(slug)}\n"
                        f"Author/Source: {AUTHOR}\nCategory: {item['category']}\n"
                        "Publicly accessible courseware imported for local offline classroom use; original attribution and source watermark retained."
                    )
                    animation = Animation(
                        title=item["title"], subject_id=4, textbook_node_id=node.id, description=description,
                        author=AUTHOR, file_path=file_path, thumbnail=None, grade_level="高中", keywords=item["keywords"],
                        source_type="original", is_published=True, review_status="approved",
                        validation_status=validation_status, validation_summary=summary,
                        validation_errors=json.dumps(upload_errors, ensure_ascii=False),
                        validation_warnings=json.dumps(upload_warnings, ensure_ascii=False),
                        file_size=saved_size, created_by=creator.id,
                    )
                    db.add(animation)
                    db.commit()
                    db.refresh(animation)
                    own_for_web(Path(file_path).parent)
                except Exception:
                    db.rollback()
                    if file_path:
                        remove_courseware_path(file_path)
                    raise
                sources[page_url] = animation
                report["imported"].append({"id": slug, "animation_id": animation.id, "title": animation.title, "file_path": animation.file_path, "bytes": saved_size})
            thumbnail = install_thumbnail(animation, FUTURE_THUMBNAIL_DIR / f"questionscope-{slug}.webp", f"questionscope-{slug}")
            db.commit()
            report["future_thumbnails"].append(thumbnail)
        except Exception as exc:
            db.rollback()
            report["failed"].append({"id": slug, "title": item["title"], "error": str(exc)})

    animations = db.query(Animation).all()
    matches, unmatched = match_thumbnails(db, animations)
    report["other_thumbnails_unmatched"] = unmatched
    for match in matches:
        try:
            result = install_thumbnail(match["animation"], match["source"], "courseware")
            result["match_method"] = match["method"]
            db.commit()
            report["other_thumbnails"].append(result)
        except Exception as exc:
            db.rollback()
            report["other_thumbnails_unmatched"].append({"title": match["animation"].title, "reason": str(exc)})

    nginx = {"deployed": False}
    if NGINX_SOURCE.is_file():
        try:
            temporary = NGINX_LIVE.with_suffix(".conf.courseware-tmp")
            shutil.copy2(NGINX_SOURCE, temporary)
            os.replace(temporary, NGINX_LIVE)
            subprocess.run(["nginx", "-t"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            nginx = {"deployed": True, "config": str(NGINX_LIVE)}
        except Exception as exc:
            saved = backup_dir / "edusimu.conf"
            if saved.is_file():
                shutil.copy2(saved, NGINX_LIVE)
                subprocess.run(["nginx", "-t"], check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                subprocess.run(["systemctl", "reload", "nginx"], check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            nginx = {"deployed": False, "error": str(exc), "restored": saved.is_file()}
    report["nginx"] = nginx
    report["production_total_after"] = db.query(Animation).count()
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["inspect", "apply"])
    args = parser.parse_args()
    db = SessionLocal()
    report = None
    try:
        report = inspect(db) if args.action == "inspect" else apply(db)
    finally:
        db.close()
        if report is not None:
            REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
            REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.chmod(REPORT_PATH, 0o644)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report.get("failed") or not report.get("nginx", {"deployed": True}).get("deployed") else 0


if __name__ == "__main__":
    raise SystemExit(main())
