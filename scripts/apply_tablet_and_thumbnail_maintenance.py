#!/usr/bin/env python3
"""Backup-first maintenance for tablet fixes, lag backfill, and audited thumbnails."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(ROOT / "scripts"))

from app.database import SessionLocal  # noqa: E402
from app.models import Animation  # noqa: E402
from app.routers.animations import evaluate_animation_file_performance  # noqa: E402
from production_courseware_release import (  # noqa: E402
    backup_database,
    install_thumbnail,
    own_for_web,
    validate_webp,
)

BACKUP_ROOT = Path("/var/www/edusimu/backups")
TABLET_UPLOAD_DIR = ROOT / "tmp/tablet-fixes-upload"
THUMB_FINAL_DIR = ROOT / "tmp/production-thumbnails-upload/final"
THUMB_MANIFEST_PATH = ROOT / "tmp/production-thumbnails-upload/selected.json"
WRAPPER_PATH = ROOT / "scripts/tongjiang_isolated_wrapper.html"

STUDENT_LAG_OVERRIDES = {
    190: "体积偏大(3.1MB)、学生实测在平板端易卡顿",
}


def resolve_animation_path(file_path: str) -> Path:
    if file_path.startswith("./uploads/"):
        return BACKEND_DIR / file_path[2:]
    return Path(file_path)


def make_backup_dir(tag: str) -> tuple[Path, Path]:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / f"{tag}-{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    db_backup = backup_dir / "edusimu-postgresql.dump"
    backup_database(db_backup)
    return backup_dir, db_backup


def apply_tablet_fixes(db) -> dict:
    backup_dir, db_backup = make_backup_dir("tablet-fixes")
    orig_dir = backup_dir / "original_html"
    orig_dir.mkdir(parents=True, exist_ok=True)

    wrapper_template = WRAPPER_PATH.read_text(encoding="utf-8")
    updated_individual = []
    updated_tongjiang = []
    failed = []

    # 1. Apply individual courseware HTML fixes staged in tmp/tablet-fixes-upload/<id>.html
    if TABLET_UPLOAD_DIR.is_dir():
        for src_file in sorted(TABLET_UPLOAD_DIR.glob("*.html"), key=lambda p: int(p.stem)):
            aid = int(src_file.stem)
            animation = db.query(Animation).filter(Animation.id == aid).first()
            if not animation:
                failed.append({"id": aid, "error": "animation not found"})
                continue
            target = resolve_animation_path(animation.file_path)
            if not target.is_file():
                failed.append({"id": aid, "error": f"file missing: {target}"})
                continue
            shutil.copy2(target, orig_dir / f"{aid}.html")
            data = src_file.read_bytes()
            tmp = target.with_suffix(".tmp")
            tmp.write_bytes(data)
            os.chmod(tmp, 0o644)
            os.replace(tmp, target)
            own_for_web(target)
            updated_individual.append({"id": aid, "title": animation.title, "bytes": len(data)})

    # 2. Refresh all Tongjiang isolated wrappers with tablet-adapted wrapper template
    animations = db.query(Animation).order_by(Animation.id).all()
    for animation in animations:
        if "edusimu-isolated-tongjiang-v1" not in (animation.keywords or ""):
            continue
        target = resolve_animation_path(animation.file_path)
        if not target.is_file():
            failed.append({"id": animation.id, "error": f"tongjiang file missing: {target}"})
            continue
        text = target.read_text(encoding="utf-8", errors="ignore")
        cfg_match = re.search(r'<script\s+id="edusimu-isolation"[^>]*>(.*?)</script>', text, re.S)
        if not cfg_match:
            failed.append({"id": animation.id, "error": "missing edusimu-isolation config"})
            continue
        title_match = re.search(r"<title>(.*?)</title>", text, re.S)
        page_title = title_match.group(1) if title_match else html.escape(animation.title)
        shutil.copy2(target, orig_dir / f"{animation.id}.html")
        rebuilt = wrapper_template.replace("__TITLE__", page_title).replace("__CONFIG__", cfg_match.group(1))
        data = rebuilt.encode("utf-8")
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(data)
        os.chmod(tmp, 0o644)
        os.replace(tmp, target)
        own_for_web(target)
        updated_tongjiang.append({"id": animation.id, "title": animation.title, "bytes": len(data)})

    report = {
        "action": "apply-tablet-fixes",
        "backup_dir": str(backup_dir),
        "database_backup": str(db_backup),
        "updated_individual_count": len(updated_individual),
        "updated_tongjiang_count": len(updated_tongjiang),
        "updated_individual": updated_individual,
        "failed": failed,
    }
    report_path = ROOT / "tmp/tablet-fixes-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(report_path, 0o644)
    return report


def backfill_lag(db) -> dict:
    backup_dir, db_backup = make_backup_dir("lag-backfill")
    animations = db.query(Animation).order_by(Animation.id).all()
    flagged = []
    cleared = []
    for animation in animations:
        target = resolve_animation_path(animation.file_path)
        may_lag, reason = evaluate_animation_file_performance(
            str(target),
            total_size_bytes=animation.file_size,
            source_type=animation.source_type or "original",
        )
        if animation.id in STUDENT_LAG_OVERRIDES and not may_lag:
            may_lag = True
            reason = STUDENT_LAG_OVERRIDES[animation.id]
        animation.may_lag = may_lag
        animation.lag_reason = reason
        if may_lag:
            flagged.append({"id": animation.id, "title": animation.title, "reason": reason})
        else:
            cleared.append(animation.id)
    db.commit()

    report = {
        "action": "backfill-lag",
        "backup_dir": str(backup_dir),
        "database_backup": str(db_backup),
        "total": len(animations),
        "flagged_count": len(flagged),
        "cleared_count": len(cleared),
        "flagged": flagged,
    }
    report_path = ROOT / "tmp/lag-backfill-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(report_path, 0o644)
    return report


def apply_thumbnails(db) -> dict:
    selected_ids = json.loads(THUMB_MANIFEST_PATH.read_text(encoding="utf-8"))
    if len(selected_ids) != len(set(selected_ids)):
        raise RuntimeError("缩略图替换清单包含重复课件 ID")
    for aid in selected_ids:
        validate_webp(THUMB_FINAL_DIR / f"production-{aid}.webp")

    backup_dir, db_backup = make_backup_dir("thumbnails-refresh")
    applied = []
    failed = []
    for aid in selected_ids:
        try:
            animation = db.query(Animation).filter(Animation.id == aid).first()
            if not animation:
                failed.append({"id": aid, "error": "animation not found"})
                continue
            result = install_thumbnail(animation, THUMB_FINAL_DIR / f"production-{aid}.webp", "audited-capture")
            db.commit()
            applied.append(result)
        except Exception as exc:
            db.rollback()
            failed.append({"id": aid, "error": str(exc)})

    report = {
        "action": "apply-thumbnails",
        "backup_dir": str(backup_dir),
        "database_backup": str(db_backup),
        "applied_count": len(applied),
        "applied": applied,
        "failed": failed,
    }
    report_path = ROOT / "tmp/thumbnails-refresh-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(report_path, 0o644)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["apply-tablet-fixes", "backfill-lag", "apply-thumbnails"])
    args = parser.parse_args()
    db = SessionLocal()
    try:
        if args.action == "apply-tablet-fixes":
            report = apply_tablet_fixes(db)
        elif args.action == "backfill-lag":
            report = backfill_lag(db)
        else:
            report = apply_thumbnails(db)
    finally:
        db.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report.get("failed") else 0


if __name__ == "__main__":
    raise SystemExit(main())
