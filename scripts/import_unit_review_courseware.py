#!/usr/bin/env python3
"""Register the three static unit-review courseware files in the catalogue."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pwd
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Animation, Subject, TextbookNode, User  # noqa: E402
from app.routers.animations import (  # noqa: E402
    build_file_url,
    process_courseware_upload,
    remove_courseware_path,
    validate_courseware,
)

MARKER = "[EduSimu unit review static import]"
REVIEW_SECTION = "单元复习"
ITEMS = [
    {
        "slug": "gravity-unit",
        "title": "万有引力与宇宙航行 · 全单元交互课件",
        "book": "必修第二册",
        "chapter": "第七章 万有引力与宇宙航行",
        "description": "覆盖行星运动、万有引力定律、宇宙航行与单元归纳，支持课堂演示、知识图、连续复习和课后作业。",
        "keywords": "单元复习,万有引力,宇宙航行,开普勒定律,卫星,高中物理",
    },
    {
        "slug": "mechanical-energy-unit",
        "title": "机械能与能量守恒 · 全单元交互课件",
        "book": "必修第二册",
        "chapter": "第八章 机械能守恒定律",
        "description": "覆盖功、功率、势能、动能定理和机械能守恒，支持课堂演示、知识图、连续复习和课后作业。",
        "keywords": "单元复习,机械能,能量守恒,动能定理,功率,高中物理",
    },
    {
        "slug": "momentum-unit",
        "title": "动量与动量守恒定律 · 全单元交互课件",
        "book": "选择性必修第一册",
        "chapter": "第一章 动量守恒定律",
        "description": "覆盖动量、冲量、动量定理、动量守恒和碰撞，支持课堂演示、知识图、连续复习和课后作业。",
        "keywords": "单元复习,动量,冲量,动量守恒,碰撞,高中物理",
    },
]


def source_url(item: dict) -> str:
    return f"/edusimu/unit-review/{item['slug']}/index.html"


def source_path(item: dict) -> Path:
    return ROOT / "frontend" / "public" / "unit-review" / item["slug"] / "index.html"


def find_chapter(db, subject_id: int, item: dict) -> TextbookNode:
    books = db.query(TextbookNode).filter(
        TextbookNode.subject_id == subject_id,
        TextbookNode.node_type == "book",
        TextbookNode.name == item["book"],
    ).all()
    if len(books) != 1:
        raise RuntimeError(f"教材分册匹配数量异常：{item['book']}（{len(books)} 个）")
    chapters = db.query(TextbookNode).filter(
        TextbookNode.subject_id == subject_id,
        TextbookNode.parent_id == books[0].id,
        TextbookNode.node_type == "chapter",
        TextbookNode.name == item["chapter"],
    ).all()
    if len(chapters) != 1:
        raise RuntimeError(f"教材章节匹配数量异常：{item['chapter']}（{len(chapters)} 个）")
    return chapters[0]


def marker_matches(db, item: dict) -> list[Animation]:
    url = source_url(item)
    rows = db.query(Animation).filter(
        Animation.description.contains(MARKER) | Animation.review_notes.contains(MARKER)
    ).all()
    return [
        row for row in rows
        if any(text and f"Source: {url}" in text for text in (row.description, row.review_notes))
    ]


def inspect_items(db, subject_id: int) -> list[dict]:
    results = []
    for item in ITEMS:
        path = source_path(item)
        content = path.read_bytes()
        validation_status, summary, errors, warnings = validate_courseware(content)
        chapter = find_chapter(db, subject_id, item)
        sections = db.query(TextbookNode).filter(
            TextbookNode.parent_id == chapter.id,
            TextbookNode.name == REVIEW_SECTION,
        ).all()
        if len(sections) > 1:
            raise RuntimeError(f"复习节目录重复：{item['chapter']} / {REVIEW_SECTION}")
        registered = marker_matches(db, item)
        if len(registered) > 1:
            raise RuntimeError(f"同一来源已登记多次：{source_url(item)}")
        title_matches = db.query(Animation).filter(
            Animation.subject_id == subject_id,
            Animation.title == item["title"],
        ).all()
        unowned_title_matches = [row for row in title_matches if row.id not in {a.id for a in registered}]
        results.append({
            "slug": item["slug"],
            "title": item["title"],
            "source_url": source_url(item),
            "source_bytes": len(content),
            "source_sha256": hashlib.sha256(content).hexdigest(),
            "validation_status": validation_status,
            "validation_summary": summary,
            "validation_errors": errors,
            "validation_warnings": warnings,
            "chapter_id": chapter.id,
            "chapter_path": f"{item['book']} / {item['chapter']} / {REVIEW_SECTION}",
            "review_section_id": sections[0].id if sections else None,
            "registered": [
                {"id": row.id, "published": row.is_published, "file_path": row.file_path}
                for row in registered
            ],
            "unowned_title_matches": [
                {"id": row.id, "file_path": row.file_path} for row in unowned_title_matches
            ],
        })
    return results


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("inspect", "apply"))
    parser.add_argument("--report", type=Path, default=ROOT / "tmp" / "unit-review-import-report.json")
    args = parser.parse_args()

    db = SessionLocal()
    new_file_paths: list[str] = []
    committed = False
    try:
        subject = db.query(Subject).filter(Subject.name == "physics").first()
        if not subject:
            raise RuntimeError("未找到物理学科")
        creator = db.query(User).filter(User.username == "admin").first()
        if not creator:
            raise RuntimeError("未找到 admin 创建者")
        items = inspect_items(db, subject.id)
        report = {
            "mode": args.action,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "subject_id": subject.id,
            "items": items,
            "imported": [],
            "skipped": [],
        }
        problems = [
            {"slug": item["slug"], "errors": item["validation_errors"], "unowned_title_matches": item["unowned_title_matches"]}
            for item in items
            if item["validation_errors"] or item["unowned_title_matches"]
        ]
        if problems:
            report["problems"] = problems
            raise RuntimeError("预检发现校验错误或未登记的同名课件，停止执行")

        if args.action == "apply":
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup_dir = Path("/var/www/edusimu/backups") / f"unit-review-{timestamp}"
            backup_dir.mkdir(parents=True, exist_ok=False)
            database_backup = backup_dir / "edusimu-postgresql.dump"
            backup_database(database_backup)
            report["backup_dir"] = str(backup_dir)
            report["database_backup"] = str(database_backup)

            old_file_paths = []
            for item, inspected in zip(ITEMS, items):
                animation = None
                if inspected["registered"]:
                    animation = db.query(Animation).filter(
                        Animation.id == inspected["registered"][0]["id"]
                    ).one()
                    current_path = Path(animation.file_path)
                    if current_path.is_file() and hashlib.sha256(current_path.read_bytes()).hexdigest() == inspected["source_sha256"]:
                        report["skipped"].append({"slug": item["slug"], "animation_id": animation.id, "reason": "content unchanged"})
                        continue

                chapter = db.query(TextbookNode).filter(TextbookNode.id == inspected["chapter_id"]).one()
                section_id = inspected["review_section_id"]
                if section_id:
                    section = db.query(TextbookNode).filter(TextbookNode.id == section_id).one()
                else:
                    max_sort = db.query(TextbookNode.sort_order).filter(
                        TextbookNode.parent_id == chapter.id
                    ).order_by(TextbookNode.sort_order.desc()).first()
                    section = TextbookNode(
                        subject_id=subject.id,
                        parent_id=chapter.id,
                        name=REVIEW_SECTION,
                        node_type="section",
                        sort_order=(max_sort[0] if max_sort else 0) + 1,
                    )
                    db.add(section)
                    db.flush()

                content = source_path(item).read_bytes()
                file_path, saved_size, validation_status, summary, errors, warnings = process_courseware_upload(
                    content, f"{item['slug']}.html", subject.id
                )
                new_file_paths.append(file_path)
                if validation_status != "passed" or errors:
                    raise RuntimeError(f"课件登记校验失败：{item['title']}：{'；'.join(errors)}")
                own_for_web(Path(file_path).parent)
                description = item["description"]
                metadata = f"{MARKER}\nSource: {source_url(item)}"
                action = "updated" if animation else "imported"
                old_file_path = animation.file_path if animation else None
                if animation:
                    animation.textbook_node_id = section.id
                    animation.description = description
                    existing_notes = (animation.review_notes or "").strip()
                    if metadata not in existing_notes:
                        animation.review_notes = "\n\n".join(filter(None, (existing_notes, metadata)))
                    animation.file_path = file_path
                    animation.file_size = saved_size
                    animation.is_published = True
                    animation.review_status = "approved"
                    animation.validation_status = validation_status
                    animation.validation_summary = summary
                    animation.validation_errors = json.dumps(errors, ensure_ascii=False)
                    animation.validation_warnings = json.dumps(warnings, ensure_ascii=False)
                else:
                    animation = Animation(
                        title=item["title"],
                        subject_id=subject.id,
                        textbook_node_id=section.id,
                        description=description,
                        review_notes=metadata,
                        author=creator.real_name or creator.username,
                        file_path=file_path,
                        thumbnail=None,
                        grade_level="高中",
                        keywords=item["keywords"],
                        source_type="original",
                        is_published=True,
                        review_status="approved",
                        validation_status=validation_status,
                        validation_summary=summary,
                        validation_errors=json.dumps(errors, ensure_ascii=False),
                        validation_warnings=json.dumps(warnings, ensure_ascii=False),
                        file_size=saved_size,
                        created_by=creator.id,
                    )
                db.add(animation)
                db.flush()
                if old_file_path and old_file_path != file_path:
                    old_file_paths.append(old_file_path)
                report.setdefault(action, []).append({
                    "slug": item["slug"],
                    "animation_id": animation.id,
                    "title": animation.title,
                    "textbook_node_id": section.id,
                    "textbook_path": inspected["chapter_path"],
                    "file_url": build_file_url(file_path),
                    "published": animation.is_published,
                    "review_status": animation.review_status,
                    "validation_status": animation.validation_status,
                    "warnings": warnings,
                    "sha256": hashlib.sha256(Path(file_path).read_bytes()).hexdigest(),
                })
            db.commit()
            committed = True
            for old_file_path in old_file_paths:
                remove_courseware_path(old_file_path)

        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        db.rollback()
        if not committed:
            for path in new_file_paths:
                remove_courseware_path(path)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
