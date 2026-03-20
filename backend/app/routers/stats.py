from datetime import date, datetime, time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from ..database import get_db
from ..models import User, Animation, Subject, Rating, ViewHistory, AnimationInteraction, Favorite, TextbookNode
from ..schemas import StatsOverview, StatsAnimation, StatsUser
from ..auth import require_role

router = APIRouter(prefix="/api/stats", tags=["学习统计"])


def build_textbook_path(node: Optional[TextbookNode]) -> Optional[str]:
    if not node:
        return None
    parts = []
    current = node
    while current:
        parts.append(current.name)
        current = current.parent
    return " / ".join(reversed(parts))


def apply_animation_scope(query, current_user: User):
    if current_user.role == "teacher":
        query = query.filter(Animation.created_by == current_user.id)
    return query


def get_scoped_animation_ids(db: Session, current_user: User, subject_id: Optional[int] = None):
    query = db.query(Animation.id).filter(Animation.is_published == True)
    query = apply_animation_scope(query, current_user)
    if subject_id:
        query = query.filter(Animation.subject_id == subject_id)
    return query.subquery()


def build_datetime_range(date_from: Optional[date], date_to: Optional[date]):
    start_dt = datetime.combine(date_from, time.min) if date_from else None
    end_dt = datetime.combine(date_to, time.max) if date_to else None
    return start_dt, end_dt

@router.get("/overview", response_model=StatsOverview)
async def get_stats_overview(
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    total_users = db.query(func.count(User.id)).scalar()
    total_students = db.query(func.count(User.id)).filter(User.role == "student").scalar()
    total_teachers = db.query(func.count(User.id)).filter(User.role == "teacher").scalar()
    animation_query = db.query(Animation).filter(Animation.is_published == True)
    animation_query = apply_animation_scope(animation_query, current_user)
    animation_ids_query = animation_query.with_entities(Animation.id)
    start_dt, end_dt = build_datetime_range(date_from, date_to)

    total_animations = animation_query.count()
    view_query = db.query(func.count(ViewHistory.id)).filter(
        ViewHistory.animation_id.in_(animation_ids_query)
    )
    if start_dt:
        view_query = view_query.filter(ViewHistory.viewed_at >= start_dt)
    if end_dt:
        view_query = view_query.filter(ViewHistory.viewed_at <= end_dt)
    total_views = view_query.scalar() or 0

    favorite_query = db.query(func.count(Favorite.id)).filter(
        Favorite.animation_id.in_(animation_ids_query)
    )
    if start_dt:
        favorite_query = favorite_query.filter(Favorite.created_at >= start_dt)
    if end_dt:
        favorite_query = favorite_query.filter(Favorite.created_at <= end_dt)
    total_favorites = favorite_query.scalar() or 0

    rating_query = db.query(func.count(Rating.id)).filter(
        Rating.animation_id.in_(animation_ids_query)
    )
    if start_dt:
        rating_query = rating_query.filter(Rating.created_at >= start_dt)
    if end_dt:
        rating_query = rating_query.filter(Rating.created_at <= end_dt)
    total_ratings = rating_query.scalar() or 0
    
    return StatsOverview(
        total_users=total_users,
        total_students=total_students,
        total_teachers=total_teachers,
        total_animations=total_animations,
        total_views=total_views,
        total_favorites=total_favorites,
        total_ratings=total_ratings
    )

@router.get("/animations/{animation_id}", response_model=StatsAnimation)
async def get_animation_stats(
    animation_id: int,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")
    if current_user.role == "teacher" and animation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此动画统计")
    
    avg_rating = db.query(func.avg(Rating.score)).filter(
        Rating.animation_id == animation_id
    ).scalar()
    
    rating_count = db.query(func.count(Rating.id)).filter(
        Rating.animation_id == animation_id
    ).scalar()
    
    favorite_count = db.query(func.count(Favorite.id)).filter(
        Favorite.animation_id == animation_id
    ).scalar()
    
    return StatsAnimation(
        animation_id=animation_id,
        title=animation.title,
        view_count=animation.view_count,
        avg_rating=round(avg_rating, 2) if avg_rating else None,
        rating_count=rating_count,
        favorite_count=favorite_count
    )

@router.get("/users/{user_id}", response_model=StatsUser)
async def get_user_stats(
    user_id: int,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if current_user.role == "teacher":
        has_access = db.query(ViewHistory.id).join(
            Animation, Animation.id == ViewHistory.animation_id
        ).filter(
            ViewHistory.user_id == user_id,
            Animation.created_by == current_user.id,
            Animation.is_published == True,
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="无权查看此用户统计")
    
    view_stats = db.query(
        func.count(ViewHistory.id).label('total_views'),
        func.sum(ViewHistory.view_duration).label('total_duration'),
        func.sum(ViewHistory.interaction_count).label('total_interactions')
    ).join(
        Animation, Animation.id == ViewHistory.animation_id
    ).filter(
        ViewHistory.user_id == user_id,
        Animation.is_published == True
    )
    view_stats = apply_animation_scope(view_stats, current_user).first()
    
    favorite_count = db.query(func.count(Favorite.id)).filter(
        Favorite.user_id == user_id
    ).join(
        Animation, Animation.id == Favorite.animation_id
    ).filter(
        Animation.is_published == True
    )
    favorite_count = apply_animation_scope(favorite_count, current_user).scalar()
    
    return StatsUser(
        user_id=user_id,
        username=user.username,
        real_name=user.real_name,
        class_name=user.class_name,
        total_views=view_stats.total_views or 0,
        total_duration=view_stats.total_duration or 0,
        total_interactions=view_stats.total_interactions or 0,
        total_favorites=favorite_count
    )


@router.get("/textbook-performance")
async def get_textbook_performance(
    subject_id: Optional[int] = Query(None, description="学科ID筛选"),
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    scoped_animation_ids = get_scoped_animation_ids(db, current_user, subject_id)
    start_dt, end_dt = build_datetime_range(date_from, date_to)

    animation_counts = db.query(
        Animation.textbook_node_id.label("node_id"),
        func.count(Animation.id).label("animation_count"),
    ).filter(
        Animation.is_published == True,
        Animation.textbook_node_id.is_not(None),
        Animation.id.in_(scoped_animation_ids),
    ).group_by(Animation.textbook_node_id).subquery()

    view_stats = db.query(
        Animation.textbook_node_id.label("node_id"),
        func.count(ViewHistory.id).label("total_views"),
        func.count(func.distinct(ViewHistory.user_id)).label("unique_students"),
        func.avg(ViewHistory.view_duration).label("avg_duration"),
        func.avg(ViewHistory.interaction_count).label("avg_interactions"),
    ).join(
        ViewHistory, ViewHistory.animation_id == Animation.id
    ).filter(
        Animation.is_published == True,
        Animation.textbook_node_id.is_not(None),
        Animation.id.in_(scoped_animation_ids),
    )
    if start_dt:
        view_stats = view_stats.filter(ViewHistory.viewed_at >= start_dt)
    if end_dt:
        view_stats = view_stats.filter(ViewHistory.viewed_at <= end_dt)
    view_stats = view_stats.group_by(Animation.textbook_node_id).subquery()

    rating_stats = db.query(
        Animation.textbook_node_id.label("node_id"),
        func.avg(Rating.score).label("avg_rating"),
    ).join(
        Rating, Rating.animation_id == Animation.id
    ).filter(
        Animation.is_published == True,
        Animation.textbook_node_id.is_not(None),
        Animation.id.in_(scoped_animation_ids),
    )
    if start_dt:
        rating_stats = rating_stats.filter(Rating.created_at >= start_dt)
    if end_dt:
        rating_stats = rating_stats.filter(Rating.created_at <= end_dt)
    rating_stats = rating_stats.group_by(Animation.textbook_node_id).subquery()

    rows = db.query(
        TextbookNode.id.label("node_id"),
        func.coalesce(animation_counts.c.animation_count, 0).label("animation_count"),
        func.coalesce(view_stats.c.total_views, 0).label("total_views"),
        func.coalesce(view_stats.c.unique_students, 0).label("unique_students"),
        view_stats.c.avg_duration.label("avg_duration"),
        view_stats.c.avg_interactions.label("avg_interactions"),
        rating_stats.c.avg_rating.label("avg_rating"),
    ).join(
        animation_counts, animation_counts.c.node_id == TextbookNode.id
    ).outerjoin(
        view_stats, view_stats.c.node_id == TextbookNode.id
    ).outerjoin(
        rating_stats, rating_stats.c.node_id == TextbookNode.id
    )

    if subject_id:
        rows = rows.filter(TextbookNode.subject_id == subject_id)

    rows = rows.order_by(
        desc(func.coalesce(view_stats.c.total_views, 0)),
        desc(func.coalesce(view_stats.c.unique_students, 0))
    ).limit(limit).all()

    results = []
    for row in rows:
        node = db.query(TextbookNode).filter(TextbookNode.id == row.node_id).first()
        results.append({
            "textbook_node_id": row.node_id,
            "textbook_path": build_textbook_path(node),
            "animation_count": row.animation_count or 0,
            "total_views": row.total_views or 0,
            "unique_students": row.unique_students or 0,
            "avg_duration": round(row.avg_duration or 0),
            "avg_interactions": round(row.avg_interactions or 0, 2),
            "avg_rating": round(row.avg_rating, 2) if row.avg_rating else None,
        })
    return results


@router.get("/courseware-effect")
async def get_courseware_effect(
    subject_id: Optional[int] = Query(None, description="学科ID筛选"),
    textbook_node_id: Optional[int] = Query(None, description="教材章节ID筛选"),
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = build_datetime_range(date_from, date_to)

    query = db.query(
        Animation.id.label("animation_id"),
        Animation.title,
        func.count(ViewHistory.id).label("total_views"),
        func.count(func.distinct(ViewHistory.user_id)).label("unique_students"),
        func.avg(ViewHistory.view_duration).label("avg_duration"),
        func.avg(ViewHistory.interaction_count).label("avg_interactions"),
    ).outerjoin(
        ViewHistory, ViewHistory.animation_id == Animation.id
    ).filter(
        Animation.is_published == True
    )

    query = apply_animation_scope(query, current_user)
    if subject_id:
        query = query.filter(Animation.subject_id == subject_id)
    if textbook_node_id:
        query = query.filter(Animation.textbook_node_id == textbook_node_id)
    if start_dt:
        query = query.filter(ViewHistory.viewed_at >= start_dt)
    if end_dt:
        query = query.filter(ViewHistory.viewed_at <= end_dt)

    view_rows = query.group_by(Animation.id).order_by(
        desc(func.count(ViewHistory.id)),
        desc(func.avg(ViewHistory.view_duration))
    ).limit(limit).all()

    animation_ids = [row.animation_id for row in view_rows]
    favorite_query = db.query(
        Favorite.animation_id.label("animation_id"),
        func.count(Favorite.id).label("favorite_count"),
    ).filter(
        Favorite.animation_id.in_(animation_ids)
    )
    if start_dt:
        favorite_query = favorite_query.filter(Favorite.created_at >= start_dt)
    if end_dt:
        favorite_query = favorite_query.filter(Favorite.created_at <= end_dt)
    favorite_counts = {
        row.animation_id: row.favorite_count
        for row in favorite_query.group_by(Favorite.animation_id).all()
    } if animation_ids else {}

    rating_query = db.query(
        Rating.animation_id.label("animation_id"),
        func.avg(Rating.score).label("avg_rating"),
    ).filter(
        Rating.animation_id.in_(animation_ids)
    )
    if start_dt:
        rating_query = rating_query.filter(Rating.created_at >= start_dt)
    if end_dt:
        rating_query = rating_query.filter(Rating.created_at <= end_dt)
    rating_avgs = {
        row.animation_id: row.avg_rating
        for row in rating_query.group_by(Rating.animation_id).all()
    } if animation_ids else {}

    results = []
    for row in view_rows:
        animation = db.query(Animation).filter(Animation.id == row.animation_id).first()
        unique_students = row.unique_students or 0
        favorite_count = favorite_counts.get(row.animation_id, 0) or 0
        avg_rating = rating_avgs.get(row.animation_id)
        results.append({
            "animation_id": row.animation_id,
            "title": row.title,
            "textbook_path": build_textbook_path(animation.textbook_node if animation else None),
            "total_views": row.total_views or 0,
            "unique_students": unique_students,
            "avg_duration": round(row.avg_duration or 0),
            "avg_interactions": round(row.avg_interactions or 0, 2),
            "favorite_count": favorite_count,
            "favorite_rate": round((favorite_count / unique_students) * 100, 2) if unique_students else 0,
            "avg_rating": round(avg_rating, 2) if avg_rating else None,
        })
    return results

@router.get("/classes/{class_name}")
async def get_class_stats(
    class_name: str,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    users = db.query(User).filter(User.class_name == class_name, User.role == "student").all()
    
    if not users:
        raise HTTPException(status_code=404, detail="班级不存在")
    
    user_ids = [user.id for user in users]
    
    scoped_animation_ids = get_scoped_animation_ids(db, current_user)
    total_views = db.query(func.count(ViewHistory.id)).join(
        Animation, Animation.id == ViewHistory.animation_id
    ).filter(
        ViewHistory.user_id.in_(user_ids),
        Animation.id.in_(scoped_animation_ids)
    ).scalar()
    
    total_duration = db.query(func.sum(ViewHistory.view_duration)).join(
        Animation, Animation.id == ViewHistory.animation_id
    ).filter(
        ViewHistory.user_id.in_(user_ids),
        Animation.id.in_(scoped_animation_ids)
    ).scalar() or 0
    
    total_interactions = db.query(func.sum(ViewHistory.interaction_count)).join(
        Animation, Animation.id == ViewHistory.animation_id
    ).filter(
        ViewHistory.user_id.in_(user_ids),
        Animation.id.in_(scoped_animation_ids)
    ).scalar() or 0
    
    most_viewed = db.query(
        Animation.id,
        Animation.title,
        func.count(ViewHistory.id).label('view_count')
    ).join(ViewHistory).filter(
        ViewHistory.user_id.in_(user_ids),
        Animation.id.in_(scoped_animation_ids)
    ).group_by(Animation.id).order_by(func.count(ViewHistory.id).desc()).limit(10).all()
    
    return {
        "class_name": class_name,
        "total_students": len(users),
        "total_views": total_views,
        "total_duration": total_duration,
        "total_interactions": total_interactions,
        "most_viewed_animations": [
            {"id": anim.id, "title": anim.title, "view_count": anim.view_count}
            for anim in most_viewed
        ]
    }

@router.get("/subject-heat")
async def get_subject_heat(
    subject_id: Optional[int] = Query(None, description="学科ID筛选"),
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = build_datetime_range(date_from, date_to)
    query = db.query(
        Subject.id.label('subject_id'),
        Subject.display_name.label('subject_name'),
        func.count(ViewHistory.id).label('view_count')
    ).join(
        Animation, Animation.subject_id == Subject.id
    ).outerjoin(
        ViewHistory, ViewHistory.animation_id == Animation.id
    )

    query = query.filter(Animation.is_published == True)
    query = apply_animation_scope(query, current_user)
    if start_dt:
        query = query.filter(ViewHistory.viewed_at >= start_dt)
    if end_dt:
        query = query.filter(ViewHistory.viewed_at <= end_dt)
    
    if subject_id:
        query = query.filter(Subject.id == subject_id)
    
    result = query.group_by(Subject.id, Subject.display_name).order_by(
        desc('view_count')
    ).all()
    
    return [
        {
            "subject_id": r.subject_id,
            "subject_name": r.subject_name,
            "view_count": r.view_count or 0
        }
        for r in result
    ]

@router.get("/top-favorites")
async def get_top_favorites(
    subject_id: Optional[int] = Query(None, description="学科ID筛选"),
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = build_datetime_range(date_from, date_to)

    query = db.query(
        Animation.id,
        Animation.title,
        Animation.subject_id,
        Subject.display_name.label('subject_name'),
        func.count(Favorite.id).label('favorite_count')
    ).join(
        Favorite, Favorite.animation_id == Animation.id
    ).join(
        Subject, Subject.id == Animation.subject_id
    )

    query = query.filter(Animation.is_published == True)
    query = apply_animation_scope(query, current_user)
    if start_dt:
        query = query.filter(Favorite.created_at >= start_dt)
    if end_dt:
        query = query.filter(Favorite.created_at <= end_dt)
    
    if subject_id:
        query = query.filter(Animation.subject_id == subject_id)
    
    result = query.group_by(
        Animation.id, Animation.title, Animation.subject_id, Subject.display_name
    ).order_by(
        desc('favorite_count')
    ).limit(limit).all()
    
    return [
        {
            "animation_id": r.id,
            "title": r.title,
            "subject_id": r.subject_id,
            "subject_name": r.subject_name,
            "favorite_count": r.favorite_count
        }
        for r in result
    ]

@router.get("/top-views")
async def get_top_views(
    subject_id: Optional[int] = Query(None, description="学科ID筛选"),
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = build_datetime_range(date_from, date_to)

    if start_dt or end_dt:
        query = db.query(
            Animation.id,
            Animation.title,
            Animation.subject_id,
            Subject.display_name.label('subject_name'),
            func.count(ViewHistory.id).label('view_count')
        ).join(
            Subject, Subject.id == Animation.subject_id
        ).outerjoin(
            ViewHistory, ViewHistory.animation_id == Animation.id
        )
    else:
        query = db.query(
            Animation.id,
            Animation.title,
            Animation.subject_id,
            Subject.display_name.label('subject_name'),
            Animation.view_count
        ).join(
            Subject, Subject.id == Animation.subject_id
        )

    query = apply_animation_scope(query, current_user)
    
    if subject_id:
        query = query.filter(Animation.subject_id == subject_id)
    
    query = query.filter(Animation.is_published == True)
    if start_dt:
        query = query.filter(ViewHistory.viewed_at >= start_dt)
    if end_dt:
        query = query.filter(ViewHistory.viewed_at <= end_dt)

    if start_dt or end_dt:
        result = query.group_by(
            Animation.id, Animation.title, Animation.subject_id, Subject.display_name
        ).order_by(
            desc('view_count')
        ).limit(limit).all()
    else:
        result = query.order_by(
            desc(Animation.view_count)
        ).limit(limit).all()
    
    return [
        {
            "animation_id": r.id,
            "title": r.title,
            "subject_id": r.subject_id,
            "subject_name": r.subject_name,
            "view_count": r.view_count
        }
        for r in result
    ]

@router.get("/top-active-users")
async def get_top_active_users(
    subject_id: Optional[int] = Query(None, description="学科ID筛选"),
    date_from: Optional[date] = Query(None, description="起始日期"),
    date_to: Optional[date] = Query(None, description="结束日期"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = build_datetime_range(date_from, date_to)

    query = db.query(
        User.id,
        User.username,
        User.real_name,
        User.class_name,
        func.count(ViewHistory.id).label('total_views'),
        func.sum(ViewHistory.view_duration).label('total_duration'),
        func.sum(ViewHistory.interaction_count).label('total_interactions')
    ).join(
        ViewHistory, ViewHistory.user_id == User.id
    )
    
    query = query.join(
        Animation, Animation.id == ViewHistory.animation_id
    ).filter(
        Animation.is_published == True
    )
    query = apply_animation_scope(query, current_user)
    if start_dt:
        query = query.filter(ViewHistory.viewed_at >= start_dt)
    if end_dt:
        query = query.filter(ViewHistory.viewed_at <= end_dt)
    
    if subject_id:
        query = query.filter(Animation.subject_id == subject_id)
    
    result = query.filter(
        User.role == 'student'
    ).group_by(
        User.id, User.username, User.real_name, User.class_name
    ).order_by(
        desc('total_views')
    ).limit(limit).all()
    
    return [
        {
            "user_id": r.id,
            "username": r.username,
            "real_name": r.real_name,
            "class_name": r.class_name,
            "total_views": r.total_views or 0,
            "total_duration": r.total_duration or 0,
            "total_interactions": r.total_interactions or 0
        }
        for r in result
    ]
