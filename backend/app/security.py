import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

ph = PasswordHasher()
bearer_scheme = HTTPBearer(auto_error=False)
COOKIE_NAME = "cc_refresh"


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


def create_access_token(user: User) -> tuple[str, int]:
    settings = get_settings()
    minutes = settings.jwt_access_minutes
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "church_id": str(user.church_id),
        "role": user.role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return token, minutes * 60


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return payload


def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, digest


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def refresh_expiry(remember: bool) -> datetime:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if remember:
        return now + timedelta(days=settings.refresh_remember_days)
    return now + timedelta(hours=settings.refresh_session_hours)


def issue_refresh_token(db: Session, user: User, remember: bool) -> str:
    from app.models import RefreshToken

    raw, digest = new_refresh_token()
    token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token_hash=digest,
        expires_at=refresh_expiry(remember),
        remember=remember,
        created_at=datetime.now(timezone.utc),
    )
    db.add(token)
    db.commit()
    return raw


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[str, User]:
    from app.models import RefreshToken

    digest = hash_refresh_token(raw_token)
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    now = datetime.now(timezone.utc)
    expires_at = token.expires_at if token and token.expires_at.tzinfo is not None else (token.expires_at.replace(tzinfo=timezone.utc) if token else now)

    if token is None or token.revoked_at is not None or expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session. Please log in again.")

    user = db.scalar(select(User).where(User.id == token.user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or not found.")

    new_raw, new_digest = new_refresh_token()
    new_token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token_hash=new_digest,
        expires_at=refresh_expiry(token.remember),
        remember=token.remember,
        created_at=now,
    )
    db.add(new_token)
    db.flush()

    token.revoked_at = now
    token.replaced_by_id = new_token.id
    db.commit()
    return new_raw, user


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    from app.models import RefreshToken

    digest = hash_refresh_token(raw_token)
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    if token and token.revoked_at is None:
        token.revoked_at = datetime.now(timezone.utc)
        db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    payload = decode_access_token(credentials.credentials)
    try:
        user_id = uuid.UUID(payload["sub"])
        church_id = uuid.UUID(payload["church_id"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.") from exc
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active or user.church_id != church_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator permissions required.")
    return user
