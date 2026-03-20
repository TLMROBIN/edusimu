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
            total = db.execute(
                text("SELECT COUNT(*) FROM textbook_nodes WHERE subject_id = :sid"),
                {"sid": subject_id},
            ).scalar_one()
            books = db.execute(
                text(
                    "SELECT name FROM textbook_nodes "
                    "WHERE subject_id = :sid AND node_type = :node_type "
                    "ORDER BY sort_order"
                ),
                {"sid": subject_id, "node_type": "book"},
            ).fetchall()
            print(name, total, [row[0] for row in books])
    finally:
        db.close()


if __name__ == "__main__":
    main()
