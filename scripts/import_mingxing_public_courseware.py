#!/usr/bin/env python3
"""Import the publicly listed Mingxing Physics courseware into EduSimu.

The source catalogue is a public endpoint.  Each HTML file is passed through
EduSimu's normal package localizer and validator before it is registered, so a
courseware item is never marked published if it still requires a remote asset.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, settings
from app.models import Animation, Subject, User
from app.routers.animations import process_courseware_upload


DEFAULT_STATE_URL = "https://zlmmxwl.com/api/public/site-state"
SOURCE_HOST = "https://zlmmxwl.com"
MARKER = "[Mingxing Physics public import]"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import public Mingxing Physics courseware")
    parser.add_argument("--state-url", default=DEFAULT_STATE_URL)
    parser.add_argument("--creator", default="admin")
    parser.add_argument("--subject-id", type=int, default=4)
    parser.add_argument("--state-file", type=Path, help="Use an already downloaded site-state JSON file")
    parser.add_argument("--report", type=Path, default=Path("tmp/mingxing-physics-import-report.json"))
    parser.add_argument("--limit", type=int, default=0, help="For a bounded trial import")
    return parser.parse_args()


def fetch(url: str) -> bytes:
    req = urllib_request.Request(url, headers={"User-Agent": "EduSimuMingxingImporter/1.0"})
    with urllib_request.urlopen(req, timeout=45) as response:
        return response.read()


def load_state(args: argparse.Namespace) -> dict:
    raw = args.state_file.read_bytes() if args.state_file else fetch(args.state_url)
    state = json.loads(raw)
    if not isinstance(state.get("resources"), list):
        raise SystemExit("Source site-state has no resources list")
    return state


def existing_source_urls(db) -> set[str]:
    return {
        row.description.split("Source: ", 1)[1].split("\n", 1)[0]
        for row in db.query(Animation.description).filter(Animation.description.contains(MARKER)).all()
        if row.description and "Source: " in row.description
    }


def main() -> int:
    args = parse_args()
    state = load_state(args)
    resources = [item for item in state["resources"] if item.get("status") == "published" and item.get("href")]
    if args.limit:
        resources = resources[: args.limit]

    db = SessionLocal()
    report = {
        "source_state_url": args.state_url,
        "source_revision": state.get("revision"),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "total_published": len(resources),
        "imported": [],
        "skipped": [],
        "failed": [],
    }
    try:
        if not db.query(Subject).filter(Subject.id == args.subject_id).first():
            raise SystemExit(f"Subject does not exist: {args.subject_id}")
        creator = db.query(User).filter(User.username == args.creator).first()
        if not creator:
            raise SystemExit(f"Creator does not exist: {args.creator}")
        known_sources = existing_source_urls(db)

        for index, resource in enumerate(resources, start=1):
            href = str(resource["href"])
            source_url = href if href.startswith("http") else f"{SOURCE_HOST}{href}"
            title = str(resource.get("title") or resource["id"])
            item = {"id": resource["id"], "title": title, "source_url": source_url}
            if source_url in known_sources:
                report["skipped"].append(item | {"reason": "already imported"})
                continue
            try:
                content = fetch(source_url)
                file_path, file_size, validation_status, summary, _, warnings = process_courseware_upload(
                    content, f"{resource['id']}.html", args.subject_id
                )
                description = (
                    f"{MARKER}\nSource: {source_url}\n"
                    f"Source resource ID: {resource['id']}\n"
                    "Imported from the publicly accessible Mingxing Physics course-resource catalogue."
                )
                animation = Animation(
                    title=title,
                    subject_id=args.subject_id,
                    description=description,
                    author="敏行物理（公开资源导入）",
                    file_path=file_path,
                    grade_level="高中",
                    keywords=",".join(resource.get("tags") or []),
                    source_type="original",
                    is_published=True,
                    review_status="approved",
                    validation_status=validation_status,
                    validation_summary=summary,
                    validation_errors="[]",
                    validation_warnings=json.dumps(warnings, ensure_ascii=False),
                    file_size=file_size,
                    created_by=creator.id,
                )
                db.add(animation)
                db.commit()
                known_sources.add(source_url)
                report["imported"].append(item | {
                    "animation_id": animation.id,
                    "file_path": file_path,
                    "bytes": file_size,
                    "sha256": hashlib.sha256(Path(file_path).read_bytes()).hexdigest(),
                    "warnings": warnings,
                })
                print(f"[{index}/{len(resources)}] imported: {title}")
            except Exception as exc:  # Keep importing the independent remaining items.
                db.rollback()
                report["failed"].append(item | {"error": str(exc)})
                print(f"[{index}/{len(resources)}] failed: {title}: {exc}", file=sys.stderr)
    finally:
        db.close()

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: len(report[key]) for key in ("imported", "skipped", "failed")}, ensure_ascii=False))
    return 0 if not report["failed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
