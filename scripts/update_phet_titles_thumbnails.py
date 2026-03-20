#!/usr/bin/env python3
"""
Update PhET physics animations:
- Translate English titles to Chinese (when no official zh_CN title exists)
- Remove duplicates where older record already exists
- Download official thumbnails and attach to animations
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, settings
from app.models import Animation
from app.routers.animations import remove_courseware_path, remove_file_if_exists

import import_phet_physics_catalog as catalog


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update PhET titles and thumbnails")
    parser.add_argument("--metadata-file", default=catalog.DEFAULT_METADATA_FILE, help="Path to partner-services JSON")
    parser.add_argument("--metadata-url", help="Optional URL to fetch partner-services JSON")
    parser.add_argument("--subject-id", type=int, default=4, help="EduSimu physics subject id")
    parser.add_argument("--min-id", type=int, default=95, help="Minimum animation id for new batch")
    parser.add_argument("--max-id", type=int, default=158, help="Maximum animation id for new batch")
    parser.add_argument("--dry-run", action="store_true", help="Only print actions")
    return parser.parse_args()


def load_metadata(args: argparse.Namespace) -> dict:
    if args.metadata_url:
        request = urllib_request.Request(
            args.metadata_url,
            headers={"User-Agent": "EduSimuPhETImporter/1.0"},
        )
        with urllib_request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    path = Path(args.metadata_file)
    if not path.exists():
        raise SystemExit(f"Metadata file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def pick_best_image(sim_images: list[dict]) -> dict | None:
    if not sim_images:
        return None
    pngs = [img for img in sim_images if img.get("format") == "image/png"]
    candidates = pngs or sim_images
    target_width = 600
    return min(candidates, key=lambda img: abs((img.get("width") or target_width) - target_width))


def build_sim_maps(simulations: list[dict], translation: dict[str, str]) -> tuple[dict[str, dict], dict[str, dict]]:
    title_map: dict[str, dict] = {}
    name_map: dict[str, dict] = {}
    for sim in simulations:
        name = sim.get("name", "")
        name_map[name] = sim
        default_title = sim.get("defaultData", {}).get("title")
        if default_title:
            title_map[default_title] = sim
        localized = sim.get("localizedData", {}) or {}
        if "zh_CN" in localized:
            zh_title = localized["zh_CN"].get("title")
            if zh_title:
                title_map[zh_title] = sim
        translated = translation.get(name)
        if translated:
            title_map[translated] = sim
    return title_map, name_map


def download_thumbnail(url: str, target_dir: str, sim_name: str) -> str:
    os.makedirs(target_dir, exist_ok=True)
    timestamp = int(time.time() * 1000)
    random_id = random.randint(1000, 9999)
    filename = f"phet_{sim_name}_{timestamp}_{random_id}.png"
    absolute_path = os.path.join(target_dir, filename)
    request = urllib_request.Request(
        url,
        headers={"User-Agent": "EduSimuPhETImporter/1.0"},
    )
    with urllib_request.urlopen(request, timeout=30) as response:
        with open(absolute_path, "wb") as buffer:
            buffer.write(response.read())
    return f"/uploads/thumbnails/{filename}"


def main() -> int:
    args = parse_args()
    metadata = load_metadata(args)
    simulations = metadata.get("simulations", [])
    if not simulations:
        raise SystemExit("未找到 simulations 数据")

    translation = catalog.EN_TITLE_TRANSLATIONS
    title_map, name_map = build_sim_maps(simulations, translation)

    db = SessionLocal()
    try:
        new_batch = (
            db.query(Animation)
            .filter(
                Animation.subject_id == args.subject_id,
                Animation.id >= args.min_id,
                Animation.id <= args.max_id,
            )
            .order_by(Animation.id.asc())
            .all()
        )
        existing_titles = {
            row.title
            for row in db.query(Animation.title)
            .filter(Animation.subject_id == args.subject_id, Animation.id < args.min_id)
            .all()
        }

        for animation in new_batch:
            original_title = animation.title
            sim = title_map.get(original_title)
            if sim:
                sim_name = sim.get("name", "")
                translated = translation.get(sim_name)
                if translated and animation.title != translated:
                    if args.dry_run:
                        print(f"[DRY] 标题翻译: {animation.id} {animation.title} -> {translated}")
                    else:
                        animation.title = translated
                        db.add(animation)
                        db.commit()
                        original_title = translated

            if original_title in existing_titles:
                if args.dry_run:
                    print(f"[DRY] 删除重复: {animation.id} {original_title}")
                else:
                    remove_courseware_path(animation.file_path)
                    if animation.thumbnail and animation.thumbnail.startswith("/uploads/thumbnails/"):
                        remove_file_if_exists(os.path.join(settings.upload_dir, animation.thumbnail.replace("/uploads/", "")))
                    db.delete(animation)
                    db.commit()
                continue

            if animation.thumbnail:
                continue

            if not sim:
                sim = title_map.get(animation.title)
            if not sim:
                print(f"跳过缩略图: 未匹配到元数据 {animation.id} {animation.title}")
                continue

            sim_images = sim.get("defaultData", {}).get("simImages") or []
            image = pick_best_image(sim_images)
            if not image or not image.get("url"):
                print(f"跳过缩略图: 无可用图片 {animation.id} {animation.title}")
                continue

            if args.dry_run:
                print(f"[DRY] 缩略图: {animation.id} {animation.title} -> {image['url']}")
                continue

            thumbnail_dir = os.path.join(settings.upload_dir, "thumbnails")
            thumbnail_path = download_thumbnail(image["url"], thumbnail_dir, sim.get("name", "phet"))
            animation.thumbnail = thumbnail_path
            db.add(animation)
            db.commit()
            print(f"已更新缩略图: {animation.id} {animation.title}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
