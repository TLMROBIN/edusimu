from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, CheckConstraint, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    real_name = Column(String(100))
    grade_level = Column(String(50), index=True)
    class_name = Column(String(50), index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    animations = relationship("Animation", back_populates="creator")
    favorites = relationship("Favorite", back_populates="user")
    ratings = relationship("Rating", back_populates="user")
    view_histories = relationship("ViewHistory", back_populates="user")

class Subject(Base):
    __tablename__ = "subjects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(50), nullable=False)
    sort_order = Column(Integer, default=0)
    
    animations = relationship("Animation", back_populates="subject")
    textbook_nodes = relationship("TextbookNode", back_populates="subject")

class TextbookNode(Base):
    __tablename__ = "textbook_nodes"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("textbook_nodes.id"), index=True)
    name = Column(String(200), nullable=False)
    node_type = Column(String(20), nullable=False, default="chapter")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subject = relationship("Subject", back_populates="textbook_nodes")
    parent = relationship("TextbookNode", remote_side=[id], back_populates="children")
    children = relationship("TextbookNode", back_populates="parent", cascade="all, delete-orphan")
    animations = relationship("Animation", back_populates="textbook_node")

class Animation(Base):
    __tablename__ = "animations"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    textbook_node_id = Column(Integer, ForeignKey("textbook_nodes.id"), index=True)
    description = Column(Text)
    author = Column(String(100))
    file_path = Column(String(500), nullable=False)
    thumbnail = Column(String(500))
    grade_level = Column(String(50))
    keywords = Column(Text)
    source_type = Column(String(20), default="original", nullable=False, index=True)
    view_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"))
    is_published = Column(Boolean, default=False, index=True)
    review_status = Column(String(20), default="pending_review", index=True)
    review_notes = Column(Text)
    validation_status = Column(String(20), default="pending", index=True)
    validation_summary = Column(Text)
    validation_errors = Column(Text)
    validation_warnings = Column(Text)
    file_size = Column(Integer)
    may_lag = Column(Boolean, default=False, nullable=False, index=True)
    lag_reason = Column(Text)
    has_quiz = Column(Boolean, default=False, nullable=False, index=True)
    quiz_manifest = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    subject = relationship("Subject", back_populates="animations")
    textbook_node = relationship("TextbookNode", back_populates="animations")
    creator = relationship("User", back_populates="animations")
    favorites = relationship("Favorite", back_populates="animation", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="animation", cascade="all, delete-orphan")
    view_histories = relationship("ViewHistory", back_populates="animation", cascade="all, delete-orphan")
    collection_items = relationship("CollectionItem", back_populates="animation", cascade="all, delete-orphan")


class AnimationCollection(Base):
    __tablename__ = "animation_collections"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    cover_image = Column(String(500))
    is_banner = Column(Boolean, default=False, nullable=False, index=True)
    banner_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    items = relationship(
        "CollectionItem",
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="CollectionItem.sort_order",
    )


class CollectionItem(Base):
    __tablename__ = "collection_items"
    __table_args__ = (
        UniqueConstraint("collection_id", "animation_id", name="uq_collection_animation"),
        Index("ix_collection_items_order", "collection_id", "sort_order"),
    )

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("animation_collections.id"), nullable=False, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False)

    collection = relationship("AnimationCollection", back_populates="items")
    animation = relationship("Animation", back_populates="collection_items")


class Favorite(Base):
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (UniqueConstraint('user_id', 'animation_id', name='unique_favorite'),)
    
    user = relationship("User", back_populates="favorites")
    animation = relationship("Animation", back_populates="favorites")

class Rating(Base):
    __tablename__ = "ratings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    score = Column(Integer, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        CheckConstraint('score >= 1 AND score <= 5', name='check_score_range'),
        UniqueConstraint('user_id', 'animation_id', name='unique_rating'),
    )
    
    user = relationship("User", back_populates="ratings")
    animation = relationship("Animation", back_populates="ratings")

class ViewHistory(Base):
    __tablename__ = "view_histories"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    view_duration = Column(Integer, default=0)
    interaction_count = Column(Integer, default=0)
    quiz_score = Column(Integer)
    quiz_total = Column(Integer)
    viewed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    user = relationship("User", back_populates="view_histories")
    animation = relationship("Animation", back_populates="view_histories")
    interactions = relationship("AnimationInteraction", back_populates="view_history", cascade="all, delete-orphan")


class CoursewareQuizAttempt(Base):
    __tablename__ = "courseware_quiz_attempts"
    __table_args__ = (
        UniqueConstraint("user_id", "animation_id", "question_key", name="uq_quiz_attempt_user_anim_q"),
        Index("ix_quiz_attempt_animation_user", "animation_id", "user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_key = Column(String(80), nullable=False, index=True)
    question_title = Column(String(200), nullable=False)
    question_type = Column(String(20), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    first_is_correct = Column(Boolean, nullable=False)
    score = Column(Integer, nullable=False, default=0)
    max_score = Column(Integer, nullable=False, default=1)
    student_answer = Column(Text)
    expected_answer = Column(String(200))
    mistake_tag = Column(String(50))
    attempt_count = Column(Integer, nullable=False, default=1)
    first_submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class DanmakuSession(Base):
    __tablename__ = "danmaku_sessions"
    __table_args__ = (
        Index("ix_danmaku_sessions_active", "animation_id", "class_name", "closed_early", "expires_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False, index=True)
    opened_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    opened_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    closed_early = Column(Boolean, nullable=False, default=False)


class DanmakuMessage(Base):
    __tablename__ = "danmaku_messages"
    __table_args__ = (
        Index("ix_danmaku_messages_session_poll", "animation_id", "class_name", "session_id", "id"),
        Index("ix_danmaku_messages_history_hot", "animation_id", "is_deleted", "is_pinned", "upvote_count"),
    )

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("danmaku_sessions.id"), nullable=False, index=True)
    animation_id = Column(Integer, ForeignKey("animations.id"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(String(40), nullable=False)
    upvote_count = Column(Integer, nullable=False, default=0)
    is_pinned = Column(Boolean, nullable=False, default=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    teacher_reply = Column(Text)
    replied_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class DanmakuUpvote(Base):
    __tablename__ = "danmaku_upvotes"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_danmaku_upvote_message_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("danmaku_messages.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AnimationInteraction(Base):
    __tablename__ = "animation_interactions"
    
    id = Column(Integer, primary_key=True, index=True)
    view_history_id = Column(Integer, ForeignKey("view_histories.id"), nullable=False, index=True)
    interaction_type = Column(String(50), nullable=False)
    interaction_data = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    view_history = relationship("ViewHistory", back_populates="interactions")


# ---- 课件游戏数据层（物理闯关等游戏类课件；按 game_key 区分不同游戏） ----

class GameProgress(Base):
    """每个用户每个游戏一份 JSON 存档；version 用于乐观锁。"""
    __tablename__ = "game_progress"
    __table_args__ = (UniqueConstraint("user_id", "game_key", name="uq_game_progress_user_game"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_key = Column(String(40), nullable=False, index=True)
    data = Column(Text, nullable=False, default="{}")
    version = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GameAttempt(Base):
    """每一次作答（关卡/每日挑战/训练场/段位赛），用于统计、榜单与错因分析。"""
    __tablename__ = "game_attempts"
    __table_args__ = (UniqueConstraint("user_id", "client_id", name="uq_game_attempt_client"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_key = Column(String(40), nullable=False, index=True)
    client_id = Column(String(64), nullable=False)  # 客户端生成，离线补传时去重
    mode = Column(String(20), nullable=False, default="main")  # main / daily / arena / ranked
    level_id = Column(String(80), nullable=False, index=True)
    seed = Column(String(64))
    passed = Column(Boolean, nullable=False, default=False)
    stars = Column(Integer, nullable=False, default=0)
    score = Column(Integer, nullable=False, default=0)
    difficulty = Column(Integer, nullable=False, default=1)
    mistake_tags = Column(Text, default="[]")
    duration_ms = Column(Integer, default=0)
    day = Column(String(10), nullable=False, index=True)  # 北京时间 YYYY-MM-DD
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class GameRating(Base):
    """段位赛积分，按周赛季。"""
    __tablename__ = "game_ratings"
    __table_args__ = (UniqueConstraint("user_id", "game_key", "season", name="uq_game_rating_user_season"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_key = Column(String(40), nullable=False, index=True)
    season = Column(String(10), nullable=False, index=True)  # ISO 周，如 2026-W39
    rating = Column(Integer, nullable=False, default=1000)
    games = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GameCheckin(Base):
    """每日挑战打卡（完成当日全部题目才记一次）。"""
    __tablename__ = "game_checkins"
    __table_args__ = (UniqueConstraint("user_id", "game_key", "day", name="uq_game_checkin_day"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_key = Column(String(40), nullable=False, index=True)
    day = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GameClassSetting(Base):
    """教师对班级的游戏设置：解锁到第几个世界、是否显示榜单。"""
    __tablename__ = "game_class_settings"
    __table_args__ = (UniqueConstraint("game_key", "class_name", name="uq_game_class_setting"),)

    id = Column(Integer, primary_key=True, index=True)
    game_key = Column(String(40), nullable=False, index=True)
    class_name = Column(String(50), nullable=False, index=True)
    data = Column(Text, nullable=False, default="{}")
    updated_by = Column(Integer, ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
