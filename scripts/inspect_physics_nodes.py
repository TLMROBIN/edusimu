from sqlalchemy import text

from app.database import SessionLocal


def main():
    db = SessionLocal()
    try:
        subject_id = db.execute(
            text("SELECT id FROM subjects WHERE name = :name"),
            {"name": "physics"},
        ).scalar_one()
        print(
            "physics_animations",
            db.execute(
                text("SELECT COUNT(*) FROM animations WHERE subject_id = :sid"),
                {"sid": subject_id},
            ).scalar_one(),
        )
        print(
            "physics_bound_nodes",
            db.execute(
                text("SELECT COUNT(*) FROM animations WHERE subject_id = :sid AND textbook_node_id IS NOT NULL"),
                {"sid": subject_id},
            ).scalar_one(),
        )

        rows = db.execute(
            text(
                "SELECT id, name, node_type, parent_id, sort_order "
                "FROM textbook_nodes WHERE subject_id = :sid "
                "ORDER BY COALESCE(parent_id, 0), sort_order, id"
            ),
            {"sid": subject_id},
        ).fetchall()
        for row in rows:
            print(tuple(row))
    finally:
        db.close()


if __name__ == "__main__":
    main()
