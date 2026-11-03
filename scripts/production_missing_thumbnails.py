#!/usr/bin/env python3
"""Export missing production thumbnails or apply newly captured images."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import Animation  # noqa: E402
from production_courseware_release import (  # noqa: E402
    backup_database,
    install_thumbnail,
    relative_upload_url,
    validate_webp,
)

WORK_DIR = ROOT / "tmp/production-missing-thumbnails"
MANIFEST_PATH = WORK_DIR / "manifest.json"
FINAL_DIR = ROOT / "tmp/production-missing-thumbnails-upload/final"
REPORT_PATH = WORK_DIR / "apply-report.json"
BACKUP_ROOT = Path("/var/www/edusimu/backups")


def thumbnail_exists(thumbnail: str | None) -> bool:
    if not thumbnail:
        return False
    if thumbnail.startswith("/uploads/"):
        from app.database import settings
        path = Path(settings.upload_dir) / thumbnail.split("/uploads/", 1)[1]
    else:
        path = Path(thumbnail)
    return path.is_file()


def export_missing(db) -> dict:
    rows = []
    for animation in db.query(Animation).order_by(Animation.subject_id, Animation.id).all():
        if thumbnail_exists(animation.thumbnail):
            continue
        rows.append({
            "id": animation.id,
            "title": animation.title,
            "subject_id": animation.subject_id,
            "file_path": animation.file_path,
            "url_path": relative_upload_url(animation.file_path),
            "current_thumbnail": animation.thumbnail,
            "reason": "missing" if not animation.thumbnail else "file_not_found",
        })
    manifest = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "production_total": db.query(Animation).count(),
        "missing_count": len(rows),
        "animations": rows,
    }
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(MANIFEST_PATH, 0o644)
    return {"mode": "export", "production_total": manifest["production_total"], "missing_count": len(rows), "animations": rows}


def apply_missing(db) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    rows = manifest["animations"]
    for row in rows:
        validate_webp(FINAL_DIR / f"production-{row['id']}.webp")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / f"missing-thumbnails-{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    database_backup = backup_dir / "edusimu-postgresql.dump"
    backup_database(database_backup)

    report = {
        "mode": "apply",
        "started_at": timestamp,
        "backup_dir": str(backup_dir),
        "database_backup": str(database_backup),
        "applied": [],
        "skipped": [],
        "failed": [],
    }
    for row in rows:
        try:
            animation = db.query(Animation).filter(Animation.id == row["id"]).first()
            if not animation or animation.file_path != row["file_path"] or animation.thumbnail != row["current_thumbnail"]:
                report["skipped"].append({"id": row["id"], "title": row["title"], "reason": "production record changed"})
                continue
            result = install_thumbnail(animation, FINAL_DIR / f"production-{row['id']}.webp", "production-capture")
            db.commit()
            report["applied"].append(result)
        except Exception as exc:
            db.rollback()
            report["failed"].append({"id": row["id"], "title": row["title"], "error": str(exc)})
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(REPORT_PATH, 0o644)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["export", "apply"])
    args = parser.parse_args()
    db = SessionLocal()
    try:
        report = export_missing(db) if args.action == "export" else apply_missing(db)
    finally:
        db.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report.get("failed") else 0


if __name__ == "__main__":
    raise SystemExit(main())
