from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..auth import require_role
from ..database import get_db
from ..models import Animation, User, ViewHistory

router = APIRouter(prefix="/api/admin", tags=["管理后台"])

@router.get("/pending-animations")
async def get_pending_animations(
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    animations = db.query(Animation).filter(Animation.review_status != "approved").all()
    return animations

@router.post("/approve/{animation_id}")
async def approve_animation(
    animation_id: int,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")

    if animation.validation_status != "passed":
        raise HTTPException(status_code=400, detail="课件校验未通过，不能发布")

    animation.is_published = True
    animation.review_status = "approved"
    db.commit()
    
    return {"message": "动画已发布"}

@router.get("/logs")
async def get_system_logs(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    recent_views = db.query(ViewHistory).order_by(
        ViewHistory.viewed_at.desc()
    ).offset(skip).limit(limit).all()
    
    logs = []
    for view in recent_views:
        user = db.query(User).filter(User.id == view.user_id).first()
        animation = db.query(Animation).filter(Animation.id == view.animation_id).first()
        
        logs.append({
            "id": view.id,
            "user": {
                "id": user.id,
                "username": user.username,
                "real_name": user.real_name
            } if user else None,
            "animation": {
                "id": animation.id,
                "title": animation.title
            } if animation else None,
            "view_duration": view.view_duration,
            "interaction_count": view.interaction_count,
            "viewed_at": view.viewed_at.isoformat()
        })
    
    return logs

@router.get("/users-summary")
async def get_users_summary(
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    students_by_class = db.query(
        User.class_name,
        func.count(User.id).label('count')
    ).filter(
        User.role == "student",
        User.class_name.isnot(None)
    ).group_by(User.class_name).all()
    
    recent_users = db.query(User).order_by(User.created_at.desc()).limit(10).all()
    
    return {
        "students_by_class": [
            {"class_name": cls, "count": count}
            for cls, count in students_by_class
        ],
        "recent_users": recent_users
    }
