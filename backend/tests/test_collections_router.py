import tempfile
import unittest
from base64 import b64decode
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.datastructures import Headers

from backend.app.database import Base, settings
from backend.app.models import Animation, AnimationCollection, Subject, User
from backend.app.routers.collections import (
    create_collection,
    delete_collection,
    get_collection,
    get_collections,
    update_collection,
    upload_collection_cover,
)
from backend.app.schemas import CollectionCreate, CollectionUpdate


class CollectionRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="edusimu-collections-")
        self.original_upload_dir = settings.upload_dir
        settings.upload_dir = str(Path(self.temp_dir.name) / "uploads")
        self.engine = create_engine(
            f"sqlite:///{Path(self.temp_dir.name) / 'test.db'}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)()
        self.admin = User(username="admin", password_hash="x", role="admin", is_active=True)
        self.student = User(username="student", password_hash="x", role="student", is_active=True)
        subject = Subject(name="physics", display_name="物理", sort_order=1)
        self.db.add_all([self.admin, self.student, subject])
        self.db.flush()
        self.first = self._add_animation(subject.id, "牛顿运动定律", published=True)
        self.second = self._add_animation(subject.id, "机械能守恒", published=True)
        self.hidden = self._add_animation(subject.id, "未发布课件", published=False)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        settings.upload_dir = self.original_upload_dir
        self.temp_dir.cleanup()

    def _add_animation(self, subject_id, title, published):
        animation = Animation(
            title=title,
            subject_id=subject_id,
            file_path=f"/tmp/{title}.html",
            source_type="original",
            created_by=self.admin.id,
            is_published=published,
            review_status="approved" if published else "pending_review",
            validation_status="passed" if published else "pending",
        )
        self.db.add(animation)
        self.db.flush()
        return animation

    async def _create(self, title, animation_ids, banner_order=0):
        return await create_collection(
            CollectionCreate(title=title, animation_ids=animation_ids, banner_order=banner_order),
            current_user=self.admin,
            db=self.db,
        )

    async def _enable_banner(self, collection_id, banner_order=0):
        cover = UploadFile(
            file=BytesIO(b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR/cAAAAASUVORK5CYII="
            )),
            filename="cover.png",
            headers=Headers({"content-type": "image/png"}),
        )
        await upload_collection_cover(collection_id, cover=cover, current_user=self.admin, db=self.db)
        return await update_collection(
            collection_id,
            CollectionUpdate(is_banner=True, banner_order=banner_order),
            current_user=self.admin,
            db=self.db,
        )

    def test_partial_update_rejects_explicit_null_for_required_fields(self):
        for field in ("title", "animation_ids", "is_banner", "banner_order"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                CollectionUpdate(**{field: None})
        self.assertEqual(CollectionUpdate(description=None).model_dump(exclude_unset=True), {"description": None})

    async def test_invalid_cover_keeps_the_previous_cover(self):
        created = await self._create("封面测试", [self.first.id])
        original = await self._enable_banner(created.id)
        cover = UploadFile(
            file=BytesIO(b"not a PNG"),
            filename="cover.png",
            headers=Headers({"content-type": "image/png"}),
        )
        with self.assertRaises(HTTPException) as error:
            await upload_collection_cover(created.id, cover, current_user=self.admin, db=self.db)
        self.assertEqual(error.exception.status_code, 400)
        detail = await get_collection(created.id, current_user=self.student, db=self.db)
        self.assertEqual(detail.cover_image, original.cover_image)

    async def test_collection_keeps_courseware_order_and_hides_unpublished_items(self):
        created = await self._create("力学合集", [self.second.id, self.first.id])
        self.assertEqual([item.id for item in created.animations], [self.second.id, self.first.id])

        self.second.is_published = False
        self.db.commit()
        detail = await get_collection(created.id, current_user=self.student, db=self.db)
        self.assertEqual([item.id for item in detail.animations], [self.first.id])
        self.assertEqual(detail.animation_count, 1)

    async def test_banner_requires_cover_and_uses_queue_order(self):
        with self.assertRaises(HTTPException) as missing_cover:
            await create_collection(
                CollectionCreate(title="无封面", animation_ids=[self.first.id], is_banner=True),
                current_user=self.admin,
                db=self.db,
            )
        self.assertEqual(missing_cover.exception.status_code, 400)

        later = await self._create("后展示", [self.first.id], banner_order=2)
        earlier = await self._create("先展示", [self.second.id], banner_order=1)
        await self._enable_banner(later.id, banner_order=2)
        await self._enable_banner(earlier.id, banner_order=1)

        banners = await get_collections(banner_only=True, current_user=self.student, db=self.db)
        self.assertEqual([item.title for item in banners], ["先展示", "后展示"])
        self.assertTrue(all(item.cover_image for item in banners))

    async def test_collection_rejects_unpublished_courseware(self):
        with self.assertRaises(HTTPException) as context:
            await self._create("错误合集", [self.first.id, self.hidden.id])
        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(self.db.query(AnimationCollection).count(), 0)

    async def test_collection_can_save_same_courseware_again_with_new_order(self):
        created = await self._create("力学合集", [self.first.id, self.second.id])
        saved = await update_collection(
            created.id,
            CollectionUpdate(animation_ids=[self.first.id, self.second.id]),
            current_user=self.admin,
            db=self.db,
        )
        self.assertEqual([item.id for item in saved.animations], [self.first.id, self.second.id])

        reordered = await update_collection(
            created.id,
            CollectionUpdate(animation_ids=[self.second.id, self.first.id]),
            current_user=self.admin,
            db=self.db,
        )
        self.assertEqual([item.id for item in reordered.animations], [self.second.id, self.first.id])

    async def test_deleting_collection_or_courseware_does_not_leave_stale_items(self):
        created = await self._create("临时合集", [self.first.id, self.second.id])
        self.db.delete(self.first)
        self.db.commit()
        detail = await get_collection(created.id, current_user=self.student, db=self.db)
        self.assertEqual([item.id for item in detail.animations], [self.second.id])

        await delete_collection(created.id, current_user=self.admin, db=self.db)
        self.assertIsNotNone(self.db.query(Animation).filter(Animation.id == self.second.id).first())
        remaining = await get_collections(banner_only=False, current_user=self.student, db=self.db)
        self.assertEqual(remaining, [])


if __name__ == "__main__":
    unittest.main()
