#!/usr/bin/env python3
"""Prepare and import QuestionScope's 14 public Future Courseware pages.

Download the runtime wrappers separately with ego-browser, then run this script
without --prepare-only to extract their embedded HTML, remove only the remote
lease heartbeat, and pass each result through EduSimu's normal upload pipeline.
Author attribution and the source watermark are preserved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import Animation, Subject, TextbookNode, User
from app.routers.animations import (
    process_courseware_upload,
    remove_courseware_path,
    validate_courseware,
    validate_required_textbook_node,
)

SOURCE_HOST = "https://questionscope.cn"
AUTHOR = "莞高物理邱老师：动境物理"
MARKER = "[QuestionScope Future import]"
RAW_DIR = ROOT_DIR / "tmp/questionscope-future/raw"
PROCESSED_DIR = ROOT_DIR / "tmp/questionscope-future/processed"
DEFAULT_REPORT = ROOT_DIR / "tmp/questionscope-future/import-report.json"

CATALOG = [
    {"id": "drinking-bird", "title": "饮水鸟", "category": "热学", "node_id": 247, "description": "它真的停不下来吗？亲手拆穿一只“永动”鸟。", "keywords": "未来课件,热学,热力学第二定律,饮水鸟"},
    {"id": "double-slit", "title": "双缝", "category": "光学", "node_id": 201, "description": "沉浸式实验：亲手转手轮测出波长。", "keywords": "未来课件,光学,双缝干涉,波长测量"},
    {"id": "four-pins", "title": "四枚针", "category": "光学", "node_id": 198, "description": "趴下看针、亲手作图，测出折射率 n。", "keywords": "未来课件,光学,光的折射,折射率"},
    {"id": "planet-scoop", "title": "饕餮的一勺", "category": "力学", "node_id": 137, "description": "挖掉一勺，引力还剩多少。", "keywords": "未来课件,力学,万有引力,引力场"},
    {"id": "gravity-weight", "title": "苹果有多重", "category": "力学", "node_id": 137, "description": "重力只是引力的一个分力。", "keywords": "未来课件,力学,万有引力,重力"},
    {"id": "snell-window", "title": "水獭的视锥", "category": "光学", "node_id": 199, "description": "水下抬头看见的圆窗。", "keywords": "未来课件,光学,全反射,斯涅尔窗口"},
    {"id": "hydrogen-levels", "title": "原子的台阶", "category": "近代物理", "node_id": 252, "description": "氢原子能级与光谱。", "keywords": "未来课件,近代物理,氢原子,能级,光谱"},
    {"id": "chain-reaction", "title": "链式反应", "category": "近代物理", "node_id": 258, "description": "裂变、临界与反应堆。", "keywords": "未来课件,近代物理,核裂变,链式反应,反应堆"},
    {"id": "mechanical-waves", "title": "振动的接力", "category": "力学", "node_id": 192, "description": "波的形成与驻波。", "keywords": "未来课件,力学,机械波,波的形成,驻波"},
    {"id": "invisible-orbits", "title": "看不见的轨道", "category": "力学", "node_id": 139, "description": "卫星怎样绕地球。", "keywords": "未来课件,力学,万有引力,宇宙航行,卫星轨道"},
    {"id": "instrument-reading", "title": "读数大师", "category": "综合", "node_id": 164, "description": "十四件仪器读数。", "keywords": "未来课件,综合,物理实验,仪器读数"},
    {"id": "thin-film-flatness", "title": "劈尖干涉", "category": "光学", "node_id": 200, "description": "用劈尖干涉检查平面平整度。", "keywords": "未来课件,光学,劈尖干涉,薄膜干涉"},
    {"id": "printer-feed-friction", "title": "打印机进纸", "category": "力学", "node_id": 113, "description": "叠放体进纸与摩擦力。", "keywords": "未来课件,力学,摩擦力,打印机进纸"},
    {"id": "optical-fiber", "title": "光导纤维", "category": "光学", "node_id": 199, "description": "全反射导光。", "keywords": "未来课件,光学,全反射,光导纤维"},
]

SOURCE_HTML_RE = re.compile(r'\bvar\s+sourceHtml\s*=\s*(?P<value>"(?:\\.|[^"\\])*")\s*;')
SCRIPT_RE = re.compile(r"<script\b[^>]*>[\s\S]*?</script>", re.IGNORECASE)


def source_url(slug: str) -> str:
    return f"{SOURCE_HOST}/experiments/{slug}"


def runtime_url(slug: str) -> str:
    return f"{SOURCE_HOST}/api/experiments/{slug}/runtime"


def extract_embedded_html(raw: str, slug: str) -> tuple[str, int]:
    match = SOURCE_HTML_RE.search(raw)
    if not match:
        raise ValueError("运行时页面中未找到内嵌 sourceHtml")
    source_html = json.loads(match.group("value"))
    removed = 0

    def remove_lease_script(script_match: re.Match[str]) -> str:
        nonlocal removed
        script = script_match.group(0)
        lease_path = f"/api/experiments/{slug}/lease"
        if lease_path in script and "setInterval" in script:
            removed += 1
            return "<!-- EduSimu offline adaptation: remote lease heartbeat removed; attribution retained. -->"
        return script

    source_html = SCRIPT_RE.sub(remove_lease_script, source_html)
    if removed != 1:
        raise ValueError(f"预期移除 1 个登录心跳脚本，实际为 {removed}")
    if f"/api/experiments/{slug}/lease" in source_html:
        raise ValueError("课件仍包含原站登录心跳路径")
    return source_html, removed


def existing_source_urls(db) -> set[str]:
    urls = set()
    rows = db.query(Animation.description).filter(Animation.description.contains(MARKER)).all()
    for (description,) in rows:
        if description and "Source: " in description:
            urls.add(description.split("Source: ", 1)[1].split("\n", 1)[0])
    return urls


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入动境物理的 14 个未来课件")
    parser.add_argument("--prepare-only", action="store_true", help="只提取并校验，不写入数据库")
    parser.add_argument("--creator", default="admin")
    parser.add_argument("--subject-id", type=int, default=4)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "source": f"{SOURCE_HOST}/start",
        "author": AUTHOR,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "mode": "prepare-only" if args.prepare_only else "import",
        "total": len(CATALOG),
        "prepared": [],
        "imported": [],
        "skipped": [],
        "failed": [],
    }

    db = SessionLocal()
    try:
        subject = db.query(Subject).filter(Subject.id == args.subject_id).first()
        if not subject:
            raise SystemExit(f"学科不存在：{args.subject_id}")
        creator = db.query(User).filter(User.username == args.creator).first()
        if not creator and not args.prepare_only:
            raise SystemExit(f"创建者不存在：{args.creator}")
        known_sources = existing_source_urls(db)

        for index, item in enumerate(CATALOG, start=1):
            slug = item["id"]
            page_url = source_url(slug)
            raw_path = RAW_DIR / f"{slug}.html"
            processed_path = PROCESSED_DIR / f"{slug}.html"
            result = {"id": slug, "title": item["title"], "source_url": page_url}
            try:
                raw = raw_path.read_text(encoding="utf-8")
                html, removed = extract_embedded_html(raw, slug)
                processed = html.encode("utf-8")
                processed_path.write_bytes(processed)
                validation_status, summary, errors, warnings = validate_courseware(processed)
                result.update({
                    "bytes": len(processed),
                    "sha256": hashlib.sha256(processed).hexdigest(),
                    "lease_scripts_removed": removed,
                    "validation_status": validation_status,
                    "validation_summary": summary,
                    "validation_errors": errors,
                    "validation_warnings": warnings,
                })
                report["prepared"].append(result.copy())
                print(f"[{index}/{len(CATALOG)}] 已提取：{item['title']}（{len(processed)} 字节）")

                if args.prepare_only:
                    continue
                if page_url in known_sources:
                    report["skipped"].append(result | {"reason": "already imported"})
                    continue
                if errors:
                    raise ValueError(f"离线校验未通过：{summary}；{'；'.join(errors)}")

                validate_required_textbook_node(db, args.subject_id, item["node_id"])
                file_path = None
                try:
                    file_path, saved_size, validation_status, summary, upload_errors, upload_warnings = process_courseware_upload(
                        processed, f"questionscope-{slug}.html", args.subject_id
                    )
                    description = (
                        f"{item['description']}\n\n{MARKER}\n"
                        f"Source: {page_url}\nRuntime: {runtime_url(slug)}\n"
                        f"Author/Source: {AUTHOR}\nCategory: {item['category']}\n"
                        "Publicly accessible courseware imported for local offline classroom use; "
                        "original attribution and source watermark retained."
                    )
                    animation = Animation(
                        title=item["title"],
                        subject_id=args.subject_id,
                        textbook_node_id=item["node_id"],
                        description=description,
                        author=AUTHOR,
                        file_path=file_path,
                        thumbnail=None,
                        grade_level="高中",
                        keywords=item["keywords"],
                        source_type="original",
                        is_published=True,
                        review_status="approved",
                        validation_status=validation_status,
                        validation_summary=summary,
                        validation_errors=json.dumps(upload_errors, ensure_ascii=False),
                        validation_warnings=json.dumps(upload_warnings, ensure_ascii=False),
                        file_size=saved_size,
                        created_by=creator.id,
                    )
                    db.add(animation)
                    db.commit()
                    db.refresh(animation)
                except Exception:
                    db.rollback()
                    if file_path:
                        remove_courseware_path(file_path)
                    raise

                known_sources.add(page_url)
                report["imported"].append(result | {
                    "animation_id": animation.id,
                    "textbook_node_id": item["node_id"],
                    "file_path": file_path,
                    "saved_bytes": saved_size,
                    "upload_warnings": upload_warnings,
                })
                print(f"    已导入并发布：ID {animation.id}")
            except Exception as exc:
                db.rollback()
                report["failed"].append(result | {"error": str(exc)})
                print(f"[{index}/{len(CATALOG)}] 失败：{item['title']}：{exc}", file=sys.stderr)
    finally:
        db.close()
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({key: len(report[key]) for key in ("prepared", "imported", "skipped", "failed")}, ensure_ascii=False))
    return 0 if not report["failed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
