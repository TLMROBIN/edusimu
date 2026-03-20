#!/usr/bin/env python3
"""
Import a PhET HTML simulation into EduSimu.

This script can:
1. Download a PhET single-file HTML or read a local HTML file
2. Apply a small EduSimu-oriented sanitization pass
3. Reuse the backend validation/localization pipeline
4. Create a courseware record bound to a textbook section
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import Animation, Subject, TextbookNode, User
from app.routers.animations import (
    compute_review_state,
    localize_external_resources,
    save_upload_file,
    validate_courseware,
    validate_required_textbook_node,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import a PhET HTML file into EduSimu")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--source-url", help="Remote HTML URL")
    source_group.add_argument("--source-file", help="Local HTML file path")

    parser.add_argument("--title", required=True, help="Courseware title")
    parser.add_argument("--subject-id", type=int, required=True, help="Subject ID")
    parser.add_argument("--textbook-node-id", type=int, required=True, help="Leaf textbook node ID")
    parser.add_argument("--creator", default="admin", help="Creator username, default: admin")
    parser.add_argument("--description", default="", help="Courseware description")
    parser.add_argument("--grade-level", default="", help="Grade level text, e.g. 高二")
    parser.add_argument("--keywords", default="", help="Comma separated keywords")
    parser.add_argument("--author-name", default="", help="Override author name shown in UI")
    parser.add_argument("--publish", action="store_true", help="Publish immediately when validation passes")
    parser.add_argument(
        "--force-publish",
        action="store_true",
        help="Force publish even when validation fails (admin only)",
    )
    parser.add_argument("--keep-processed", help="Optional path to save the processed HTML")
    return parser.parse_args()


def read_source(args: argparse.Namespace) -> bytes:
    if args.source_file:
        return Path(args.source_file).read_bytes()

    request = urllib_request.Request(
        args.source_url,
        headers={"User-Agent": "EduSimuPhETImporter/1.0"},
    )
    with urllib_request.urlopen(request, timeout=20) as response:
        return response.read()


def sanitize_phet_html(content: bytes, course_title: str = "") -> bytes:
    text = content.decode("utf-8", errors="ignore")
    text = text.replace("\r\n", "\n")

    def ensure_viewport(html: str) -> str:
        def normalize_viewport(match: re.Match[str]) -> str:
            prefix = match.group("prefix")
            content_value = match.group("content")
            suffix = match.group("suffix")
            lower = content_value.lower()
            parts = [part.strip() for part in content_value.split(",") if part.strip()]
            if "width=device-width" not in lower:
                parts.insert(0, "width=device-width")
            if "initial-scale" not in lower:
                parts.append("initial-scale=1")
            content_value = ",".join(parts)
            return f"{prefix}{content_value}{suffix}"

        viewport_re = re.compile(
            r'(?P<prefix><meta[^>]+name=["\']viewport["\'][^>]+content=["\'])(?P<content>[^"\']*)(?P<suffix>["\'][^>]*>)',
            re.IGNORECASE,
        )
        if viewport_re.search(html):
            return viewport_re.sub(normalize_viewport, html, count=1)

        head_match = re.search(r"<head[^>]*>", html, flags=re.IGNORECASE)
        viewport_tag = '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1"/>'
        if head_match:
            insert_at = head_match.end()
            return f"{html[:insert_at]}\n  {viewport_tag}{html[insert_at:]}"
        return f"{viewport_tag}\n{html}"

    def strip_external_resource_tags(html: str) -> str:
        html = re.sub(
            r'(?is)<script\b[^>]*\bsrc=["\'](?:https?:)?//[^"\']+["\'][^>]*>\s*</script>',
            "",
            html,
        )
        html = re.sub(
            r'(?is)<link\b[^>]*\bhref=["\'](?:https?:)?//[^"\']+["\'][^>]*>',
            "",
            html,
        )
        html = re.sub(
            r'(?is)<img\b[^>]*\bsrc=["\'](?:https?:)?//[^"\']+["\'][^>]*>',
            "",
            html,
        )
        html = re.sub(
            r'(?is)<iframe\b[^>]*\bsrc=["\'](?:https?:)?//[^"\']+["\'][^>]*>',
            "",
            html,
        )
        return html

    def strip_phet_analytics(html: str) -> str:
        html = re.sub(
            r'(?is)<script\b[^>]*>\s*!function\(\)\{"use strict";if\(phet\.chipper\.queryParameters\.yotta\).*?</script>',
            "",
            html,
            count=1,
        )
        html = re.sub(
            r'(?is)<script[^>]+src=["\']https://static\.cloudflareinsights\.com/[^"\']+["\'][^>]*>\s*</script>',
            "",
            html,
        )
        return html

    def neutralize_open_graph_urls(html: str) -> str:
        html = re.sub(
            r'(?is)<meta\b[^>]+property=["\']og:url["\'][^>]+content=["\'][^"\']+["\'][^>]*>',
            "",
            html,
        )
        html = re.sub(
            r'(?is)<meta\b[^>]+property=["\']og:image["\'][^>]+content=["\'][^"\']+["\'][^>]*>',
            "",
            html,
        )
        return html

    text = strip_phet_analytics(text)
    text = strip_external_resource_tags(text)
    text = neutralize_open_graph_urls(text)
    text = ensure_viewport(text)

    return text.encode("utf-8")


def save_processed_copy(content: bytes, target_path: str | None) -> None:
    if not target_path:
        return
    path = Path(target_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def resolve_creator(db, creator_value: str) -> User:
    user = db.query(User).filter(User.username == creator_value).first()
    if user:
        return user

    if creator_value.isdigit():
        user = db.query(User).filter(User.id == int(creator_value)).first()
        if user:
            return user

    raise SystemExit(f"未找到创建者用户: {creator_value}")


def import_animation(args: argparse.Namespace) -> int:
    raw_content = read_source(args)
    processed_content = sanitize_phet_html(raw_content, args.title)
    save_processed_copy(processed_content, args.keep_processed)

    db = SessionLocal()
    try:
        subject = db.query(Subject).filter(Subject.id == args.subject_id).first()
        if not subject:
            raise SystemExit(f"学科不存在: {args.subject_id}")

        validate_required_textbook_node(db, args.subject_id, args.textbook_node_id)
        creator = resolve_creator(db, args.creator)

        localized_content, localization_errors, localization_warnings = localize_external_resources(
            processed_content,
            args.subject_id,
        )
        validation_status, validation_summary, validation_errors, validation_warnings = validate_courseware(
            localized_content
        )
        validation_errors.extend(localization_errors)
        validation_warnings.extend(localization_warnings)
        validation_status = "passed" if not validation_errors else "failed"
        validation_summary = (
            f"校验{'通过' if validation_status == 'passed' else '未通过'}："
            f"{len(validation_errors)} 个问题，{len(validation_warnings)} 条提醒"
        )

        file_path, file_size = save_upload_file(localized_content, args.subject_id)
        author_name = args.author_name or creator.real_name or creator.username
        should_publish, review_status = compute_review_state(
            creator,
            args.publish,
            validation_status,
            force_publish=bool(args.force_publish),
        )

        animation = Animation(
            title=args.title,
            subject_id=args.subject_id,
            textbook_node_id=args.textbook_node_id,
            description=args.description,
            author=author_name,
            file_path=file_path,
            thumbnail=None,
            grade_level=args.grade_level,
            keywords=args.keywords,
            source_type="phet",
            is_published=should_publish,
            review_status=review_status,
            validation_status=validation_status,
            validation_summary=validation_summary,
            validation_errors=json.dumps(validation_errors, ensure_ascii=False),
            validation_warnings=json.dumps(validation_warnings, ensure_ascii=False),
            file_size=file_size,
            created_by=creator.id,
        )

        db.add(animation)
        db.commit()
        db.refresh(animation)

        print(f"导入成功: {animation.title}")
        print(f"ID: {animation.id}")
        print(f"文件: {animation.file_path}")
        print(f"发布状态: {animation.is_published}")
        print(f"审核状态: {animation.review_status}")
        print(f"校验状态: {animation.validation_status}")
        print(f"校验摘要: {animation.validation_summary}")
        if validation_errors:
            print("问题:")
            for item in validation_errors:
                print(f"- {item}")
        if validation_warnings:
            print("提醒:")
            for item in validation_warnings:
                print(f"- {item}")
        return 0
    finally:
        db.close()


def main() -> int:
    args = parse_args()
    try:
        return import_animation(args)
    except KeyboardInterrupt:
        print("已取消")
        return 130
    except Exception as exc:
        print(f"导入失败: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
