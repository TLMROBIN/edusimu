import argparse
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import TextbookNode
from app.subject_catalogs import (
    BIOLOGY_CATALOG,
    CHEMISTRY_CATALOG,
    GEOGRAPHY_CATALOG,
    MATH_CATALOG,
)


CATALOGS = {
    "math": MATH_CATALOG,
    "chemistry": CHEMISTRY_CATALOG,
    "biology": BIOLOGY_CATALOG,
    "geography": GEOGRAPHY_CATALOG,
}


def parse_args():
    parser = argparse.ArgumentParser(description="Import textbook catalogs by subject")
    parser.add_argument(
        "--subject",
        action="append",
        choices=sorted(CATALOGS.keys()),
        help="Only import one subject. Repeatable.",
    )
    return parser.parse_args()


def import_subject(db, subject_name, books):
    subject_id = db.execute(
        text("SELECT id FROM subjects WHERE name = :name"),
        {"name": subject_name},
    ).scalar_one()

    bound_count = db.execute(
        text("SELECT COUNT(*) FROM animations WHERE subject_id = :sid AND textbook_node_id IS NOT NULL"),
        {"sid": subject_id},
    ).scalar_one()
    if bound_count > 0:
        raise RuntimeError(f"{subject_name} 已有课件绑定教材目录，已停止导入。")

    db.query(TextbookNode).filter(TextbookNode.subject_id == subject_id).delete(synchronize_session=False)
    db.flush()

    for book_index, (book_name, chapters) in enumerate(books, start=1):
        book_node = TextbookNode(
            subject_id=subject_id,
            name=book_name,
            node_type="book",
            sort_order=book_index,
        )
        db.add(book_node)
        db.flush()

        for chapter_index, (chapter_name, sections) in enumerate(chapters, start=1):
            chapter_node = TextbookNode(
                subject_id=subject_id,
                parent_id=book_node.id,
                name=chapter_name,
                node_type="chapter",
                sort_order=chapter_index,
            )
            db.add(chapter_node)
            db.flush()

            for section_index, section_name in enumerate(sections, start=1):
                db.add(TextbookNode(
                    subject_id=subject_id,
                    parent_id=chapter_node.id,
                    name=section_name,
                    node_type="section",
                    sort_order=section_index,
                ))


def main():
    args = parse_args()
    selected = args.subject or list(CATALOGS.keys())
    db = SessionLocal()
    try:
        for subject_name in selected:
            books = CATALOGS[subject_name]
            import_subject(db, subject_name, books)
        db.commit()
        print(f"已导入教材目录: {', '.join(selected)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
