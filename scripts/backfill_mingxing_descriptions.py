#!/usr/bin/env python3
"""Fill empty Mingxing Physics descriptions with concise Chinese courseware copy."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import or_

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Animation  # noqa: E402
from cleanup_courseware_descriptions import backup_database  # noqa: E402
from mingxing_descriptions import DESCRIPTIONS  # noqa: E402

MARKER = "[Mingxing Physics public import]"


def imported_rows(db) -> list[Animation]:
    return (
        db.query(Animation)
        .filter(or_(Animation.description.contains(MARKER), Animation.review_notes.contains(MARKER)))
        .order_by(Animation.id)
        .all()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "apply"))
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT_DIR / "tmp" / "mingxing-description-backfill-report.json",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = imported_rows(db)
        candidates = [row for row in rows if not (row.description or "").strip()]
        unmapped = sorted({row.title for row in candidates if row.title not in DESCRIPTIONS})
        if unmapped:
            raise RuntimeError("以下课件尚无中文说明：" + "、".join(unmapped))

        report = {
            "mode": args.action,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "imported_rows": len(rows),
            "already_described": len(rows) - len(candidates),
            "to_fill": len(candidates),
            "items": [
                {"id": row.id, "title": row.title, "description": DESCRIPTIONS[row.title]}
                for row in candidates
            ],
        }

        if args.action == "apply" and candidates:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup_dir = Path("/var/www/edusimu/backups") / f"mingxing-descriptions-{timestamp}"
            if engine.url.get_backend_name() == "sqlite":
                backup_dir = ROOT_DIR / "tmp" / "backups" / f"mingxing-descriptions-{timestamp}"
            backup_dir.mkdir(parents=True, exist_ok=False)
            backup_path = backup_dir / (
                "edusimu-postgresql.dump" if engine.url.get_backend_name() == "postgresql" else "edusimu.db"
            )
            backup_database(backup_path)
            if not backup_path.is_file() or backup_path.stat().st_size == 0:
                raise RuntimeError("数据库备份未生成有效文件")
            report["database_backup"] = str(backup_path)

            for row in candidates:
                row.description = DESCRIPTIONS[row.title]
                db.add(row)
            db.commit()
            remaining = sum(not (row.description or "").strip() for row in imported_rows(db))
            if remaining:
                raise RuntimeError(f"仍有 {remaining} 条敏行物理课件缺少中文说明")
            report["remaining_empty"] = 0
        else:
            db.rollback()

        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key != "items"}, ensure_ascii=False, indent=2))
        print(f"详细报告：{args.report}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
