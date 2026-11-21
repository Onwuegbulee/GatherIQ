from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.rate_limit import enforce_auth_rate_limit
from app.schemas import ChangePasswordRequest, LoginRequest, SetupRequest, TokenResponse, UserOut
from app.security import (
    COOKIE_NAME,
    create_access_token,
    get_current_user,
    hash_password,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.setup import create_church_with_admin

router = APIRouter()


def _set_refresh_cookie(response: Response, raw_token: str, remember: bool) -> None:
    settings = get_settings()
    max_age = (settings.refresh_remember_days * 86400) if remember else (settings.refresh_session_hours * 3600)
    response.set_cookie(
        key=COOKIE_NAME,
        value=raw_token,
        max_age=max_age,
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.effective_cookie_samesite,  # type: ignore
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.effective_cookie_samesite,  # type: ignore
    )


@router.post("/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def setup_church_and_admin(
    payload: SetupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    enforce_auth_rate_limit(request)
    try:
        user = create_church_with_admin(
            db,
            church_name=payload.church_name,
            church_location=payload.church_location,
            full_name=payload.full_name,
            email=payload.email,
            password=payload.password,
            role="admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    access_token, expires_in = create_access_token(user)
    refresh_raw = issue_refresh_token(db, user, remember=True)
    _set_refresh_cookie(response, refresh_raw, remember=True)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    enforce_auth_rate_limit(request)
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required.",
        )

    user = db.scalar(select(User).where(User.email == email))

    if user is None or not verify_password(user.password_hash, password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    access_token, expires_in = create_access_token(user)
    refresh_raw = issue_refresh_token(db, user, remember=payload.remember)
    _set_refresh_cookie(response, refresh_raw, remember=payload.remember)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token_endpoint(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    raw_token = request.cookies.get(COOKIE_NAME)
    if not raw_token:
        auth_header = request.headers.get("X-Refresh-Token")
        if auth_header:
            raw_token = auth_header.strip()

    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required.")

    new_raw, user = rotate_refresh_token(db, raw_token)
    access_token, expires_in = create_access_token(user)
    _set_refresh_cookie(response, new_raw, remember=True)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    raw_token = request.cookies.get(COOKIE_NAME)
    if raw_token:
        revoke_refresh_token(db, raw_token)
    _clear_refresh_cookie(response)
    return {"message": "Logged out successfully."}


@router.get("/me", response_model=UserOut)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    return UserOut.model_validate(current_user)


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(current_user.password_hash, payload.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password.",
        )
    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"message": "Password updated successfully."}
