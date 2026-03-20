from sqlalchemy import text

from app.database import SessionLocal
from app.models import Subject, TextbookNode
from app.physics_catalog import PHYSICS_CATALOG


def main():
    db = SessionLocal()
    try:
        subject = db.query(Subject).filter(Subject.name == "physics").first()
        if not subject:
            raise RuntimeError("未找到 physics 学科，请先初始化数据库。")

        animation_count = db.execute(
            text("SELECT COUNT(*) FROM animations WHERE subject_id = :subject_id"),
            {"subject_id": subject.id},
        ).scalar_one()
        if animation_count > 0:
            raise RuntimeError("物理学科下已经有关联课件，已停止导入，避免破坏既有章节绑定。")

        db.query(TextbookNode).filter(TextbookNode.subject_id == subject.id).delete(synchronize_session=False)
        db.flush()

        for book_index, (book_name, chapters) in enumerate(PHYSICS_CATALOG, start=1):
            book_node = TextbookNode(
                subject_id=subject.id,
                name=book_name,
                node_type="book",
                sort_order=book_index,
            )
            db.add(book_node)
            db.flush()

            for chapter_index, (chapter_name, sections) in enumerate(chapters, start=1):
                chapter_node = TextbookNode(
                    subject_id=subject.id,
                    parent_id=book_node.id,
                    name=chapter_name,
                    node_type="chapter",
                    sort_order=chapter_index,
                )
                db.add(chapter_node)
                db.flush()

                for section_index, section_name in enumerate(sections, start=1):
                    db.add(TextbookNode(
                        subject_id=subject.id,
                        parent_id=chapter_node.id,
                        name=section_name,
                        node_type="section",
                        sort_order=section_index,
                    ))

        db.commit()
        print(f"已导入高中物理人教版教材目录，共 {len(PHYSICS_CATALOG)} 本书。")
    finally:
        db.close()


if __name__ == "__main__":
    main()
