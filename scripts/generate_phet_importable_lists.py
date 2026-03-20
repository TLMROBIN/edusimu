#!/usr/bin/env python3
"""
Generate non-physics PhET importable lists for EduSimu.

Outputs:
- docs/PhET非物理可导入清单.md
- docs/generated/phet_non_physics_unique_candidates.csv
- docs/generated/phet_<subject>_catalog.csv
- docs/generated/phet_non_physics_existing_overlaps.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import request as urllib_request

from sqlalchemy import create_engine, text


ROOT_DIR = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT_DIR / "docs"
GENERATED_DIR = DOCS_DIR / "generated"

OFFICIAL_METADATA_URL = (
    "https://phet.colorado.edu/services/metadata/1.3/simulations"
    "?format=json&summary&includePrototypes"
)
DEFAULT_PARTNER_METADATA_FILE = Path("/tmp/phet_partner_simulations.json")
PHET_PROJECT_RE = re.compile(r"window\.phet\.chipper\.project\s*=\s*'([^']+)'")

TOP_SUBJECTS = {
    4: "Physics",
    12: "Biology",
    13: "Chemistry",
    14: "Earth & Space",
    15: "Math & Statistics",
}

TARGET_SUBJECT_LABELS = [
    "Math & Statistics",
    "Chemistry",
    "Earth & Space",
    "Biology",
]

CSV_FILE_NAMES = {
    "Math & Statistics": "phet_math_statistics_catalog.csv",
    "Chemistry": "phet_chemistry_catalog.csv",
    "Earth & Space": "phet_earth_and_space_catalog.csv",
    "Biology": "phet_biology_catalog.csv",
}

SYSTEM_SUBJECT_HINTS = {
    "Math & Statistics": "math",
    "Chemistry": "chemistry",
    "Earth & Space": "geography",
    "Biology": "biology",
}


@dataclass
class ExistingAnimation:
    animation_id: int
    subject_id: int
    subject_name: str
    title: str
    file_path: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate non-physics PhET importable lists")
    parser.add_argument(
        "--partner-metadata-file",
        default=str(DEFAULT_PARTNER_METADATA_FILE),
        help="Path to PhET partner metadata JSON",
    )
    parser.add_argument(
        "--database-url",
        help="Optional database URL used to compare against the current system state",
    )
    return parser.parse_args()


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib_request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with urllib_request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build_partner_map(partner_metadata: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {simulation["name"]: simulation for simulation in partner_metadata["simulations"]}


def top_subject_labels(subject_ids: list[int]) -> list[str]:
    labels = [TOP_SUBJECTS[subject_id] for subject_id in subject_ids if subject_id in TOP_SUBJECTS]
    return [label for label in labels if label in TOP_SUBJECTS.values()]


def read_phet_project(file_path: str | None) -> str | None:
    if not file_path or not os.path.exists(file_path):
        return None
    content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
    match = PHET_PROJECT_RE.search(content)
    return match.group(1) if match else None


def load_existing_state(database_url: str | None) -> tuple[dict[str, ExistingAnimation], dict[str, dict[str, int]]]:
    if not database_url:
        return {}, {}

    engine = create_engine(database_url)
    existing_by_project: dict[str, ExistingAnimation] = {}
    subject_status: dict[str, dict[str, int]] = {}

    with engine.connect() as connection:
        subject_rows = connection.execute(
            text(
                """
                select s.id, s.name, count(t.id) as textbook_nodes
                from subjects s
                left join textbook_nodes t on t.subject_id = s.id
                group by s.id, s.name
                order by s.id
                """
            )
        ).mappings()
        for row in subject_rows:
            subject_status[row["name"]] = {
                "subject_id": row["id"],
                "textbook_nodes": row["textbook_nodes"],
            }

        animation_rows = connection.execute(
            text(
                """
                select a.id, a.subject_id, s.name as subject_name, a.title, a.file_path
                from animations a
                join subjects s on s.id = a.subject_id
                order by a.id asc
                """
            )
        ).mappings()
        for row in animation_rows:
            project = read_phet_project(row["file_path"])
            if not project or project in existing_by_project:
                continue
            existing_by_project[project] = ExistingAnimation(
                animation_id=row["id"],
                subject_id=row["subject_id"],
                subject_name=row["subject_name"],
                title=row["title"],
                file_path=row["file_path"],
            )

    engine.dispose()
    return existing_by_project, subject_status


def resolve_titles_and_urls(
    project_name: str,
    official_simulation: dict[str, Any],
    partner_simulation: dict[str, Any] | None,
) -> tuple[str, str, str, bool]:
    localized = (partner_simulation or {}).get("localizedData", {}) or {}
    default_data = (partner_simulation or {}).get("defaultData", {}) or {}

    if "zh_CN" in localized:
        zh_data = localized["zh_CN"]
        zh_title = zh_data.get("title") or default_data.get("title") or project_name
        en_title = default_data.get("title") or project_name
        return zh_title, en_title, zh_data["runUrl"], True

    localized_simulations = official_simulation.get("localizedSimulations", {}) or {}
    english_title = (
        default_data.get("title")
        or localized_simulations.get("en", {}).get("title")
        or project_name
    )
    zh_title = localized_simulations.get("zh_CN", {}).get("title") or english_title
    default_run_url = default_data.get("runUrl") or f"/sims/html/{project_name}/latest/{project_name}_en.html"
    return zh_title, english_title, default_run_url, "zh_CN" in localized_simulations


def build_records(
    official_metadata: dict[str, Any],
    partner_map: dict[str, dict[str, Any]],
    existing_by_project: dict[str, ExistingAnimation],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for project in official_metadata["projects"]:
        if project["type"] != 2:
            continue
        official_simulation = project["simulations"][0]
        if official_simulation.get("isPrototype"):
            continue

        project_name = project["name"].removeprefix("html/")
        subject_labels = top_subject_labels(official_simulation.get("subjects", []))
        if not any(label in TARGET_SUBJECT_LABELS for label in subject_labels):
            continue

        partner_simulation = partner_map.get(project_name)
        display_title, english_title, recommended_run_url, has_official_zh_cn = resolve_titles_and_urls(
            project_name,
            official_simulation,
            partner_simulation,
        )
        existing = existing_by_project.get(project_name)

        records.append(
            {
                "project_name": project_name,
                "display_title": display_title,
                "english_title": english_title,
                "recommended_run_url": recommended_run_url,
                "has_official_zh_cn": has_official_zh_cn,
                "official_subjects": "|".join(subject_labels),
                "official_subject_list": subject_labels,
                "already_in_system": bool(existing),
                "existing_animation_id": existing.animation_id if existing else "",
                "existing_subject_name": existing.subject_name if existing else "",
                "existing_title": existing.title if existing else "",
            }
        )

    records.sort(key=lambda item: (item["display_title"], item["project_name"]))
    return records


def csv_row(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_name": record["project_name"],
        "display_title": record["display_title"],
        "english_title": record["english_title"],
        "official_subjects": ",".join(record["official_subject_list"]),
        "has_official_zh_cn": "yes" if record["has_official_zh_cn"] else "no",
        "recommended_run_url": record["recommended_run_url"],
        "already_in_system": "yes" if record["already_in_system"] else "no",
        "existing_animation_id": record["existing_animation_id"],
        "existing_subject_name": record["existing_subject_name"],
        "existing_title": record["existing_title"],
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "project_name",
        "display_title",
        "english_title",
        "official_subjects",
        "has_official_zh_cn",
        "recommended_run_url",
        "already_in_system",
        "existing_animation_id",
        "existing_subject_name",
        "existing_title",
    ]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(csv_row(row))


def write_subject_csvs(records: list[dict[str, Any]]) -> None:
    for subject_label, file_name in CSV_FILE_NAMES.items():
        subject_rows = [
            record for record in records if subject_label in record["official_subject_list"]
        ]
        write_csv(GENERATED_DIR / file_name, subject_rows)


def write_unique_candidate_csv(records: list[dict[str, Any]]) -> None:
    unique_rows = [record for record in records if not record["already_in_system"]]
    write_csv(GENERATED_DIR / "phet_non_physics_unique_candidates.csv", unique_rows)


def write_existing_overlap_csv(records: list[dict[str, Any]]) -> None:
    overlap_rows = [record for record in records if record["already_in_system"]]
    write_csv(GENERATED_DIR / "phet_non_physics_existing_overlaps.csv", overlap_rows)


def markdown_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return lines


def system_status_rows(subject_status: dict[str, dict[str, int]]) -> list[list[str]]:
    rows: list[list[str]] = []
    for subject_label in TARGET_SUBJECT_LABELS:
        system_subject_name = SYSTEM_SUBJECT_HINTS[subject_label]
        status = subject_status.get(system_subject_name)
        if not status:
            rows.append([subject_label, system_subject_name, "no", "0", "未建学科"])
            continue
        textbook_nodes = str(status["textbook_nodes"])
        readiness = "可导入" if status["textbook_nodes"] > 0 else "需先补教材目录"
        rows.append(
            [
                subject_label,
                system_subject_name,
                str(status["subject_id"]),
                textbook_nodes,
                readiness,
            ]
        )
    return rows


def summary_rows(records: list[dict[str, Any]], subject_status: dict[str, dict[str, int]]) -> list[list[str]]:
    official_counter = Counter()
    existing_counter = Counter()
    new_counter = Counter()

    for record in records:
        for subject_label in record["official_subject_list"]:
            if subject_label not in TARGET_SUBJECT_LABELS:
                continue
            official_counter[subject_label] += 1
            if record["already_in_system"]:
                existing_counter[subject_label] += 1
            else:
                new_counter[subject_label] += 1

    rows: list[list[str]] = []
    for subject_label in TARGET_SUBJECT_LABELS:
        system_subject_name = SYSTEM_SUBJECT_HINTS[subject_label]
        textbook_nodes = str(subject_status.get(system_subject_name, {}).get("textbook_nodes", 0))
        rows.append(
            [
                subject_label,
                str(official_counter[subject_label]),
                str(existing_counter[subject_label]),
                str(new_counter[subject_label]),
                system_subject_name,
                textbook_nodes,
            ]
        )
    return rows


def unique_candidate_rows(records: list[dict[str, Any]]) -> list[list[str]]:
    rows: list[list[str]] = []
    for record in records:
        if record["already_in_system"]:
            continue
        rows.append(
            [
                record["project_name"],
                record["display_title"],
                ",".join(record["official_subject_list"]),
                "是" if record["has_official_zh_cn"] else "否",
                record["recommended_run_url"],
            ]
        )
    return rows


def overlap_rows(records: list[dict[str, Any]]) -> list[list[str]]:
    rows: list[list[str]] = []
    for record in records:
        if not record["already_in_system"]:
            continue
        rows.append(
            [
                record["project_name"],
                record["display_title"],
                ",".join(record["official_subject_list"]),
                str(record["existing_animation_id"]),
                record["existing_subject_name"],
                record["existing_title"],
            ]
        )
    return rows


def write_markdown(records: list[dict[str, Any]], subject_status: dict[str, dict[str, int]]) -> None:
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    unique_candidates = [record for record in records if not record["already_in_system"]]

    lines = [
        "# PhET 非物理可导入清单",
        "",
        f"- 生成时间：{generated_at}",
        f"- 官网元数据：`{OFFICIAL_METADATA_URL}`",
        f"- Partner 元数据：`{DEFAULT_PARTNER_METADATA_FILE}`",
        "- 统计口径：仅统计官方 HTML、非 prototype 课件。",
        "- 去重口径：按实际 PhET project 与当前系统已存在课件比对；系统里已存在同内容的，不再算作新增候选。",
        "",
        "## 1. 系统准备情况",
        "",
    ]
    lines.extend(
        markdown_table(
            ["PhET 学科", "系统学科", "subject_id", "教材节点数", "状态"],
            system_status_rows(subject_status),
        )
    )
    lines.extend(
        [
            "",
            "说明：`Earth & Space` 在当前系统里只能暂挂到 `geography`，但现在还没有教材目录，暂时不适合直接批量导入。",
            "",
            "## 2. 汇总",
            "",
        ]
    )
    lines.extend(
        markdown_table(
            ["PhET 学科", "官网 HTML 数", "系统已存在", "新增候选", "系统学科", "教材节点数"],
            summary_rows(records, subject_status),
        )
    )
    lines.extend(
        [
            "",
            f"- 非物理唯一新增候选总数：`{len(unique_candidates)}`",
            "- 详细 CSV：",
            "  - `docs/generated/phet_non_physics_unique_candidates.csv`",
            "  - `docs/generated/phet_math_statistics_catalog.csv`",
            "  - `docs/generated/phet_chemistry_catalog.csv`",
            "  - `docs/generated/phet_earth_and_space_catalog.csv`",
            "  - `docs/generated/phet_biology_catalog.csv`",
            "  - `docs/generated/phet_non_physics_existing_overlaps.csv`",
            "",
            "## 3. 唯一新增候选",
            "",
        ]
    )
    lines.extend(
        markdown_table(
            ["project", "标题", "官方学科", "有官方中文", "推荐 runUrl"],
            unique_candidate_rows(records),
        )
    )
    lines.extend(
        [
            "",
            "## 4. 官网属于非物理学科但系统里已存在的课件",
            "",
        ]
    )
    lines.extend(
        markdown_table(
            ["project", "标题", "官方学科", "现有动画 ID", "现有系统学科", "现有标题"],
            overlap_rows(records),
        )
    )
    lines.append("")

    output_path = DOCS_DIR / "PhET非物理可导入清单.md"
    output_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    official_metadata = fetch_json(OFFICIAL_METADATA_URL)
    partner_metadata = load_json(args.partner_metadata_file)
    partner_map = build_partner_map(partner_metadata)
    existing_by_project, subject_status = load_existing_state(args.database_url)
    records = build_records(official_metadata, partner_map, existing_by_project)

    write_markdown(records, subject_status)
    write_unique_candidate_csv(records)
    write_existing_overlap_csv(records)
    write_subject_csvs(records)

    print(f"generated markdown: {DOCS_DIR / 'PhET非物理可导入清单.md'}")
    print(f"generated csv dir: {GENERATED_DIR}")
    print(f"unique candidates: {sum(1 for record in records if not record['already_in_system'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
