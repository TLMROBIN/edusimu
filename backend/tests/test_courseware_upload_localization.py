import asyncio
import io
import os
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base, settings
from backend.app.models import Animation, Subject, TextbookNode, User
from backend.app.routers.animations import create_animation, process_courseware_upload, replace_animation_file


class FakeHTTPResponse:
    def __init__(self, body: bytes, content_type: str):
        self._buffer = io.BytesIO(body)
        self.headers = {"Content-Type": content_type}

    def read(self, size: int = -1) -> bytes:
        return self._buffer.read(size)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def fake_urlopen_factory(mapping):
    def _fake_urlopen(request, timeout=8):
        url = request.full_url if hasattr(request, "full_url") else request
        if url not in mapping:
            raise AssertionError(f"unexpected url requested: {url}")
        body, content_type = mapping[url]
        return FakeHTTPResponse(body, content_type)

    return _fake_urlopen


class CoursewareUploadLocalizationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="edusimu-localization-")
        self.original_upload_dir = settings.upload_dir
        settings.upload_dir = self.temp_dir

        self.engine = create_engine(f"sqlite:///{Path(self.temp_dir) / 'test.db'}", connect_args={"check_same_thread": False})
        TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(self.engine)
        self.db = TestingSession()

        self.teacher = User(username="teacher", password_hash="x", role="teacher", real_name="Teacher")
        self.subject = Subject(name="physics", display_name="物理")
        self.db.add_all([self.teacher, self.subject])
        self.db.flush()

        self.textbook_node = TextbookNode(subject_id=self.subject.id, name="第一节", node_type="section", sort_order=1)
        self.db.add(self.textbook_node)
        self.db.commit()
        self.db.refresh(self.teacher)
        self.db.refresh(self.subject)
        self.db.refresh(self.textbook_node)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        settings.upload_dir = self.original_upload_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_process_courseware_upload_localizes_html_script_to_package_relative_path(self):
        html = b'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.example.com/three.min.js"></script>
</head>
<body style="touch-action: manipulation;">
  <button onclick="alert('ok')">Run</button>
</body>
</html>'''

        with patch("backend.app.routers.animations.urllib_request.urlopen", fake_urlopen_factory({
            "https://cdn.example.com/three.min.js": (b"console.log('three-local')", "application/javascript"),
        })):
            entry_path, saved_size, validation_status, summary, errors, warnings = process_courseware_upload(
                html,
                "lesson.html",
                self.subject.id,
            )

        self.assertEqual(validation_status, "passed")
        self.assertEqual(errors, [])
        self.assertTrue(saved_size > 0)
        localized_html = Path(entry_path).read_text(encoding="utf-8")
        self.assertIn('src="./_localized/three.min.js"', localized_html)
        self.assertTrue(Path(entry_path).parent.joinpath("_localized", "three.min.js").exists())
        self.assertIn("系统已自动本地化 1 个外链静态资源。", warnings)
        self.assertTrue(summary.startswith("校验通过"))

    def test_process_courseware_upload_localizes_all_html_and_css_in_zip_workspace(self):
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as archive:
            archive.writestr(
                "index.html",
                """<!DOCTYPE html><html><head>
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<link rel=\"stylesheet\" href=\"styles/app.css\" />
<script src=\"https://cdn.example.com/three.min.js\"></script>
</head><body style=\"touch-action: manipulation;\"><button onclick=\"void 0\">ok</button></body></html>""",
            )
            archive.writestr(
                "pages/extra.html",
                """<!DOCTYPE html><html><head>
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<script src=\"https://cdn.example.com/helper.js\"></script>
</head><body style=\"touch-action: manipulation;\"><button onclick=\"void 0\">extra</button></body></html>""",
            )
            archive.writestr(
                "styles/app.css",
                "body { background-image: url('https://cdn.example.com/bg.png'); }",
            )

        with patch("backend.app.routers.animations.urllib_request.urlopen", fake_urlopen_factory({
            "https://cdn.example.com/three.min.js": (b"console.log('three-local')", "application/javascript"),
            "https://cdn.example.com/helper.js": (b"console.log('helper-local')", "application/javascript"),
            "https://cdn.example.com/bg.png": (b"png-data", "image/png"),
        })):
            entry_path, _, validation_status, _, errors, warnings = process_courseware_upload(
                zip_buffer.getvalue(),
                "bundle.zip",
                self.subject.id,
            )

        self.assertEqual(validation_status, "passed")
        self.assertEqual(errors, [])
        package_dir = Path(entry_path).parent
        extra_html = package_dir / "pages" / "extra.html"
        css_path = package_dir / "styles" / "app.css"
        self.assertIn('src="./_localized/three.min.js"', Path(entry_path).read_text(encoding="utf-8"))
        self.assertIn('src="../_localized/helper.js"', extra_html.read_text(encoding="utf-8"))
        self.assertIn("../_localized/bg.png", css_path.read_text(encoding="utf-8"))
        self.assertTrue(package_dir.joinpath("_localized", "three.min.js").exists())
        self.assertTrue(package_dir.joinpath("_localized", "helper.js").exists())
        self.assertTrue(package_dir.joinpath("_localized", "bg.png").exists())
        self.assertTrue(any("已自动本地化资源" in item for item in warnings))

    def test_create_animation_blocks_unlocalizable_upload_without_db_insert(self):
        html = b'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="touch-action: manipulation;">
<script>fetch("https://api.example.com/data")</script>
<button onclick="void 0">Run</button>
</body>
</html>'''

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(create_animation(
                title="bad lesson",
                subject_id=self.subject.id,
                textbook_node_id=self.textbook_node.id,
                description=None,
                grade_level=None,
                keywords=None,
                source_type=None,
                is_published=False,
                force_publish=False,
                file=UploadFile(filename="bad.html", file=io.BytesIO(html)),
                thumbnail=None,
                current_user=self.teacher,
                db=self.db,
            ))

        self.assertEqual(ctx.exception.status_code, 400)
        payload = ctx.exception.detail
        self.assertIsInstance(payload, dict)
        self.assertIn("validation_errors", payload)
        self.assertTrue(any("外部网络请求" in item for item in payload["validation_errors"]))
        self.assertEqual(self.db.query(Animation).count(), 0)
        self.assertEqual(list(Path(self.temp_dir).glob("**/pkg_*")), [])

    def test_replace_animation_file_keeps_existing_courseware_when_new_upload_fails(self):
        package_dir = Path(self.temp_dir) / str(self.subject.id) / "pkg_existing"
        package_dir.mkdir(parents=True, exist_ok=True)
        existing_entry = package_dir / "index.html"
        existing_entry.write_text("<html><body>existing</body></html>", encoding="utf-8")

        animation = Animation(
            title="existing",
            subject_id=self.subject.id,
            textbook_node_id=self.textbook_node.id,
            description=None,
            author="Teacher",
            file_path=str(existing_entry),
            thumbnail=None,
            grade_level=None,
            keywords=None,
            source_type="original",
            is_published=False,
            review_status="pending_review",
            validation_status="passed",
            validation_summary="ok",
            validation_errors="[]",
            validation_warnings="[]",
            file_size=existing_entry.stat().st_size,
            created_by=self.teacher.id,
        )
        self.db.add(animation)
        self.db.commit()
        self.db.refresh(animation)

        bad_html = b'''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="touch-action: manipulation;">
<iframe src="https://remote.example.com/embed"></iframe>
<button onclick="void 0">Run</button>
</body>
</html>'''

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(replace_animation_file(
                animation_id=animation.id,
                file=UploadFile(filename="bad.html", file=io.BytesIO(bad_html)),
                thumbnail=None,
                title=None,
                subject_id=None,
                textbook_node_id=None,
                description=None,
                grade_level=None,
                keywords=None,
                source_type=None,
                is_published=False,
                current_user=self.teacher,
                db=self.db,
            ))

        self.assertEqual(ctx.exception.status_code, 400)
        self.db.refresh(animation)
        self.assertEqual(animation.file_path, str(existing_entry))
        self.assertTrue(existing_entry.exists())
        self.assertEqual(list(Path(self.temp_dir).glob("**/pkg_*")), [package_dir])


if __name__ == "__main__":
    unittest.main()
