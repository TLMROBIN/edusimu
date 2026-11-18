#!/usr/bin/env python3
"""Create a tablet-friendly QuestionScope package with bounded texture sizes."""

from __future__ import annotations

import base64
import gzip
import io
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = ROOT / "tmp/questionscope-future"
SOURCE = WORK_DIR / "processed/invisible-orbits.html"
TARGET_DIR = WORK_DIR / "optimized"
TARGET = TARGET_DIR / "invisible-orbits.html"
REPORT = WORK_DIR / "optimization-report.json"
MAX_TEXTURE_EDGE = 2048
WEBP_QUALITY = 84
DATA_URL_RE = re.compile(
    r"data:(?P<mime>[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+)(?P<params>(?:;[A-Za-z0-9_.=-]+)*),(?P<data>[A-Za-z0-9+/=%_-]+)"
)


def main() -> None:
    raw = SOURCE.read_bytes()
    text = raw.decode("utf-8")
    changes = []
    pieces = []
    cursor = 0
    for match in DATA_URL_RE.finditer(text):
        if match.group("mime").lower() != "image/webp" or ";base64" not in match.group("params").lower():
            continue
        payload = base64.b64decode(match.group("data"))
        with Image.open(io.BytesIO(payload)) as source_image:
            source_image.load()
            width, height = source_image.size
            if max(width, height) <= MAX_TEXTURE_EDGE:
                continue
            scale = MAX_TEXTURE_EDGE / max(width, height)
            target_size = (round(width * scale), round(height * scale))
            image = source_image.convert("RGBA") if "A" in source_image.getbands() else source_image.convert("RGB")
            resized = image.resize(target_size, Image.Resampling.LANCZOS)
            output = io.BytesIO()
            resized.save(output, "WEBP", quality=WEBP_QUALITY, method=6)
            optimized_payload = output.getvalue()

        encoded = base64.b64encode(optimized_payload).decode("ascii")
        replacement = f"data:image/webp;base64,{encoded}"
        pieces.append(text[cursor:match.start()])
        pieces.append(replacement)
        cursor = match.end()
        changes.append({
            "original_dimensions": [width, height],
            "optimized_dimensions": list(target_size),
            "original_bytes": len(payload),
            "optimized_bytes": len(optimized_payload),
            "original_rgba_bytes": width * height * 4,
            "optimized_rgba_bytes": target_size[0] * target_size[1] * 4,
        })
    pieces.append(text[cursor:])
    optimized = "".join(pieces).encode("utf-8")
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(optimized)

    report = {
        "source": str(SOURCE),
        "target": str(TARGET),
        "max_texture_edge": MAX_TEXTURE_EDGE,
        "webp_quality": WEBP_QUALITY,
        "original_bytes": len(raw),
        "optimized_bytes": len(optimized),
        "original_gzip_bytes": len(gzip.compress(raw, compresslevel=9)),
        "optimized_gzip_bytes": len(gzip.compress(optimized, compresslevel=9)),
        "size_reduction_percent": round((1 - len(optimized) / len(raw)) * 100, 2),
        "gzip_reduction_percent": round((1 - len(gzip.compress(optimized, compresslevel=9)) / len(gzip.compress(raw, compresslevel=9))) * 100, 2),
        "changed_textures": len(changes),
        "original_changed_texture_rgba_bytes": sum(item["original_rgba_bytes"] for item in changes),
        "optimized_changed_texture_rgba_bytes": sum(item["optimized_rgba_bytes"] for item in changes),
        "changes": changes,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
