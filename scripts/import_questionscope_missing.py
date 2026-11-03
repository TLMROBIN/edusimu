#!/usr/bin/env python3
"""Import the 2 new QuestionScope Future Courseware items into EduSimu.

Handles:
- lc-oscillation (电子秋千 - LC振荡电路)
- momentum-collision (一撞之间 - 验证动量守恒定律)
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

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

ITEMS = [
    {
        "id": "lc-oscillation",
        "title": "电子秋千",
        "category": "电磁学",
        "node_path": ("选择性必修第二册", "第四章 电磁振荡 电磁波", "第一节 电磁振荡"),
        "description": "沉浸式实验 · LC 振荡电路。亲手拨动开关、观察电容器充放电与自感线圈的能量交替转换。",
        "keywords": "未来课件,电磁学,电磁振荡,LC振荡电路,电容器,电感线圈",
    },
    {
        "id": "momentum-collision",
        "title": "一撞之间",
        "category": "力学",
        "node_path": ("选择性必修第一册", "第一章 动量守恒定律", "4. 实验：验证动量守恒定律"),
        "description": "亲手推滑块、读计时器、记落点，验证动量守恒。",
        "keywords": "未来课件,力学,动量守恒,碰撞,气垫导轨",
    },
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
        raise ValueError(f"{slug}: 运行时页面中未找到内嵌 sourceHtml")
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
        raise ValueError(f"{slug}: 预期移除 1 个登录心跳脚本，实际为 {removed}")
    if f"/api/experiments/{slug}/lease" in source_html:
        raise ValueError(f"{slug}: 课件仍包含原站登录心跳路径")
    return source_html, removed


def find_leaf_node_id(db, subject_id: int, book_name: str, chapter_name: str, section_name: str) -> int:
    book = (
        db.query(TextbookNode)
        .filter(
            TextbookNode.subject_id == subject_id,
            TextbookNode.node_type == "book",
            TextbookNode.name == book_name,
        )
        .first()
    )
    if not book:
        # Fallback without subject filter
        book = (
            db.query(TextbookNode)
            .filter(
                TextbookNode.node_type == "book",
                TextbookNode.name == book_name,
            )
            .first()
        )
    if not book:
        raise ValueError(f"教材分册未找到: {book_name}")

    chapter = (
        db.query(TextbookNode)
        .filter(
            TextbookNode.parent_id == book.id,
            TextbookNode.node_type == "chapter",
            TextbookNode.name == chapter_name,
        )
        .first()
    )
    if not chapter:
        raise ValueError(f"章节未找到: {chapter_name} (in {book_name})")

    section = (
        db.query(TextbookNode)
        .filter(
            TextbookNode.parent_id == chapter.id,
            TextbookNode.name == section_name,
        )
        .first()
    )
    if not section:
        # Fallback to substring match
        for s in db.query(TextbookNode).filter(TextbookNode.parent_id == chapter.id).all():
            if section_name in s.name or s.name in section_name:
                section = s
                break
    if not section:
        raise ValueError(f"节未找到: {section_name} (in {chapter_name})")

    return section.id


def main() -> int:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    imported_count = 0
    skipped_count = 0

    try:
        subject = (
            db.query(Subject)
            .filter(Subject.name.in_(["physics", "物理", "高中物理"]))
            .first()
        )
        if not subject:
            subject = db.query(Subject).filter(Subject.id == 4).first()
        if not subject:
            subject = db.query(Subject).first()
        if not subject:
            print("错误: 未找到任何学科数据", file=sys.stderr)
            return 1
        subject_id = subject.id
        print(f"使用学科: ID {subject_id} ({subject.name})")

        admin = db.query(User).filter(User.role == "admin").order_by(User.id).first()
        if not admin:
            admin = db.query(User).first()
        if not admin:
            print("错误: 未找到任何可用用户", file=sys.stderr)
            return 1
        creator_id = admin.id
        print(f"使用创建者: ID {creator_id} ({admin.username})")

        for item in ITEMS:
            slug = item["id"]
            page_url = source_url(slug)

            existing = (
                db.query(Animation)
                .filter(Animation.description.contains(f"Source: {page_url}"))
                .first()
            )
            if existing:
                print(f"[已存在] {item['title']} (ID {existing.id}) -> 跳过")
                skipped_count += 1
                continue

            processed_path = PROCESSED_DIR / f"{slug}.html"
            if processed_path.is_file():
                processed_bytes = processed_path.read_bytes()
            else:
                raw_path = RAW_DIR / f"{slug}.html"
                if not raw_path.is_file():
                    print(f"错误: 原始与处理后文件均不存在: {slug}", file=sys.stderr)
                    return 1
                raw = raw_path.read_text(encoding="utf-8")
                source_html, removed = extract_embedded_html(raw, slug)
                processed_bytes = source_html.encode("utf-8")
                processed_path.write_bytes(processed_bytes)

            validation_status, summary, errors, warnings = validate_courseware(processed_bytes)
            print(f"[校验] {item['title']}: status={validation_status}, errors={len(errors)}, warnings={len(warnings)}")
            if errors:
                print(f"  错误: {errors}", file=sys.stderr)
                return 1

            book_name, ch_name, sec_name = item["node_path"]
            node_id = find_leaf_node_id(db, subject_id, book_name, ch_name, sec_name)
            validate_required_textbook_node(db, subject_id, node_id)

            upload_filename = f"questionscope-{slug}.html"
            file_path, saved_size, v_status, v_summary, v_errors, v_warnings = process_courseware_upload(
                processed_bytes, upload_filename, subject_id
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
                subject_id=subject_id,
                textbook_node_id=node_id,
                description=description,
                author=AUTHOR,
                file_path=file_path,
                thumbnail=None,
                grade_level="高中",
                keywords=item["keywords"],
                source_type="original",
                is_published=True,
                review_status="approved",
                validation_status=v_status,
                validation_summary=v_summary,
                validation_errors=json.dumps(v_errors, ensure_ascii=False),
                validation_warnings=json.dumps(v_warnings, ensure_ascii=False),
                file_size=saved_size,
                created_by=creator_id,
            )

            db.add(animation)
            db.commit()
            db.refresh(animation)
            imported_count += 1
            print(f"[成功导入] ID {animation.id}: {animation.title} (节ID: {node_id}, 路径: {file_path})")

        print(f"\n全部处理完成: 成功导入 {imported_count} 个, 跳过 {skipped_count} 个")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
