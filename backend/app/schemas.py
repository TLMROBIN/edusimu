from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, StrictBool, field_validator

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    role: str = Field(..., pattern="^(student|teacher|admin)$")
    real_name: Optional[str] = Field(None, max_length=100)
    grade_level: Optional[str] = Field(None, max_length=50)
    class_name: Optional[str] = Field(None, max_length=50)

class UserCreate(UserBase):
    password: Optional[str] = Field(None, max_length=100)

class UserBatchCreate(BaseModel):
    users: List[UserCreate]

class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    real_name: Optional[str] = Field(None, max_length=100)
    grade_level: Optional[str] = Field(None, max_length=50)
    class_name: Optional[str] = Field(None, max_length=50)
    role: Optional[str] = Field(None, pattern="^(student|teacher|admin)$")
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class AnimationBase(BaseModel):
    title: str = Field(..., max_length=200)
    subject_id: int
    textbook_node_id: Optional[int] = None
    description: Optional[str] = None
    grade_level: Optional[str] = Field(None, max_length=50)
    keywords: Optional[str] = None
    is_published: bool = False

class AnimationCreate(AnimationBase):
    pass


class GeoGebraImportRequest(BaseModel):
    link: str = Field(..., min_length=1, max_length=1000)
    subject_id: int
    textbook_node_id: int
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    grade_level: Optional[str] = Field(None, max_length=50)
    keywords: Optional[str] = None
    is_published: bool = False
    force_publish: bool = False

class AnimationUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    author: Optional[str] = Field(None, max_length=100)
    subject_id: Optional[int] = None
    textbook_node_id: Optional[int] = None
    description: Optional[str] = None
    grade_level: Optional[str] = Field(None, max_length=50)
    keywords: Optional[str] = None
    is_published: Optional[bool] = None
    review_notes: Optional[str] = None
    force_publish: Optional[bool] = None
    may_lag: Optional[bool] = None
    lag_reason: Optional[str] = None

class AiPromptSuggestion(BaseModel):
    title: str
    prompt: str

class AnimationResponse(AnimationBase):
    id: int
    author: Optional[str] = None
    source_type: str = "original"
    file_path: str
    file_url: Optional[str] = None
    thumbnail: Optional[str]
    view_count: int
    file_size: Optional[int]
    may_lag: bool = False
    lag_reason: Optional[str] = None
    has_quiz: bool = False
    quiz_count: int = 0
    created_by: Optional[int]
    creator_name: Optional[str] = None
    subject_name: Optional[str] = None
    textbook_path: Optional[str] = None
    review_status: str = "pending_review"
    review_notes: Optional[str] = None
    validation_status: str = "pending"
    validation_summary: Optional[str] = None
    validation_errors: List[str] = Field(default_factory=list)
    validation_warnings: List[str] = Field(default_factory=list)
    ai_guidance: Optional[str] = None
    ai_prompts: List[AiPromptSuggestion] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime]
    avg_rating: Optional[float] = None
    rating_count: int = 0
    
    class Config:
        from_attributes = True

class CollectionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    animation_ids: List[int] = Field(default_factory=list, max_length=100)
    is_banner: bool = False
    banner_order: int = Field(0, ge=0, le=9999)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("合集名称不能为空")
        return value

    @field_validator("animation_ids")
    @classmethod
    def validate_animation_ids(cls, value: List[int]) -> List[int]:
        if len(set(value)) != len(value):
            raise ValueError("合集不能重复添加同一课件")
        if any(animation_id <= 0 for animation_id in value):
            raise ValueError("课件 ID 无效")
        return value


class CollectionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    animation_ids: Optional[List[int]] = Field(None, max_length=100)
    is_banner: Optional[bool] = None
    banner_order: Optional[int] = Field(None, ge=0, le=9999)

    @field_validator("title", "animation_ids", "is_banner", "banner_order", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("请省略无需修改的字段")
        return value

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("合集名称不能为空")
        return value

    @field_validator("animation_ids")
    @classmethod
    def validate_animation_ids(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        if value is None:
            return value
        return CollectionCreate.validate_animation_ids(value)


class CollectionSummary(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    is_banner: bool = False
    banner_order: int = 0
    animation_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CollectionDetail(CollectionSummary):
    animations: List[AnimationResponse] = Field(default_factory=list)


class FavoriteBase(BaseModel):
    animation_id: int

class FavoriteResponse(FavoriteBase):
    id: int
    user_id: int
    created_at: datetime
    animation: Optional[AnimationResponse] = None
    
    class Config:
        from_attributes = True

class RatingBase(BaseModel):
    animation_id: int
    score: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

class RatingResponse(RatingBase):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ViewHistoryCreate(BaseModel):
    animation_id: int
    view_duration: int = 0
    interaction_count: int = 0
    quiz_score: Optional[int] = None
    quiz_total: Optional[int] = None

class ViewHistoryResponse(ViewHistoryCreate):
    id: int
    user_id: int
    viewed_at: datetime
    
    class Config:
        from_attributes = True


class ViewHistoryUpdate(BaseModel):
    view_duration: Optional[int] = None
    interaction_count: Optional[int] = None
    quiz_score: Optional[int] = None
    quiz_total: Optional[int] = None

class InteractionCreate(BaseModel):
    interaction_type: str = Field(..., max_length=50)
    interaction_data: Optional[str] = None

class InteractionResponse(InteractionCreate):
    id: int
    view_history_id: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

class CoursewareQuizAttemptCreate(BaseModel):
    version: Literal[1] = 1
    questionId: str = Field(..., min_length=1, max_length=80)
    answer: str = Field(..., max_length=1024)
    isCorrect: StrictBool
    score: Optional[int] = Field(None, ge=0)
    mistakeTag: Optional[str] = Field(None, max_length=50)

    @field_validator("questionId")
    @classmethod
    def strip_question_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("题目 ID 不能为空")
        return value

    @field_validator("mistakeTag")
    @classmethod
    def strip_mistake_tag(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else value


class DanmakuSessionRequest(BaseModel):
    class_name: str = Field(..., min_length=1, max_length=50)
    action: Literal["open", "close"]

    @field_validator("class_name")
    @classmethod
    def strip_class_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("班级不能为空")
        return value


class DanmakuMessageCreate(BaseModel):
    class_name: str = Field(..., min_length=1, max_length=50)
    content: str = Field(..., min_length=1, max_length=40)

    @field_validator("class_name", "content")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("内容不能为空")
        return value


class DanmakuMessagePatch(BaseModel):
    is_pinned: Optional[bool] = None
    is_deleted: Optional[bool] = None
    teacher_reply: Optional[str] = Field(None, max_length=500)


class DanmakuMessageResponse(BaseModel):
    id: int
    session_id: Optional[int]
    animation_id: int
    class_name: str
    user_id: Optional[int] = None
    display_name: str
    content: str
    upvote_count: int
    upvoted_by_me: bool = False
    is_pinned: bool
    is_deleted: bool = False
    teacher_reply: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime


class DanmakuStateResponse(BaseModel):
    is_open: bool
    session_id: Optional[int] = None
    class_name: str
    remaining_seconds: int = Field(0, ge=0, le=2400)
    messages: List[DanmakuMessageResponse] = Field(default_factory=list)
    upvoted_message_ids: List[int] = Field(default_factory=list)


class DanmakuHistoryResponse(BaseModel):
    items: List[DanmakuMessageResponse] = Field(default_factory=list)
    total: int
    page: int
    page_size: int


class DanmakuUpvoteResponse(BaseModel):
    message_id: int
    upvoted: bool
    upvote_count: int


class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=6, max_length=100)
    new_password: str = Field(..., min_length=6, max_length=100)

class SubjectBase(BaseModel):
    name: str = Field(..., max_length=50)
    display_name: str = Field(..., max_length=50)
    sort_order: int = 0

class SubjectResponse(SubjectBase):
    id: int
    
    class Config:
        from_attributes = True

class TextbookNodeResponse(BaseModel):
    id: int
    subject_id: int
    parent_id: Optional[int] = None
    name: str
    node_type: str
    sort_order: int = 0
    children: List["TextbookNodeResponse"] = Field(default_factory=list)

    class Config:
        from_attributes = True

class TextbookNodeCreate(BaseModel):
    subject_id: int
    parent_id: Optional[int] = None
    name: str = Field(..., max_length=200)
    node_type: str = Field(..., pattern="^(book|chapter|section)$")
    sort_order: int = 0

class TextbookNodeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    sort_order: Optional[int] = None


class TextbookImportNode(BaseModel):
    name: str = Field(..., max_length=200)
    children: List["TextbookImportNode"] = Field(default_factory=list)


class TextbookImportRequest(BaseModel):
    subject_id: int
    replace_existing: bool = True
    use_preset: bool = False
    books: List[TextbookImportNode] = Field(default_factory=list)

class StatsOverview(BaseModel):
    total_users: int
    total_students: int
    total_teachers: int
    total_animations: int
    total_views: int
    total_favorites: int
    total_ratings: int

class StatsAnimation(BaseModel):
    animation_id: int
    title: str
    view_count: int
    avg_rating: Optional[float]
    rating_count: int
    favorite_count: int

class StatsUser(BaseModel):
    user_id: int
    username: str
    real_name: Optional[str]
    class_name: Optional[str]
    total_views: int
    total_duration: int
    total_interactions: int
    total_favorites: int


TextbookNodeResponse.model_rebuild()
TextbookImportNode.model_rebuild()
