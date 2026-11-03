#!/usr/bin/env python3
"""Export production thumbnail metadata and apply audited replacements."""

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
from production_courseware_release import backup_database, install_thumbnail, relative_upload_url, validate_webp  # noqa: E402

WORK_DIR = ROOT / "tmp/production-thumbnail-audit"
MANIFEST_PATH = WORK_DIR / "manifest.json"
SELECTED_PATH = ROOT / "tmp/production-thumbnail-audit-upload/selected.json"
FINAL_DIR = ROOT / "tmp/production-thumbnail-audit-upload/final"
REPORT_PATH = WORK_DIR / "apply-report.json"
BACKUP_ROOT = Path("/var/www/edusimu/backups")


def export_all(db) -> dict:
    rows = [{
        "id": animation.id,
        "title": animation.title,
        "subject_id": animation.subject_id,
        "file_path": animation.file_path,
        "url_path": relative_upload_url(animation.file_path),
        "current_thumbnail": animation.thumbnail,
    } for animation in db.query(Animation).order_by(Animation.subject_id, Animation.id).all()]
    manifest = {"exported_at": datetime.now(timezone.utc).isoformat(), "production_total": len(rows), "animations": rows}
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(MANIFEST_PATH, 0o644)
    return {"mode": "export", "production_total": len(rows)}


def apply_selected(db) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    selected_ids = json.loads(SELECTED_PATH.read_text(encoding="utf-8"))
    if len(selected_ids) != len(set(selected_ids)):
        raise RuntimeError("替换清单包含重复课件 ID")
    by_id = {row["id"]: row for row in manifest["animations"]}
    rows = [by_id[animation_id] for animation_id in selected_ids]
    for row in rows:
        validate_webp(FINAL_DIR / f"production-{row['id']}.webp")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / f"thumbnail-audit-{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    database_backup = backup_dir / "edusimu-postgresql.dump"
    backup_database(database_backup)
    report = {"mode": "apply", "started_at": timestamp, "backup_dir": str(backup_dir), "database_backup": str(database_backup), "applied": [], "skipped": [], "failed": []}
    for row in rows:
        try:
            animation = db.query(Animation).filter(Animation.id == row["id"]).first()
            if not animation or animation.file_path != row["file_path"] or animation.thumbnail != row["current_thumbnail"]:
                report["skipped"].append({"id": row["id"], "title": row["title"], "reason": "production record changed"})
                continue
            result = install_thumbnail(animation, FINAL_DIR / f"production-{row['id']}.webp", "audited-capture")
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
        report = export_all(db) if args.action == "export" else apply_selected(db)
    finally:
        db.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report.get("failed") else 0


if __name__ == "__main__":
    raise SystemExit(main())
