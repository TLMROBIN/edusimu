#!/usr/bin/env python3
"""
Import non-physics official PhET HTML simulations into EduSimu.

Rules:
- import only official HTML, non-prototype simulations
- dedupe by actual PhET project across the whole system
- prefer official zh_CN runUrl when available
- if no official zh_CN exists, keep English runtime but use Chinese system title
- Earth & Space maps to EduSimu geography
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, settings
from app.models import Animation, TextbookNode, User

import import_phet_html


PHET_BASE_URL = "https://phet.colorado.edu"
OFFICIAL_METADATA_URL = (
    "https://phet.colorado.edu/services/metadata/1.3/simulations"
    "?format=json&summary&includePrototypes"
)
DEFAULT_PARTNER_METADATA_FILE = "/tmp/phet_partner_simulations.json"
PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*'([^']+)'")

TARGET_SUBJECTS = {
    "Math & Statistics": {
        "subject_id": 2,
        "subject_name": "math",
        "display_name": "数学",
        "fallback_section_name": "PhET 数学仿真",
    },
    "Chemistry": {
        "subject_id": 5,
        "subject_name": "chemistry",
        "display_name": "化学",
        "fallback_section_name": "PhET 化学仿真",
    },
    "Biology": {
        "subject_id": 6,
        "subject_name": "biology",
        "display_name": "生物",
        "fallback_section_name": "PhET 生物仿真",
    },
    "Earth & Space": {
        "subject_id": 7,
        "subject_name": "geography",
        "display_name": "地理",
        "fallback_section_name": "PhET 地理仿真",
    },
}

OFFICIAL_SUBJECT_ID_TO_LABEL = {
    12: "Biology",
    13: "Chemistry",
    14: "Earth & Space",
    15: "Math & Statistics",
}

PRIMARY_SUBJECT_BY_PROJECT = {
    "membrane-transport": "Biology",
    "molecule-polarity": "Chemistry",
    "ph-scale": "Chemistry",
}

TITLE_OVERRIDES = {
    "center-and-variability": "中心与离散程度",
    "greenhouse-effect": "温室效应",
    "mean-share-and-balance": "平均数：分配与平衡",
    "membrane-transport": "膜运输",
    "number-compare": "数字比较",
    "number-pairs": "数字配对",
    "ph-scale": "pH值",
    "projectile-sampling-distributions": "抛体抽样分布",
    "quadrilateral": "四边形",
    "ph-scale-basics": "pH值：基础",
    "function-builder-basics": "函数构造器：基础",
    "molecule-shapes-basics": "分子形状：基础",
    "fractions-intro": "分数：入门",
    "fractions-mixed-numbers": "分数：带分数",
    "fractions-equality": "分数：等式",
    "vector-addition-equations": "向量的和：等式",
    "number-line-integers": "数轴：整数",
    "number-line-distance": "数轴：距离",
    "number-line-operations": "数轴：运算",
    "equality-explorer-two-variables": "等式探索：两个变量",
    "equality-explorer-basics": "等式探索：基础",
    "graphing-slope-intercept": "绘图：斜率与截距",
}

SECTION_TARGETS = {
    "center-and-variability": "2. 用样本估计总体",
    "least-squares-regression": "2. 一元线性回归模型",
    "trig-tour": "4. 三角函数的图象与性质",
    "graphing-quadratics": "3. 二次函数与一元二次方程、不等式",
    "function-builder": "1. 函数的概念及其表示",
    "function-builder-basics": "1. 函数的概念及其表示",
    "graphing-lines": "2. 直线的方程",
    "graphing-slope-intercept": "2. 直线的方程",
    "vector-addition-equations": "2. 平面向量的运算",
    "projectile-sampling-distributions": "5. 正态分布",
    "acid-base-solutions": "2. 水的电离和溶液的酸碱性",
    "ph-scale": "2. 水的电离和溶液的酸碱性",
    "ph-scale-basics": "2. 水的电离和溶液的酸碱性",
    "balancing-chemical-equations": "1. 物质的分类及转化",
    "beers-law-lab": "3. 物质的量",
    "concentration": "3. 物质的量",
    "molarity": "3. 物质的量",
    "reactants-products-and-leftovers": "3. 物质的量",
    "build-a-molecule": "3. 化学键",
    "isotopes-and-atomic-mass": "1. 原子结构",
    "molecule-shapes": "2. 分子的空间结构",
    "molecule-shapes-basics": "2. 分子的空间结构",
    "molecule-polarity": "3. 分子的性质",
    "gene-expression-essentials": "1. 基因指导蛋白质的合成",
    "membrane-transport": "3. 物质跨膜运输的方式",
    "neuron": "3. 神经冲动的产生和传导",
    "natural-selection": "2. 现代生物进化理论的主要内容",
    "greenhouse-effect": "第二节 大气受热过程和大气运动",
}

DESCRIPTION_OVERRIDES = {
    "center-and-variability": "观察数据中心位置与离散程度的统计特征。",
    "mean-share-and-balance": "通过平均分配理解平均数和平衡思想。",
    "number-compare": "比较数字大小并理解数值关系。",
    "number-pairs": "通过配对练习认识数的组成关系。",
    "projectile-sampling-distributions": "用抽样结果理解样本分布与总体差异。",
    "quadrilateral": "观察四边形边角变化及图形性质。",
    "least-squares-regression": "用散点图和回归线理解线性拟合。",
    "trig-tour": "观察角度变化与三角函数值、图像的对应关系。",
    "graphing-quadratics": "探究二次函数系数变化对图像的影响。",
    "function-builder-basics": "通过输入输出关系认识函数规则。",
    "function-builder": "构造函数规则并观察输入输出变化。",
    "vector-addition-equations": "用方程与图形表示向量加法。",
    "arithmetic": "练习四则运算并理解数量关系。",
    "fraction-matcher": "通过匹配活动理解分数表示及大小关系。",
    "fractions-intro": "认识分数的意义与基本表示方法。",
    "fractions-mixed-numbers": "理解假分数与带分数之间的转化。",
    "fractions-equality": "比较不同表示形式的等值分数。",
    "area-builder": "通过拼搭图形理解面积与周长。",
    "area-model-algebra": "用面积模型理解代数表达式关系。",
    "area-model-decimals": "用面积模型理解小数运算关系。",
    "area-model-introduction": "用面积模型建立面积与乘法的直观认识。",
    "area-model-multiplication": "用面积模型理解乘法计算过程。",
    "build-a-fraction": "通过组合图形构建分数表示。",
    "unit-rates": "比较单位量价格并理解单位比率。",
    "ratio-and-proportion": "通过交互演示理解比和比例关系。",
    "proportion-playground": "在情境中练习比例关系的判断与调整。",
    "number-play": "通过互动游戏练习数字组合与数量关系。",
    "number-line-integers": "在数轴上观察整数位置与大小规律。",
    "number-line-distance": "利用数轴理解距离与数值差。",
    "number-line-operations": "在数轴上演示加减运算过程。",
    "graphing-lines": "观察直线方程参数变化对图像的影响。",
    "graphing-slope-intercept": "理解斜率和截距对直线图像的影响。",
    "equality-explorer": "通过天平式情境理解等式平衡关系。",
    "equality-explorer-basics": "在基础情境中理解等式平衡。",
    "equality-explorer-two-variables": "在双变量情境中观察等式平衡变化。",
    "expression-exchange": "比较不同表达式形式的等值关系。",
    "make-a-ten": "通过凑十活动理解数字组合策略。",
    "acid-base-solutions": "观察酸碱溶液中粒子组成与 pH 的变化。",
    "balancing-chemical-equations": "练习化学方程式配平。",
    "beers-law-lab": "观察溶液浓度与吸光度的关系。",
    "build-a-molecule": "组合原子并认识常见分子结构。",
    "concentration": "配制溶液并理解浓度变化。",
    "isotopes-and-atomic-mass": "比较同位素组成与平均原子质量。",
    "molarity": "调节溶质量与体积理解摩尔浓度。",
    "molecule-polarity": "观察分子构型对极性的影响。",
    "molecule-shapes": "观察电子对排布与分子空间结构。",
    "molecule-shapes-basics": "用基础模型认识分子空间结构。",
    "ph-scale": "观察酸碱溶液 pH 与离子变化的关系。",
    "ph-scale-basics": "用基础模型认识 pH 变化及酸碱性。",
    "reactants-products-and-leftovers": "通过配比关系理解反应物、生成物与剩余量。",
    "gene-expression-essentials": "观察转录、翻译与基因表达调控。",
    "membrane-transport": "观察物质跨膜运输方式与浓度差影响。",
    "neuron": "认识神经元结构与信号传导过程。",
    "natural-selection": "观察环境选择对种群性状分布的影响。",
    "greenhouse-effect": "观察温室气体对地表温度与能量平衡的影响。",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import non-physics PhET simulations into EduSimu")
    parser.add_argument("--metadata-file", default=DEFAULT_PARTNER_METADATA_FILE, help="Path to partner metadata JSON")
    parser.add_argument("--official-metadata-url", default=OFFICIAL_METADATA_URL, help="Official metadata URL")
    parser.add_argument("--creator", default="admin", help="Creator username")
    parser.add_argument("--no-publish", action="store_true", help="Do not publish automatically")
    parser.add_argument("--force-publish", action="store_true", help="Force publish even when validation fails")
    parser.add_argument("--dry-run", action="store_true", help="Only print planned actions")
    parser.add_argument("--limit", type=int, default=0, help="Limit import count")
    parser.add_argument("--only-name", action="append", default=[], help="Only import these project names")
    return parser.parse_args()


def fetch_json(url: str) -> dict:
    request = urllib_request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib_request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_partner_metadata(path: str) -> dict:
    metadata_path = Path(path)
    if not metadata_path.exists():
        raise SystemExit(f"Metadata file not found: {metadata_path}")
    return json.loads(metadata_path.read_text(encoding="utf-8"))


def resolve_creator(db, creator_value: str) -> User:
    user = db.query(User).filter(User.username == creator_value).first()
    if user:
        return user
    if creator_value.isdigit():
        user = db.query(User).filter(User.id == int(creator_value)).first()
        if user:
            return user
    raise SystemExit(f"未找到创建者用户: {creator_value}")


def list_sections(db, subject_id: int) -> list[TextbookNode]:
    return (
        db.query(TextbookNode)
        .filter(TextbookNode.subject_id == subject_id, TextbookNode.node_type == "section")
        .order_by(TextbookNode.id.asc())
        .all()
    )


def ensure_fallback_section(db, subject_label: str) -> int:
    config = TARGET_SUBJECTS[subject_label]
    subject_id = config["subject_id"]
    section_name = config["fallback_section_name"]

    book = (
        db.query(TextbookNode)
        .filter(TextbookNode.subject_id == subject_id, TextbookNode.node_type == "book")
        .order_by(TextbookNode.sort_order.asc(), TextbookNode.id.asc())
        .first()
    )
    if not book:
        raise SystemExit(f"未找到 {config['display_name']} 教材目录（book 节点）")

    chapter = (
        db.query(TextbookNode)
        .filter(
            TextbookNode.subject_id == subject_id,
            TextbookNode.parent_id == book.id,
            TextbookNode.node_type == "chapter",
            TextbookNode.name == "拓展：PhET 仿真",
        )
        .first()
    )
    if not chapter:
        chapter = TextbookNode(
            subject_id=subject_id,
            parent_id=book.id,
            name="拓展：PhET 仿真",
            node_type="chapter",
            sort_order=999,
        )
        db.add(chapter)
        db.flush()

    section = (
        db.query(TextbookNode)
        .filter(
            TextbookNode.subject_id == subject_id,
            TextbookNode.parent_id == chapter.id,
            TextbookNode.node_type == "section",
            TextbookNode.name == section_name,
        )
        .first()
    )
    if not section:
        section = TextbookNode(
            subject_id=subject_id,
            parent_id=chapter.id,
            name=section_name,
            node_type="section",
            sort_order=1,
        )
        db.add(section)
        db.flush()
    return section.id


def extract_phet_project(file_path: str | None) -> str | None:
    if not file_path or not os.path.exists(file_path):
        return None
    content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
    match = PHET_PROJECT_RE.search(content)
    return match.group(1) if match else None


def load_existing_projects(db) -> set[str]:
    projects = set()
    animations = db.query(Animation.file_path).order_by(Animation.id.asc()).all()
    for (file_path,) in animations:
        project = extract_phet_project(file_path)
        if project:
            projects.add(project)
    return projects


def normalize_title(project_name: str, title: str) -> str:
    normalized = TITLE_OVERRIDES.get(project_name, title or project_name)
    return normalized.strip()


def select_primary_subject(project_name: str, official_subjects: list[str]) -> str:
    if project_name in PRIMARY_SUBJECT_BY_PROJECT:
        return PRIMARY_SUBJECT_BY_PROJECT[project_name]
    if len(official_subjects) == 1:
        return official_subjects[0]
    raise SystemExit(f"未定义多学科课件的主学科归属: {project_name} -> {official_subjects}")


def pick_best_image(sim_images: list[dict]) -> dict | None:
    if not sim_images:
        return None
    pngs = [image for image in sim_images if image.get("format") == "image/png"]
    candidates = pngs or sim_images
    target_width = 600
    return min(candidates, key=lambda image: abs((image.get("width") or target_width) - target_width))


def download_thumbnail(url: str, sim_name: str) -> str:
    thumbnail_dir = os.path.join(settings.upload_dir, "thumbnails")
    os.makedirs(thumbnail_dir, exist_ok=True)
    timestamp = int(time.time() * 1000)
    random_id = random.randint(1000, 9999)
    filename = f"phet_{sim_name}_{timestamp}_{random_id}.png"
    absolute_path = os.path.join(thumbnail_dir, filename)
    request = urllib_request.Request(url, headers={"User-Agent": "EduSimuPhETImporter/1.0"})
    with urllib_request.urlopen(request, timeout=30) as response:
        with open(absolute_path, "wb") as buffer:
            buffer.write(response.read())
    return f"/uploads/thumbnails/{filename}"


def subject_labels_from_official(subject_ids: list[int]) -> list[str]:
    labels = [OFFICIAL_SUBJECT_ID_TO_LABEL[sid] for sid in subject_ids if sid in OFFICIAL_SUBJECT_ID_TO_LABEL]
    return [label for label in labels if label in TARGET_SUBJECTS]


def pick_locale_run_url_and_title(project_name: str, official_sim: dict, partner_sim: dict | None) -> tuple[str, str, list[dict]]:
    localized = (partner_sim or {}).get("localizedData", {}) or {}
    default_data = (partner_sim or {}).get("defaultData", {}) or {}
    if "zh_CN" in localized:
        zh_data = localized["zh_CN"]
        title = zh_data.get("title") or default_data.get("title") or project_name
        return zh_data["runUrl"], normalize_title(project_name, title), default_data.get("simImages") or []

    english_title = default_data.get("title") or official_sim.get("localizedSimulations", {}).get("en", {}).get("title") or project_name
    run_url = default_data.get("runUrl") or f"/sims/html/{project_name}/latest/{project_name}_en.html"
    return run_url, normalize_title(project_name, english_title), default_data.get("simImages") or []


def build_description(project_name: str, subject_label: str, title: str) -> str:
    if project_name in DESCRIPTION_OVERRIDES:
        return DESCRIPTION_OVERRIDES[project_name]
    subject_cn = TARGET_SUBJECTS[subject_label]["display_name"]
    return f"PhET 官方{subject_cn}仿真，围绕{title}进行交互演示。"


def import_one(args: argparse.Namespace, source_url: str, title: str, subject_id: int, section_id: int, description: str) -> None:
    sim_args = argparse.Namespace(
        source_url=source_url,
        source_file=None,
        title=title,
        subject_id=subject_id,
        textbook_node_id=section_id,
        creator=args.creator,
        description=description,
        grade_level="",
        keywords="",
        author_name="",
        publish=not args.no_publish,
        force_publish=args.force_publish,
        keep_processed=None,
    )
    import_phet_html.import_animation(sim_args)


def main() -> int:
    args = parse_args()
    official_metadata = fetch_json(args.official_metadata_url)
    partner_metadata = load_partner_metadata(args.metadata_file)
    partner_map = {sim["name"]: sim for sim in partner_metadata.get("simulations", [])}

    db = SessionLocal()
    try:
        resolve_creator(db, args.creator)
        existing_projects = load_existing_projects(db)
        sections_by_subject = {}
        fallback_by_subject = {}
        for subject_label, config in TARGET_SUBJECTS.items():
            sections = list_sections(db, config["subject_id"])
            if not sections:
                raise SystemExit(f"未找到 {config['display_name']} 教材叶子节点（section）")
            sections_by_subject[subject_label] = sections
            fallback_by_subject[subject_label] = ensure_fallback_section(db, subject_label)
        db.commit()

        candidates = []
        for project in official_metadata.get("projects", []):
            if project["type"] != 2:
                continue
            official_sim = project["simulations"][0]
            if official_sim.get("isPrototype"):
                continue

            project_name = project["name"].removeprefix("html/")
            if project_name in existing_projects:
                continue

            official_subjects = subject_labels_from_official(official_sim.get("subjects", []))
            if not official_subjects:
                continue
            primary_subject = select_primary_subject(project_name, official_subjects)
            if args.only_name and project_name not in set(args.only_name):
                continue

            partner_sim = partner_map.get(project_name)
            run_url, title, sim_images = pick_locale_run_url_and_title(project_name, official_sim, partner_sim)
            if not run_url.startswith("http"):
                source_url = f"{PHET_BASE_URL}{run_url}"
            else:
                source_url = run_url
            description = build_description(project_name, primary_subject, title)
            target_section_name = SECTION_TARGETS.get(project_name)
            section_id = fallback_by_subject[primary_subject]
            if target_section_name:
                for node in sections_by_subject[primary_subject]:
                    if node.name == target_section_name:
                        section_id = node.id
                        break

            candidates.append(
                {
                    "project_name": project_name,
                    "primary_subject": primary_subject,
                    "subject_id": TARGET_SUBJECTS[primary_subject]["subject_id"],
                    "title": title,
                    "source_url": source_url,
                    "description": description,
                    "section_id": section_id,
                    "thumbnail_image": pick_best_image(sim_images) if sim_images else None,
                }
            )

        candidates.sort(key=lambda item: (item["subject_id"], item["title"], item["project_name"]))
        if args.limit:
            candidates = candidates[: args.limit]

        imported_ids_by_subject: dict[str, list[int]] = defaultdict(list)
        for item in candidates:
            if args.dry_run:
                print(
                    f"[DRY] {item['project_name']} -> {item['primary_subject']} -> "
                    f"{item['title']} -> section {item['section_id']} -> {item['source_url']}"
                )
                continue

            import_one(
                args,
                item["source_url"],
                item["title"],
                item["subject_id"],
                item["section_id"],
                item["description"],
            )

            animation = (
                db.query(Animation)
                .filter(Animation.subject_id == item["subject_id"], Animation.title == item["title"])
                .order_by(Animation.id.desc())
                .first()
            )
            if not animation:
                raise SystemExit(f"导入后未找到课件记录: {item['title']}")

            image = item["thumbnail_image"]
            if image and image.get("url") and not animation.thumbnail:
                animation.thumbnail = download_thumbnail(image["url"], item["project_name"])
                db.add(animation)
                db.commit()

            imported_ids_by_subject[item["primary_subject"]].append(animation.id)
            existing_projects.add(item["project_name"])
            print(f"已导入: {animation.id} {item['title']} -> {item['primary_subject']}")

        if not args.dry_run:
            for subject_label in TARGET_SUBJECTS:
                ids = imported_ids_by_subject.get(subject_label, [])
                print(f"{subject_label}: {len(ids)} 个")
                if ids:
                    print(f"  IDs: {ids[0]} - {ids[-1]}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
