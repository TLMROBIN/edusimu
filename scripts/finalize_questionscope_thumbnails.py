#!/usr/bin/env python3
"""Turn captured QuestionScope pages into lightweight 16:9 WebP thumbnails."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = ROOT / "tmp/questionscope-future"
RAW_DIR = WORK_DIR / "thumbnails-raw"
OUTPUT_DIR = WORK_DIR / "thumbnails"
REPORT_PATH = WORK_DIR / "import-report.json"
CONTACT_SHEET = WORK_DIR / "thumbnails-contact-sheet.jpg"


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Light.ttc"):
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    results = []
    for item in report["imported"]:
        source = RAW_DIR / f"{item['id']}.png"
        target = OUTPUT_DIR / f"questionscope-{item['id']}.webp"
        with Image.open(source) as image:
            fitted = ImageOps.fit(image.convert("RGB"), (640, 360), method=Image.Resampling.LANCZOS)
            fitted.save(target, "WEBP", quality=84, method=6)
        results.append({"id": item["id"], "title": item["title"], "path": str(target), "bytes": target.stat().st_size})

    columns, rows = 4, 4
    tile_width, image_height, label_height = 320, 180, 34
    sheet = Image.new("RGB", (columns * tile_width, rows * (image_height + label_height)), "#111827")
    draw = ImageDraw.Draw(sheet)
    label_font = font(17)
    for index, item in enumerate(results):
        with Image.open(item["path"]) as image:
            tile = image.convert("RGB").resize((tile_width, image_height), Image.Resampling.LANCZOS)
        x = (index % columns) * tile_width
        y = (index // columns) * (image_height + label_height)
        sheet.paste(tile, (x, y))
        draw.text((x + 10, y + image_height + 6), f"{index + 1:02d}  {item['title']}", font=label_font, fill="#f8fafc")
    sheet.save(CONTACT_SHEET, "JPEG", quality=88, optimize=True)
    (WORK_DIR / "thumbnail-report.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(results), "bytes": sum(item["bytes"] for item in results), "contact_sheet": str(CONTACT_SHEET)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
