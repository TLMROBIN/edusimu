#!/usr/bin/env python3
"""
Rebind physics courseware to better textbook sections and refresh concise descriptions.

Rules:
- Prefer explicit PhET project -> section mapping
- If no suitable section exists, fallback to "PhET 物理仿真"
- Update descriptions to concise function summaries
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import Animation, TextbookNode

import import_phet_physics_catalog as catalog


PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*'([^']+)'")

LOCAL_TITLE_RULES = {
    "右手螺旋定则": {
        "section": "3. 电磁感应现象及应用",
        "description": "演示通电导线周围磁场方向与右手螺旋定则。",
    },
    "机械波多解性问题1": {
        "section": "2. 波的描述",
        "description": "演示机械波传播中的相位关系和多解分析。",
    },
    "光电效应演示实验": {
        "section": "2. 光电效应",
        "description": "演示入射光频率、光强和遏止电压对光电效应的影响。",
    },
    "核裂变与聚变演示实验": {
        "section": "4. 核裂变与核聚变",
        "description": "比较核裂变与核聚变的条件、过程和能量释放。",
    },
    "质谱仪原理": {
        "section": "第四节 质谱仪和回旋加速器",
        "description": "演示质谱仪中带电粒子的偏转与质量分析原理。",
    },
    "回旋加速器": {
        "section": "第四节 质谱仪和回旋加速器",
        "description": "演示回旋加速器中带电粒子的加速过程和轨道变化。",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remap physics courseware textbook bindings")
    parser.add_argument("--subject-id", type=int, default=4, help="Physics subject id")
    parser.add_argument("--dry-run", action="store_true", help="Only print changes")
    return parser.parse_args()


def extract_project(file_path: str | None) -> str | None:
    if not file_path or not os.path.exists(file_path):
        return None
    text = Path(file_path).read_text(encoding="utf-8", errors="ignore")
    match = PHET_PROJECT_RE.search(text)
    return match.group(1) if match else None


def build_section_map(db, subject_id: int) -> dict[str, int]:
    nodes = (
        db.query(TextbookNode)
        .filter(TextbookNode.subject_id == subject_id, TextbookNode.node_type == "section")
        .all()
    )
    return {node.name: node.id for node in nodes}


def resolve_target(animation: Animation, project: str | None) -> tuple[str | None, str | None]:
    if project:
        return (
            catalog.SIM_SECTION_TARGETS.get(project, "PhET 物理仿真"),
            catalog.SIM_DESCRIPTIONS.get(project, animation.description or ""),
        )

    rule = LOCAL_TITLE_RULES.get(animation.title)
    if rule:
        return rule["section"], rule["description"]

    return None, None


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        section_map = build_section_map(db, args.subject_id)
        fallback_id = section_map.get("PhET 物理仿真")
        if not fallback_id:
            raise SystemExit("未找到 PhET 物理仿真 章节节点")

        animations = (
            db.query(Animation)
            .filter(Animation.subject_id == args.subject_id)
            .order_by(Animation.id.asc())
            .all()
        )

        updated = 0
        for animation in animations:
            project = extract_project(animation.file_path)
            section_name, description = resolve_target(animation, project)
            if not section_name and not description:
                continue

            target_section_id = section_map.get(section_name) if section_name else animation.textbook_node_id
            if section_name and target_section_id is None:
                target_section_id = fallback_id

            changed = False
            if target_section_id and animation.textbook_node_id != target_section_id:
                changed = True
                if args.dry_run:
                    print(f"[DRY] 章节: {animation.id} {animation.title} -> {section_name}")
                else:
                    animation.textbook_node_id = target_section_id

            concise_description = (description or "").strip()
            if concise_description and (animation.description or "").strip() != concise_description:
                changed = True
                if args.dry_run:
                    print(f"[DRY] 描述: {animation.id} {animation.title} -> {concise_description}")
                else:
                    animation.description = concise_description

            if changed and not args.dry_run:
                db.add(animation)
                updated += 1
            elif changed:
                updated += 1

        if not args.dry_run:
            db.commit()
        print(f"更新条数: {updated}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
