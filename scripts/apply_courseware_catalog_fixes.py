#!/usr/bin/env python3
"""Bind Mingxing Physics courseware to the matching textbook sections and publish the belt model."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pwd
import grp
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

from app.database import SessionLocal
from app.models import Animation, Subject, TextbookNode, User
from app.routers.animations import build_file_url, process_courseware_upload, remove_courseware_path


MINGXING_AUTHOR = "敏行物理（公开资源导入）"
MINGXING_MARKER = "[Mingxing Physics public import]"
BELT_TITLE = "传送带模型模拟器"
BELT_SOURCE = ROOT_DIR / "courseware" / "传送带模型模拟器" / "index.html"

# Paths are (book, chapter, section). The two supplemental section names keep
# the imported demonstrations discoverable without assigning them to a false
# textbook section. The Galton board is a statistics model, so it gets its own
# cross-disciplinary extension path.
MINGXING_SECTION_PATHS: dict[str, tuple[str, str, str]] = {
    "质谱仪": ("选择性必修第二册", "第一章 磁场", "第四节 质谱仪和回旋加速器"),
    "折射定律": ("选择性必修第一册", "第四章 光", "1. 光的折射"),
    "带电粒子在变化电场中的运动": ("必修第三册", "第十章 静电场中的能量", "5. 带电粒子在电场中的运动"),
    "霍尔效应3D演示": ("选择性必修第二册", "第一章 磁场", "第三节 带电粒子在磁场中的作用"),
    "霍尔效应演示2D": ("选择性必修第二册", "第一章 磁场", "第三节 带电粒子在磁场中的作用"),
    "弹簧振子能量变化": ("选择性必修第一册", "第二章 机械振动", "3. 简谐运动的回复力和能量"),
    "实深与视深辨析": ("选择性必修第一册", "第四章 光", "1. 光的折射"),
    "晶体的微观结构": ("选择性必修第三册", "第二章 气体、固体和液体", "4. 固体"),
    "原子结构的发现历程": ("选择性必修第三册", "第四章 原子结构和波粒二象性", "3. 原子的核式结构模型"),
    "固体": ("选择性必修第三册", "第二章 气体、固体和液体", "4. 固体"),
    "高尔顿板": ("拓展资源", "跨学科模型", "高尔顿板与正态分布"),
    "卫星发射与变轨动画演示": ("必修第二册", "第七章 万有引力与宇宙航行", "4. 宇宙航行"),
    "分子间作用力": ("选择性必修第三册", "第一章 分子动理论", "4. 分子动能和分子势能"),
    "气体实验定律": ("选择性必修第三册", "第二章 气体、固体和液体", "气体实验定律综合"),
    "气压模拟": ("选择性必修第三册", "第一章 分子动理论", "1. 分子动理论的基本内容"),
    "物块在转动圆盘运动分析（交互动画）物理人教版必修第二册": ("必修第二册", "第六章 圆周运动", "1. 圆周运动"),
    "气体压强与分子数密度（交互动画）物理人教版选择性必修第三册": ("选择性必修第三册", "第一章 分子动理论", "1. 分子动理论的基本内容"),
    "碰撞（交互动画）物理人教版选择性必修第一册": ("选择性必修第一册", "第一章 动量守恒定律", "5. 弹性碰撞和非弹性碰撞"),
    "楞次定律（交互动画）物理人教版选择性必修第二册": ("选择性必修第二册", "第二章 电磁感应", "第一节 感应电流的方向"),
    "地球的卫星（交互动画）物理人教版必修第二册": ("必修第二册", "第七章 万有引力与宇宙航行", "4. 宇宙航行"),
    "单摆阻尼（交互动画）物理人教版选择性必修第一册": ("选择性必修第一册", "第二章 机械振动", "阻尼振动"),
    "带电粒子在磁场中螺旋运动分析（交互动画）物理人教版选择性必修第二册": ("选择性必修第二册", "第一章 磁场", "第三节 带电粒子在磁场中的作用"),
    "波义耳定律（交互动画）物理人教版选择性必修第三册": ("选择性必修第三册", "第二章 气体、固体和液体", "2. 气体的等温变化"),
    "安培力（交互动画）物理人教版选择性必修第二册": ("选择性必修第二册", "第一章 磁场", "第一节 磁场对通电导线的作用"),
    "弹簧力与速度": ("选择性必修第一册", "第二章 机械振动", "1. 简谐运动"),
    "阻尼振动": ("选择性必修第一册", "第二章 机械振动", "阻尼振动"),
    "力的合成": ("必修第一册", "第三章 相互作用——力", "4. 力的合成和分解"),
    "安培力的微观解释": ("选择性必修第二册", "第一章 磁场", "第一节 磁场对通电导线的作用"),
    "匀变速运动：平均速度 = 中间时刻速度推导": ("必修第一册", "第二章 匀变速直线运动的研究", "2. 匀变速直线运动的速度与时间的关系"),
    "斜抛运动": ("必修第二册", "第五章 抛体运动", "4. 抛体运动的规律"),
    "匀变速直线运动图像问题": ("必修第一册", "第二章 匀变速直线运动的研究", "2. 匀变速直线运动的速度与时间的关系"),
    "导体棒磁铁": ("选择性必修第二册", "第一章 磁场", "第一节 磁场对通电导线的作用"),
}


def get_or_create_node(db, subject_id: int, parent: TextbookNode | None, node_type: str, name: str) -> TextbookNode:
    parent_id = parent.id if parent else None
    query = db.query(TextbookNode).filter(
        TextbookNode.subject_id == subject_id,
        TextbookNode.parent_id == parent_id,
        TextbookNode.node_type == node_type,
        TextbookNode.name == name,
    )
    node = query.first()
    if node:
        return node
    sibling_query = db.query(TextbookNode).filter(
        TextbookNode.subject_id == subject_id,
        TextbookNode.parent_id == parent_id,
        TextbookNode.node_type == node_type,
    )
    sort_order = (sibling_query.order_by(TextbookNode.sort_order.desc()).with_entities(TextbookNode.sort_order).first() or (0,))[0] + 1
    node = TextbookNode(subject_id=subject_id, parent_id=parent_id, node_type=node_type, name=name, sort_order=sort_order)
    db.add(node)
    db.flush()
    return node


def resolve_section(db, subject_id: int, path: tuple[str, str, str], create: bool) -> TextbookNode | None:
    parent = None
    for index, name in enumerate(path):
        node_type = ("book", "chapter", "section")[index]
        query = db.query(TextbookNode).filter(
            TextbookNode.subject_id == subject_id,
            TextbookNode.parent_id == (parent.id if parent else None),
            TextbookNode.node_type == node_type,
            TextbookNode.name == name,
        )
        node = query.first()
        if not node:
            if not create:
                return None
            node = get_or_create_node(db, subject_id, parent, node_type, name)
        parent = node
    return parent


def chown_courseware(path: str) -> None:
    try:
        uid = pwd.getpwnam("www-data").pw_uid
        gid = grp.getgrnam("www-data").gr_gid
    except KeyError:
        return
    package_dir = Path(path).parent
    for item in [package_dir, *package_dir.rglob("*")]:
        os.chown(item, uid, gid)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply database and upload changes (default is a dry run)")
    parser.add_argument("--source", type=Path, default=BELT_SOURCE)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.apply and not args.source.is_file():
        raise SystemExit(f"课件源文件不存在: {args.source}")

    db = SessionLocal()
    new_file_path = None
    committed = False
    try:
        subject = db.query(Subject).filter(Subject.name == "physics").first()
        if not subject:
            raise SystemExit("未找到 physics 学科")

        mingxing_rows = (
            db.query(Animation)
            .filter(Animation.subject_id == subject.id)
            .filter((Animation.author == MINGXING_AUTHOR) | Animation.description.contains(MINGXING_MARKER))
            .order_by(Animation.id)
            .all()
        )
        unmapped_titles = sorted({row.title for row in mingxing_rows} - set(MINGXING_SECTION_PATHS))
        if unmapped_titles:
            raise SystemExit("以下敏行物理课件尚无目录映射，停止修改: " + "、".join(unmapped_titles))

        bindings = []
        for animation in mingxing_rows:
            path = MINGXING_SECTION_PATHS[animation.title]
            # Creating missing supplemental nodes inside a dry-run transaction
            # lets us validate the full path list; rollback below keeps it read-only.
            section = resolve_section(db, subject.id, path, create=True)
            if not section:
                raise SystemExit(f"教材路径不存在: {' / '.join(path)}")
            bindings.append((animation, section, path))

        duplicates = db.query(Animation).filter(Animation.subject_id == subject.id, Animation.title == BELT_TITLE).all()
        if len(duplicates) > 1:
            raise SystemExit(f"物理学科存在多个同名课件，拒绝自动替换: {len(duplicates)} 条")
        belt_section = resolve_section(db, subject.id, ("必修第一册", "第四章 运动和力的关系", "3. 牛顿第二定律"), create=False)
        if not belt_section:
            raise SystemExit("未找到“必修第一册 / 第四章 运动和力的关系 / 3. 牛顿第二定律”目录")

        if not args.apply:
            print(json.dumps({
                "mode": "dry-run",
                "mingxing_rows": len(bindings),
                "mingxing_mappings": [{"id": row.id, "title": row.title, "path": " / ".join(path)} for row, _, path in bindings],
                "belt_existing_id": duplicates[0].id if duplicates else None,
                "belt_chapter": "必修第一册 / 第四章 运动和力的关系 / 3. 牛顿第二定律",
                "source_sha256": hashlib.sha256(args.source.read_bytes()).hexdigest() if args.source.is_file() else None,
            }, ensure_ascii=False, indent=2))
            db.rollback()
            return 0

        for animation, section, _ in bindings:
            animation.textbook_node_id = section.id
            db.add(animation)

        content = args.source.read_bytes()
        new_file_path, saved_size, validation_status, validation_summary, validation_errors, validation_warnings = process_courseware_upload(
            content, "传送带模型模拟器.html", subject.id
        )
        if validation_status != "passed" or validation_errors:
            raise SystemExit("传送带课件校验未通过: " + "; ".join(validation_errors))
        chown_courseware(new_file_path)

        belt = duplicates[0] if duplicates else None
        old_file_path = belt.file_path if belt else None
        if belt is None:
            admin = db.query(User).filter(User.role == "admin").order_by(User.id).first()
            if not admin:
                raise SystemExit("未找到管理员账号，无法登记课件")
            belt = Animation(title=BELT_TITLE, subject_id=subject.id, created_by=admin.id)
            db.add(belt)

        belt.title = BELT_TITLE
        belt.subject_id = subject.id
        belt.textbook_node_id = belt_section.id
        belt.description = "交互演示传送带模型中物块的受力、摩擦力方向及运动状态变化，对应牛顿第二定律。"
        belt.author = "系统管理员"
        belt.file_path = new_file_path
        belt.file_size = saved_size
        belt.grade_level = "高中"
        belt.keywords = "传送带模型,牛顿第二定律,摩擦力,受力分析"
        belt.source_type = "original"
        belt.is_published = True
        belt.review_status = "approved"
        belt.validation_status = validation_status
        belt.validation_summary = validation_summary
        belt.validation_errors = json.dumps(validation_errors, ensure_ascii=False)
        belt.validation_warnings = json.dumps(validation_warnings, ensure_ascii=False)

        db.commit()
        committed = True
        db.refresh(belt)
        if old_file_path and old_file_path != new_file_path:
            remove_courseware_path(old_file_path)

        print(json.dumps({
            "mode": "applied",
            "mingxing_bound": len(bindings),
            "belt": {
                "id": belt.id,
                "title": belt.title,
                "chapter": "必修第一册 / 第四章 运动和力的关系 / 3. 牛顿第二定律",
                "published": belt.is_published,
                "validation_status": belt.validation_status,
                "warnings": validation_warnings,
                "file_url": build_file_url(belt.file_path),
                "sha256": hashlib.sha256(Path(belt.file_path).read_bytes()).hexdigest(),
            },
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        db.rollback()
        if new_file_path and not committed:
            remove_courseware_path(new_file_path)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
