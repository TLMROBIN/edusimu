#!/usr/bin/env python3
"""
Delete duplicate animations by content fingerprint, keeping the oldest record.

Current fingerprint strategy:
- Prefer PhET project id extracted from HTML content
- Fallback to normalized content hash
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, settings
from app.models import Animation
from app.routers.animations import remove_courseware_path, remove_file_if_exists


PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*'([^']+)'")
TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC")
UPLOAD_NAME_RE = re.compile(r"/uploads/\d+/\d+_\d+\.html")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Delete duplicate animations by content fingerprint")
    parser.add_argument("--subject-id", type=int, default=4, help="Only process one subject id when provided")
    parser.add_argument("--dry-run", action="store_true", help="Only print duplicates, do not delete")
    return parser.parse_args()


def load_content(file_path: str | None) -> str:
    if not file_path or not os.path.exists(file_path):
        return ""
    return Path(file_path).read_text(encoding="utf-8", errors="ignore")


def normalized_hash(content: str) -> str | None:
    if not content:
        return None
    text = TIMESTAMP_RE.sub("", content)
    text = UPLOAD_NAME_RE.sub("/uploads/X/Y.html", text)
    text = re.sub(r"\s+", "", text)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def content_fingerprint(content: str) -> tuple[str, str] | None:
    if not content:
        return None
    project_match = PHET_PROJECT_RE.search(content)
    if project_match:
        return ("phet", project_match.group(1))
    digest = normalized_hash(content)
    if digest:
        return ("hash", digest)
    return None


def delete_animation(db, animation: Animation) -> None:
    remove_courseware_path(animation.file_path)
    if animation.thumbnail and animation.thumbnail.startswith("/uploads/thumbnails/"):
        absolute_thumb = os.path.join(settings.upload_dir, animation.thumbnail.replace("/uploads/", ""))
        remove_file_if_exists(absolute_thumb)
    db.delete(animation)


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        query = db.query(Animation)
        if args.subject_id:
            query = query.filter(Animation.subject_id == args.subject_id)
        animations = query.order_by(Animation.id.asc()).all()

        grouped: dict[tuple[str, str], list[Animation]] = defaultdict(list)
        for animation in animations:
            content = load_content(animation.file_path)
            fingerprint = content_fingerprint(content)
            if fingerprint:
                grouped[fingerprint].append(animation)

        duplicate_groups = [items for items in grouped.values() if len(items) > 1]
        for items in duplicate_groups:
            keeper = items[0]
            duplicates = items[1:]
            print(f"保留: {keeper.id} {keeper.title}")
            for duplicate in duplicates:
                print(f"删除: {duplicate.id} {duplicate.title}")
                if not args.dry_run:
                    delete_animation(db, duplicate)
            if not args.dry_run:
                db.commit()
        print(f"重复组数: {len(duplicate_groups)}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
