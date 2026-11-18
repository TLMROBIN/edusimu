#!/usr/bin/env python3
"""Export, finalize, and apply real screenshots as EduSimu courseware thumbnails."""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend/edusimu.db"
WORK_DIR = ROOT / "tmp/courseware-thumbnails"
RAW_DIR = WORK_DIR / "raw"
FINAL_DIR = WORK_DIR / "final"
MANIFEST_PATH = WORK_DIR / "manifest.json"
REPORT_PATH = WORK_DIR / "thumbnail-report.json"
QUESTIONSCOPE_MARKER = "[QuestionScope Future import]"


def load_manifest() -> list[dict]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def export_manifest() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT id, title, file_path, thumbnail, file_size
            FROM animations
            WHERE description NOT LIKE ? OR description IS NULL
            ORDER BY id
            """,
            (f"%{QUESTIONSCOPE_MARKER}%",),
        ).fetchall()
    finally:
        connection.close()
    manifest = []
    for row in rows:
        file_path = Path(row["file_path"])
        if "/uploads/" not in row["file_path"]:
            raise RuntimeError(f"无法转换课件路径：{file_path}")
        relative = row["file_path"].split("/uploads/", 1)[1]
        manifest.append({
            "id": row["id"],
            "title": row["title"],
            "file_path": str(file_path),
            "url_path": f"/uploads/{relative}",
            "old_thumbnail": row["thumbnail"],
            "file_size": row["file_size"],
        })
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST_PATH), "count": len(manifest)}, ensure_ascii=False))


def label_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Light.ttc"):
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def finalize_thumbnails() -> None:
    manifest = {item["id"]: item for item in load_manifest()}
    captures = []
    for path in sorted(WORK_DIR.glob("capture-results-*.json")):
        captures.extend(json.loads(path.read_text(encoding="utf-8")))
    latest = {}
    for capture in captures:
        latest[capture["id"]] = capture

    results = []
    for animation_id, item in sorted(manifest.items()):
        capture = latest.get(animation_id)
        result = {"id": animation_id, "title": item["title"], "capture": capture or {"ok": False, "error": "not captured"}}
        raw_path = RAW_DIR / f"{animation_id:04d}.png"
        if capture and capture.get("ok") and raw_path.exists():
            with Image.open(raw_path) as image:
                rgb = image.convert("RGB")
                if animation_id == 4:
                    rgb = ImageOps.autocontrast(rgb, cutoff=1)
                stat = ImageStat.Stat(rgb.resize((160, 90)))
                variance = round(sum(stat.stddev) / 3, 2)
                thumbnail = ImageOps.fit(rgb, (640, 360), method=Image.Resampling.LANCZOS)
                final_path = FINAL_DIR / f"courseware-{animation_id:04d}.webp"
                thumbnail.save(final_path, "WEBP", quality=86, method=6)
            result.update({
                "ok": True,
                "path": str(final_path),
                "bytes": final_path.stat().st_size,
                "visual_stddev": variance,
                "needs_review": variance < 8,
            })
        else:
            result.update({"ok": False, "needs_review": True})
        results.append(result)

    font = label_font(16)
    for old_sheet in WORK_DIR.glob("contact-sheet-*.jpg"):
        old_sheet.unlink()
    ready = [item for item in results if item["ok"]]
    for sheet_index in range(0, len(ready), 12):
        chunk = ready[sheet_index:sheet_index + 12]
        sheet = Image.new("RGB", (1280, 3 * 214), "#111827")
        draw = ImageDraw.Draw(sheet)
        for index, item in enumerate(chunk):
            with Image.open(item["path"]) as image:
                tile = image.convert("RGB").resize((320, 180), Image.Resampling.LANCZOS)
            x = (index % 4) * 320
            y = (index // 4) * 214
            sheet.paste(tile, (x, y))
            title = item["title"]
            if len(title) > 20:
                title = title[:19] + "…"
            draw.text((x + 8, y + 186), f"{item['id']:02d}  {title}", font=font, fill="#f8fafc")
        sheet_path = WORK_DIR / f"contact-sheet-{sheet_index // 12 + 1:02d}.jpg"
        sheet.save(sheet_path, "JPEG", quality=90, optimize=True)

    REPORT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "total": len(results),
        "ready": len(ready),
        "failed": sum(not item["ok"] for item in results),
        "needs_review": sum(item["needs_review"] for item in results),
        "total_bytes": sum(item.get("bytes", 0) for item in results),
    }, ensure_ascii=False))


def apply_thumbnails() -> None:
    results = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    ready = [item for item in results if item["ok"]]
    if not ready:
        raise RuntimeError("没有可上传的缩略图")
    backup_dir = WORK_DIR / "backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    db_backup = backup_dir / "edusimu-before-thumbnails.db"
    if not db_backup.exists():
        shutil.copy2(DB_PATH, db_backup)

    target_dir = ROOT / "backend/uploads/thumbnails"
    target_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    applied = []
    try:
        with connection:
            for item in ready:
                source = Path(item["path"])
                with source.open("rb") as handle:
                    header = handle.read(12)
                if header[:4] != b"RIFF" or header[8:12] != b"WEBP":
                    raise RuntimeError(f"无效 WebP：{source}")
                target = target_dir / source.name
                shutil.copy2(source, target)
                thumbnail_path = f"/uploads/thumbnails/{source.name}"
                cursor = connection.execute(
                    "UPDATE animations SET thumbnail = ? WHERE id = ?",
                    (thumbnail_path, item["id"]),
                )
                if cursor.rowcount != 1:
                    raise RuntimeError(f"课件记录不存在：{item['id']}")
                applied.append({"id": item["id"], "title": item["title"], "thumbnail": thumbnail_path, "bytes": target.stat().st_size})
    finally:
        connection.close()
    apply_report = {
        "applied": applied,
        "applied_count": len(applied),
        "missing_or_failed": [item for item in results if not item["ok"]],
        "database_backup": str(db_backup),
    }
    (WORK_DIR / "apply-report.json").write_text(json.dumps(apply_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"applied": len(applied), "missing_or_failed": len(apply_report["missing_or_failed"])}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["export", "finalize", "apply"])
    args = parser.parse_args()
    if args.action == "export":
        export_manifest()
    elif args.action == "finalize":
        finalize_thumbnails()
    else:
        apply_thumbnails()


if __name__ == "__main__":
    main()
