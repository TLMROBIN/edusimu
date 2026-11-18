import asyncio
import io
import shutil
import tempfile
import unittest
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base, settings
from backend.app.models import Subject, TextbookNode, User
from backend.app.routers.animations import (
    create_animation,
    evaluate_tablet_performance,
    get_animations,
    update_animation,
)
from backend.app.schemas import AnimationUpdate


class TabletPerformanceTagTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="edusimu-lag-")
        self.original_upload_dir = settings.upload_dir
        settings.upload_dir = self.temp_dir

        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_dir) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(self.engine)
        self.db = TestingSession()

        self.admin = User(username="admin", password_hash="x", role="admin", real_name="Admin")
        self.subject = Subject(name="physics", display_name="物理")
        self.db.add_all([self.admin, self.subject])
        self.db.flush()

        self.node = TextbookNode(subject_id=self.subject.id, name="第一节", node_type="section", sort_order=1)
        self.db.add(self.node)
        self.db.commit()
        self.db.refresh(self.admin)
        self.db.refresh(self.subject)
        self.db.refresh(self.node)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        settings.upload_dir = self.original_upload_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_evaluate_tablet_performance_flags_heavy_and_skips_light(self):
        light_html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button onclick="go()">Go</button></body></html>'
        may_lag, reason = evaluate_tablet_performance(32 * 1024, [light_html], source_type="original")
        self.assertFalse(may_lag)
        self.assertIsNone(reason)

        heavy_3d = '<!doctype html><html><script src="./three.module.js"></script><style>.x{backdrop-filter:blur(8px);}</style><script>renderer.shadowMap.enabled=true;</script></html>'
        may_lag, reason = evaluate_tablet_performance(int(1.4 * 1024 * 1024), [heavy_3d], source_type="original")
        self.assertTrue(may_lag)
        self.assertIn("3D/WebGL渲染", reason)

        large_phet = '<!doctype html><html><body>phet webglrenderer stub</body></html>'
        may_lag, reason = evaluate_tablet_performance(int(4.5 * 1024 * 1024), [large_phet], source_type="phet")
        self.assertTrue(may_lag)
        self.assertIn("体积较大", reason)

        small_phet = '<!doctype html><html><body>phet webglrenderer stub</body></html>'
        may_lag, reason = evaluate_tablet_performance(int(1.8 * 1024 * 1024), [small_phet], source_type="phet")
        self.assertFalse(may_lag)
        self.assertIsNone(reason)

    def test_upload_sets_and_update_toggles_may_lag(self):
        heavy_html = (
            '<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<style>@media (max-width:900px){body{font-size:14px}}.card{backdrop-filter:blur(8px);}</style></head>'
            '<body style="touch-action:none;"><button onclick="go()">Run</button>'
            '<script>const s = "new THREE.WebGLRenderer"; renderer.shadowMap.enabled = true;</script>'
            + ('<!-- pad -->' * 120000)
            + '</body></html>'
        ).encode("utf-8")

        upload = UploadFile(filename="heavy.html", file=io.BytesIO(heavy_html))
        created = asyncio.run(create_animation(
            title="重型3D实验",
            subject_id=self.subject.id,
            textbook_node_id=self.node.id,
            description="测试",
            grade_level="高一",
            keywords="3D",
            source_type="original",
            is_published=True,
            force_publish=False,
            file=upload,
            thumbnail=None,
            current_user=self.admin,
            db=self.db,
        ))
        self.assertTrue(created.may_lag)
        self.assertIsNotNone(created.lag_reason)

        lag_only = asyncio.run(get_animations(may_lag=True, current_user=self.admin, db=self.db))
        self.assertEqual([item.id for item in lag_only], [created.id])

        updated = asyncio.run(update_animation(
            animation_id=created.id,
            animation_data=AnimationUpdate(may_lag=False),
            current_user=self.admin,
            db=self.db,
        ))
        self.assertFalse(updated.may_lag)
        self.assertIsNone(updated.lag_reason)


if __name__ == "__main__":
    unittest.main()
