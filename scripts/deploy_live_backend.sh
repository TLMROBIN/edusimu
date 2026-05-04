#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LIVE_BACKEND_DIR="/var/www/edusimu/backend"
SOURCE_BACKEND_DIR="${PROJECT_ROOT}/backend"
BACKUP_TS="$(date +%Y%m%d%H%M%S)"
APP_BACKUP_DIR="${LIVE_BACKEND_DIR}/app.bak-${BACKUP_TS}"
REQUIREMENTS_BACKUP="${LIVE_BACKEND_DIR}/requirements.bak-${BACKUP_TS}.txt"

if [[ -d "${LIVE_BACKEND_DIR}/app" ]]; then
  cp -a "${LIVE_BACKEND_DIR}/app" "${APP_BACKUP_DIR}"
fi
if [[ -f "${LIVE_BACKEND_DIR}/requirements.txt" ]]; then
  cp -a "${LIVE_BACKEND_DIR}/requirements.txt" "${REQUIREMENTS_BACKUP}"
fi
rm -rf "${LIVE_BACKEND_DIR}/app"
cp -a "${SOURCE_BACKEND_DIR}/app" "${LIVE_BACKEND_DIR}/app"
cp -a "${SOURCE_BACKEND_DIR}/requirements.txt" "${LIVE_BACKEND_DIR}/requirements.txt"
chown -R www-data:www-data "${LIVE_BACKEND_DIR}/app" "${LIVE_BACKEND_DIR}/requirements.txt"

cd "${LIVE_BACKEND_DIR}"
if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
source venv/bin/activate
python -m pip install --disable-pip-version-check -r requirements.txt
python -m compileall app
python - <<'PY'
from app.database import SessionLocal
from app.init_db import init_database

db = SessionLocal()
try:
    init_database(db)
finally:
    db.close()
PY

python - <<'PY'
from sqlalchemy import text

from app.database import SessionLocal
from app.models import TextbookNode
from app.physics_catalog import PHYSICS_CATALOG

db = SessionLocal()
try:
    subject_id = db.execute(text("SELECT id FROM subjects WHERE name = 'physics'")).scalar_one()
    bound_animation_count = db.execute(
        text("SELECT COUNT(*) FROM animations WHERE subject_id = :sid AND textbook_node_id IS NOT NULL"),
        {"sid": subject_id},
    ).scalar_one()
    if bound_animation_count > 0:
        print("线上物理学科已有课件绑定教材目录，跳过物理目录重建。")
        raise SystemExit(0)

    db.query(TextbookNode).filter(TextbookNode.subject_id == subject_id).delete(synchronize_session=False)
    db.flush()

    for book_index, (book_name, chapters) in enumerate(PHYSICS_CATALOG, start=1):
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

    db.commit()
finally:
    db.close()
PY

systemctl restart edusimu-backend
systemctl is-active edusimu-backend

python - <<'PY'
from sqlalchemy import text
from app.database import SessionLocal

db = SessionLocal()
try:
    subject_id = db.execute(text("SELECT id FROM subjects WHERE name = 'physics'")).scalar_one()
    total = db.execute(
        text("SELECT COUNT(*) FROM textbook_nodes WHERE subject_id = :sid"),
        {"sid": subject_id},
    ).scalar_one()
    books = db.execute(
        text("SELECT name FROM textbook_nodes WHERE subject_id = :sid AND node_type = 'book' ORDER BY sort_order"),
        {"sid": subject_id},
    ).fetchall()
    print("physics_nodes_total", total)
    print("physics_books", [row[0] for row in books])
finally:
    db.close()
PY
