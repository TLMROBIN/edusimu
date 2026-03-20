#!/usr/bin/env python3
import argparse
import re
from pathlib import Path

from app.routers.animations import render_default_thumbnail_image


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate default courseware thumbnails in place.")
    parser.add_argument("thumbnail_dir", help="Directory containing default_*.png thumbnails")
    args = parser.parse_args()

    thumbnail_dir = Path(args.thumbnail_dir)
    if not thumbnail_dir.exists():
        print(f"目录不存在: {thumbnail_dir}")
        return 1

    count = 0
    for path in thumbnail_dir.glob("default_*.png"):
        match = re.match(r"default_(\d+)_", path.name)
        if not match:
            continue
        render_default_thumbnail_image(str(path), int(match.group(1)))
        count += 1

    print(f"已重生成 {count} 张默认缩略图")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
