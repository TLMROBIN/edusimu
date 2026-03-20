from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from .auth import get_password_hash
from .database import Base, SessionLocal, engine, settings
from .models import Subject, TextbookNode, User
from .physics_catalog import PHYSICS_CATALOG
from .subject_catalogs import BIOLOGY_CATALOG, CHEMISTRY_CATALOG, MATH_CATALOG


def ensure_animation_columns(db: Session):
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("animations")}
    missing_columns = {
        "textbook_node_id": "ALTER TABLE animations ADD COLUMN textbook_node_id INTEGER",
        "review_status": "ALTER TABLE animations ADD COLUMN review_status VARCHAR(20) DEFAULT 'pending_review'",
        "review_notes": "ALTER TABLE animations ADD COLUMN review_notes TEXT",
        "validation_status": "ALTER TABLE animations ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending'",
        "validation_summary": "ALTER TABLE animations ADD COLUMN validation_summary TEXT",
        "validation_errors": "ALTER TABLE animations ADD COLUMN validation_errors TEXT",
        "validation_warnings": "ALTER TABLE animations ADD COLUMN validation_warnings TEXT",
        "source_type": "ALTER TABLE animations ADD COLUMN source_type VARCHAR(20) DEFAULT 'original'",
    }

    for column_name, ddl in missing_columns.items():
        if column_name not in columns:
            db.execute(text(ddl))

    db.execute(text(
        "UPDATE animations "
        "SET review_status = COALESCE(review_status, CASE WHEN is_published THEN 'approved' ELSE 'pending_review' END), "
        "validation_status = COALESCE(validation_status, CASE WHEN is_published THEN 'passed' ELSE 'pending' END), "
        "source_type = COALESCE(NULLIF(source_type, ''), 'original')"
    ))
    db.execute(text("CREATE INDEX IF NOT EXISTS ix_animations_source_type ON animations (source_type)"))
    db.commit()


def ensure_user_columns(db: Session):
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("users")}
    missing_columns = {
        "grade_level": "ALTER TABLE users ADD COLUMN grade_level VARCHAR(50)",
    }

    for column_name, ddl in missing_columns.items():
        if column_name not in columns:
            db.execute(text(ddl))

    db.commit()


def ensure_textbook_nodes_table(db: Session):
    inspector = inspect(engine)
    if "textbook_nodes" in inspector.get_table_names():
        return

    db.execute(text("""
        CREATE TABLE textbook_nodes (
            id INTEGER PRIMARY KEY,
            subject_id INTEGER NOT NULL,
            parent_id INTEGER,
            name VARCHAR(200) NOT NULL,
            node_type VARCHAR(20) NOT NULL DEFAULT 'chapter',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(subject_id) REFERENCES subjects (id),
            FOREIGN KEY(parent_id) REFERENCES textbook_nodes (id)
        )
    """))
    db.commit()


def seed_textbook_nodes(db: Session):
    existing_count = db.query(TextbookNode).count()
    if existing_count > 0:
        return

    subjects = {subject.name: subject for subject in db.query(Subject).all()}
    catalog_seed = {
        "math": MATH_CATALOG,
        "physics": PHYSICS_CATALOG,
        "chinese": [
            ("必修上", [
                ("第一单元", ["沁园春·长沙", "立在地球边上放号"]),
                ("第二单元", ["短歌行", "归园田居"]),
            ]),
        ],
        "chemistry": CHEMISTRY_CATALOG,
        "biology": BIOLOGY_CATALOG,
    }

    sort_index = 1
    for subject_name, books in catalog_seed.items():
        subject = subjects.get(subject_name)
        if not subject:
            continue
        for book_name, chapters in books:
            book_node = TextbookNode(
                subject_id=subject.id,
                name=book_name,
                node_type="book",
                sort_order=sort_index,
            )
            db.add(book_node)
            db.flush()
            chapter_index = 1
            for chapter_name, sections in chapters:
                chapter_node = TextbookNode(
                    subject_id=subject.id,
                    parent_id=book_node.id,
                    name=chapter_name,
                    node_type="chapter",
                    sort_order=chapter_index,
                )
                db.add(chapter_node)
                db.flush()
                section_index = 1
                for section_name in sections:
                    db.add(TextbookNode(
                        subject_id=subject.id,
                        parent_id=chapter_node.id,
                        name=section_name,
                        node_type="section",
                        sort_order=section_index,
                    ))
                    section_index += 1
                chapter_index += 1
            sort_index += 1

    db.commit()

def init_database(db: Session):
    Base.metadata.create_all(bind=engine)
    ensure_user_columns(db)
    ensure_animation_columns(db)
    ensure_textbook_nodes_table(db)
    
    admin = db.query(User).filter(User.username == settings.admin_username).first()
    if not admin:
        admin = User(
            username=settings.admin_username,
            password_hash=get_password_hash(settings.admin_password),
            role="admin",
            real_name="系统管理员",
            is_active=True
        )
        db.add(admin)
        print(f"创建管理员账号: {settings.admin_username}")
    
    subjects_data = [
        {"name": "chinese", "display_name": "语文", "sort_order": 1},
        {"name": "math", "display_name": "数学", "sort_order": 2},
        {"name": "english", "display_name": "英语", "sort_order": 3},
        {"name": "physics", "display_name": "物理", "sort_order": 4},
        {"name": "chemistry", "display_name": "化学", "sort_order": 5},
        {"name": "biology", "display_name": "生物", "sort_order": 6},
        {"name": "geography", "display_name": "地理", "sort_order": 7},
        {"name": "politics", "display_name": "政治", "sort_order": 8},
        {"name": "history", "display_name": "历史", "sort_order": 9},
    ]
    
    for subject_data in subjects_data:
        subject = db.query(Subject).filter(Subject.name == subject_data["name"]).first()
        if not subject:
            subject = Subject(**subject_data)
            db.add(subject)
            print(f"创建学科: {subject_data['display_name']}")

    db.commit()
    seed_textbook_nodes(db)
    
    print("数据库初始化完成！")

if __name__ == "__main__":
    db = SessionLocal()
    try:
        init_database(db)
    finally:
        db.close()
