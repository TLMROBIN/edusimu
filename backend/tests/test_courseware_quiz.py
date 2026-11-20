import base64
import csv
import io
import json
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models import (
    Animation, CoursewareQuizAttempt, DanmakuMessage, DanmakuSession, DanmakuUpvote, Subject, User, ViewHistory,
)
from backend.app.routers.animations import (
    build_issue_prompts, delete_animation, inspect_courseware_quiz, read_courseware_quiz_metadata,
    serialize_animation, validate_courseware,
)
from backend.app.routers.classroom import (
    change_danmaku_session, create_danmaku_message, export_quiz_stats, get_quiz_stats,
    submit_quiz_attempt, toggle_danmaku_upvote, utc_now,
)
from backend.app.schemas import CoursewareQuizAttemptCreate, DanmakuMessageCreate, DanmakuSessionRequest

CLASS_ONE = "高二1班"
CLASS_TWO = "高二2班"
MANIFEST = {
    "version": 1,
    "questions": [
        {
            "id": "q1",
            "title": "第1题：入射光频率增大时遏止电压的变化",
            "type": "choice",
            "options": ["A. 增大", "B. 减小", "C. 不变"],
            "answer": "A",
            "maxScore": 1,
        },
        {
            "id": "q2",
            "title": "第2题：逐差法计算小车加速度",
            "type": "numeric",
            "answer": "2.40",
            "maxScore": 2,
        },
    ],
}


def courseware_html(manifest=None, submit_marker=True):
    manifest_tag = ""
    if manifest is not None:
        manifest_tag = f'<script type="application/json" id="edusimu-quiz-manifest">{manifest}</script>'
    marker = "window.parent.postMessage({type:'EDUSIMU_QUIZ_SUBMIT'}, '*')" if submit_marker else ""
    return (
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<style>body{touch-action:none;}@media (max-width:900px){body{font-size:14px;}}</style></head>'
        f'<body><button onclick="submitAnswer()">提交</button>{manifest_tag}<script>{marker}</script></body></html>'
    ).encode("utf-8")


class QuizManifestTests(unittest.TestCase):
    def test_upload_metadata_reads_quiz_from_updated_isolated_wrapper(self):
        template = (Path(__file__).resolve().parents[2] / "scripts/tongjiang_isolated_wrapper.html").read_text("utf-8")
        config = {"version": 1, "marker": "edusimu-isolated-tongjiang-v1", "slug": "test"}
        inner = courseware_html(json.dumps(MANIFEST))
        config["sourceBase64"] = base64.b64encode(inner).decode()
        wrapped = template.replace("__TITLE__", "隔离测试").replace("__CONFIG__", json.dumps(config))
        self.assertTrue(inspect_courseware_quiz(wrapped.encode())[0])
        legacy = wrapped.replace("parent.postMessage({\n      type: 'EDUSIMU_QUIZ_SUBMIT'", "void ({\n      type: 'EDUSIMU_QUIZ_SUBMIT'")
        self.assertIn("隔离包装器缺少", inspect_courseware_quiz(legacy.encode())[2][0])
        config["sourceBase64"] = base64.b64encode(courseware_html()).decode()
        plain = template.replace("__TITLE__", "隔离测试").replace("__CONFIG__", json.dumps(config))
        self.assertEqual(inspect_courseware_quiz(plain.encode()), (False, None, []))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "wrapped.html"
            path.write_text(wrapped, "utf-8")
            ready, manifest, keywords = read_courseware_quiz_metadata(str(path), "物理")
        self.assertTrue(ready)
        self.assertEqual(len(json.loads(manifest)["questions"]), 2)
        self.assertEqual(keywords, "物理,edusimu-isolated-tongjiang-v1")

    def test_manifest_requires_quiz_payload_in_executable_parent_call(self):
        html = courseware_html(json.dumps(MANIFEST), submit_marker=False)
        call = b"window.parent.postMessage({version:1, 'type':'EDUSIMU_QUIZ_SUBMIT'}, '*')"
        snippets = [
            b"<!-- <script>" + call + b"</script> -->",
            b"<script>/* " + call + b" */</script>",
            b"<script>// " + call + b"\n</script>",
            b'<script type="text/plain">' + call + b"</script>",
            b"<script>const example = " + json.dumps(call.decode()).encode() + b";</script>",
            b"<script>const quiz = {type:'EDUSIMU_QUIZ_SUBMIT'}; parent.postMessage({type:'OTHER'}, '*');</script>",
        ]
        for snippet in snippets:
            with self.subTest(snippet=snippet):
                ready, _, warnings = inspect_courseware_quiz(html.replace(b"<script></script>", snippet))
                self.assertFalse(ready)
                self.assertIn("缺少 EDUSIMU_QUIZ_SUBMIT", warnings[0])

        for script in (
            call,
            b"const payload = {version:1, /* comment */ type:'EDUSIMU_QUIZ_SUBMIT'}; parent.postMessage(payload, '*')",
        ):
            with self.subTest(script=script):
                valid = html.replace(b"<script></script>", b"<script>" + script + b"</script>")
                self.assertTrue(inspect_courseware_quiz(valid)[0])

    def test_three_state_detection_does_not_block_regular_playback(self):
        plain_status, _, _, plain_warnings = validate_courseware(courseware_html())
        self.assertEqual(plain_status, "passed")
        self.assertFalse(any("题目" in warning for warning in plain_warnings))

        valid_status, _, _, valid_warnings = validate_courseware(courseware_html(json.dumps(MANIFEST)))
        self.assertEqual(valid_status, "passed")
        self.assertTrue(any("已识别 2 道标准题目" in warning for warning in valid_warnings))

        invalid_status, _, _, invalid_warnings = validate_courseware(courseware_html("{"))
        self.assertEqual(invalid_status, "passed")
        self.assertTrue(any("题目规范不完整" in warning for warning in invalid_warnings))
        prompts = build_issue_prompts([], invalid_warnings)
        self.assertIn("修复课件题目规范 Prompt", [prompt.title for prompt in prompts])

    def test_manifest_requires_valid_fields_and_submit_call(self):
        cases = [
            (json.dumps({"version": 2, "questions": MANIFEST["questions"]}), "version"),
            (json.dumps({"version": 1.0, "questions": MANIFEST["questions"]}), "version"),
            (json.dumps({"version": 1, "questions": []}), "非空数组"),
            (json.dumps({"version": 1, "questions": [{"id": "q1", "type": "choice"}]}), "title"),
            (json.dumps({"version": 1, "questions": [MANIFEST["questions"][0], MANIFEST["questions"][0]]}), "重复"),
        ]
        for raw, reason in cases:
            with self.subTest(reason=reason):
                _, _, _, warnings = validate_courseware(courseware_html(raw))
                self.assertTrue(any("题目规范不完整" in warning and reason in warning for warning in warnings))

        _, _, _, warnings = validate_courseware(courseware_html(json.dumps(MANIFEST), submit_marker=False))
        self.assertTrue(any("缺少 EDUSIMU_QUIZ_SUBMIT" in warning for warning in warnings))
        wrong_type = courseware_html(json.dumps(MANIFEST)).replace(b'type="application/json"', b'type="text/javascript"', 1)
        _, _, _, warnings = validate_courseware(wrong_type)
        self.assertTrue(any("application/json" in warning for warning in warnings))


class QuizAttemptTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="edusimu-quiz-")
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
        subject = Subject(name="physics-quiz-test", display_name="物理")
        self.db.add(subject)
        self.db.flush()
        self.animation = Animation(
            title="规范带题课件",
            subject_id=subject.id,
            file_path="quiz.html",
            is_published=True,
            has_quiz=True,
            quiz_manifest=json.dumps(MANIFEST, ensure_ascii=False),
        )
        self.db.add_all([self.s1, self.s2, self.other, self.teacher, self.admin, self.animation])
        self.db.flush()
        now = utc_now()
        self.old_history = ViewHistory(user_id=self.s1.id, animation_id=self.animation.id, viewed_at=now - timedelta(hours=1))
        self.latest_history = ViewHistory(user_id=self.s1.id, animation_id=self.animation.id, viewed_at=now)
        self.db.add_all([self.old_history, self.latest_history])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    async def submit(self, question_id="q1", answer="B", correct=False, score=None, user=None, mistake=None):
        return await submit_quiz_attempt(
            self.animation.id,
            CoursewareQuizAttemptCreate(
                questionId=question_id,
                answer=answer,
                isCorrect=correct,
                score=score,
                mistakeTag=mistake,
            ),
            current_user=user or self.s1,
            db=self.db,
        )

    async def test_upsert_preserves_first_result_and_updates_latest_view_history(self):
        first = await self.submit(correct=False, mistake="方向判断反了")
        self.assertEqual(first["attempt_count"], 1)
        self.assertFalse(first["first_is_correct"])
        self.db.refresh(self.latest_history)
        self.assertEqual(self.latest_history.quiz_score, 0)
        self.assertEqual(self.latest_history.quiz_total, 3)

        second = await self.submit(answer="A", correct=True)
        self.assertEqual(second["attempt_count"], 2)
        self.assertFalse(second["first_is_correct"])
        self.assertTrue(second["is_correct"])
        self.assertEqual(second["score"], 1)
        self.db.refresh(self.latest_history)
        self.db.refresh(self.old_history)
        self.assertEqual(self.latest_history.quiz_score, 1)
        self.assertEqual(self.latest_history.quiz_total, 3)
        self.assertIsNone(self.old_history.quiz_score)

        await self.submit(question_id="q2", answer="2.40", correct=True)
        self.db.refresh(self.latest_history)
        self.assertEqual(self.latest_history.quiz_score, 3)
        self.assertEqual(self.latest_history.quiz_total, 3)
        self.assertEqual(self.db.query(CoursewareQuizAttempt).count(), 2)

        with self.assertRaises(HTTPException) as unknown_question:
            await self.submit(question_id="not-in-manifest")
        self.assertEqual(unknown_question.exception.status_code, 400)
        with self.assertRaises(HTTPException) as excessive_score:
            await self.submit(score=2)
        self.assertEqual(excessive_score.exception.status_code, 400)
        with self.assertRaises(HTTPException) as teacher_submit:
            await self.submit(user=self.teacher)
        self.assertEqual(teacher_submit.exception.status_code, 403)
        with self.assertRaises(HTTPException) as oversized_answer:
            await self.submit(answer="题" * 400)
        self.assertEqual(oversized_answer.exception.status_code, 413)

    async def test_replaced_manifest_scores_only_current_questions(self):
        await self.submit(answer="A", correct=True)
        await self.submit(question_id="q2", answer="2.40", correct=True)
        new_question = {"id": "q3", "title": "新题", "type": "fill", "maxScore": 1}
        revised_question = {**MANIFEST["questions"][1], "maxScore": 1}
        self.animation.quiz_manifest = json.dumps({"version": 1, "questions": [revised_question, new_question]})
        self.db.commit()

        await self.submit(question_id="q3", answer="新答案", correct=True)
        self.db.refresh(self.latest_history)
        self.assertEqual((self.latest_history.quiz_score, self.latest_history.quiz_total), (2, 2))
        stats = await get_quiz_stats(self.animation.id, CLASS_ONE, self.teacher, self.db)
        student = next(row for row in stats["students"] if row["user_id"] == self.s1.id)
        self.assertEqual((student["total_score"], student["total_max_score"]), (2, 2))
        self.assertEqual(self.db.query(CoursewareQuizAttempt).count(), 3)

    async def test_delete_courseware_with_classroom_records_and_foreign_keys(self):
        self.db.execute(text("PRAGMA foreign_keys=ON"))
        self.assertEqual(self.db.scalar(text("PRAGMA foreign_keys")), 1)
        animation_id = self.animation.id
        path = Path(self.temp_dir.name) / "courseware.html"
        path.write_text("<html></html>", encoding="utf-8")
        self.animation.file_path = str(path)
        self.db.commit()
        await self.submit()
        await change_danmaku_session(
            animation_id, DanmakuSessionRequest(class_name=CLASS_ONE, action="open"), self.teacher, self.db,
        )
        message = await create_danmaku_message(
            animation_id, DanmakuMessageCreate(class_name=CLASS_ONE, content="随堂提问"), self.s1, self.db,
        )
        await toggle_danmaku_upvote(animation_id, message.id, self.s2, self.db)

        with patch.object(self.db, "commit", side_effect=RuntimeError("commit failed")):
            with self.assertRaisesRegex(RuntimeError, "commit failed"):
                await delete_animation(animation_id, self.admin, self.db)
        self.db.rollback()
        self.assertTrue(path.exists())
        self.assertIsNotNone(self.db.get(Animation, animation_id))
        self.assertEqual(self.db.query(DanmakuUpvote).count(), 1)

        await delete_animation(animation_id, self.admin, self.db)
        self.assertIsNone(self.db.get(Animation, animation_id))
        self.assertFalse(path.exists())
        for model in (CoursewareQuizAttempt, DanmakuMessage, DanmakuSession, DanmakuUpvote, ViewHistory):
            self.assertEqual(self.db.query(model).count(), 0)

    async def test_csv_is_class_scoped_and_uses_individual_attempt_timestamps(self):
        await self.submit(answer="B")
        await self.submit(answer="A", correct=True)
        await self.submit(question_id="q2", answer='=1+1, "原始作答"\n第二行', correct=False)
        await self.submit(answer="外班作答", user=self.other)
        response = await export_quiz_stats(self.animation.id, CLASS_ONE, self.teacher, self.db)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertTrue(response.body.startswith(b"\xef\xbb\xbf"))
        rows = list(csv.DictReader(io.StringIO(response.body.decode("utf-8-sig"))))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["学生姓名"], self.s1.real_name)
        self.assertEqual(rows[0]["班级"], CLASS_ONE)
        self.assertEqual((rows[0]["首答正误"], rows[0]["最终正误"], rows[0]["提交次数"]), ("错误", "正确", "2"))
        self.assertEqual(rows[1]["作答内容"], '\'' + '=1+1, "原始作答"\n第二行')
        attempts = self.db.query(CoursewareQuizAttempt).filter_by(user_id=self.s1.id).all()
        for row in rows:
            attempt = next(item for item in attempts if item.question_key == row["题目ID"])
            self.assertEqual(row["更新时间"], attempt.updated_at.replace(tzinfo=utc_now().tzinfo).isoformat())
        with self.assertRaises(HTTPException) as error:
            await export_quiz_stats(self.animation.id, CLASS_TWO, self.teacher, self.db)
        self.assertEqual(error.exception.status_code, 403)

    async def test_class_stats_cover_questions_students_and_class_isolation(self):
        await self.submit(answer="B", correct=False)
        await self.submit(answer="A", correct=True)
        await self.submit(answer="B", correct=False, user=self.s2)
        await self.submit(question_id="q2", answer="2.40", correct=True, user=self.s2)
        await self.submit(answer="A", correct=True, user=self.other)

        stats = await get_quiz_stats(
            self.animation.id,
            class_name=CLASS_ONE,
            current_user=self.teacher,
            db=self.db,
        )
        self.assertEqual(stats["student_count"], 2)
        q1, q2 = stats["questions"]
        self.assertEqual(q1["submitted_count"], 2)
        self.assertEqual(q1["first_correct_rate"], 0)
        self.assertEqual(q1["final_correct_rate"], 50)
        self.assertEqual(q1["answer_distribution"], [{"answer": "A", "count": 1}, {"answer": "B", "count": 1}])
        self.assertEqual(q1["top_incorrect_answers"], [{"answer": "B", "count": 1}])
        self.assertEqual(q2["submitted_count"], 1)
        self.assertEqual(q2["final_correct_rate"], 100)

        students_by_id = {student["user_id"]: student for student in stats["students"]}
        s1 = students_by_id[self.s1.id]
        s2 = students_by_id[self.s2.id]
        self.assertEqual(s1["status"], "in_progress")
        self.assertEqual(s1["completed_count"], 1)
        self.assertEqual(s1["total_score"], 1)
        self.assertEqual(s1["total_max_score"], 3)
        self.assertEqual(s1["first_wrong_question_ids"], ["q1"])
        self.assertEqual(s1["wrong_question_ids"], [])
        self.assertEqual(s2["status"], "completed")
        self.assertEqual(s2["total_score"], 2)
        self.assertEqual(s2["wrong_question_ids"], ["q1"])

        with self.assertRaises(HTTPException) as class_error:
            await get_quiz_stats(
                self.animation.id,
                class_name=CLASS_TWO,
                current_user=self.teacher,
                db=self.db,
            )
        self.assertEqual(class_error.exception.status_code, 403)
        admin_stats = await get_quiz_stats(
            self.animation.id,
            class_name=CLASS_TWO,
            current_user=self.admin,
            db=self.db,
        )
        self.assertEqual(admin_stats["questions"][0]["submitted_count"], 1)

    async def test_animation_response_exposes_quiz_tag_and_count(self):
        response = serialize_animation(self.animation, self.db)
        self.assertTrue(response.has_quiz)
        self.assertEqual(response.quiz_count, 2)
        self.animation.has_quiz = False
        with self.assertRaises(HTTPException) as disabled:
            await self.submit()
        self.assertEqual(disabled.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
