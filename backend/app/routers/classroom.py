import csv
import io
import json
import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import get_current_active_user, require_role
from ..database import get_db
from ..models import Animation, CoursewareQuizAttempt, DanmakuMessage, DanmakuSession, DanmakuUpvote, User, ViewHistory
from ..schemas import (
    CoursewareQuizAttemptCreate,
    DanmakuHistoryResponse,
    DanmakuMessageCreate,
    DanmakuMessagePatch,
    DanmakuMessageResponse,
    DanmakuSessionRequest,
    DanmakuStateResponse,
    DanmakuUpvoteResponse,
)
from .animations import ensure_animation_access, load_quiz_questions
from .game import ensure_class_access, teacher_classes

router = APIRouter(prefix="/api/classroom", tags=["课堂弹幕与提问墙"])

SESSION_DURATION = timedelta(minutes=40)
STUDENT_SEND_COOLDOWN = timedelta(seconds=15)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_animation(db: Session, animation_id: int, current_user: User) -> Animation:
    animation = db.query(Animation).filter(Animation.id == animation_id).first()
    if not animation:
        raise HTTPException(status_code=404, detail="动画不存在")
    ensure_animation_access(animation, current_user)
    return animation


def resolve_class_name(current_user: User, requested: Optional[str]) -> str:
    requested = (requested or "").strip()
    if current_user.role == "student":
        own_class = (current_user.class_name or "").strip()
        if not own_class:
            raise HTTPException(status_code=400, detail="当前账号尚未分配班级")
        if requested and requested != own_class:
            raise HTTPException(status_code=403, detail="只能参与本班课堂弹幕")
        return own_class
    if not requested and current_user.role == "teacher":
        allowed = teacher_classes(current_user)
        if allowed and len(allowed) == 1:
            requested = allowed[0]
    if not requested:
        raise HTTPException(status_code=400, detail="请选择班级")
    ensure_class_access(current_user, requested)
    return requested


def active_session(db: Session, animation_id: int, class_name: str) -> Optional[DanmakuSession]:
    now = utc_now()
    return db.query(DanmakuSession).filter(
        DanmakuSession.animation_id == animation_id,
        DanmakuSession.class_name == class_name,
        DanmakuSession.closed_early.is_(False),
        DanmakuSession.expires_at > now,
    ).order_by(DanmakuSession.opened_at.desc(), DanmakuSession.id.desc()).first()


def display_name(user: User) -> str:
    return user.real_name or user.username


def user_names(db: Session, messages: Iterable[DanmakuMessage]) -> Dict[int, str]:
    user_ids = {message.user_id for message in messages}
    if not user_ids:
        return {}
    return {
        user.id: display_name(user)
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    }


def serialize_message(
    message: DanmakuMessage,
    names: Dict[int, str],
    upvoted_ids: set,
    anonymize: bool = False,
) -> DanmakuMessageResponse:
    return DanmakuMessageResponse(
        id=message.id,
        session_id=message.session_id,
        animation_id=message.animation_id,
        class_name=message.class_name,
        user_id=None if anonymize else message.user_id,
        display_name="同学" if anonymize else names.get(message.user_id, "同学"),
        content=message.content,
        upvote_count=message.upvote_count or 0,
        upvoted_by_me=message.id in upvoted_ids,
        is_pinned=bool(message.is_pinned),
        is_deleted=bool(message.is_deleted),
        teacher_reply=message.teacher_reply,
        replied_at=as_utc(message.replied_at) if message.replied_at else None,
        created_at=as_utc(message.created_at),
    )


def state_payload(
    db: Session,
    animation_id: int,
    class_name: str,
    current_user: User,
    after_id: int = 0,
) -> DanmakuStateResponse:
    session = active_session(db, animation_id, class_name)
    if not session:
        return DanmakuStateResponse(is_open=False, class_name=class_name)

    remaining_seconds = max(0, min(2400, math.ceil((as_utc(session.expires_at) - utc_now()).total_seconds())))
    messages = db.query(DanmakuMessage).filter(
        DanmakuMessage.session_id == session.id,
        DanmakuMessage.is_deleted.is_(False),
        DanmakuMessage.id > after_id,
    ).order_by(DanmakuMessage.id.asc()).limit(100).all()
    upvoted_ids = {
        row.message_id
        for row in db.query(DanmakuUpvote.message_id).join(
            DanmakuMessage, DanmakuMessage.id == DanmakuUpvote.message_id
        ).filter(
            DanmakuMessage.session_id == session.id,
            DanmakuUpvote.user_id == current_user.id,
        ).all()
    }
    names = user_names(db, messages)
    return DanmakuStateResponse(
        is_open=True,
        session_id=session.id,
        class_name=class_name,
        remaining_seconds=remaining_seconds,
        messages=[serialize_message(message, names, upvoted_ids) for message in messages],
        upvoted_message_ids=sorted(upvoted_ids),
    )


@router.get("/classes")
async def list_classroom_classes(
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    allowed = teacher_classes(current_user)
    rows = db.query(User.class_name).filter(
        User.role == "student",
        User.class_name.isnot(None),
        User.class_name != "",
    ).distinct().order_by(User.class_name.asc()).all()
    return [name for (name,) in rows if allowed is None or name in allowed]


@router.get("/animations/{animation_id}/danmaku/state", response_model=DanmakuStateResponse)
async def get_danmaku_state(
    animation_id: int,
    class_name: Optional[str] = None,
    after_id: int = Query(0, ge=0),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    get_animation(db, animation_id, current_user)
    resolved_class = resolve_class_name(current_user, class_name)
    return state_payload(db, animation_id, resolved_class, current_user, after_id)


@router.get("/animations/{animation_id}/danmaku/history", response_model=DanmakuHistoryResponse)
async def get_danmaku_history(
    animation_id: int,
    scope: str = Query("class", pattern=r"^(class|all)$"),
    sort: str = Query("hot", pattern=r"^(hot|latest)$"),
    class_name: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    get_animation(db, animation_id, current_user)
    query = db.query(DanmakuMessage).filter(
        DanmakuMessage.animation_id == animation_id,
        DanmakuMessage.is_deleted.is_(False),
    )
    if scope == "class" or (class_name and current_user.role != "student"):
        selected_class = resolve_class_name(current_user, class_name)
        query = query.filter(DanmakuMessage.class_name == selected_class)
    elif current_user.role == "student":
        query = query.filter(DanmakuMessage.is_pinned.is_(True))
    else:
        allowed_classes = teacher_classes(current_user)
        if allowed_classes is not None:
            query = query.filter(DanmakuMessage.class_name.in_(allowed_classes))

    total = query.count()
    if sort == "hot":
        query = query.order_by(
            DanmakuMessage.is_pinned.desc(),
            DanmakuMessage.upvote_count.desc(),
            DanmakuMessage.created_at.desc(),
            DanmakuMessage.id.desc(),
        )
    else:
        query = query.order_by(DanmakuMessage.created_at.desc(), DanmakuMessage.id.desc())
    messages = query.offset((page - 1) * page_size).limit(page_size).all()
    message_ids = [message.id for message in messages]
    upvoted_ids = set()
    if message_ids:
        upvoted_ids = {
            row.message_id
            for row in db.query(DanmakuUpvote.message_id).filter(
                DanmakuUpvote.message_id.in_(message_ids),
                DanmakuUpvote.user_id == current_user.id,
            ).all()
        }
    names = user_names(db, messages)
    items = [
        serialize_message(
            message,
            names,
            upvoted_ids,
            anonymize=current_user.role == "student" and message.class_name != (current_user.class_name or "").strip(),
        )
        for message in messages
    ]
    return DanmakuHistoryResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/animations/{animation_id}/danmaku/session", response_model=DanmakuStateResponse)
async def change_danmaku_session(
    animation_id: int,
    payload: DanmakuSessionRequest,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    get_animation(db, animation_id, current_user)
    class_name = resolve_class_name(current_user, payload.class_name)
    now = utc_now()
    if payload.action == "open":
        sessions = db.query(DanmakuSession).filter(
            DanmakuSession.animation_id == animation_id,
            DanmakuSession.class_name == class_name,
            DanmakuSession.closed_early.is_(False),
        ).all()
        for session in sessions:
            if as_utc(session.expires_at) > now:
                session.closed_early = True
        session = DanmakuSession(
            animation_id=animation_id,
            class_name=class_name,
            opened_by=current_user.id,
            opened_at=now,
            expires_at=now + SESSION_DURATION,
            closed_early=False,
        )
        db.add(session)
    else:
        session = db.query(DanmakuSession).filter(
            DanmakuSession.animation_id == animation_id,
            DanmakuSession.class_name == class_name,
            DanmakuSession.closed_early.is_(False),
        ).order_by(DanmakuSession.opened_at.desc(), DanmakuSession.id.desc()).first()
        if session:
            session.closed_early = True
    db.commit()
    return state_payload(db, animation_id, class_name, current_user)


@router.post("/animations/{animation_id}/danmaku/messages", response_model=DanmakuMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_danmaku_message(
    animation_id: int,
    payload: DanmakuMessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    get_animation(db, animation_id, current_user)
    class_name = resolve_class_name(current_user, payload.class_name)
    session = active_session(db, animation_id, class_name)
    if not session:
        raise HTTPException(status_code=409, detail="本班弹幕尚未开启或已结束")
    now = utc_now()
    if current_user.role == "student":
        latest = db.query(DanmakuMessage).filter(
            DanmakuMessage.session_id == session.id,
            DanmakuMessage.user_id == current_user.id,
        ).order_by(DanmakuMessage.id.desc()).first()
        if latest:
            elapsed = (now - as_utc(latest.created_at)).total_seconds()
            if elapsed < STUDENT_SEND_COOLDOWN.total_seconds():
                retry_after = max(1, math.ceil(STUDENT_SEND_COOLDOWN.total_seconds() - elapsed))
                raise HTTPException(
                    status_code=429,
                    detail=f"发言间隔为 15 秒，请 {retry_after} 秒后再试",
                    headers={"Retry-After": str(retry_after)},
                )
    message = DanmakuMessage(
        session_id=session.id,
        animation_id=animation_id,
        class_name=class_name,
        user_id=current_user.id,
        content=payload.content,
        upvote_count=0,
        is_pinned=False,
        is_deleted=False,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return serialize_message(message, {current_user.id: display_name(current_user)}, set())


@router.post("/animations/{animation_id}/danmaku/messages/{message_id}/upvote", response_model=DanmakuUpvoteResponse)
async def toggle_danmaku_upvote(
    animation_id: int,
    message_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    get_animation(db, animation_id, current_user)
    message = db.query(DanmakuMessage).filter(
        DanmakuMessage.id == message_id,
        DanmakuMessage.animation_id == animation_id,
        DanmakuMessage.is_deleted.is_(False),
    ).with_for_update().first()
    if not message:
        raise HTTPException(status_code=404, detail="问题不存在或已删除")
    if current_user.role == "student":
        own_class = (current_user.class_name or "").strip()
        if message.class_name != own_class and not message.is_pinned:
            raise HTTPException(status_code=403, detail="只能为本班或精选问题点赞")
    else:
        ensure_class_access(current_user, message.class_name)

    existing = db.query(DanmakuUpvote).filter(
        DanmakuUpvote.message_id == message_id,
        DanmakuUpvote.user_id == current_user.id,
    ).first()
    upvoted = existing is None
    if existing:
        db.delete(existing)
        db.query(DanmakuMessage).filter(DanmakuMessage.id == message_id).update(
            {
                DanmakuMessage.upvote_count: case(
                    (func.coalesce(DanmakuMessage.upvote_count, 0) > 0, func.coalesce(DanmakuMessage.upvote_count, 0) - 1),
                    else_=0,
                )
            },
            synchronize_session=False,
        )
    else:
        db.add(DanmakuUpvote(message_id=message_id, user_id=current_user.id))
        db.query(DanmakuMessage).filter(DanmakuMessage.id == message_id).update(
            {DanmakuMessage.upvote_count: func.coalesce(DanmakuMessage.upvote_count, 0) + 1},
            synchronize_session=False,
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(DanmakuUpvote).filter(
            DanmakuUpvote.message_id == message_id,
            DanmakuUpvote.user_id == current_user.id,
        ).first()
        upvoted = existing is not None
    latest = db.query(DanmakuMessage).filter(DanmakuMessage.id == message_id).first()
    return DanmakuUpvoteResponse(
        message_id=message_id,
        upvoted=upvoted,
        upvote_count=latest.upvote_count or 0,
    )


@router.patch("/animations/{animation_id}/danmaku/messages/{message_id}", response_model=DanmakuMessageResponse)
async def moderate_danmaku_message(
    animation_id: int,
    message_id: int,
    payload: DanmakuMessagePatch,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    get_animation(db, animation_id, current_user)
    message = db.query(DanmakuMessage).filter(
        DanmakuMessage.id == message_id,
        DanmakuMessage.animation_id == animation_id,
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="问题不存在")
    ensure_class_access(current_user, message.class_name)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="没有需要更新的内容")
    if "is_pinned" in changes:
        message.is_pinned = bool(payload.is_pinned)
    if "is_deleted" in changes:
        message.is_deleted = bool(payload.is_deleted)
    if "teacher_reply" in changes:
        reply = (payload.teacher_reply or "").strip()
        message.teacher_reply = reply or None
        message.replied_at = utc_now() if reply else None
    db.commit()
    db.refresh(message)
    upvoted = db.query(DanmakuUpvote).filter(
        DanmakuUpvote.message_id == message.id,
        DanmakuUpvote.user_id == current_user.id,
    ).first()
    return serialize_message(
        message,
        user_names(db, [message]),
        {message.id} if upvoted else set(),
    )


@router.post("/animations/{animation_id}/quiz-attempts")
async def submit_quiz_attempt(
    animation_id: int,
    payload: CoursewareQuizAttemptCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="仅学生账号可以提交作答")
    animation = get_animation(db, animation_id, current_user)
    if not animation.has_quiz:
        raise HTTPException(status_code=409, detail="该课件未启用作答收集")
    questions = load_quiz_questions(animation.quiz_manifest)
    question = next((item for item in questions if item.get("id") == payload.questionId), None)
    if not question:
        raise HTTPException(status_code=400, detail="题目 ID 不在课件标准题单中")
    if len(payload.answer.encode("utf-8")) > 1024:
        raise HTTPException(status_code=413, detail="作答内容超过 1024 字节")

    max_score = question.get("maxScore", 1)
    score = payload.score if payload.score is not None else (max_score if payload.isCorrect else 0)
    if score > max_score:
        raise HTTPException(status_code=400, detail="得分不能超过题目分值")
    now = utc_now()
    attempt = db.query(CoursewareQuizAttempt).filter(
        CoursewareQuizAttempt.animation_id == animation_id,
        CoursewareQuizAttempt.user_id == current_user.id,
        CoursewareQuizAttempt.question_key == payload.questionId,
    ).with_for_update().first()
    if attempt is None:
        attempt = CoursewareQuizAttempt(
            animation_id=animation_id,
            user_id=current_user.id,
            question_key=payload.questionId,
            first_is_correct=payload.isCorrect,
            attempt_count=1,
            first_submitted_at=now,
        )
        db.add(attempt)
    else:
        attempt.attempt_count = (attempt.attempt_count or 1) + 1
    attempt.question_title = question["title"]
    attempt.question_type = question["type"]
    attempt.is_correct = payload.isCorrect
    attempt.score = score
    attempt.max_score = max_score
    attempt.student_answer = payload.answer
    attempt.expected_answer = question.get("answer")
    attempt.mistake_tag = payload.mistakeTag or None
    attempt.updated_at = now
    try:
        db.flush()
        latest_history = db.query(ViewHistory).filter(
            ViewHistory.animation_id == animation_id,
            ViewHistory.user_id == current_user.id,
        ).order_by(ViewHistory.viewed_at.desc(), ViewHistory.id.desc()).with_for_update().first()
        if latest_history:
            max_scores = {item["id"]: item.get("maxScore", 1) for item in questions}
            scores = db.query(CoursewareQuizAttempt.question_key, CoursewareQuizAttempt.score).filter(
                CoursewareQuizAttempt.animation_id == animation_id,
                CoursewareQuizAttempt.user_id == current_user.id,
                CoursewareQuizAttempt.question_key.in_(max_scores),
            )
            latest_history.quiz_score = sum(min(score, max_scores[key]) for key, score in scores)
            latest_history.quiz_total = sum(max_scores.values())
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="作答正在提交中，请重试")
    db.refresh(attempt)
    return {
        "id": attempt.id,
        "question_id": attempt.question_key,
        "is_correct": attempt.is_correct,
        "first_is_correct": attempt.first_is_correct,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "attempt_count": attempt.attempt_count,
        "first_submitted_at": as_utc(attempt.first_submitted_at),
        "updated_at": as_utc(attempt.updated_at),
    }


def answer_values(raw: Optional[str]) -> List[str]:
    if raw is None:
        return ["（空答）"]
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return [raw]
    if isinstance(parsed, list):
        return [str(item) for item in parsed] or ["（空答）"]
    if isinstance(parsed, str):
        return [parsed]
    return [raw]


@router.get("/animations/{animation_id}/quiz-stats")
async def get_quiz_stats(
    animation_id: int,
    class_name: Optional[str] = None,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    animation = get_animation(db, animation_id, current_user)
    if not animation.has_quiz:
        raise HTTPException(status_code=409, detail="该课件未启用作答收集")
    resolved_class = resolve_class_name(current_user, class_name)
    questions = load_quiz_questions(animation.quiz_manifest)
    students = db.query(User).filter(
        User.class_name == resolved_class,
        User.role == "student",
        User.is_active.is_(True),
    ).all()
    students.sort(key=lambda user: (display_name(user), user.id))
    student_ids = [student.id for student in students]
    attempts = []
    if student_ids:
        attempts = db.query(CoursewareQuizAttempt).filter(
            CoursewareQuizAttempt.animation_id == animation_id,
            CoursewareQuizAttempt.user_id.in_(student_ids),
        ).all()
    attempts_by_question = {}
    attempts_by_student = {}
    for attempt in attempts:
        attempts_by_question.setdefault(attempt.question_key, []).append(attempt)
        attempts_by_student.setdefault(attempt.user_id, {})[attempt.question_key] = attempt

    question_stats = []
    for question in questions:
        rows = attempts_by_question.get(question["id"], [])
        submitted = len(rows)
        first_correct = sum(1 for row in rows if row.first_is_correct)
        final_correct = sum(1 for row in rows if row.is_correct)
        distribution = Counter()
        incorrect = Counter()
        for row in rows:
            values = answer_values(row.student_answer)
            distribution.update(values)
            if not row.is_correct:
                incorrect.update(values)
        question_stats.append({
            "question_id": question["id"],
            "title": question["title"],
            "type": question["type"],
            "options": question.get("options", []),
            "expected_answer": question.get("answer"),
            "max_score": question.get("maxScore", 1),
            "submitted_count": submitted,
            "first_correct_count": first_correct,
            "final_correct_count": final_correct,
            "first_correct_rate": round(first_correct * 100 / submitted, 1) if submitted else 0,
            "final_correct_rate": round(final_correct * 100 / submitted, 1) if submitted else 0,
            "answer_distribution": [
                {"answer": answer, "count": count}
                for answer, count in distribution.most_common()
            ],
            "top_incorrect_answers": [
                {"answer": answer, "count": count}
                for answer, count in incorrect.most_common(3)
            ],
        })

    total_max_score = sum(question.get("maxScore", 1) for question in questions)
    student_stats = []
    for student in students:
        student_attempts = attempts_by_student.get(student.id, {})
        results = []
        wrong_ids = []
        first_wrong_ids = []
        latest_update = None
        for question in questions:
            attempt = student_attempts.get(question["id"])
            if not attempt:
                continue
            max_score = question.get("maxScore", 1)
            if not attempt.is_correct:
                wrong_ids.append(question["id"])
            if not attempt.first_is_correct:
                first_wrong_ids.append(question["id"])
            latest_update = max(latest_update or attempt.updated_at, attempt.updated_at)
            results.append({
                "question_id": question["id"],
                "first_is_correct": attempt.first_is_correct,
                "is_correct": attempt.is_correct,
                "score": min(attempt.score, max_score),
                "max_score": max_score,
                "student_answer": attempt.student_answer,
                "mistake_tag": attempt.mistake_tag,
                "attempt_count": attempt.attempt_count,
                "updated_at": as_utc(attempt.updated_at),
            })
        completed = len(results)
        student_stats.append({
            "user_id": student.id,
            "display_name": display_name(student),
            "status": "not_started" if completed == 0 else ("completed" if completed == len(questions) else "in_progress"),
            "completed_count": completed,
            "question_count": len(questions),
            "total_score": sum(result["score"] for result in results),
            "total_max_score": total_max_score,
            "wrong_question_ids": wrong_ids,
            "first_wrong_question_ids": first_wrong_ids,
            "question_results": results,
            "updated_at": as_utc(latest_update) if latest_update else None,
        })
    return {
        "animation_id": animation_id,
        "class_name": resolved_class,
        "student_count": len(students),
        "question_count": len(questions),
        "questions": question_stats,
        "students": student_stats,
    }


def csv_cell(value: Optional[str]) -> str:
    text = value or ""
    if text.startswith(("\t", "\r", "\n")) or text.lstrip(" \t\r\n\ufeff").startswith(("=", "+", "-", "@", "＝", "＋", "－", "＠")):
        return "'" + text
    return text


@router.get("/animations/{animation_id}/quiz-stats.csv")
async def export_quiz_stats(
    animation_id: int,
    class_name: str = Query(..., min_length=1, max_length=50),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    stats = await get_quiz_stats(animation_id, class_name, current_user, db)
    question_titles = {question["question_id"]: question["title"] for question in stats["questions"]}
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["学生姓名", "班级", "题目ID", "题目", "首答正误", "最终正误", "提交次数", "作答内容", "更新时间"])
    for student in stats["students"]:
        for result in student["question_results"]:
            question_id = result["question_id"]
            writer.writerow([
                csv_cell(student["display_name"]), csv_cell(stats["class_name"]),
                csv_cell(question_id), csv_cell(question_titles[question_id]),
                "正确" if result["first_is_correct"] else "错误",
                "正确" if result["is_correct"] else "错误",
                result["attempt_count"], csv_cell(result["student_answer"]), result["updated_at"].isoformat(),
            ])
    return Response(
        output.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="quiz-{animation_id}.csv"', "Cache-Control": "private, no-store"},
    )
