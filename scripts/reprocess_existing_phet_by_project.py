#!/usr/bin/env python3
"""
Reprocess existing PhET animations by project id.

This updates historical PhET records that may still reference stale external_cache
assets, turning them into self-contained offline HTML files.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import Animation
from app.routers.animations import (
    localize_external_resources,
    remove_courseware_path,
    save_upload_file,
    validate_courseware,
)

import import_phet_html
import import_phet_physics_catalog as catalog


PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*'([^']+)'")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reprocess existing PhET records by project id")
    parser.add_argument("--metadata-file", default=catalog.DEFAULT_METADATA_FILE, help="Path to partner-services JSON")
    parser.add_argument("--subject-id", type=int, default=4, help="Subject id")
    parser.add_argument("--dry-run", action="store_true", help="Only print targets")
    return parser.parse_args()


def load_metadata(path: str) -> dict:
    metadata_path = Path(path)
    if not metadata_path.exists():
        raise SystemExit(f"Metadata file not found: {path}")
    return json.loads(metadata_path.read_text(encoding="utf-8"))


def extract_project(file_path: str | None) -> str | None:
    if not file_path:
        return None
    resolved = file_path
    if file_path.startswith("./uploads/"):
        resolved = os.path.join("/var/www/edusimu/backend", file_path[2:])
    if not os.path.exists(resolved):
        return None
    text = Path(resolved).read_text(encoding="utf-8", errors="ignore")
    match = PHET_PROJECT_RE.search(text)
    return match.group(1) if match else None


def download_html(url: str) -> bytes:
    request = urllib_request.Request(
        url,
        headers={"User-Agent": "EduSimuPhETImporter/1.0"},
    )
    with urllib_request.urlopen(request, timeout=30) as response:
        return response.read()


def update_animation(animation: Animation, run_url: str, subject_id: int) -> None:
    raw_content = download_html(run_url)
    processed_content = import_phet_html.sanitize_phet_html(raw_content, animation.title)
    localized_content, localization_errors, localization_warnings = localize_external_resources(
        processed_content,
        subject_id,
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

    remove_courseware_path(animation.file_path)
    file_path, file_size = save_upload_file(localized_content, subject_id)
    animation.file_path = file_path
    animation.file_size = file_size
    animation.validation_status = validation_status
    animation.validation_summary = validation_summary
    animation.validation_errors = json.dumps(validation_errors, ensure_ascii=False)
    animation.validation_warnings = json.dumps(validation_warnings, ensure_ascii=False)


def main() -> int:
    args = parse_args()
    metadata = load_metadata(args.metadata_file)
    sims = {sim["name"]: sim for sim in metadata.get("simulations", [])}

    db = SessionLocal()
    updated = 0
    try:
        animations = (
            db.query(Animation)
            .filter(Animation.subject_id == args.subject_id)
            .order_by(Animation.id.asc())
            .all()
        )
        for animation in animations:
            project = extract_project(animation.file_path)
            if not project:
                continue
            sim = sims.get(project)
            if not sim:
                continue
            run_url, _ = catalog.pick_locale_run_url(sim)
            if not run_url.startswith("http"):
                run_url = f"{catalog.PHET_BASE_URL}{run_url}"
            print(f"更新: {animation.id} {animation.title} [{project}]")
            if not args.dry_run:
                update_animation(animation, run_url, args.subject_id)
                db.add(animation)
                db.commit()
            updated += 1
        print(f"完成更新: {updated} 条")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
