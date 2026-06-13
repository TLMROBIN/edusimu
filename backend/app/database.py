from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = BACKEND_DIR / "edusimu.db"
DEFAULT_UPLOAD_DIR = BACKEND_DIR / "uploads"

class Settings(BaseSettings):
    database_url: str = f"sqlite:///{DEFAULT_DB_PATH}"
    secret_key: str = "your-secret-key-change-this-in-production-please"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    oidc_enabled: bool = False
    oidc_issuer: str = "http://10.50.159.62/auth/realms/school-platform"
    oidc_client_id: str = "edusimu"
    oidc_client_secret: str | None = None
    oidc_redirect_uri: str = "http://10.50.159.62/edusimu/api/auth/oidc/callback"
    oidc_scope: str = "openid profile email"
    admin_username: str = "admin"
    admin_password: str = "admin123"
    upload_dir: str = str(DEFAULT_UPLOAD_DIR)
    max_file_size: int = 52428800

    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"))

settings = Settings()

upload_path = Path(settings.upload_dir)
if not upload_path.is_absolute():
    upload_path = (BACKEND_DIR / upload_path).resolve()
settings.upload_dir = str(upload_path)

engine_kwargs = {"pool_pre_ping": True}
if settings.database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 20
    engine_kwargs["max_overflow"] = 40

engine = create_engine(settings.database_url, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
