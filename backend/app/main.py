import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import SessionLocal, settings
from .init_db import init_database
from .routers import admin, animations, auth, favorites_ratings, stats, users

app = FastAPI(
    title="教育动画展示系统",
    description="支持HTML动画上传、播放、互动和学习记录追踪",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(animations.router)
app.include_router(favorites_ratings.router)
app.include_router(stats.router)
app.include_router(admin.router)

@app.on_event("startup")
def startup():
    db = SessionLocal()
    try:
        init_database(db)
    finally:
        db.close()

@app.get("/")
async def root():
    return {"message": "教育动画展示系统 API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
