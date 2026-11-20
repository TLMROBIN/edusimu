import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, selectinload

from ..auth import get_current_active_user, require_role
from ..database import get_db, settings
from ..models import Animation, AnimationCollection, CollectionItem, User
from ..schemas import CollectionCreate, CollectionDetail, CollectionSummary, CollectionUpdate
from .animations import serialize_animation

router = APIRouter(prefix="/api/collections", tags=["动画合集"])

MAX_COVER_SIZE = 5 * 1024 * 1024
COVER_SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": (b"RIFF",),
}


def collection_query(db: Session):
    return db.query(AnimationCollection).options(
        selectinload(AnimationCollection.items).selectinload(CollectionItem.animation)
    )


def get_collection_or_404(db: Session, collection_id: int, *, for_update=False) -> AnimationCollection:
    query = collection_query(db).filter(AnimationCollection.id == collection_id)
    if for_update:
        query = query.with_for_update()
    collection = query.first()
    if not collection:
        raise HTTPException(status_code=404, detail="合集不存在")
    return collection


def published_items(collection: AnimationCollection):
    return [
        item for item in collection.items
        if item.animation is not None and item.animation.is_published
    ]


def serialize_collection_summary(collection: AnimationCollection) -> CollectionSummary:
    return CollectionSummary(
        id=collection.id,
        title=collection.title,
        description=collection.description,
        cover_image=collection.cover_image,
        is_banner=bool(collection.is_banner),
        banner_order=collection.banner_order,
        animation_count=len(published_items(collection)),
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


def serialize_collection_detail(collection: AnimationCollection, db: Session) -> CollectionDetail:
    summary = serialize_collection_summary(collection)
    return CollectionDetail(
        **summary.model_dump(),
        animations=[serialize_animation(item.animation, db) for item in published_items(collection)],
    )


def load_published_animations(db: Session, animation_ids: List[int]) -> List[Animation]:
    if not animation_ids:
        return []
    animations = db.query(Animation).filter(
        Animation.id.in_(animation_ids),
        Animation.is_published.is_(True),
    ).all()
    if len(animations) != len(animation_ids):
        raise HTTPException(status_code=400, detail="合集只能添加已发布课件，请刷新课件列表后重试")
    animations_by_id = {animation.id: animation for animation in animations}
    return [animations_by_id[animation_id] for animation_id in animation_ids]


def remove_cover_file(cover_image: Optional[str]) -> None:
    if not cover_image or not cover_image.startswith("/uploads/collections/"):
        return
    filename = os.path.basename(cover_image)
    cover_path = Path(settings.upload_dir) / "collections" / filename
    try:
        cover_path.unlink(missing_ok=True)
    except OSError:
        pass


@router.get("/", response_model=List[CollectionSummary])
async def get_collections(
    banner_only: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = collection_query(db)
    if banner_only:
        query = query.filter(
            AnimationCollection.is_banner.is_(True),
            AnimationCollection.cover_image.is_not(None),
            AnimationCollection.cover_image != "",
        ).order_by(AnimationCollection.banner_order, AnimationCollection.id)
    else:
        query = query.order_by(AnimationCollection.created_at.desc(), AnimationCollection.id.desc())
    collections = query.all()
    summaries = [serialize_collection_summary(collection) for collection in collections]
    if banner_only:
        summaries = [summary for summary in summaries if summary.animation_count > 0]
    return summaries


@router.get("/{collection_id}", response_model=CollectionDetail)
async def get_collection(
    collection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    collection = get_collection_or_404(db, collection_id)
    return serialize_collection_detail(collection, db)


@router.post("/", response_model=CollectionDetail, status_code=status.HTTP_201_CREATED)
async def create_collection(
    payload: CollectionCreate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    animations = load_published_animations(db, payload.animation_ids)
    if payload.is_banner:
        raise HTTPException(status_code=400, detail="请先创建合集并上传封面，再开启首页 Banner")
    collection = AnimationCollection(
        title=payload.title,
        description=payload.description,
        is_banner=False,
        banner_order=payload.banner_order,
    )
    collection.items = []
    db.add(collection)
    db.flush()
    for sort_order, animation in enumerate(animations):
        collection.items.append(CollectionItem(animation=animation, sort_order=sort_order))
    db.commit()
    db.refresh(collection)
    return serialize_collection_detail(get_collection_or_404(db, collection.id), db)


@router.put("/{collection_id}", response_model=CollectionDetail)
async def update_collection(
    collection_id: int,
    payload: CollectionUpdate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    collection = get_collection_or_404(db, collection_id, for_update=True)
    update_data = payload.model_dump(exclude_unset=True)

    if "animation_ids" in update_data:
        animations = load_published_animations(db, update_data.pop("animation_ids"))
        collection.items.clear()
        db.flush()
        collection.items = [
            CollectionItem(animation=animation, sort_order=sort_order)
            for sort_order, animation in enumerate(animations)
        ]

    for field, value in update_data.items():
        setattr(collection, field, value)

    if collection.is_banner:
        if not collection.cover_image:
            raise HTTPException(status_code=400, detail="开启首页 Banner 前请先上传合集封面")
        if not published_items(collection):
            raise HTTPException(status_code=400, detail="首页 Banner 至少需要一个已发布课件")

    db.commit()
    return serialize_collection_detail(get_collection_or_404(db, collection.id), db)


@router.post("/{collection_id}/cover", response_model=CollectionDetail)
async def upload_collection_cover(
    collection_id: int,
    cover: UploadFile = File(...),
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    extension = os.path.splitext(cover.filename or "")[1].lower()
    if extension not in COVER_SIGNATURES or not (cover.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="封面只支持 JPG、PNG、GIF 或 WebP 图片")

    content = await cover.read(MAX_COVER_SIZE + 1)
    if len(content) > MAX_COVER_SIZE:
        raise HTTPException(status_code=400, detail="封面图片不能超过 5MB")
    if not content:
        raise HTTPException(status_code=400, detail="封面图片不能为空")
    if not content.startswith(COVER_SIGNATURES[extension]) or (
        extension == ".webp" and content[8:12] != b"WEBP"
    ):
        raise HTTPException(status_code=400, detail="封面内容与图片格式不符")

    collection = get_collection_or_404(db, collection_id, for_update=True)
    cover_dir = Path(settings.upload_dir) / "collections"
    cover_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    cover_path = cover_dir / filename
    old_cover = collection.cover_image
    try:
        cover_path.write_bytes(content)
        collection.cover_image = f"/uploads/collections/{filename}"
        db.commit()
    except Exception:
        db.rollback()
        remove_cover_file(f"/uploads/collections/{filename}")
        raise
    if old_cover != collection.cover_image:
        remove_cover_file(old_cover)
    return serialize_collection_detail(get_collection_or_404(db, collection.id), db)


@router.delete("/{collection_id}")
async def delete_collection(
    collection_id: int,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db),
):
    collection = get_collection_or_404(db, collection_id, for_update=True)
    cover_image = collection.cover_image
    db.delete(collection)
    db.commit()
    remove_cover_file(cover_image)
    return {"message": "合集已删除，收录的课件不受影响"}
