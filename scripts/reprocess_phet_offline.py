#!/usr/bin/env python3
"""
Reprocess existing PhET physics animations to be offline-ready.

Behavior:
- Loads official PhET partner-services metadata JSON
- Re-downloads the original HTML runUrl for each PhET physics sim
- Applies PhET sanitization + localization + validation
- Updates existing animations (title match) with new file_path/validation
"""

from __future__ import annotations

import argparse
import json
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reprocess PhET animations for offline use")
    parser.add_argument("--metadata-file", default=catalog.DEFAULT_METADATA_FILE, help="Path to partner-services JSON")
    parser.add_argument("--metadata-url", help="Optional URL to fetch partner-services JSON")
    parser.add_argument("--subject-id", type=int, default=4, help="EduSimu physics subject id")
    parser.add_argument("--dry-run", action="store_true", help="Only print mapping, do not update")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of animations to update")
    parser.add_argument("--only-title", action="append", default=[], help="Only update by title (repeatable)")
    return parser.parse_args()


def load_metadata(args: argparse.Namespace) -> dict:
    if args.metadata_url:
        request = urllib_request.Request(
            args.metadata_url,
            headers={"User-Agent": "EduSimuPhETImporter/1.0"},
        )
        with urllib_request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    path = Path(args.metadata_file)
    if not path.exists():
        raise SystemExit(f"Metadata file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def build_title_map(simulations: list[dict]) -> dict[str, str]:
    physics_subject_id = catalog.infer_physics_subject_id(simulations) or 4
    physics_sims = [sim for sim in simulations if physics_subject_id in sim.get("subjectIds", [])]

    mapping: dict[str, str] = {}
    for sim in physics_sims:
        run_url, title = catalog.pick_locale_run_url(sim)
        if not run_url.startswith("http"):
            run_url = f"{catalog.PHET_BASE_URL}{run_url}"
        mapping[title] = run_url
    return mapping


def download_html(url: str, retries: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib_request.Request(
                url,
                headers={"User-Agent": "EduSimuPhETImporter/1.0"},
            )
            with urllib_request.urlopen(request, timeout=30) as response:
                chunks = []
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    chunks.append(chunk)
                return b"".join(chunks)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= retries:
                break
    raise RuntimeError(f"下载失败: {url}") from last_error


def reprocess_animation(animation: Animation, run_url: str, subject_id: int) -> None:
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
    metadata = load_metadata(args)
    simulations = metadata.get("simulations", [])
    if not simulations:
        raise SystemExit("未找到 simulations 数据")

    title_map = build_title_map(simulations)
    if args.only_title:
        only = set(args.only_title)
        title_map = {title: url for title, url in title_map.items() if title in only}

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
            run_url = title_map.get(animation.title)
            if not run_url:
                continue
            if args.dry_run:
                print(f"[DRY] {animation.id} {animation.title} -> {run_url}")
            else:
                print(f"更新: {animation.id} {animation.title}")
                try:
                    reprocess_animation(animation, run_url, args.subject_id)
                    db.add(animation)
                    db.commit()
                except Exception as exc:  # noqa: BLE001
                    db.rollback()
                    print(f"失败: {animation.id} {animation.title} -> {exc}")
            updated += 1
            if args.limit and updated >= args.limit:
                break
        print(f"完成更新: {updated} 条")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
