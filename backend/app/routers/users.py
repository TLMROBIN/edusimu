from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..auth import get_password_hash, require_role
from ..database import get_db
from ..models import User
from ..schemas import UserBatchCreate, UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/api/users", tags=["用户管理"])

@router.get("/", response_model=List[UserResponse])
async def get_users(
    role: str = None,
    grade_level: str = None,
    class_name: str = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if grade_level:
        query = query.filter(User.grade_level == grade_level)
    if class_name:
        query = query.filter(User.class_name == class_name)
    users = query.offset(skip).limit(limit).all()
    return users

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    db_user = db.query(User).filter(User.username == user_data.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    user = User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
        real_name=user_data.real_name,
        grade_level=user_data.grade_level,
        class_name=user_data.class_name,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/batch-create", status_code=status.HTTP_201_CREATED)
async def batch_create_users(
    users_data: UserBatchCreate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    total_count = len(users_data.users)
    created_count = 0
    errors = []

    if total_count == 0:
        return {
            "message": "没有可导入的用户数据",
            "total_count": 0,
            "created_count": 0,
            "error_count": 0,
            "errors": []
        }

    requested_usernames = {
        user_data.username.strip()
        for user_data in users_data.users
        if user_data.username and user_data.username.strip()
    }
    existing_usernames = set(
        db.scalars(
            select(User.username).where(User.username.in_(requested_usernames))
        ).all()
    )
    seen_usernames = set(existing_usernames)

    for index, user_data in enumerate(users_data.users, start=1):
        username = user_data.username.strip()

        if username in existing_usernames:
            errors.append(f"第 {index} 条用户名 {username} 已存在")
            continue

        if username in seen_usernames:
            errors.append(f"第 {index} 条用户名 {username} 在本次导入中重复")
            continue

        try:
            user = User(
                username=username,
                password_hash=get_password_hash(user_data.password),
                role=user_data.role,
                real_name=user_data.real_name,
                grade_level=user_data.grade_level,
                class_name=user_data.class_name,
                is_active=True
            )
            db.add(user)
            db.commit()
            seen_usernames.add(username)
            created_count += 1
        except IntegrityError:
            db.rollback()
            errors.append(f"第 {index} 条用户名 {username} 已存在")
        except Exception as e:
            db.rollback()
            errors.append(f"第 {index} 条创建失败: {str(e)}")

    error_count = len(errors)
    if created_count == total_count:
        message = f"成功创建 {created_count} 个用户"
    elif created_count > 0:
        message = f"成功创建 {created_count} 个用户，失败 {error_count} 个"
    else:
        message = f"未创建任何用户，失败 {error_count} 个"

    return {
        "message": message,
        "total_count": total_count,
        "created_count": created_count,
        "error_count": error_count,
        "errors": errors
    }

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user_data.username is not None and user_data.username != user.username:
        existing_user = db.query(User).filter(User.username == user_data.username).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="用户名已存在")
        user.username = user_data.username
    
    if user_data.real_name is not None:
        user.real_name = user_data.real_name
    if user_data.grade_level is not None:
        user.grade_level = user_data.grade_level
    if user_data.class_name is not None:
        user.class_name = user_data.class_name
    if user_data.role is not None:
        user.role = user_data.role
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    if user.role == "admin" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="无权删除管理员账号")
    
    db.delete(user)
    db.commit()
    return {"message": "用户已删除"}
