from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import HTMLResponse, RedirectResponse
import json
import secrets
from urllib.parse import urlparse
from sqlalchemy.orm import Session
from ..auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_active_user
)
from ..database import get_db, settings
from ..models import User
from ..oidc import OidcAuthError, create_login_state, exchange_code_for_claims, issue_local_token_for_claims
from ..schemas import ChangePasswordRequest, Token, UserResponse

router = APIRouter(prefix="/api/auth", tags=["认证"])
OIDC_CALLBACK_PATH = "/api/auth/oidc/callback"


def _normalize_path_prefix(value: str | None) -> str:
    if not value:
        return ""
    prefix = value.strip()
    if not prefix or prefix == "/":
        return ""
    if not prefix.startswith("/"):
        prefix = f"/{prefix}"
    return prefix.rstrip("/")


def _frontend_home_path(request: Request) -> str:
    forwarded_prefix = _normalize_path_prefix(
        request.headers.get("x-forwarded-prefix") or request.headers.get("x-script-name")
    )
    if forwarded_prefix:
        return f"{forwarded_prefix}/home"

    redirect_path = urlparse(settings.oidc_redirect_uri).path
    redirect_prefix = ""
    if redirect_path.endswith(OIDC_CALLBACK_PATH):
        redirect_prefix = _normalize_path_prefix(redirect_path[: -len(OIDC_CALLBACK_PATH)])
    return f"{redirect_prefix}/home" if redirect_prefix else "/home"

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    # 本系统已切换为统一认证（SSO）登录，本地账号密码登录停用
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="本系统已切换为统一认证登录，请通过统一平台入口登录",
    )


@router.get("/oidc/login")
async def oidc_login():
    login_state = create_login_state()
    response = RedirectResponse(login_state["authorization_url"], status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie("edusimu_oidc_state", login_state["state"], httponly=True, samesite="lax", max_age=600, path="/")
    response.set_cookie(
        "edusimu_oidc_verifier",
        login_state["code_verifier"],
        httponly=True,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return response


@router.get("/oidc/callback", response_class=HTMLResponse)
async def oidc_callback(code: str, state: str, request: Request, db: Session = Depends(get_db)):
    expected_state = request.cookies.get("edusimu_oidc_state")
    code_verifier = request.cookies.get("edusimu_oidc_verifier")
    if not expected_state or not code_verifier or not secrets.compare_digest(expected_state, state):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OIDC state")
    try:
        claims = exchange_code_for_claims(code, code_verifier)
        access_token = issue_local_token_for_claims(db, claims)
    except OidcAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    home_path = _frontend_home_path(request)
    html = f"""<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>统一认证登录中</title></head>
<body>
<p>统一认证成功，正在进入 edusimu...</p>
<script>
localStorage.setItem("token", {json.dumps(access_token)});
localStorage.setItem("edusimu_sso", "1");
location.replace({json.dumps(home_path)});
</script>
</body>
</html>"""
    response = HTMLResponse(html)
    response.delete_cookie("edusimu_oidc_state", path="/")
    response.delete_cookie("edusimu_oidc_verifier", path="/")
    return response

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_active_user)):
    return {"message": "登出成功"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码错误")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与当前密码相同")

    current_user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"message": "密码修改成功"}
