import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models import User
from backend.app.oidc import OidcAuthError, issue_local_token_for_claims


class OidcUserProvisioningTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="edusimu-oidc-")
        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_dir.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(self.engine)
        self.db = TestingSession()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_first_oidc_login_with_teacher_claim_creates_teacher_not_student(self):
        issue_local_token_for_claims(
            self.db,
            {
                "preferred_username": "li.teacher",
                "name": "李老师",
                "realm_access": {"roles": ["offline_access", "teacher"]},
            },
        )

        user = self.db.query(User).filter(User.username == "li.teacher").one()
        self.assertEqual(user.role, "teacher")
        self.assertEqual(user.real_name, "李老师")
        self.assertIsNone(user.grade_level)
        self.assertIsNone(user.class_name)

    def test_oidc_login_prefers_existing_local_user_before_claim_role_inference(self):
        teacher = User(username="local.teacher", password_hash="x", role="teacher", real_name="本地教师", is_active=True)
        self.db.add(teacher)
        self.db.commit()

        issue_local_token_for_claims(
            self.db,
            {
                "preferred_username": "local.teacher",
                "name": "平台姓名",
            },
        )

        user = self.db.query(User).filter(User.username == "local.teacher").one()
        self.assertEqual(user.role, "teacher")
        self.assertEqual(user.real_name, "本地教师")
        self.assertEqual(self.db.query(User).count(), 1)

    def test_unknown_oidc_login_without_role_claim_is_rejected_without_creating_student(self):
        with self.assertRaises(OidcAuthError):
            issue_local_token_for_claims(
                self.db,
                {
                    "preferred_username": "mystery.user",
                    "name": "未知用户",
                },
            )

        self.assertEqual(self.db.query(User).filter(User.username == "mystery.user").count(), 0)
        self.assertEqual(self.db.query(User).filter(User.role == "student").count(), 0)


if __name__ == "__main__":
    unittest.main()
