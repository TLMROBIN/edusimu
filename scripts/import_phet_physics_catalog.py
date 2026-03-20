#!/usr/bin/env python3
"""
Import all PhET physics HTML5 simulations into EduSimu.

Data source:
- PhET official partner-services metadata API JSON (downloaded ahead of time)

Behavior:
- Filters to physics sims (auto-infer subject id from known physics sims)
- Uses zh_CN runUrl if official translation exists, otherwise default (en)
- Maps to physics textbook leaf nodes by heuristic keywords
- Publishes automatically when validation passes (optional force publish)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import Animation, TextbookNode, User

import import_phet_html


PHET_BASE_URL = "https://phet.colorado.edu"
DEFAULT_METADATA_FILE = "/tmp/phet_partner_simulations.json"
PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*'([^']+)'")

KNOWN_PHYSICS_SIM_NAMES = [
    "gravity-force-lab",
    "forces-and-motion-basics",
    "projectile-motion",
    "circuit-construction-kit-dc",
    "circuit-construction-kit-ac",
    "energy-skate-park",
    "pendulum-lab",
    "wave-interference",
    "wave-on-a-string",
    "bending-light",
    "geometric-optics",
    "faradays-electromagnetic-lab",
]

EN_TITLE_TRANSLATIONS = {
    "build-a-nucleus": "构建原子核",
    "buoyancy": "浮力",
    "buoyancy-basics": "浮力：基础",
    "calculus-grapher": "微积分绘图器",
    "circuit-construction-kit-ac": "交流电路构建实验",
    "faradays-electromagnetic-lab": "法拉第电磁实验室",
    "fourier-making-waves": "傅里叶：造波",
    "generator": "发电机",
    "geometric-optics-basics": "几何光学：基础",
    "keplers-laws": "开普勒定律",
    "magnet-and-compass": "磁铁和指南针",
    "magnets-and-electromagnets": "磁铁与电磁铁",
    "models-of-the-hydrogen-atom": "氢原子模型",
    "my-solar-system": "我的太阳系",
    "projectile-data-lab": "抛体运动数据实验室",
    "quantum-coin-toss": "量子抛硬币",
    "quantum-measurement": "量子测量",
}

SIM_SECTION_TARGETS = {
    "atomic-interactions": "4. 分子动能和分子势能",
    "balancing-act": "5. 共点力的平衡",
    "balloons-and-static-electricity": "1. 电荷",
    "bending-light": "1. 光的折射",
    "blackbody-spectrum": "1. 普朗克黑体辐射理论",
    "build-a-nucleus": "1. 原子核的组成",
    "build-an-atom": "3. 原子的核式结构模型",
    "buoyancy": "PhET 物理仿真",
    "buoyancy-basics": "PhET 物理仿真",
    "calculus-grapher": "PhET 物理仿真",
    "capacitor-lab-basics": "4. 电容器的电容",
    "charges-and-fields": "3. 电场 电场强度",
    "circuit-construction-kit-ac": "第一节 认识交变电流",
    "circuit-construction-kit-ac-virtual-lab": "第一节 认识交变电流",
    "circuit-construction-kit-dc": "4. 串联电路和并联电路",
    "circuit-construction-kit-dc-virtual-lab": "4. 串联电路和并联电路",
    "collision-lab": "5. 弹性碰撞和非弹性碰撞",
    "color-vision": "PhET 物理仿真",
    "coulombs-law": "2. 库仑定律",
    "curve-fitting": "PhET 物理仿真",
    "density": "PhET 物理仿真",
    "diffusion": "1. 分子动理论的基本内容",
    "energy-forms-and-changes": "1. 功、热和内能的改变",
    "energy-skate-park": "4. 机械能守恒定律",
    "energy-skate-park-basics": "4. 机械能守恒定律",
    "faradays-electromagnetic-lab": "第一节 感应电流的方向",
    "faradays-law": "第二节 法拉第电磁感应定律",
    "forces-and-motion-basics": "5. 牛顿运动定律的应用",
    "fourier-making-waves": "2. 波的描述",
    "friction": "2. 摩擦力",
    "gas-properties": "2. 气体的等温变化",
    "gases-intro": "1. 分子动理论的基本内容",
    "generator": "第三节 电磁感应定律的应用",
    "geometric-optics": "1. 光的折射",
    "geometric-optics-basics": "1. 光的折射",
    "gravity-and-orbits": "1. 行星的运动",
    "gravity-force-lab": "2. 万有引力定律",
    "gravity-force-lab-basics": "2. 万有引力定律",
    "hookes-law": "1. 重力与弹力",
    "john-travoltage": "1. 电荷",
    "keplers-laws": "1. 行星的运动",
    "magnet-and-compass": "1. 磁场 磁感线",
    "magnets-and-electromagnets": "1. 磁场 磁感线",
    "masses-and-springs": "1. 简谐运动",
    "masses-and-springs-basics": "1. 简谐运动",
    "models-of-the-hydrogen-atom": "4. 氢原子光谱和玻尔的原子模型",
    "molecules-and-light": "第四节 电磁波谱",
    "my-solar-system": "1. 行星的运动",
    "ohms-law": "2. 闭合电路的欧姆定律",
    "pendulum-lab": "4. 单摆",
    "plinko-probability": "PhET 物理仿真",
    "projectile-data-lab": "3. 实验：探究平抛运动的特点",
    "projectile-motion": "4. 抛体运动的规律",
    "quantum-coin-toss": "5. 粒子的波动性和量子力学的建立",
    "quantum-measurement": "5. 粒子的波动性和量子力学的建立",
    "resistance-in-a-wire": "2. 导体的电阻",
    "rutherford-scattering": "3. 原子的核式结构模型",
    "states-of-matter": "4. 分子动能和分子势能",
    "states-of-matter-basics": "4. 分子动能和分子势能",
    "under-pressure": "3. 气体的等压变化和等容变化",
    "vector-addition": "4. 力的合成和分解",
    "wave-interference": "4. 波的干涉",
    "wave-on-a-string": "1. 波的形成",
    "waves-intro": "1. 波的形成",
}

SIM_DESCRIPTIONS = {
    "atomic-interactions": "探究原子间距离变化对相互作用力和势能的影响。",
    "balancing-act": "探究杠杆平衡、力矩和质量分布的关系。",
    "balloons-and-static-electricity": "演示摩擦起电后电荷转移与静电吸引现象。",
    "bending-light": "观察光在不同介质中的传播方向变化。",
    "blackbody-spectrum": "观察黑体辐射强度随温度和波长的变化。",
    "build-a-nucleus": "认识原子核组成、核素和稳定性。",
    "build-an-atom": "认识原子结构、电子排布和离子形成。",
    "buoyancy": "探究浮力与液体密度、排液体积的关系。",
    "buoyancy-basics": "用基础模型认识浮力大小规律。",
    "calculus-grapher": "用于函数图像和变化关系的可视化演示。",
    "capacitor-lab-basics": "认识电容器电容与极板参数、电压的关系。",
    "charges-and-fields": "观察点电荷分布形成的电场和电场线。",
    "circuit-construction-kit-ac": "搭建交流电路并观察电流、电压和元件响应。",
    "circuit-construction-kit-ac-virtual-lab": "在虚拟实验中搭建交流电路并测量电学量。",
    "circuit-construction-kit-dc": "搭建直流电路并观察串并联连接效果。",
    "circuit-construction-kit-dc-virtual-lab": "在虚拟实验中搭建直流电路并测量电学量。",
    "collision-lab": "探究碰撞前后速度、动量和能量变化。",
    "color-vision": "演示不同颜色光的混合与视觉感知。",
    "coulombs-law": "探究电荷量和距离对静电力的影响。",
    "curve-fitting": "用于数据点拟合和函数模型比较。",
    "density": "比较质量、体积和密度之间的关系。",
    "diffusion": "观察粒子热运动导致的扩散现象。",
    "energy-forms-and-changes": "观察热能、机械能等不同能量形式的转化。",
    "energy-skate-park": "探究动能、势能和机械能守恒。",
    "energy-skate-park-basics": "用基础场景认识机械能转化与守恒。",
    "faradays-electromagnetic-lab": "观察磁通量变化与感应电流方向。",
    "faradays-law": "探究磁通量变化与感应电动势的关系。",
    "forces-and-motion-basics": "认识力、摩擦和运动状态变化的关系。",
    "fourier-making-waves": "观察多个简谐波叠加形成复杂波形。",
    "friction": "探究摩擦力大小与接触条件、运动状态的关系。",
    "gas-properties": "观察气体压强、体积、温度和粒子数的关系。",
    "gases-intro": "用粒子模型认识气体压强、温度和体积变化。",
    "generator": "演示发电机中机械能向电能的转化。",
    "geometric-optics": "探究透镜成像、物距像距和光路变化。",
    "geometric-optics-basics": "用基础场景认识透镜成像规律。",
    "gravity-and-orbits": "观察万有引力作用下的轨道运动。",
    "gravity-force-lab": "探究质量和距离对万有引力的影响。",
    "gravity-force-lab-basics": "用基础模型认识质量、距离与引力大小关系。",
    "hookes-law": "探究弹簧形变量与弹力大小的关系。",
    "john-travoltage": "演示人体静电积累与放电现象。",
    "keplers-laws": "观察行星轨道并验证开普勒定律。",
    "magnet-and-compass": "观察磁铁周围磁场方向与指南针偏转。",
    "magnets-and-electromagnets": "比较永磁体和电磁铁的磁场现象。",
    "masses-and-springs": "探究弹簧振子的振动规律和周期变化。",
    "masses-and-springs-basics": "用基础模型认识弹簧振子运动。",
    "models-of-the-hydrogen-atom": "比较不同氢原子模型对光谱的解释。",
    "molecules-and-light": "观察不同波段电磁波与分子的相互作用。",
    "my-solar-system": "构建并观察多天体系统的轨道演化。",
    "ohms-law": "探究电压、电流和电阻之间的定量关系。",
    "pendulum-lab": "探究单摆周期与摆长、重力加速度的关系。",
    "plinko-probability": "用弹珠下落结果直观认识概率分布。",
    "projectile-data-lab": "通过数据测量分析抛体运动规律。",
    "projectile-motion": "观察斜抛运动的轨迹、速度和分运动。",
    "quantum-coin-toss": "用量子模型直观认识叠加与测量结果。",
    "quantum-measurement": "演示量子测量对系统状态的影响。",
    "resistance-in-a-wire": "探究导线长度、截面积和材料对电阻的影响。",
    "rutherford-scattering": "通过粒子散射现象理解原子的核式结构。",
    "states-of-matter": "观察物质三态及分子运动特征。",
    "states-of-matter-basics": "用基础模型认识物质三态变化。",
    "under-pressure": "探究压强、体积和粒子运动的关系。",
    "vector-addition": "演示多个矢量的合成与分解。",
    "wave-interference": "观察波的相干叠加与干涉图样。",
    "wave-on-a-string": "观察绳波的形成、传播和反射。",
    "waves-intro": "用基础模型认识波的传播与叠加。",
}

TOPIC_RULES = [
    (
        "electricity",
        [
            "electric",
            "charge",
            "circuit",
            "current",
            "voltage",
            "resistor",
            "capacitor",
            "battery",
            "magnet",
            "magnetic",
            "electromagnet",
            "induction",
            "field",
            "ohm",
            "ampere",
            "dc",
            "ac",
        ],
        ["电路", "电流", "电场", "电势", "电阻", "电容", "电", "磁", "电磁"],
    ),
    (
        "waves_optics",
        [
            "wave",
            "sound",
            "light",
            "optics",
            "lens",
            "mirror",
            "refraction",
            "reflection",
            "diffraction",
            "interference",
            "laser",
            "photon",
        ],
        ["波", "振动", "声", "光", "折射", "反射", "干涉", "衍射", "光学"],
    ),
    (
        "mechanics",
        [
            "motion",
            "force",
            "velocity",
            "acceleration",
            "newton",
            "gravity",
            "friction",
            "mass",
            "energy",
            "power",
            "work",
            "momentum",
            "projectile",
            "pendulum",
            "spring",
            "torque",
            "rotation",
            "circular",
            "orbit",
            "balance",
            "collision",
        ],
        ["运动", "速度", "加速度", "牛顿", "力", "重力", "摩擦", "能", "功", "动量", "圆周", "抛体", "万有引力"],
    ),
    (
        "thermo",
        [
            "heat",
            "thermal",
            "temperature",
            "gas",
            "pressure",
            "entropy",
            "thermo",
            "phase",
            "states of matter",
        ],
        ["热", "温度", "气体", "压强", "内能", "分子"],
    ),
    (
        "modern",
        [
            "quantum",
            "atomic",
            "nuclear",
            "electron",
            "hydrogen",
            "rutherford",
            "radioactive",
            "photon",
        ],
        ["原子", "量子", "核", "光电", "放射"],
    ),
    (
        "fluids",
        [
            "fluid",
            "buoyancy",
            "density",
            "pressure",
            "flow",
            "liquid",
        ],
        ["流体", "浮力", "密度", "压强"],
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import PhET physics simulations into EduSimu")
    parser.add_argument("--metadata-file", default=DEFAULT_METADATA_FILE, help="Path to partner-services JSON")
    parser.add_argument("--metadata-url", help="Optional URL to fetch partner-services JSON")
    parser.add_argument("--subject-id", type=int, default=4, help="EduSimu physics subject id")
    parser.add_argument("--creator", default="admin", help="Creator username, default: admin")
    parser.add_argument("--no-publish", action="store_true", help="Do not publish automatically")
    parser.add_argument(
        "--force-publish",
        action="store_true",
        help="Force publish even when validation fails (admin only)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only print mapping, do not import")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of sims imported")
    parser.add_argument("--only-name", action="append", default=[], help="Only import sims by name (repeatable)")
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


def infer_physics_subject_id(simulations: Iterable[dict]) -> int | None:
    subject_counts = {}
    name_index = {sim["name"]: sim for sim in simulations}
    for name in KNOWN_PHYSICS_SIM_NAMES:
        sim = name_index.get(name)
        if not sim:
            continue
        for sid in sim.get("subjectIds", []):
            subject_counts[sid] = subject_counts.get(sid, 0) + 1
    if not subject_counts:
        return None
    return max(subject_counts, key=subject_counts.get)


def normalize_text(value: str) -> str:
    return value.lower().replace("-", " ").replace("_", " ")


def pick_locale_run_url(sim: dict) -> tuple[str, str]:
    localized = sim.get("localizedData", {}) or {}
    if "zh_CN" in localized:
        data = localized["zh_CN"]
        return data["runUrl"], data.get("title") or sim["defaultData"]["title"]
    title = sim["defaultData"]["title"]
    translated = EN_TITLE_TRANSLATIONS.get(sim.get("name", ""))
    return sim["defaultData"]["runUrl"], translated or title


def build_full_paths(nodes: list[TextbookNode]) -> dict[int, str]:
    by_id = {node.id: node for node in nodes}
    paths: dict[int, str] = {}

    def node_path(node: TextbookNode) -> str:
        if node.id in paths:
            return paths[node.id]
        parts = [node.name]
        parent_id = node.parent_id
        while parent_id:
            parent = by_id.get(parent_id)
            if not parent:
                break
            parts.append(parent.name)
            parent_id = parent.parent_id
        path = "/".join(reversed(parts))
        paths[node.id] = path
        return path

    for node in nodes:
        node_path(node)
    return paths


def select_section_id(sim_title: str, sim_name: str, sections: list[TextbookNode]) -> int | None:
    exact_section_name = SIM_SECTION_TARGETS.get(sim_name)
    if exact_section_name:
        for node in sections:
            if node.name == exact_section_name:
                return node.id

    text = f"{sim_title} {sim_name}"
    text_norm = normalize_text(text)

    full_paths = build_full_paths(sections)
    for _, topic_keywords, section_keywords in TOPIC_RULES:
        if not any(keyword in text_norm for keyword in topic_keywords):
            continue
        for node in sections:
            path = full_paths.get(node.id, node.name)
            if any(key in path for key in section_keywords):
                return node.id
    return None


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


def ensure_fallback_section(db, subject_id: int) -> int:
    book = (
        db.query(TextbookNode)
        .filter(TextbookNode.subject_id == subject_id, TextbookNode.node_type == "book")
        .order_by(TextbookNode.sort_order.asc(), TextbookNode.id.asc())
        .first()
    )
    if not book:
        raise SystemExit("未找到物理教材目录（book 节点），无法创建回退章节")

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
            TextbookNode.name == "PhET 物理仿真",
        )
        .first()
    )
    if not section:
        section = TextbookNode(
            subject_id=subject_id,
            parent_id=chapter.id,
            name="PhET 物理仿真",
            node_type="section",
            sort_order=1,
        )
        db.add(section)
        db.flush()
    return section.id


def extract_phet_project(file_path: str | None) -> str | None:
    if not file_path:
        return None
    path = Path(file_path)
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8", errors="ignore")
    match = PHET_PROJECT_RE.search(content)
    return match.group(1) if match else None


def simulation_exists(db, title: str, subject_id: int, sim_name: str) -> bool:
    existing = (
        db.query(Animation)
        .filter(Animation.subject_id == subject_id)
        .order_by(Animation.id.asc())
        .all()
    )
    for animation in existing:
        if animation.title == title:
            return True
        if extract_phet_project(animation.file_path) == sim_name:
            return True
    return False


def import_one(args: argparse.Namespace, sim: dict, subject_id: int, section_id: int) -> int:
    run_url, title = pick_locale_run_url(sim)
    if run_url.startswith("http"):
        source_url = run_url
    else:
        source_url = f"{PHET_BASE_URL}{run_url}"

    sim_args = argparse.Namespace(
        source_url=source_url,
        source_file=None,
        title=title,
        subject_id=subject_id,
        textbook_node_id=section_id,
        creator=args.creator,
        description=SIM_DESCRIPTIONS.get(sim["name"], ""),
        grade_level="",
        keywords="",
        author_name="",
        publish=args.publish,
        force_publish=args.force_publish,
        keep_processed=None,
    )
    return import_phet_html.import_animation(sim_args)


def main() -> int:
    args = parse_args()
    args.publish = not args.no_publish
    metadata = load_metadata(args)
    simulations = metadata.get("simulations", [])
    if not simulations:
        raise SystemExit("未找到 simulations 数据")

    physics_subject_id = infer_physics_subject_id(simulations) or 4
    physics_sims = [sim for sim in simulations if physics_subject_id in sim.get("subjectIds", [])]

    if args.only_name:
        only = set(args.only_name)
        physics_sims = [sim for sim in physics_sims if sim["name"] in only]

    if args.limit:
        physics_sims = physics_sims[: args.limit]

    db = SessionLocal()
    try:
        resolve_creator(db, args.creator)
        sections = list_sections(db, args.subject_id)
        if not sections:
            raise SystemExit("未找到物理教材叶子节点（section），请先初始化教材目录")
        fallback_section_id = ensure_fallback_section(db, args.subject_id)
        db.commit()

        for sim in physics_sims:
            run_url, title = pick_locale_run_url(sim)
            section_id = select_section_id(title, sim["name"], sections) or fallback_section_id
            if args.dry_run:
                print(f"[DRY] {sim['name']} -> {title} -> section {section_id} -> {run_url}")
                continue

            if simulation_exists(db, title, args.subject_id, sim["name"]):
                print(f"已存在，跳过: {title}")
                continue

            import_one(args, sim, args.subject_id, section_id)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
