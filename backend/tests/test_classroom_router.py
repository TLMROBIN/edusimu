import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models import Animation, DanmakuSession, Subject, User
from backend.app.routers import classroom
from backend.app.schemas import DanmakuMessageCreate, DanmakuMessagePatch, DanmakuSessionRequest

CLASS_ONE = "高二1班"
CLASS_TWO = "高二2班"


class ClassroomRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="edusimu-classroom-")
        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_dir.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)()
        self.s1 = User(username="s1", password_hash="x", role="student", real_name="学生甲", class_name=CLASS_ONE, is_active=True)
        self.s2 = User(username="s2", password_hash="x", role="student", real_name="学生乙", class_name=CLASS_ONE, is_active=True)
        self.other = User(username="s3", password_hash="x", role="student", real_name="外班学生", class_name=CLASS_TWO, is_active=True)
        self.teacher = User(username="t1", password_hash="x", role="teacher", real_name="老师", class_name=CLASS_ONE, is_active=True)
        self.admin = User(username="admin-test", password_hash="x", role="admin", real_name="管理员", is_active=True)
        subject = Subject(name="physics-test", display_name="物理", sort_order=1)
        self.db.add(subject)
        self.db.flush()
        self.animation = Animation(
            title="测试课件",
            subject_id=subject.id,
            file_path="test.html",
            is_published=True,
            created_by=self.teacher.id,
        )
        self.db.add_all([self.s1, self.s2, self.other, self.teacher, self.admin, self.animation])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    async def open_session(self, class_name=CLASS_ONE, user=None):
        return await classroom.change_danmaku_session(
            self.animation.id,
            DanmakuSessionRequest(class_name=class_name, action="open"),
            current_user=user or self.teacher,
            db=self.db,
        )

    async def send(self, content="这里没看懂", user=None, class_name=CLASS_ONE):
        return await classroom.create_danmaku_message(
            self.animation.id,
            DanmakuMessageCreate(class_name=class_name, content=content),
            current_user=user or self.s1,
            db=self.db,
        )

    async def state(self, user=None, class_name=CLASS_ONE, after_id=0):
        return await classroom.get_danmaku_state(
            self.animation.id,
            class_name=class_name,
            after_id=after_id,
            current_user=user or self.s1,
            db=self.db,
        )

    async def history(self, user=None, scope="class", sort="hot", class_name=CLASS_ONE):
        return await classroom.get_danmaku_history(
            self.animation.id,
            scope=scope,
            sort=sort,
            class_name=class_name,
            page=1,
            page_size=20,
            current_user=user or self.s1,
            db=self.db,
        )

    async def test_default_closed_open_cooldown_incremental_and_early_close(self):
        initial = await self.state()
        self.assertFalse(initial.is_open)
        discussion_only = await self.send("弹幕关闭时的提问", user=self.s2)
        self.assertIsNone(discussion_only.session_id)
        self.assertEqual((await self.history()).items[0].id, discussion_only.id)
        self.assertEqual((await self.state()).messages, [])

        with self.assertRaises(HTTPException) as class_error:
            await self.open_session(CLASS_TWO)
        self.assertEqual(class_error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as student_class_error:
            await self.state(class_name=CLASS_TWO)
        self.assertEqual(student_class_error.exception.status_code, 403)

        opened = await self.open_session()
        self.assertTrue(opened.is_open)
        self.assertLessEqual(opened.remaining_seconds, 2400)
        self.assertGreater(opened.remaining_seconds, 2390)
        self.assertEqual(opened.messages, [])
        with self.assertRaises(HTTPException) as opening_cooldown:
            await self.send("开启后仍在冷却", user=self.s2)
        self.assertEqual(opening_cooldown.exception.status_code, 429)

        message = await self.send()
        self.assertEqual(message.display_name, "学生甲")
        self.assertIsNotNone(message.created_at.tzinfo)
        with self.assertRaises(HTTPException) as cooldown_error:
            await self.send("第二条")
        self.assertEqual(cooldown_error.exception.status_code, 429)

        incremental = await self.state()
        self.assertEqual([item.id for item in incremental.messages], [message.id])
        empty = await self.state(after_id=message.id)
        self.assertEqual(empty.messages, [])

        closed = await classroom.change_danmaku_session(
            self.animation.id,
            DanmakuSessionRequest(class_name=CLASS_ONE, action="close"),
            current_user=self.teacher,
            db=self.db,
        )
        self.assertFalse(closed.is_open)
        with self.assertRaises(HTTPException) as closing_cooldown:
            await self.send("关闭后仍在冷却")
        self.assertEqual(closing_cooldown.exception.status_code, 429)
        after_close = await self.send("关闭后仍可提问", user=self.teacher)
        self.assertIsNone(after_close.session_id)
        history = await self.history()
        self.assertEqual({item.id for item in history.items}, {discussion_only.id, message.id, after_close.id})

    async def test_expired_session_still_allows_history_and_toggle_upvotes(self):
        await self.open_session()
        message = await self.send()
        session = self.db.query(DanmakuSession).filter_by(id=message.session_id).one()
        session.expires_at = classroom.utc_now() - timedelta(seconds=1)
        self.db.commit()

        expired = await self.state()
        self.assertFalse(expired.is_open)
        self.assertEqual(expired.remaining_seconds, 0)
        after_expiry = await self.send("弹幕到期后仍可提问", user=self.s2)
        self.assertIsNone(after_expiry.session_id)

        upvoted = await classroom.toggle_danmaku_upvote(
            self.animation.id, message.id, current_user=self.s2, db=self.db
        )
        self.assertTrue(upvoted.upvoted)
        self.assertEqual(upvoted.upvote_count, 1)
        history = await self.history(user=self.s2)
        self.assertTrue(history.items[0].upvoted_by_me)
        self.assertEqual(history.items[0].upvote_count, 1)
        self.assertEqual(history.total, 2)

        cancelled = await classroom.toggle_danmaku_upvote(
            self.animation.id, message.id, current_user=self.s2, db=self.db
        )
        self.assertFalse(cancelled.upvoted)
        self.assertEqual(cancelled.upvote_count, 0)
        history = await self.history(user=self.s2)
        self.assertFalse(history.items[0].upvoted_by_me)

    async def test_cross_class_privacy_and_teacher_moderation(self):
        own_message = await self.send_after_open(self.s1, CLASS_ONE, self.teacher)
        other_message = await self.send_after_open(self.other, CLASS_TWO, self.admin)

        with self.assertRaises(HTTPException) as upvote_error:
            await classroom.toggle_danmaku_upvote(
                self.animation.id, other_message.id, current_user=self.s1, db=self.db
            )
        self.assertEqual(upvote_error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as moderate_error:
            await classroom.moderate_danmaku_message(
                self.animation.id,
                other_message.id,
                DanmakuMessagePatch(is_pinned=True),
                current_user=self.teacher,
                db=self.db,
            )
        self.assertEqual(moderate_error.exception.status_code, 403)

        empty_all = await self.history(scope="all", class_name=None)
        self.assertEqual(empty_all.total, 0)
        pinned = await classroom.moderate_danmaku_message(
            self.animation.id,
            other_message.id,
            DanmakuMessagePatch(is_pinned=True, teacher_reply="这是跨班精选解答"),
            current_user=self.admin,
            db=self.db,
        )
        self.assertIsNotNone(pinned.replied_at)
        all_history = await self.history(scope="all", class_name=None)
        self.assertEqual(all_history.total, 1)
        self.assertEqual(all_history.items[0].display_name, "同学")
        self.assertIsNone(all_history.items[0].user_id)
        self.assertEqual(all_history.items[0].teacher_reply, "这是跨班精选解答")
        teacher_all = await self.history(user=self.teacher, scope="all", class_name=None)
        self.assertEqual([item.id for item in teacher_all.items], [own_message.id])
        self.assertEqual(teacher_all.items[0].user_id, own_message.user_id)
        upvoted = await classroom.toggle_danmaku_upvote(
            self.animation.id, other_message.id, current_user=self.s1, db=self.db
        )
        self.assertTrue(upvoted.upvoted)

        await classroom.moderate_danmaku_message(
            self.animation.id,
            own_message.id,
            DanmakuMessagePatch(is_pinned=True, teacher_reply="本班解答"),
            current_user=self.teacher,
            db=self.db,
        )
        deleted = await classroom.moderate_danmaku_message(
            self.animation.id,
            own_message.id,
            DanmakuMessagePatch(is_deleted=True),
            current_user=self.teacher,
            db=self.db,
        )
        self.assertTrue(deleted.is_deleted)
        self.assertEqual((await self.history()).total, 0)
        with self.assertRaises(HTTPException) as deleted_upvote:
            await classroom.toggle_danmaku_upvote(
                self.animation.id, own_message.id, current_user=self.s1, db=self.db
            )
        self.assertEqual(deleted_upvote.exception.status_code, 404)
        admin_all = await self.history(user=self.admin, scope="all", class_name=None)
        self.assertEqual(admin_all.total, 1)

    async def send_after_open(self, student, class_name, opener):
        await self.open_session(class_name, opener)
        return await self.send(
            content=f"{class_name}的问题",
            user=student,
            class_name=class_name,
        )

    async def test_reopen_closes_previous_active_session(self):
        first = await self.open_session()
        second = await self.open_session()
        self.assertNotEqual(first.session_id, second.session_id)
        old = self.db.query(DanmakuSession).filter_by(id=first.session_id).one()
        self.assertTrue(old.closed_early)
        current = await self.state()
        self.assertEqual(current.session_id, second.session_id)

    async def test_class_list_respects_teacher_assignment(self):
        teacher_classes = await classroom.list_classroom_classes(current_user=self.teacher, db=self.db)
        admin_classes = await classroom.list_classroom_classes(current_user=self.admin, db=self.db)
        self.assertEqual(teacher_classes, [CLASS_ONE])
        self.assertEqual(admin_classes, [CLASS_ONE, CLASS_TWO])


if __name__ == "__main__":
    unittest.main()
