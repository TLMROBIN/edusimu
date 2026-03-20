from sqlalchemy import text

from app.database import SessionLocal


def main():
    db = SessionLocal()
    try:
        for name in ("math", "chemistry", "biology"):
            subject_id = db.execute(
                text("SELECT id FROM subjects WHERE name = :name"),
                {"name": name},
            ).scalar_one()
            nodes = db.execute(
                text("SELECT COUNT(*) FROM textbook_nodes WHERE subject_id = :sid"),
                {"sid": subject_id},
            ).scalar_one()
            animations = db.execute(
                text("SELECT COUNT(*) FROM animations WHERE subject_id = :sid"),
                {"sid": subject_id},
            ).scalar_one()
            bound = db.execute(
                text("SELECT COUNT(*) FROM animations WHERE subject_id = :sid AND textbook_node_id IS NOT NULL"),
                {"sid": subject_id},
            ).scalar_one()
            print(name, "nodes", nodes, "animations", animations, "bound", bound)
    finally:
        db.close()


if __name__ == "__main__":
    main()
