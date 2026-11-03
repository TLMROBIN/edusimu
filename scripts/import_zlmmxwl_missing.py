#!/usr/bin/env python3
"""Import the 9 localized Mingxing Physics packages into EduSimu."""

import json
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(os.environ.get("EDUSIMU_BACKEND_DIR", ROOT_DIR / "backend")).resolve()
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

from app.database import SessionLocal
from app.models import Animation, Subject, TextbookNode, User
from app.routers.animations import process_courseware_upload

LOCALIZED_DIR = ROOT_DIR / "tmp/zlmmxwl-localized"
MARKER = "[Mingxing Physics public import]"
AUTHOR = "敏行物理（公开资源导入）"

ITEMS = [
    {
        "id": "res-msx8za0o-yhcnh7",
        "title": "双星模型（交互动画）物理人教版必修第二册",
        "filename": "res-msx8za0o-yhcnh7.html",
        "source_url": "https://zlmmxwl.com/uploads/resources/09bbc09740d04cc7ad1e865e3074107d/file.html",
        "node_path": ("必修第二册", "第七章 万有引力与宇宙航行", "2. 万有引力定律"),
        "keywords": "双星模型,万有引力,天体运动,交互动画",
        "author": AUTHOR
    },
    {
        "id": "res-msx8vtat-zrymkp",
        "title": "回旋加速器（交互动画）物理人教版选择性必修第二册",
        "filename": "res-msx8vtat-zrymkp.html",
        "source_url": "https://zlmmxwl.com/uploads/resources/9bab8725d8c244d686b47f086015207c/file.html",
        "node_path": ("选择性必修第二册", "第一章 磁场", "第四节 洛伦兹力与现代技术"),
        "keywords": "回旋加速器,洛伦兹力,带电粒子,磁场,加速电场",
        "author": AUTHOR
    },
    {
        "id": "res-3b3f82baa79548c4",
        "title": "安培力与导体棒",
        "filename": "res-3b3f82baa79548c4.html",
        "source_url": "https://zlmmxwl.com/uploads/resources/67025be54ec645da89b697e1ff38595d/file.html",
        "node_path": ("选择性必修第二册", "第一章 磁场", "第一节 安培力"),
        "keywords": "安培力,导体棒,磁场,电磁感应",
        "author": AUTHOR
    },
    {
        "id": "res-msx6amp0-t2d7q3",
        "title": "牛顿大炮",
        "filename": "res-msx6amp0-t2d7q3.html",
        "source_url": "https://zlmmxwl.com/uploads/resources/6e925318dd34428e977ec9e960abcb1e/file.html",
        "node_path": ("必修第二册", "第七章 万有引力与宇宙航行", "4. 宇宙航行"),
        "keywords": "牛顿大炮,宇宙速度,第一宇宙速度,轨道运动",
        "author": AUTHOR
    },
    {
        "id": "res-msx6lvyn-5tqu3v",
        "title": "演示机械波动画",
        "filename": "res-msx6lvyn-5tqu3v.zip",
        "source_url": "https://zlmmxwl.com/uploads/resources/01d6642259614e40a488b9564d57792c/file.html",
        "node_path": ("选择性必修第一册", "第三章 机械波", "1. 波的形成"),
        "keywords": "机械波,横波,波长,周期,质点振动",
        "author": "敏行物理 / 飞象老师"
    },
    {
        "id": "res-msx6l0ev-jtfs3v",
        "title": "运动合成",
        "filename": "res-msx6l0ev-jtfs3v.zip",
        "source_url": "https://zlmmxwl.com/uploads/resources/97d7610843514ee19212f3a94d84f208/file.html",
        "node_path": ("必修第二册", "第五章 抛体运动", "2. 运动的合成与分解"),
        "keywords": "运动合成,蜡块运动,分运动,合运动",
        "author": "敏行物理 / 飞象老师"
    },
    {
        "id": "res-msxaveki-963lxr",
        "title": "开普勒三定律——B版",
        "filename": "res-msxaveki-963lxr.zip",
        "source_url": "https://zlmmxwl.com/uploads/resources/3692cfe571344b6d86327b3c34e94beb/code-1.html",
        "node_path": ("必修第二册", "第七章 万有引力与宇宙航行", "1. 行星的运动"),
        "keywords": "开普勒定律,椭圆轨道,面积定律,行星运动",
        "author": AUTHOR
    },
    {
        "id": "res-msx8vh14-ruvk8v",
        "title": "光学干涉衍射模拟平台（交互动画）物理人教版选择性必修第一册",
        "filename": "res-msx8vh14-ruvk8v.zip",
        "source_url": "https://zlmmxwl.com/uploads/resources/fbb3462dab594669a4ec6887c2a19b16/file.html",
        "node_path": ("选择性必修第一册", "第四章 光", "3. 光的干涉"),
        "keywords": "双缝干涉,单缝衍射,圆孔衍射,波长,条纹间距",
        "author": AUTHOR
    },
    {
        "id": "res-msx8ungg-2t2bnh",
        "title": "地球磁场3D可视化（交互动画）物理人教版选择性必修第二册",
        "filename": "res-msx8ungg-2t2bnh.zip",
        "source_url": "https://zlmmxwl.com/uploads/resources/abe493a1749844ee957612e5c9b3bab5/3D.html",
        "node_path": ("选择性必修第二册", "第一章 磁场", "第一节 安培力"),
        "keywords": "地磁场,磁感线,磁偏角,3D可视化",
        "author": AUTHOR
    },
]

def find_node(db, path: tuple[str, str, str]) -> int | None:
    book_name, chap_name, sec_name = path
    book = db.query(TextbookNode).filter(TextbookNode.subject_id == 4, TextbookNode.name == book_name).first()
    if not book:
        return None
    chap = db.query(TextbookNode).filter(TextbookNode.parent_id == book.id, TextbookNode.name == chap_name).first()
    if not chap:
        return None
    # Match by partial string or alias
    keywords = [sec_name]
    if "回旋加速器" in sec_name:
        keywords.extend(["质谱仪和回旋加速器", "洛伦兹力与现代技术"])
    elif "安培力" in sec_name:
        keywords.extend(["磁场对通电导线的作用", "安培力"])
    
    sections = db.query(TextbookNode).filter(TextbookNode.parent_id == chap.id).all()
    for kw in keywords:
        for s in sections:
            if kw in s.name:
                return s.id
    return sections[0].id if sections else None

def main():
    db = SessionLocal()
    try:
        creator = db.query(User).filter(User.username == "admin").first()
        if not creator:
            creator = db.query(User).first()
        creator_id = creator.id if creator else 1

        for idx, item in enumerate(ITEMS, 1):
            file_path = LOCALIZED_DIR / item["filename"]
            content = file_path.read_bytes()
            node_id = find_node(db, item["node_path"])

            # Check if animation already exists with this title
            existing = db.query(Animation).filter(Animation.title == item["title"]).first()
            if existing:
                print(f"[{idx}/9] Already exists in db: {item['title']} (ID {existing.id}), updating...")
                saved_path, file_size, validation_status, summary, _, warnings = process_courseware_upload(
                    content, item["filename"], 4
                )
                existing.file_path = saved_path
                existing.file_size = file_size
                existing.author = item["author"]
                existing.textbook_node_id = node_id or existing.textbook_node_id
                existing.validation_status = validation_status
                existing.validation_summary = summary
                existing.is_published = True
                existing.review_status = "approved"
                db.commit()
                print(f"    Updated animation {existing.id}: {item['title']}")
                continue

            saved_path, file_size, validation_status, summary, _, warnings = process_courseware_upload(
                content, item["filename"], 4
            )
            desc = (
                f"{MARKER}\nSource: {item['source_url']}\n"
                f"Source resource ID: {item['id']}\n"
                "Imported from the publicly accessible Mingxing Physics course-resource catalogue and localized for offline intranet use."
            )
            anim = Animation(
                title=item["title"],
                subject_id=4,
                textbook_node_id=node_id,
                description=desc,
                author=item["author"],
                file_path=saved_path,
                grade_level="高中",
                keywords=item["keywords"],
                source_type="original",
                is_published=True,
                review_status="approved",
                validation_status=validation_status,
                validation_summary=summary,
                validation_errors="[]",
                validation_warnings=json.dumps(warnings, ensure_ascii=False),
                file_size=file_size,
                created_by=creator_id,
            )
            db.add(anim)
            db.commit()
            print(f"[{idx}/9] Successfully imported: {item['title']} (New ID {anim.id}, node {node_id})")
    finally:
        db.close()

if __name__ == "__main__":
    main()
