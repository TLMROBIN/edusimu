#!/usr/bin/env python3
"""
Backfill animation source_type based on actual courseware content.

Rules:
- PhET courseware: HTML contains window.phet.chipper.project or phet.colorado.edu marker
- otherwise: original
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, settings
from app.models import Animation


PHET_MARKERS = (
    "window.phet.chipper.project",
    "phet.colorado.edu",
    "phet.chipper",
)
PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*['\"]([^'\"]+)['\"]")


def resolve_absolute_path(file_path: str) -> Path:
    path = Path(file_path)
    if path.is_absolute():
        return path
    if file_path.startswith("/uploads/"):
        return Path(settings.upload_dir) / file_path.replace("/uploads/", "", 1)
    if file_path.startswith("./uploads/"):
        return Path(settings.upload_dir) / file_path.replace("./uploads/", "", 1)
    return Path(settings.upload_dir) / path.name


def detect_source_type(animation: Animation) -> str:
    absolute_path = resolve_absolute_path(animation.file_path)
    if not absolute_path.exists() or not absolute_path.is_file():
        return "original"

    try:
        content = absolute_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return "original"

    if PHET_PROJECT_RE.search(content):
        return "phet"
    if any(marker in content for marker in PHET_MARKERS):
        return "phet"
    return "original"


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill animation source_type")
    parser.add_argument("--only-missing", action="store_true", help="Only fill empty or invalid source_type rows")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        animations = db.query(Animation).order_by(Animation.id.asc()).all()
        updated = 0
        summary = {"phet": 0, "original": 0}

        for animation in animations:
            if args.only_missing and animation.source_type in {"phet", "original"}:
                summary[animation.source_type] = summary.get(animation.source_type, 0) + 1
                continue

            detected = detect_source_type(animation)
            summary[detected] = summary.get(detected, 0) + 1
            if animation.source_type != detected:
                animation.source_type = detected
                updated += 1

        db.commit()
        print(f"updated={updated}")
        print(f"phet={summary.get('phet', 0)}")
        print(f"original={summary.get('original', 0)}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
