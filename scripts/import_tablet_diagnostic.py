#!/usr/bin/env python3
"""Inspect or register the tablet diagnostic utility as published courseware."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import Animation, Subject, TextbookNode, User  # noqa: E402
from app.routers.animations import (  # noqa: E402
    build_file_url,
    evaluate_animation_file_performance,
    process_courseware_upload,
    remove_courseware_path,
    validate_courseware,
)
from import_unit_review_courseware import backup_database, own_for_web  # noqa: E402

SOURCE = ROOT / "courseware" / "mech-lab-2027" / "tools" / "平板检测.html"
TITLE = "平板性能检测"
BOOK = "拓展资源"
CHAPTER = "教学工具"
SECTION = "设备检测"
DESCRIPTION = "用于在学生平板上检测浏览器内核、屏幕、触控与动画帧率，辅助排查课件卡顿和兼容性问题。"
KEYWORDS = "平板,性能检测,设备检测,浏览器,帧率,触控,教学工具"
MARKER = "[EduSimu tablet diagnostic import]\nSource: courseware/mech-lab-2027/tools/平板检测.html"


def inspect_catalog(db) -> None:
    content = SOURCE.read_bytes()
    validation_status, summary, errors, warnings = validate_courseware(content)
    print(f"SOURCE: {SOURCE}")
    print(f"VALIDATION: {validation_status}; {summary}; errors={errors}; warnings={warnings}")
    if validation_status != "passed" or errors:
        raise RuntimeError("课件校验未通过，停止登记")
    matches = db.query(Animation).filter(Animation.title == TITLE).order_by(Animation.id).all()
    if len(matches) > 1:
        raise RuntimeError(f"发现 {len(matches)} 条同名课件，停止登记")
    print("TITLE_MATCHES:", [(row.id, row.subject_id, row.textbook_node_id, row.is_published) for row in matches])


def get_or_create_node(db, subject_id: int, parent_id: int | None, name: str, node_type: str) -> TextbookNode:
    query = db.query(TextbookNode).filter(
        TextbookNode.subject_id == subject_id,
        TextbookNode.parent_id == parent_id,
        TextbookNode.name == name,
        TextbookNode.node_type == node_type,
    )
    matches = query.all()
    if len(matches) > 1:
        raise RuntimeError(f"教材目录重复：{name}")
    if matches:
        return matches[0]
    max_sort = db.query(TextbookNode.sort_order).filter(
        TextbookNode.subject_id == subject_id,
        TextbookNode.parent_id == parent_id,
    ).order_by(TextbookNode.sort_order.desc()).first()
    node = TextbookNode(
        subject_id=subject_id,
        parent_id=parent_id,
        name=name,
        node_type=node_type,
        sort_order=(max_sort[0] if max_sort else 0) + 1,
    )
    db.add(node)
    db.flush()
    return node


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("inspect", "apply", "unpublish"))
    args = parser.parse_args()

    db = SessionLocal()
    new_file_path = None
    old_file_path = None
    committed = False
    try:
        inspect_catalog(db)
        if args.action == "inspect":
            return 0

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = Path("/var/www/edusimu/backups") / f"tablet-diagnostic-{timestamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        database_backup = backup_dir / "edusimu-postgresql.dump"
        backup_database(database_backup)

        if args.action == "unpublish":
            animation = db.query(Animation).filter(Animation.title == TITLE).order_by(Animation.id).first()
            if not animation:
                raise RuntimeError("未找到要下架的课件")
            was_published = animation.is_published
            animation.is_published = False
            db.commit()
            db.refresh(animation)
            print(json.dumps({
                "mode": args.action,
                "animation_id": animation.id,
                "title": animation.title,
                "was_published": was_published,
                "published": animation.is_published,
                "review_status": animation.review_status,
                "textbook_node_id": animation.textbook_node_id,
                "database_backup": str(database_backup),
            }, ensure_ascii=False, indent=2))
            return 0

        subject = db.query(Subject).filter(Subject.name == "physics").one()
        creator = db.query(User).filter(User.username == "admin").one()
        book = get_or_create_node(db, subject.id, None, BOOK, "book")
        chapter = get_or_create_node(db, subject.id, book.id, CHAPTER, "chapter")
        section = get_or_create_node(db, subject.id, chapter.id, SECTION, "section")

        content = SOURCE.read_bytes()
        file_path, saved_size, validation_status, summary, errors, warnings = process_courseware_upload(
            content, SOURCE.name, subject.id
        )
        new_file_path = file_path
        if validation_status != "passed" or errors:
            raise RuntimeError(f"上传校验失败：{errors}")
        own_for_web(Path(file_path).parent)
        may_lag, lag_reason = evaluate_animation_file_performance(
            file_path, saved_size, source_type="original"
        )

        matches = db.query(Animation).filter(Animation.title == TITLE).order_by(Animation.id).all()
        animation = matches[0] if matches else None
        if animation:
            old_file_path = animation.file_path

        values = {
            "title": TITLE,
            "subject_id": subject.id,
            "textbook_node_id": section.id,
            "description": DESCRIPTION,
            "author": creator.real_name or creator.username,
            "file_path": file_path,
            "thumbnail": None,
            "grade_level": "",
            "keywords": KEYWORDS,
            "source_type": "original",
            "is_published": True,
            "review_status": "approved",
            "validation_status": validation_status,
            "validation_summary": summary,
            "validation_errors": json.dumps(errors, ensure_ascii=False),
            "validation_warnings": json.dumps(warnings, ensure_ascii=False),
            "file_size": saved_size,
            "may_lag": may_lag,
            "lag_reason": lag_reason,
        }
        if animation:
            for key, value in values.items():
                setattr(animation, key, value)
            existing_notes = (animation.review_notes or "").strip()
            if MARKER not in existing_notes:
                animation.review_notes = "\n\n".join(filter(None, (existing_notes, MARKER)))
        else:
            animation = Animation(**values, review_notes=MARKER, created_by=creator.id)
            db.add(animation)
        db.commit()
        db.refresh(animation)
        committed = True
        if old_file_path and old_file_path != file_path:
            remove_courseware_path(old_file_path)

        report = {
            "mode": args.action,
            "animation_id": animation.id,
            "title": animation.title,
            "subject_id": animation.subject_id,
            "textbook_node_id": animation.textbook_node_id,
            "textbook_path": f"{BOOK} / {CHAPTER} / {SECTION}",
            "file_url": build_file_url(animation.file_path),
            "published": animation.is_published,
            "review_status": animation.review_status,
            "validation_status": animation.validation_status,
            "warnings": warnings,
            "sha256": hashlib.sha256(Path(animation.file_path).read_bytes()).hexdigest(),
            "source_sha256": hashlib.sha256(content).hexdigest(),
            "backup_dir": str(backup_dir),
            "database_backup": str(database_backup),
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        db.rollback()
        if not committed and new_file_path:
            remove_courseware_path(new_file_path)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
