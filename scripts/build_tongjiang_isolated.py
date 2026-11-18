#!/usr/bin/env python3
"""Package the original Tongjiang HTML in a portable opaque-origin iframe."""
import argparse
import base64
import hashlib
import html
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = "edusimu-isolated-tongjiang-v1"


def build(source_root: Path, output: Path) -> list[dict]:
    template = (ROOT / "scripts/tongjiang_isolated_wrapper.html").read_text()
    manifest = json.loads((source_root / "download-manifest.json").read_text())
    meta = json.loads((source_root / "course-meta.json").read_text())
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for item in meta:
        source = Path(manifest[item["slug"]]["path"]).read_bytes()
        slugs = re.findall(rb'meta:\{slug:"([^"\\]+)"', source)
        if slugs != [item["slug"].encode()]:
            raise ValueError(f"Source progress key differs: {item['slug']}: {slugs}")
        config = {"version": 1, "marker": MARKER, "slug": item["slug"],
                  "sourceSha256": hashlib.sha256(source).hexdigest(),
                  "sourceBytes": len(source), "sourceBase64": base64.b64encode(source).decode()}
        config_json = json.dumps(config, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
        wrapped = template.replace("__TITLE__", html.escape(item["title"])).replace("__CONFIG__", config_json).encode()
        (output / f"{item['slug']}.html").write_bytes(wrapped)
        package = output / f"{item['slug']}.zip"
        with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("index.html", wrapped)
        rows.append({**item, "sourceSha256": config["sourceSha256"], "sourceBytes": len(source),
                     "wrappedSha256": hashlib.sha256(wrapped).hexdigest(), "wrappedBytes": len(wrapped),
                     "packageBytes": package.stat().st_size, "html": str(output / f"{item['slug']}.html"),
                     "zip": str(package)})
    (output / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("/Users/binyu/Downloads/铜匠动画课件"))
    parser.add_argument("--output", type=Path, default=ROOT / "tmp/tongjiang-isolated")
    args = parser.parse_args()
    rows = build(args.source, args.output.resolve())
    print(json.dumps({"count": len(rows), "largest_zip": max(row["packageBytes"] for row in rows), "output": str(args.output)}, ensure_ascii=False))
