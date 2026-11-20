#!/usr/bin/env python3
"""Publish M00–M09 and feature their collection on the EduSimu home page."""

from __future__ import annotations

import argparse
import json
from datetime import timedelta
from pathlib import Path
from tempfile import mkdtemp
from urllib.request import Request, urlopen

from import_tablet_diagnostic import ROOT, get_or_create_node
from import_unit_review_courseware import backup_database, find_chapter, own_for_web

from app.auth import create_access_token
from app.database import SessionLocal, settings
from app.models import Animation, AnimationCollection, CollectionItem, Subject, TextbookNode, User
from app.routers.animations import (
    build_file_url,
    evaluate_animation_file_performance,
    inspect_courseware_quiz,
    load_quiz_questions,
    process_courseware_upload,
    remove_courseware_path,
    validate_courseware,
)

PUBLIC_DIR = ROOT / "frontend" / "public" / "mech-lab-2027"
TITLE = "力学实验合集"
COVER = "/mech-lab-2027/collection-banner.jpg"
DESCRIPTION = "从基础仪器读数到动量守恒和单摆测重力加速度。每讲包含原理讲解、虚拟实验台和练习。"
MARKER = "[EduSimu mechanics lab import]"
CATALOG = [
    None,
    ("必修第一册", "第二章 匀变速直线运动的研究", "1."),
    ("必修第一册", "第三章 相互作用——力", "1."),
    ("必修第一册", "第四章 运动和力的关系", "2."),
    ("必修第二册", "第五章 抛体运动", "3."),
    ("必修第二册", "第六章 圆周运动", "2."),
    ("必修第一册", "第三章 相互作用——力", "4."),
    ("必修第二册", "第八章 机械能守恒定律", "5."),
    ("选择性必修第一册", "第一章 动量守恒定律", "4."),
    ("选择性必修第一册", "第二章 机械振动", "5."),
]
LIVE_BASE = "http://127.0.0.1:3003/edusimu"


def verify_release(collection_id, animation_ids, creator, question_count):
    token = create_access_token({"sub": creator.username, "role": creator.role}, timedelta(minutes=2))
    headers = {"Authorization": f"Bearer {token}"}
    with urlopen(Request(f"{LIVE_BASE}/api/collections/?banner_only=true", headers=headers), timeout=10) as response:
        banners = json.load(response)
    banner = next((item for item in banners if item["id"] == collection_id), None)
    if not banner or banner["cover_image"] != COVER:
        raise RuntimeError("线上首页推荐接口未返回力学实验合集封面")
    with urlopen(Request(f"{LIVE_BASE}/api/collections/{collection_id}", headers=headers), timeout=10) as response:
        detail = json.load(response)
    released = detail["animations"][:len(animation_ids)]
    if [item["id"] for item in released] != animation_ids or sum(item["quiz_count"] for item in released) != question_count:
        raise RuntimeError("线上合集课件顺序或题项数量不一致")
    with urlopen(f"{LIVE_BASE}{COVER}", timeout=10) as response:
        if response.read() != (PUBLIC_DIR / Path(COVER).name).read_bytes():
            raise RuntimeError("线上 Banner 与发布素材不一致")
    print(f"线上首页、合集和封面已核对：{len(released)} 个课件，{question_count} 个题项")


def read_items(db, subject_id):
    if not (PUBLIC_DIR / Path(COVER).name).is_file():
        raise RuntimeError("缺少合集 Banner")
    for index, catalog in enumerate(CATALOG):
        code = f"M{index:02d}"
        source, = PUBLIC_DIR.glob(f"{code}-*.html")
        title = source.stem.split("-", 1)[1]
        body = source.read_bytes()
        status, _, errors, _ = validate_courseware(body)
        has_quiz, manifest, _ = inspect_courseware_quiz(body)
        if status != "passed" or errors or not has_quiz:
            raise RuntimeError(f"{code} 课件或题目清单未通过校验：{errors}")

        section = None
        if catalog:
            book_name, chapter_name, section_prefix = catalog
            chapter = find_chapter(db, subject_id, {"book": book_name, "chapter": chapter_name})
            section = db.query(TextbookNode).filter_by(
                parent_id=chapter.id, node_type="section"
            ).filter(TextbookNode.name.startswith(section_prefix)).one()

        marker = f"{MARKER} {code}"
        row = db.query(Animation).filter(Animation.review_notes.contains(marker)).one_or_none()
        if row:
            title = row.title
        else:
            titles = db.query(Animation.id).filter_by(subject_id=subject_id)
            if titles.filter_by(title=title).first():
                title = f"{title} · 力学实验"
                if titles.filter_by(title=title).first():
                    raise RuntimeError(f"发现独立的同名课件，需先核对来源：{title}")

        yield code, source.name, title, body, manifest, section, row, marker


def run(action):
    new_files = []
    old_files = []
    with SessionLocal() as db:
        subject = db.query(Subject).filter_by(name="physics").one()
        creator = db.query(User).filter_by(username=settings.admin_username, role="admin").one()
        collection = db.query(AnimationCollection).filter_by(title=TITLE).one_or_none()
        items = list(read_items(db, subject.id))
        print("预检", [(code, row.id if row else None, len(load_quiz_questions(manifest)))
                     for code, _, _, _, manifest, _, row, _ in items])
        if action == "inspect":
            return

        backup_root = Path("/var/www/edusimu/backups")
        backup_root.mkdir(parents=True, exist_ok=True)
        backup = Path(mkdtemp(prefix="mechanics-lab-", dir=backup_root)) / "edusimu-postgresql.dump"
        backup_database(backup)
        print(f"数据库备份 {backup}")

        try:
            book = get_or_create_node(db, subject.id, None, "拓展资源", "book")
            chapter = get_or_create_node(db, subject.id, book.id, "物理实验", "chapter")
            basics = get_or_create_node(db, subject.id, chapter.id, "基础仪器与读数", "section")
            animations = []
            for code, filename, title, body, manifest, section, row, marker in items:
                if row is None:
                    row = Animation(title=title, subject_id=subject.id, created_by=creator.id,
                                    author=creator.real_name or creator.username, source_type="original",
                                    description=f"{title}。包含原理讲解、交互实验与练习。",
                                    keywords=f"力学实验,虚拟实验,{code}", review_notes=marker)
                    db.add(row)
                current = Path(row.file_path) if row.file_path else None
                if not current or not current.is_file() or current.read_bytes() != body:
                    path, size, status, summary, errors, warnings = process_courseware_upload(body, filename, subject.id)
                    new_files.append(path)
                    if current:
                        old_files.append(str(current))
                    own_for_web(Path(path).parent)
                    row.file_path = path
                    row.file_size = size
                    row.validation_status = status
                    row.validation_summary = summary
                    row.validation_errors = json.dumps(errors, ensure_ascii=False)
                    row.validation_warnings = json.dumps(warnings, ensure_ascii=False)
                    row.may_lag, row.lag_reason = evaluate_animation_file_performance(path, size, source_type="original")
                row.textbook_node_id = (section or basics).id
                row.is_published = True
                row.review_status = "approved"
                row.has_quiz = True
                row.quiz_manifest = manifest
                animations.append(row)

            if collection is None:
                collection = AnimationCollection(title=TITLE, description=DESCRIPTION, banner_order=0)
                db.add(collection)
            collection.cover_image = COVER
            collection.is_banner = True
            db.flush()
            released_ids = {row.id for row in animations}
            existing_items = {item.animation_id: item for item in collection.items}
            ordered_ids = [row.id for row in animations] + [
                item.animation_id for item in collection.items if item.animation_id not in released_ids
            ]
            if len(ordered_ids) > 100:
                raise RuntimeError("合集收录课件超过 100 个")
            for sort_order, animation_id in enumerate(ordered_ids):
                if animation_id in existing_items:
                    existing_items[animation_id].sort_order = sort_order
                else:
                    collection.items.append(CollectionItem(animation_id=animation_id, sort_order=sort_order))
            db.commit()
        except Exception:
            db.rollback()
            for path in new_files:
                remove_courseware_path(path)
            raise

        print(json.dumps({
            "collection_id": collection.id,
            "cover": COVER,
            "animations": [{"id": row.id, "title": row.title, "url": build_file_url(row.file_path)}
                           for row in animations],
        }, ensure_ascii=False))
        for path in old_files:
            remove_courseware_path(path)
        verify_release(collection.id, [row.id for row in animations], creator,
                       sum(len(load_quiz_questions(row.quiz_manifest)) for row in animations))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "apply"))
    run(parser.parse_args().action)
