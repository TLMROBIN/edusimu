#!/usr/bin/env python3
"""Measure embedded assets and rendering hints in QuestionScope courseware."""

from __future__ import annotations

import base64
import gzip
import io
import json
import re
from collections import defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp/questionscope-future/processed"
REPORT_PATH = ROOT / "tmp/questionscope-future/performance-analysis.json"
DATA_URL_RE = re.compile(
    r"data:(?P<mime>[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+)(?P<params>(?:;[A-Za-z0-9_.=-]+)*),(?P<data>[A-Za-z0-9+/=%_-]+)"
)


def main() -> None:
    report = []
    for path in sorted(SOURCE_DIR.glob("*.html")):
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        assets = []
        by_mime: dict[str, int] = defaultdict(int)
        for match in DATA_URL_RE.finditer(text):
            mime = match.group("mime").lower()
            encoded = match.group("data")
            try:
                if ";base64" in match.group("params").lower():
                    payload = base64.b64decode(encoded)
                else:
                    from urllib.parse import unquote_to_bytes

                    payload = unquote_to_bytes(encoded)
            except Exception:
                continue
            by_mime[mime] += len(payload)
            item = {"mime": mime, "bytes": len(payload)}
            if mime.startswith("image/"):
                try:
                    with Image.open(io.BytesIO(payload)) as image:
                        item["width"], item["height"] = image.size
                        item["format"] = image.format
                except Exception:
                    pass
            assets.append(item)
        assets.sort(key=lambda item: item["bytes"], reverse=True)
        report.append({
            "file": path.name,
            "bytes": len(raw),
            "gzip_bytes": len(gzip.compress(raw, compresslevel=9)),
            "embedded_decoded_bytes": sum(by_mime.values()),
            "embedded_by_mime": dict(sorted(by_mime.items(), key=lambda pair: pair[1], reverse=True)),
            "largest_assets": assets[:15],
            "rendering": {
                "setPixelRatio": re.findall(r"setPixelRatio\s*\((.{0,100}?)\)", text),
                "devicePixelRatio_snippets": re.findall(r".{0,70}devicePixelRatio.{0,100}", text)[:10],
                "antialias_true": len(re.findall(r"antialias\s*:\s*!0|antialias\s*:\s*true", text)),
                "requestAnimationFrame_mentions": text.count("requestAnimationFrame"),
                "shadowMap_mentions": text.count("shadowMap"),
            },
        })
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for item in report:
        print(json.dumps({key: item[key] for key in ("file", "bytes", "gzip_bytes", "embedded_decoded_bytes", "embedded_by_mime")}, ensure_ascii=False))
        if item["file"] == "invisible-orbits.html":
            print(json.dumps(item["largest_assets"], ensure_ascii=False, indent=2))
            print(json.dumps(item["rendering"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
