from __future__ import annotations

import base64
import hashlib
import json
import secrets
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from jose import jwt
from sqlalchemy.orm import Session

from .auth import create_access_token
from .database import settings
from .models import User


class OidcAuthError(ValueError):
    pass


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def create_login_state() -> dict[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = _base64url(hashlib.sha256(verifier.encode("ascii")).digest())
    state = secrets.token_urlsafe(24)
    params = {
        "response_type": "code",
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "scope": settings.oidc_scope,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return {
        "state": state,
        "code_verifier": verifier,
        "authorization_url": f"{settings.oidc_issuer.rstrip('/')}/protocol/openid-connect/auth?{urlencode(params)}",
    }


def _post_form(url: str, data: dict[str, str]) -> dict:
    encoded = urlencode(data).encode("utf-8")
    request = Request(url, data=encoded, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _get_json(url: str) -> dict:
    with urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def exchange_code_for_claims(code: str, code_verifier: str) -> dict:
    token_data = {
        "grant_type": "authorization_code",
        "client_id": settings.oidc_client_id,
        "code": code,
        "redirect_uri": settings.oidc_redirect_uri,
        "code_verifier": code_verifier,
    }
    if settings.oidc_client_secret:
        token_data["client_secret"] = settings.oidc_client_secret
    token_payload = _post_form(
        f"{settings.oidc_issuer.rstrip('/')}/protocol/openid-connect/token",
        token_data,
    )
    id_token = token_payload.get("id_token")
    if not id_token:
        raise OidcAuthError("OIDC token response did not include id_token")
    jwks = _get_json(f"{settings.oidc_issuer.rstrip('/')}/protocol/openid-connect/certs")
    try:
        return jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=settings.oidc_client_id,
            issuer=settings.oidc_issuer.rstrip("/"),
        )
    except Exception as exc:
        raise OidcAuthError("OIDC id_token validation failed") from exc


def issue_local_token_for_claims(db: Session, claims: dict) -> str:
    username = claims.get("preferred_username") or claims.get("email", "").split("@", 1)[0]
    if not username:
        raise OidcAuthError("OIDC claims did not include a usable username")
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        user = User(
            username=username,
            password_hash="oidc-only",
            role="student",
            real_name=claims.get("name") or username,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    if not user.is_active:
        raise OidcAuthError("OIDC user is disabled")
    return create_access_token({"sub": user.username, "role": user.role})
