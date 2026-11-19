import uuid
from datetime import datetime, timezone
from typing import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ActivityLog, AttendanceSession, Church, ChurchSettings, Service, User, utcnow
from app.schemas import (
    ActivityLogOut,
    ChurchOut,
    PlatformOverviewOut,
    SuperAdminRegisterChurchRequest,
    SuperAdminResetPasswordRequest,
    SuperAdminUpdateChurchRequest,
    UserOut,
)
from app.security import hash_password, require_super_admin
from app.setup import create_church_with_admin

router = APIRouter()


def log_activity(
    db: Session,
    *,
    user: User,
    action: str,
    target_type: str = "",
    target_id: str = "",
    details: str = "",
    ip_address: str = "",
    church_id: uuid.UUID | None = None,
):
    entry = ActivityLog(
        id=uuid.uuid4(),
        user_id=user.id,
        user_email=user.email,
        church_id=church_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        details=details,
        ip_address=ip_address,
        created_at=utcnow(),
    )
    db.add(entry)
    db.flush()


def _church_to_out(church: Church, db: Session) -> ChurchOut:
    admin_user = db.scalar(select(User).where(User.church_id == church.id, User.role == "admin").limit(1))
    session_stats = db.execute(
        select(
            func.count(AttendanceSession.id).label("total_sessions"),
            func.coalesce(func.sum(AttendanceSession.total_count), 0).label("total_attendance"),
        ).where(AttendanceSession.church_id == church.id)
    ).first()

    return ChurchOut(
        id=church.id,
        name=church.name,
        location=church.location,
        email=church.email,
        phone=church.phone,
        is_active=church.is_active,
        created_at=church.created_at,
        updated_at=church.updated_at,
        admin_name=admin_user.full_name if admin_user else None,
        admin_email=admin_user.email if admin_user else None,
        total_sessions=session_stats.total_sessions if session_stats else 0,
        total_attendance=session_stats.total_attendance if session_stats else 0,
    )


# ---------------------------------------------------------------------------
# Platform Overview & Analytics
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=PlatformOverviewOut)
def get_platform_overview(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    total_churches = db.scalar(select(func.count(Church.id))) or 0
    active_churches = db.scalar(select(func.count(Church.id)).where(Church.is_active == True)) or 0
    suspended_churches = db.scalar(select(func.count(Church.id)).where(Church.is_active == False)) or 0
    total_administrators = db.scalar(select(func.count(User.id)).where(User.role == "admin")) or 0
    total_sessions = db.scalar(select(func.count(AttendanceSession.id))) or 0
    total_attendance = db.scalar(select(func.coalesce(func.sum(AttendanceSession.total_count), 0))) or 0

    logs = db.scalars(
        select(ActivityLog).order_by(desc(ActivityLog.created_at)).limit(10)
    ).all()

    return PlatformOverviewOut(
        total_churches=total_churches,
        active_churches=active_churches,
        suspended_churches=suspended_churches,
        total_administrators=total_administrators,
        total_sessions=total_sessions,
        total_attendance_recorded=total_attendance,
        recent_activity=[ActivityLogOut.model_validate(l) for l in logs],
    )


# ---------------------------------------------------------------------------
# Church Registration & Management
# ---------------------------------------------------------------------------

@router.post("/churches", response_model=ChurchOut, status_code=status.HTTP_201_CREATED)
def register_church(
    payload: SuperAdminRegisterChurchRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    try:
        admin_user = create_church_with_admin(
            db,
            church_name=payload.church_name,
            church_location=payload.location,
            church_email=payload.church_email,
            church_phone=payload.phone,
            full_name=payload.admin_full_name,
            email=payload.admin_email,
            password=payload.initial_password,
            must_change_password=True,
            role="admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    church = db.scalar(select(Church).where(Church.id == admin_user.church_id))
    log_activity(
        db,
        user=current_admin,
        action="REGISTER_CHURCH",
        target_type="Church",
        target_id=str(church.id),
        details=f"Registered church '{church.name}' with admin {admin_user.email}",
        ip_address=request.client.host if request.client else "",
        church_id=church.id,
    )
    db.commit()
    return _church_to_out(church, db)


@router.get("/churches", response_model=list[ChurchOut])
def list_churches(
    q: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    stmt = select(Church).order_by(desc(Church.created_at))
    churches = db.scalars(stmt).all()

    result = []
    for c in churches:
        out = _church_to_out(c, db)
        if q:
            term = q.strip().lower()
            matched = (
                term in out.name.lower()
                or term in out.location.lower()
                or (out.email and term in out.email.lower())
                or (out.admin_email and term in out.admin_email.lower())
                or (out.admin_name and term in out.admin_name.lower())
            )
            if not matched:
                continue
        if status_filter == "active" and not out.is_active:
            continue
        if status_filter == "suspended" and out.is_active:
            continue
        result.append(out)

    return result


@router.get("/churches/{church_id}", response_model=ChurchOut)
def get_church(
    church_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    church = db.scalar(select(Church).where(Church.id == church_id))
    if not church:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Church not found.")
    return _church_to_out(church, db)


@router.patch("/churches/{church_id}", response_model=ChurchOut)
def update_church(
    church_id: uuid.UUID,
    payload: SuperAdminUpdateChurchRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    church = db.scalar(select(Church).where(Church.id == church_id))
    if not church:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Church not found.")

    changes = []
    if payload.name is not None and payload.name.strip():
        church.name = payload.name.strip()
        changes.append(f"name: {church.name}")
    if payload.location is not None:
        church.location = payload.location.strip()
        changes.append(f"location: {church.location}")
    if payload.email is not None:
        church.email = payload.email.strip()
        changes.append(f"email: {church.email}")
    if payload.phone is not None:
        church.phone = payload.phone.strip()
        changes.append(f"phone: {church.phone}")
    if payload.is_active is not None:
        church.is_active = payload.is_active
        changes.append(f"is_active: {church.is_active}")

    church.updated_at = utcnow()
    log_activity(
        db,
        user=current_admin,
        action="UPDATE_CHURCH",
        target_type="Church",
        target_id=str(church.id),
        details=", ".join(changes),
        ip_address=request.client.host if request.client else "",
        church_id=church.id,
    )
    db.commit()
    db.refresh(church)
    return _church_to_out(church, db)


@router.post("/churches/{church_id}/toggle-status", response_model=ChurchOut)
def toggle_church_status(
    church_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    church = db.scalar(select(Church).where(Church.id == church_id))
    if not church:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Church not found.")

    church.is_active = not church.is_active
    church.updated_at = utcnow()
    action = "ACTIVATE_CHURCH" if church.is_active else "SUSPEND_CHURCH"
    log_activity(
        db,
        user=current_admin,
        action=action,
        target_type="Church",
        target_id=str(church.id),
        details=f"Church status set to {'active' if church.is_active else 'suspended'}",
        ip_address=request.client.host if request.client else "",
        church_id=church.id,
    )
    db.commit()
    db.refresh(church)
    return _church_to_out(church, db)


# ---------------------------------------------------------------------------
# Administrator Management
# ---------------------------------------------------------------------------

@router.get("/administrators", response_model=list[UserOut])
def list_administrators(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    users = db.scalars(select(User).order_by(desc(User.created_at))).all()
    return [UserOut.model_validate(u) for u in users]


@router.post("/administrators/{user_id}/reset-password", status_code=status.HTTP_200_OK)
def reset_administrator_password(
    user_id: uuid.UUID,
    payload: SuperAdminResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = True
    log_activity(
        db,
        user=current_admin,
        action="RESET_ADMIN_PASSWORD",
        target_type="User",
        target_id=str(user.id),
        details=f"Password reset for {user.email}",
        ip_address=request.client.host if request.client else "",
        church_id=user.church_id,
    )
    db.commit()
    return {"message": f"Password reset for {user.email}. User must change password on next login."}


# ---------------------------------------------------------------------------
# Attendance Analytics & Activity Logs
# ---------------------------------------------------------------------------

@router.get("/activity-logs", response_model=list[ActivityLogOut])
def get_activity_logs(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    logs = db.scalars(
        select(ActivityLog).order_by(desc(ActivityLog.created_at)).limit(limit)
    ).all()
    return [ActivityLogOut.model_validate(l) for l in logs]


@router.get("/churches/{church_id}/attendance-stats")
def get_church_attendance_stats(
    church_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_super_admin),
):
    church = db.scalar(select(Church).where(Church.id == church_id))
    if not church:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Church not found.")

    sessions = db.scalars(
        select(AttendanceSession)
        .where(AttendanceSession.church_id == church_id)
        .order_by(desc(AttendanceSession.attendance_date))
        .limit(20)
    ).all()

    return {
        "church_id": str(church.id),
        "church_name": church.name,
        "total_sessions": len(sessions),
        "history": [
            {
                "id": str(s.id),
                "date": s.attendance_date.isoformat(),
                "service_name": s.service_name_snapshot,
                "total_count": s.total_count,
                "status": s.status,
                "count_source": s.count_source,
                "duration_seconds": s.duration_seconds,
            }
            for s in sessions
        ],
    }
