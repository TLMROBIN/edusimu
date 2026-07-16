import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models import Animation, Subject, User, ViewHistory
from backend.app.routers.animations import get_recent_animations


class RecentAnimationsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="edusimu-recent-")
        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_dir.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        testing_session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(self.engine)
        self.db = testing_session()

        self.user = User(
            username="student.one",
            password_hash="x",
            role="student",
            real_name="学生一",
            is_active=True,
        )
        subject = Subject(name="physics", display_name="物理", sort_order=1)
        self.db.add_all([self.user, subject])
        self.db.flush()

        self.first = self._add_animation(subject.id, "牛顿运动定律", published=True)
        self.second = self._add_animation(subject.id, "机械能守恒", published=True)
        hidden = self._add_animation(subject.id, "未发布课件", published=False)

        now = datetime.now()
        self.db.add_all([
            ViewHistory(user_id=self.user.id, animation_id=self.second.id, viewed_at=now - timedelta(minutes=3)),
            ViewHistory(user_id=self.user.id, animation_id=self.first.id, viewed_at=now - timedelta(minutes=2)),
            ViewHistory(user_id=self.user.id, animation_id=self.first.id, viewed_at=now - timedelta(minutes=1)),
            ViewHistory(user_id=self.user.id, animation_id=hidden.id, viewed_at=now),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _add_animation(self, subject_id, title, published):
        animation = Animation(
            title=title,
            subject_id=subject_id,
            file_path=f"/tmp/{title}.html",
            source_type="original",
            created_by=self.user.id,
            is_published=published,
            review_status="approved" if published else "pending_review",
            validation_status="passed" if published else "pending",
        )
        self.db.add(animation)
        self.db.flush()
        return animation

    async def test_recent_courseware_is_unique_ordered_and_excludes_inaccessible_items(self):
        recent = await get_recent_animations(limit=2, current_user=self.user, db=self.db)

        self.assertEqual([item.id for item in recent], [self.first.id, self.second.id])
        self.assertTrue(all(item.is_published for item in recent))


if __name__ == "__main__":
    unittest.main()
