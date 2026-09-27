"""课件游戏数据层：存档、作答记录、每日挑战打卡、班级榜、段位、教师统计与设置。

课件通过 AnimationPlayer 的 EDUSIMU_CONTEXT 拿到 token 后直接调用本路由；
所有接口都以 game_key 区分游戏（物理闯关为 physics-quest）。
"""
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import get_current_active_user, require_role
from ..database import get_db
from ..models import GameAttempt, GameCheckin, GameClassSetting, GameProgress, GameRating, User

router = APIRouter(prefix="/api/game", tags=["课件游戏"])

GAME_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")
BEIJING = timezone(timedelta(hours=8))
MAX_PROGRESS_BYTES = 512 * 1024
DAILY_QUESTION_COUNT = 5
DEFAULT_SETTINGS = {"unlockedWorld": 99, "leaderboardEnabled": True}


# ---------- 工具 ----------

def check_game_key(game_key: str) -> str:
    if not GAME_KEY_PATTERN.match(game_key):
        raise HTTPException(status_code=400, detail="game_key 不合法")
    return game_key


def beijing_now() -> datetime:
    return datetime.now(BEIJING)


def beijing_day(now: Optional[datetime] = None) -> str:
    return (now or beijing_now()).strftime("%Y-%m-%d")


def iso_week(now: Optional[datetime] = None) -> str:
    year, week, _ = (now or beijing_now()).isocalendar()
    return f"{year}-W{week:02d}"


def week_days(now: Optional[datetime] = None) -> List[str]:
    current = now or beijing_now()
    monday = current - timedelta(days=current.weekday())
    return [(monday + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]


def teacher_classes(user: User) -> Optional[List[str]]:
    """教师可见班级：class_name 字段可写多个班（逗号/顿号分隔）。

    返回 None 表示不限（管理员；或教师未配置班级时沿用平台现有统计口径）。
    """
    if user.role == "admin":
        return None
    raw = (user.class_name or "").strip()
    if not raw:
        return None
    return [item.strip() for item in re.split(r"[,，、;；\s]+", raw) if item.strip()]


def ensure_class_access(user: User, class_name: str) -> None:
    allowed = teacher_classes(user)
    if allowed is not None and class_name not in allowed:
        raise HTTPException(status_code=403, detail="只能查看自己任教的班级")


def load_settings(db: Session, game_key: str, class_name: Optional[str]) -> Dict[str, Any]:
    settings = dict(DEFAULT_SETTINGS)
    if not class_name:
        return settings
    row = db.query(GameClassSetting).filter_by(game_key=game_key, class_name=class_name).first()
    if row:
        try:
            settings.update(json.loads(row.data or "{}"))
        except ValueError:
            pass
    return settings


def display_name(user: User) -> str:
    return user.real_name or user.username


# ---------- 请求模型 ----------

class ProgressIn(BaseModel):
    data: Dict[str, Any]
    base_version: int = Field(ge=0)


class AttemptIn(BaseModel):
    client_id: str = Field(min_length=6, max_length=64)
    mode: str = Field(default="main", pattern=r"^(main|daily|arena|ranked)$")
    level_id: str = Field(min_length=1, max_length=80)
    seed: Optional[str] = Field(default=None, max_length=64)
    passed: bool = False
    stars: int = Field(default=0, ge=0, le=3)
    score: int = Field(default=0, ge=0, le=100000)
    difficulty: int = Field(default=1, ge=1, le=5)
    mistake_tags: List[str] = Field(default_factory=list, max_length=20)
    duration_ms: int = Field(default=0, ge=0, le=24 * 3600 * 1000)
    day: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class AttemptBatchIn(BaseModel):
    attempts: List[AttemptIn] = Field(max_length=200)


class SettingsIn(BaseModel):
    unlockedWorld: Optional[int] = Field(default=None, ge=1, le=99)
    leaderboardEnabled: Optional[bool] = None


# ---------- 学生端 ----------

@router.get("/{game_key}/context")
async def get_context(
    game_key: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    check_game_key(game_key)
    return {
        "user": {
            "id": current_user.id,
            "name": display_name(current_user),
            "role": current_user.role,
            "class_name": current_user.class_name,
            "grade_level": current_user.grade_level,
        },
        "settings": load_settings(db, game_key, current_user.class_name),
        "today": beijing_day(),
        "season": iso_week(),
    }


@router.get("/{game_key}/progress")
async def get_progress(
    game_key: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    check_game_key(game_key)
    row = db.query(GameProgress).filter_by(user_id=current_user.id, game_key=game_key).first()
    if not row:
        return {"data": None, "version": 0, "updated_at": None}
    return {"data": json.loads(row.data or "{}"), "version": row.version, "updated_at": row.updated_at}


@router.put("/{game_key}/progress")
async def put_progress(
    game_key: str,
    payload: ProgressIn,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """乐观锁：base_version 必须等于服务器当前 version，否则 409 并返回服务器存档供客户端合并。"""
    check_game_key(game_key)
    encoded = json.dumps(payload.data, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_PROGRESS_BYTES:
        raise HTTPException(status_code=413, detail="存档过大")
    row = db.query(GameProgress).filter_by(user_id=current_user.id, game_key=game_key).first()
    current_version = row.version if row else 0
    if payload.base_version != current_version:
        raise HTTPException(status_code=409, detail={
            "message": "存档版本冲突",
            "version": current_version,
            "data": json.loads(row.data) if row else None,
        })
    if row is None:
        row = GameProgress(user_id=current_user.id, game_key=game_key, data=encoded, version=1)
        db.add(row)
    else:
        row.data = encoded
        row.version = current_version + 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail={"message": "存档版本冲突", "version": current_version, "data": None})
    return {"version": row.version}


def _store_attempt(db: Session, user: User, game_key: str, item: AttemptIn) -> bool:
    exists = db.query(GameAttempt.id).filter_by(user_id=user.id, client_id=item.client_id).first()
    if exists:
        return False
    db.add(GameAttempt(
        user_id=user.id,
        game_key=game_key,
        client_id=item.client_id,
        mode=item.mode,
        level_id=item.level_id,
        seed=item.seed,
        passed=item.passed,
        stars=item.stars if item.passed else 0,
        score=item.score,
        difficulty=item.difficulty,
        mistake_tags=json.dumps(item.mistake_tags[:20], ensure_ascii=False),
        duration_ms=item.duration_ms,
        # 离线补传只接受 3 天内的日期，防止伪造历史打卡。
        day=_accept_day(item.day),
    ))
    return True


def _accept_day(day: Optional[str]) -> str:
    today = beijing_now()
    if day:
        allowed = {beijing_day(today - timedelta(days=i)) for i in range(3)}
        if day in allowed:
            return day
    return beijing_day(today)


@router.post("/{game_key}/attempts")
async def post_attempts(
    game_key: str,
    payload: AttemptBatchIn,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """批量写入（同步队列一次补传多条）；client_id 去重，重复提交是安全的。"""
    check_game_key(game_key)
    stored = 0
    for item in payload.attempts:
        if _store_attempt(db, current_user, game_key, item):
            stored += 1
            db.flush()
    db.commit()
    return {"stored": stored, "received": len(payload.attempts)}


@router.get("/{game_key}/daily")
async def get_daily(
    game_key: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """当日种子（全校一致）与本人完成情况；完成 DAILY_QUESTION_COUNT 道即自动打卡。"""
    check_game_key(game_key)
    day = beijing_day()
    done = _daily_done_count(db, current_user.id, game_key, day)
    checked = _ensure_checkin(db, current_user.id, game_key, day, done)
    return {
        "day": day,
        "seed": f"{game_key}:{day}",
        "count": DAILY_QUESTION_COUNT,
        "done": done,
        "checked_in": checked,
        "streak": _school_day_streak(db, current_user.id, game_key),
    }


def _daily_done_count(db: Session, user_id: int, game_key: str, day: str) -> int:
    return db.query(func.count(func.distinct(GameAttempt.level_id))).filter(
        GameAttempt.user_id == user_id,
        GameAttempt.game_key == game_key,
        GameAttempt.mode == "daily",
        GameAttempt.day == day,
        GameAttempt.passed == True,  # noqa: E712
    ).scalar() or 0


def _ensure_checkin(db: Session, user_id: int, game_key: str, day: str, done: int) -> bool:
    row = db.query(GameCheckin).filter_by(user_id=user_id, game_key=game_key, day=day).first()
    if row:
        return True
    if done < DAILY_QUESTION_COUNT:
        return False
    db.add(GameCheckin(user_id=user_id, game_key=game_key, day=day))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return True


def _school_day_streak(db: Session, user_id: int, game_key: str, today: Optional[datetime] = None) -> Dict[str, int]:
    """连续打卡按上学日（周一至周五）计；周末不打断。每周允许 1 次缺勤由补签卡自动抵扣。

    节假日暂无校历数据，按工作日处理（待接入校历）。
    """
    days = {row.day for row in db.query(GameCheckin.day).filter_by(user_id=user_id, game_key=game_key).all()}
    cursor = today or beijing_now()
    if beijing_day(cursor) not in days:
        cursor -= timedelta(days=1)  # 今天还没打卡不算断
    streak = 0
    used_cards: Dict[str, int] = defaultdict(int)
    for _ in range(400):
        if cursor.weekday() < 5:
            key = beijing_day(cursor)
            if key in days:
                streak += 1
            else:
                week = iso_week(cursor)
                if used_cards[week] >= 1:
                    break
                used_cards[week] += 1
        cursor -= timedelta(days=1)
    return {"days": streak, "cards_used_this_week": used_cards.get(iso_week(), 0)}


@router.get("/{game_key}/leaderboard")
async def get_leaderboard(
    game_key: str,
    board: str = Query("rank", pattern=r"^(rank|progress)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """班级周榜：只返回前 10 名与“我的名次”。rank=段位分；progress=本周新增星数。"""
    check_game_key(game_key)
    class_name = current_user.class_name
    if not class_name:
        return {"enabled": False, "reason": "未分配班级", "top": [], "me": None}
    if not load_settings(db, game_key, class_name).get("leaderboardEnabled", True):
        return {"enabled": False, "reason": "老师已关闭榜单", "top": [], "me": None}

    classmates = db.query(User).filter(User.class_name == class_name, User.role == "student", User.is_active == True).all()  # noqa: E712
    ids = [u.id for u in classmates]
    names = {u.id: display_name(u) for u in classmates}
    scores: Dict[int, int] = {uid: 0 for uid in ids}
    if board == "rank":
        for row in db.query(GameRating).filter(GameRating.game_key == game_key, GameRating.season == iso_week(), GameRating.user_id.in_(ids)):
            scores[row.user_id] = row.rating
    else:
        rows = db.query(GameAttempt.user_id, func.sum(GameAttempt.stars)).filter(
            GameAttempt.game_key == game_key,
            GameAttempt.user_id.in_(ids),
            GameAttempt.passed == True,  # noqa: E712
            GameAttempt.day.in_(week_days()),
        ).group_by(GameAttempt.user_id).all()
        for uid, total in rows:
            scores[uid] = int(total or 0)

    ranked = sorted(ids, key=lambda uid: (-scores[uid], names[uid]))
    ranked = [uid for uid in ranked if scores[uid] > 0] or []
    top = [{"rank": i + 1, "name": names[uid], "score": scores[uid], "me": uid == current_user.id} for i, uid in enumerate(ranked[:10])]
    me = None
    if current_user.id in ranked:
        me = {"rank": ranked.index(current_user.id) + 1, "score": scores[current_user.id]}
    return {"enabled": True, "board": board, "season": iso_week(), "top": top, "me": me, "size": len(ids)}


# ---------- 段位赛 ----------

class RankedResultIn(BaseModel):
    client_id: str = Field(min_length=6, max_length=64)
    level_id: str = Field(min_length=1, max_length=80)
    seed: Optional[str] = Field(default=None, max_length=64)
    difficulty: int = Field(ge=1, le=5)
    passed: bool
    mistake_tags: List[str] = Field(default_factory=list, max_length=20)
    duration_ms: int = Field(default=0, ge=0)


def expected_score(rating: int, difficulty: int) -> float:
    # 难度 1..5 对应题目“等效分” 800..1600。
    problem = 600 + difficulty * 200
    return 1 / (1 + 10 ** ((problem - rating) / 400))


@router.post("/{game_key}/ranked")
async def post_ranked(
    game_key: str,
    payload: RankedResultIn,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """类 Elo：答对难题加分多、答错简单题扣分多；刷题量本身不加分。积分由服务器计算。"""
    check_game_key(game_key)
    season = iso_week()
    row = db.query(GameRating).filter_by(user_id=current_user.id, game_key=game_key, season=season).first()
    if row is None:
        row = GameRating(user_id=current_user.id, game_key=game_key, season=season, rating=1000, games=0)
        db.add(row)
        db.flush()
    duplicate = db.query(GameAttempt.id).filter_by(user_id=current_user.id, client_id=payload.client_id).first()
    if duplicate:
        return {"rating": row.rating, "delta": 0, "season": season, "duplicate": True}
    k = 40 if row.games < 10 else 24
    delta = round(k * ((1 if payload.passed else 0) - expected_score(row.rating, payload.difficulty)))
    row.rating = max(0, row.rating + delta)
    row.games += 1
    _store_attempt(db, current_user, game_key, AttemptIn(
        client_id=payload.client_id, mode="ranked", level_id=payload.level_id, seed=payload.seed,
        passed=payload.passed, stars=1 if payload.passed else 0, score=max(0, delta),
        difficulty=payload.difficulty, mistake_tags=payload.mistake_tags, duration_ms=payload.duration_ms,
    ))
    db.commit()
    return {"rating": row.rating, "delta": delta, "season": season, "games": row.games}


# ---------- 教师端 ----------

@router.get("/{game_key}/classes")
async def list_classes(
    game_key: str,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    check_game_key(game_key)
    allowed = teacher_classes(current_user)
    rows = db.query(User.class_name, func.count(User.id)).filter(
        User.role == "student", User.class_name.isnot(None), User.class_name != ""
    ).group_by(User.class_name).all()
    return [
        {"class_name": name, "students": count, "settings": load_settings(db, game_key, name)}
        for name, count in rows if allowed is None or name in allowed
    ]


@router.get("/{game_key}/stats/class/{class_name}")
async def class_stats(
    game_key: str,
    class_name: str,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    """班级进度、关卡通过率（知识点热力图的数据源）与高频错因。"""
    check_game_key(game_key)
    ensure_class_access(current_user, class_name)
    students = db.query(User).filter(User.class_name == class_name, User.role == "student").all()
    if not students:
        raise HTTPException(status_code=404, detail="班级不存在或没有学生")
    ids = [s.id for s in students]
    since = beijing_day(beijing_now() - timedelta(days=days - 1))
    attempts = db.query(GameAttempt).filter(
        GameAttempt.game_key == game_key, GameAttempt.user_id.in_(ids), GameAttempt.day >= since
    ).all()

    per_level: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"attempts": 0, "passed": 0, "students": set(), "passed_students": set()})
    per_student: Dict[int, Dict[str, Any]] = {sid: {"attempts": 0, "passed_levels": set(), "stars": {}, "last_day": None} for sid in ids}
    tags: Counter = Counter()
    for a in attempts:
        lv = per_level[a.level_id]
        lv["attempts"] += 1
        lv["students"].add(a.user_id)
        st = per_student[a.user_id]
        st["attempts"] += 1
        st["last_day"] = max(st["last_day"] or a.day, a.day)
        if a.passed:
            lv["passed"] += 1
            lv["passed_students"].add(a.user_id)
            st["passed_levels"].add(a.level_id)
            if a.mode == "main":
                st["stars"][a.level_id] = max(st["stars"].get(a.level_id, 0), a.stars)
        try:
            tags.update(json.loads(a.mistake_tags or "[]"))
        except ValueError:
            pass

    checkins = db.query(GameCheckin.user_id, func.count(GameCheckin.id)).filter(
        GameCheckin.game_key == game_key, GameCheckin.user_id.in_(ids), GameCheckin.day >= since
    ).group_by(GameCheckin.user_id).all()
    checkin_map = dict(checkins)

    return {
        "class_name": class_name,
        "since": since,
        "students": [
            {
                "id": s.id,
                "name": display_name(s),
                "attempts": per_student[s.id]["attempts"],
                "levels_passed": len(per_student[s.id]["passed_levels"]),
                "stars": sum(per_student[s.id]["stars"].values()),
                "checkins": checkin_map.get(s.id, 0),
                "last_day": per_student[s.id]["last_day"],
            }
            for s in sorted(students, key=lambda x: display_name(x))
        ],
        "levels": sorted([
            {
                "level_id": level_id,
                "attempts": v["attempts"],
                "pass_rate": round(v["passed"] / v["attempts"], 3) if v["attempts"] else 0,
                "students": len(v["students"]),
                "students_passed": len(v["passed_students"]),
            }
            for level_id, v in per_level.items()
        ], key=lambda x: x["level_id"]),
        "top_mistakes": [{"tag": tag, "count": count} for tag, count in tags.most_common(15)],
        "settings": load_settings(db, game_key, class_name),
    }


@router.put("/{game_key}/settings/{class_name}")
async def put_class_settings(
    game_key: str,
    class_name: str,
    payload: SettingsIn,
    current_user: User = Depends(require_role(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    check_game_key(game_key)
    ensure_class_access(current_user, class_name)
    row = db.query(GameClassSetting).filter_by(game_key=game_key, class_name=class_name).first()
    current = load_settings(db, game_key, class_name)
    current.update({k: v for k, v in payload.model_dump().items() if v is not None})
    if row is None:
        row = GameClassSetting(game_key=game_key, class_name=class_name)
        db.add(row)
    row.data = json.dumps(current, ensure_ascii=False)
    row.updated_by = current_user.id
    db.commit()
    return current
