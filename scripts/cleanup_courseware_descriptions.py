#!/usr/bin/env python3
"""Remove import metadata from user-facing courseware descriptions."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import or_

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Animation  # noqa: E402

MARKERS = (
    "[Mingxing Physics public import]",
    "[EduSimu unit review static import]",
)
METADATA_PREFIXES = (
    "Source:",
    "Source resource ID:",
    "Imported from the publicly accessible Mingxing Physics course-resource catalogue",
)


def split_description(description: str) -> tuple[str | None, str]:
    """Keep user copy in the description and provenance in internal notes."""
    user_lines = []
    metadata_lines = []
    for line in description.splitlines():
        stripped = line.strip()
        if stripped in MARKERS or stripped.startswith(METADATA_PREFIXES):
            if not stripped.startswith("Imported from "):
                metadata_lines.append(stripped)
        else:
            user_lines.append(line.rstrip())
    user_description = "\n".join(user_lines).strip() or None
    return user_description, "\n".join(metadata_lines)


def backup_database(destination: Path) -> None:
    url = engine.url
    if url.get_backend_name() == "sqlite":
        database_path = Path(url.database or "")
        if not database_path.is_file():
            raise RuntimeError(f"SQLite 数据库不存在：{database_path}")
        shutil.copy2(database_path, destination)
        return
    if url.get_backend_name() != "postgresql":
        raise RuntimeError(f"不支持备份的数据库类型：{url.get_backend_name()}")

    command = ["pg_dump", "--format=custom", "--file", str(destination)]
    if url.host:
        command.extend(["--host", str(url.host)])
    if url.port:
        command.extend(["--port", str(url.port)])
    if url.username:
        command.extend(["--username", str(url.username)])
    command.append(url.database or "")
    environment = os.environ.copy()
    if url.password:
        environment["PGPASSWORD"] = url.password
    subprocess.run(
        command,
        check=True,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def matching_rows(db) -> list[Animation]:
    return (
        db.query(Animation)
        .filter(or_(*(Animation.description.contains(marker) for marker in MARKERS)))
        .order_by(Animation.id)
        .all()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "apply"))
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT_DIR / "tmp" / "courseware-description-cleanup-report.json",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        changes = []
        for animation in matching_rows(db):
            original = animation.description or ""
            cleaned, metadata = split_description(original)
            existing_notes = (animation.review_notes or "").strip()
            notes = existing_notes
            if metadata and metadata not in existing_notes:
                notes = "\n\n".join(filter(None, (existing_notes, metadata)))
            changes.append({
                "animation": animation,
                "description": cleaned,
                "review_notes": notes or None,
            })

        report = {
            "mode": args.action,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "matched": len(changes),
            "with_user_description": sum(bool(item["description"]) for item in changes),
            "without_user_description": sum(not bool(item["description"]) for item in changes),
            "items": [
                {
                    "id": item["animation"].id,
                    "title": item["animation"].title,
                    "description": item["description"],
                }
                for item in changes
            ],
        }

        if args.action == "apply" and changes:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup_dir = Path("/var/www/edusimu/backups") / f"courseware-descriptions-{timestamp}"
            if engine.url.get_backend_name() == "sqlite":
                backup_dir = ROOT_DIR / "tmp" / "backups" / f"courseware-descriptions-{timestamp}"
            backup_dir.mkdir(parents=True, exist_ok=False)
            backup_path = backup_dir / (
                "edusimu-postgresql.dump" if engine.url.get_backend_name() == "postgresql" else "edusimu.db"
            )
            backup_database(backup_path)
            if not backup_path.is_file() or backup_path.stat().st_size == 0:
                raise RuntimeError("数据库备份未生成有效文件")
            report["database_backup"] = str(backup_path)

            for item in changes:
                item["animation"].description = item["description"]
                item["animation"].review_notes = item["review_notes"]
                db.add(item["animation"])
            db.commit()
            remaining = len(matching_rows(db))
            if remaining:
                raise RuntimeError(f"仍有 {remaining} 条课件说明包含导入标记")
            report["remaining"] = 0
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
