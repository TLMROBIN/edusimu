from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..auth import get_current_active_user
from ..database import get_db
from ..models import Animation, Favorite, Rating, User
from ..schemas import FavoriteResponse, RatingBase, RatingResponse

router = APIRouter(tags=["收藏与评分"])

@router.get("/api/favorites/", response_model=List[FavoriteResponse])
async def get_favorites(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    favorites = db.query(Favorite).filter(Favorite.user_id == current_user.id).all()
    return favorites

@router.post("/api/favorites/{animation_id}")
async def add_favorite(
    animation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")
    
    existing = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.animation_id == animation_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="已收藏此动画")
    
    favorite = Favorite(
        user_id=current_user.id,
        animation_id=animation_id
    )
    
    db.add(favorite)
    db.commit()
    
    return {"message": "收藏成功"}

@router.delete("/api/favorites/{animation_id}")
async def remove_favorite(
    animation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.animation_id == animation_id
    ).first()
    
    if not favorite:
        raise HTTPException(status_code=404, detail="未收藏此动画")
    
    db.delete(favorite)
    db.commit()
    
    return {"message": "已取消收藏"}

@router.post("/api/ratings/{animation_id}", response_model=RatingResponse)
async def create_rating(
    animation_id: int,
    rating_data: RatingBase,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")
    
    existing = db.query(Rating).filter(
        Rating.user_id == current_user.id,
        Rating.animation_id == animation_id
    ).first()
    
    if existing:
        existing.score = rating_data.score
        existing.comment = rating_data.comment
        db.commit()
        db.refresh(existing)
        return existing
    
    rating = Rating(
        user_id=current_user.id,
        animation_id=animation_id,
        score=rating_data.score,
        comment=rating_data.comment
    )
    
    db.add(rating)
    db.commit()
    db.refresh(rating)
    
    return rating

@router.get("/api/ratings/{animation_id}")
async def get_ratings(
    animation_id: int,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    ratings = db.query(Rating).filter(
        Rating.animation_id == animation_id
    ).offset(skip).limit(limit).all()
    
    avg_score = db.query(func.avg(Rating.score)).filter(
        Rating.animation_id == animation_id
    ).scalar()
    
    total_count = db.query(func.count(Rating.id)).filter(
        Rating.animation_id == animation_id
    ).scalar()
    
    return {
        "ratings": ratings,
        "avg_score": round(avg_score, 2) if avg_score else None,
        "total_count": total_count
    }
