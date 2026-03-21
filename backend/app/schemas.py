from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    role: str = Field(..., pattern="^(student|teacher|admin)$")
    real_name: Optional[str] = Field(None, max_length=100)
    grade_level: Optional[str] = Field(None, max_length=50)
    class_name: Optional[str] = Field(None, max_length=50)

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=100)

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
