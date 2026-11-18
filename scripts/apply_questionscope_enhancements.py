#!/usr/bin/env python3
"""Attach QuestionScope thumbnails and deploy the validated tablet optimization."""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, settings
from app.models import Animation
from app.routers.animations import validate_courseware

WORK_DIR = ROOT_DIR / "tmp/questionscope-future"
IMPORT_REPORT = WORK_DIR / "import-report.json"
OPTIMIZATION_REPORT = WORK_DIR / "optimization-report.json"
OPTIMIZED_HTML = WORK_DIR / "optimized/invisible-orbits.html"
THUMBNAIL_DIR = WORK_DIR / "thumbnails"
BACKUP_DIR = WORK_DIR / "original"
REPORT_PATH = WORK_DIR / "enhancement-report.json"
OPTIMIZATION_NOTE = "Tablet optimization: five oversized textures capped at 2048 px; visual content and attribution retained."


def main() -> int:
    imported = json.loads(IMPORT_REPORT.read_text(encoding="utf-8"))["imported"]
    optimization = json.loads(OPTIMIZATION_REPORT.read_text(encoding="utf-8"))
    if len(imported) != 14:
        raise SystemExit(f"预期 14 条导入记录，实际为 {len(imported)}")
    optimized_bytes = OPTIMIZED_HTML.read_bytes()
    status, summary, errors, warnings = validate_courseware(optimized_bytes)
    if status != "passed" or errors:
        raise SystemExit(f"优化版校验失败：{summary}；{'；'.join(errors)}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    db_backup = BACKUP_DIR / "edusimu-before-enhancements.db"
    if not db_backup.exists():
        shutil.copy2(BACKEND_DIR / "edusimu.db", db_backup)

    db = SessionLocal()
    replaced_file: Path | None = None
    original_backup: Path | None = None
    copied_thumbnails: list[Path] = []
    try:
        animations = []
        for item in imported:
            animation = db.get(Animation, item["animation_id"])
            if not animation or "[QuestionScope Future import]" not in (animation.description or ""):
                raise RuntimeError(f"未找到匹配的课件记录：{item['animation_id']}")
            animations.append((item, animation))

        thumbnail_results = []
        target_thumbnail_dir = Path(settings.upload_dir) / "thumbnails"
        target_thumbnail_dir.mkdir(parents=True, exist_ok=True)
        for item, animation in animations:
            source = THUMBNAIL_DIR / f"questionscope-{item['id']}.webp"
            with source.open("rb") as handle:
                header = handle.read(12)
            if header[:4] != b"RIFF" or header[8:12] != b"WEBP":
                raise RuntimeError(f"缩略图不是有效 WebP：{source}")
            target = target_thumbnail_dir / source.name
            shutil.copy2(source, target)
            copied_thumbnails.append(target)
            animation.thumbnail = f"/uploads/thumbnails/{source.name}"
            thumbnail_results.append({
                "animation_id": animation.id,
                "title": animation.title,
                "thumbnail": animation.thumbnail,
                "bytes": target.stat().st_size,
            })

        orbit_item, orbit_animation = next((item, animation) for item, animation in animations if item["id"] == "invisible-orbits")
        replaced_file = Path(orbit_animation.file_path)
        original_backup = BACKUP_DIR / "invisible-orbits.deployed-original.html"
        if not original_backup.exists():
            shutil.copy2(replaced_file, original_backup)
        temporary = replaced_file.with_suffix(".optimized.tmp")
        temporary.write_bytes(optimized_bytes)
        os.replace(temporary, replaced_file)
        orbit_animation.file_size = len(optimized_bytes)
        orbit_animation.validation_status = status
        orbit_animation.validation_summary = summary
        orbit_animation.validation_errors = "[]"
        orbit_animation.validation_warnings = json.dumps(warnings, ensure_ascii=False)
        if OPTIMIZATION_NOTE not in (orbit_animation.description or ""):
            orbit_animation.description = (orbit_animation.description or "") + "\n" + OPTIMIZATION_NOTE
        db.commit()

        report = {
            "thumbnails": thumbnail_results,
            "thumbnail_count": len(thumbnail_results),
            "thumbnail_total_bytes": sum(item["bytes"] for item in thumbnail_results),
            "optimized_animation_id": orbit_animation.id,
            "optimized_file_path": str(replaced_file),
            "original_backup": str(original_backup),
            "database_backup": str(db_backup),
            "optimization": optimization,
            "deployed_validation_status": status,
            "deployed_validation_summary": summary,
            "deployed_validation_warnings": warnings,
        }
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "thumbnails": len(thumbnail_results),
            "optimized_animation_id": orbit_animation.id,
            "optimized_bytes": len(optimized_bytes),
            "validation": summary,
        }, ensure_ascii=False))
        return 0
    except Exception:
        db.rollback()
        if replaced_file and original_backup and original_backup.exists():
            shutil.copy2(original_backup, replaced_file)
        for path in copied_thumbnails:
            path.unlink(missing_ok=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
