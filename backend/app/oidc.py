from __future__ import annotations

import base64
import hashlib
import json
import re
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


ROLE_ALIASES = {
    "admin": {"admin", "administrator", "admins", "systemadmin", "sysadmin", "系统管理员", "管理员"},
    "teacher": {"teacher", "teachers", "faculty", "instructor", "staff", "教师", "老师"},
    "student": {"student", "students", "learner", "pupil", "学生"},
}
ROLE_PRECEDENCE = ("admin", "teacher", "student")


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


def _claim_strings(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple, set)):
        items = []
        for item in value:
            items.extend(_claim_strings(item))
        return items
    if isinstance(value, dict):
        items = []
        for item in value.values():
            items.extend(_claim_strings(item))
        return items
    return [str(value)]


def _normalized_role_tokens(value: str) -> set[str]:
    normalized = value.strip().lower()
    tokens = {normalized}
    tokens.update(part for part in re.split(r"[^0-9a-z\u4e00-\u9fff]+", normalized) if part)
    return tokens


def _extract_role_values(claims: dict) -> list[str]:
    values = []
    for key in ("edusimu_role", "role", "roles", "groups"):
        values.extend(_claim_strings(claims.get(key)))

    realm_access = claims.get("realm_access")
    if isinstance(realm_access, dict):
        values.extend(_claim_strings(realm_access.get("roles")))

    resource_access = claims.get("resource_access")
    if isinstance(resource_access, dict):
        client_access = resource_access.get(settings.oidc_client_id)
        if isinstance(client_access, dict):
            values.extend(_claim_strings(client_access.get("roles")))

    return values


def _infer_role_from_claims(claims: dict) -> str | None:
    matched_roles = set()
    for value in _extract_role_values(claims):
        tokens = _normalized_role_tokens(value)
        for role, aliases in ROLE_ALIASES.items():
            if tokens.intersection(aliases):
                matched_roles.add(role)

    for role in ROLE_PRECEDENCE:
        if role in matched_roles:
            return role
    return None


def _first_claim(claims: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _username_candidates(claims: dict) -> list[str]:
    candidates = []
    for key in ("preferred_username", "username", "email", "sub"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            candidate = value.strip()
            candidates.append(candidate)
            if key == "email" and "@" in candidate:
                candidates.append(candidate.split("@", 1)[0])

    unique_candidates = []
    for candidate in candidates:
        if candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return unique_candidates


def issue_local_token_for_claims(db: Session, claims: dict) -> str:
    username_candidates = _username_candidates(claims)
    username = username_candidates[0] if username_candidates else None
    if not username:
        raise OidcAuthError("OIDC claims did not include a usable username")
    user = db.query(User).filter(User.username.in_(username_candidates)).first()
    if user is None:
        role = _infer_role_from_claims(claims)
        if role is None:
            raise OidcAuthError("OIDC claims did not include an explicit edusimu role")
        user = User(
            username=username,
            password_hash="oidc-only",
            role=role,
            real_name=claims.get("name") or username,
            grade_level=_first_claim(claims, ("grade_level", "grade", "school_grade")),
            class_name=_first_claim(claims, ("class_name", "class", "classroom", "homeroom")),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    if not user.is_active:
        raise OidcAuthError("OIDC user is disabled")
    return create_access_token({"sub": user.username, "role": user.role})
