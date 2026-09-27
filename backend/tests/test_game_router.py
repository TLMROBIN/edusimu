import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models import GameAttempt, GameCheckin, User
from backend.app.routers import game
from backend.app.routers.game import (
    AttemptBatchIn,
    AttemptIn,
    ProgressIn,
    RankedResultIn,
    SettingsIn,
    BEIJING,
    _school_day_streak,
    beijing_day,
)

KEY = "physics-quest"


class GameRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="edusimu-game-")
        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_dir.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)()
        self.s1 = User(username="s1", password_hash="x", role="student", real_name="学生甲", class_name="高二1班", is_active=True)
        self.s2 = User(username="s2", password_hash="x", role="student", real_name="学生乙", class_name="高二1班", is_active=True)
        self.s3 = User(username="s3", password_hash="x", role="student", real_name="学生丙", class_name="高二2班", is_active=True)
        self.teacher = User(username="t1", password_hash="x", role="teacher", real_name="老师", class_name="高二1班", is_active=True)
        self.db.add_all([self.s1, self.s2, self.s3, self.teacher])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    async def test_progress_optimistic_lock(self):
        empty = await game.get_progress(KEY, current_user=self.s1, db=self.db)
        self.assertEqual(empty["version"], 0)
        saved = await game.put_progress(KEY, ProgressIn(data={"stars": 3}, base_version=0), current_user=self.s1, db=self.db)
        self.assertEqual(saved["version"], 1)
        with self.assertRaises(HTTPException) as ctx:
            await game.put_progress(KEY, ProgressIn(data={"stars": 1}, base_version=0), current_user=self.s1, db=self.db)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["data"], {"stars": 3})
        loaded = await game.get_progress(KEY, current_user=self.s1, db=self.db)
        self.assertEqual(loaded["data"], {"stars": 3})
        other = await game.get_progress(KEY, current_user=self.s2, db=self.db)
        self.assertIsNone(other["data"])

    async def test_bad_game_key_rejected(self):
        with self.assertRaises(HTTPException):
            await game.get_progress("../etc", current_user=self.s1, db=self.db)

    async def test_attempts_dedup_and_daily_checkin(self):
        batch = AttemptBatchIn(attempts=[
            AttemptIn(client_id=f"daily-000{i}", mode="daily", level_id=f"d{i}", passed=True, stars=3) for i in range(5)
        ] + [AttemptIn(client_id="daily-0000", mode="daily", level_id="d0", passed=True, stars=3)])
        result = await game.post_attempts(KEY, batch, current_user=self.s1, db=self.db)
        self.assertEqual(result, {"stored": 5, "received": 6})
        daily = await game.get_daily(KEY, current_user=self.s1, db=self.db)
        self.assertEqual(daily["done"], 5)
        self.assertTrue(daily["checked_in"])
        self.assertEqual(daily["seed"], f"{KEY}:{beijing_day()}")
        other = await game.get_daily(KEY, current_user=self.s2, db=self.db)
        self.assertFalse(other["checked_in"])
        self.assertEqual(other["seed"], daily["seed"])

    async def test_old_day_is_clamped(self):
        batch = AttemptBatchIn(attempts=[AttemptIn(client_id="old-1-000000", mode="daily", level_id="d", passed=True, day="2020-01-01")])
        await game.post_attempts(KEY, batch, current_user=self.s1, db=self.db)
        row = self.db.query(GameAttempt).filter_by(client_id="old-1-000000").one()
        self.assertEqual(row.day, beijing_day())

    def test_school_day_streak_skips_weekend_and_uses_card(self):
        # 2026-09-28 是周一。打卡：9/21 一、9/22 二、9/24 四、9/25 五、9/28 一（9/23 三缺勤，用补签卡）。
        for day in ["2026-09-21", "2026-09-22", "2026-09-24", "2026-09-25", "2026-09-28"]:
            self.db.add(GameCheckin(user_id=self.s1.id, game_key=KEY, day=day))
        self.db.commit()
        today = datetime(2026, 9, 28, 12, tzinfo=BEIJING)
        streak = _school_day_streak(self.db, self.s1.id, KEY, today)
        self.assertEqual(streak["days"], 5)

    async def test_leaderboard_is_class_scoped_and_can_be_disabled(self):
        for user, stars in [(self.s1, 3), (self.s2, 2), (self.s3, 3)]:
            await game.post_attempts(KEY, AttemptBatchIn(attempts=[
                AttemptIn(client_id=f"att-000-{user.username}", level_id="book-table", passed=True, stars=stars)
            ]), current_user=user, db=self.db)
        board = await game.get_leaderboard(KEY, board="progress", current_user=self.s2, db=self.db)
        self.assertEqual([row["name"] for row in board["top"]], ["学生甲", "学生乙"])
        self.assertEqual(board["me"], {"rank": 2, "score": 2})
        await game.put_class_settings(KEY, "高二1班", SettingsIn(leaderboardEnabled=False), current_user=self.teacher, db=self.db)
        disabled = await game.get_leaderboard(KEY, board="progress", current_user=self.s2, db=self.db)
        self.assertFalse(disabled["enabled"])
        context = await game.get_context(KEY, current_user=self.s1, db=self.db)
        self.assertFalse(context["settings"]["leaderboardEnabled"])

    async def test_ranked_rating_moves_and_dedups(self):
        first = await game.post_ranked(KEY, RankedResultIn(client_id="r-1-000000", level_id="x", difficulty=5, passed=True), current_user=self.s1, db=self.db)
        self.assertGreater(first["delta"], 30)
        again = await game.post_ranked(KEY, RankedResultIn(client_id="r-1-000000", level_id="x", difficulty=5, passed=True), current_user=self.s1, db=self.db)
        self.assertEqual(again["delta"], 0)
        lose = await game.post_ranked(KEY, RankedResultIn(client_id="r-2-000000", level_id="y", difficulty=1, passed=False), current_user=self.s1, db=self.db)
        self.assertLess(lose["delta"], -30)

    async def test_teacher_sees_only_own_class(self):
        await game.post_attempts(KEY, AttemptBatchIn(attempts=[
            AttemptIn(client_id="t-1-000000", level_id="book-table", passed=False, mistake_tags=["extra:centripetal"]),
            AttemptIn(client_id="t-2-000000", level_id="book-table", passed=True, stars=2),
        ]), current_user=self.s1, db=self.db)
        stats = await game.class_stats(KEY, "高二1班", days=30, current_user=self.teacher, db=self.db)
        self.assertEqual(stats["levels"][0]["pass_rate"], 0.5)
        self.assertEqual(stats["top_mistakes"][0]["tag"], "extra:centripetal")
        self.assertEqual({s["name"] for s in stats["students"]}, {"学生甲", "学生乙"})
        with self.assertRaises(HTTPException) as ctx:
            await game.class_stats(KEY, "高二2班", days=30, current_user=self.teacher, db=self.db)
        self.assertEqual(ctx.exception.status_code, 403)
        classes = await game.list_classes(KEY, current_user=self.teacher, db=self.db)
        self.assertEqual([c["class_name"] for c in classes], ["高二1班"])


if __name__ == "__main__":
    unittest.main()
