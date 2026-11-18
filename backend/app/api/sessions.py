import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import AttendanceSession, Service, User
from app.schemas import SessionCountUpdate, SessionCreate, SessionOut
from app.security import get_current_user, require_admin
from app.sessions_service import (
    TransitionError,
    apply_demo_count,
    confirm_session,
    effective_duration,
    end_session,
    pause_session,
    resume_session,
    start_session,
)

router = APIRouter()


def _to_session_out(s: AttendanceSession, creator_name: str = "") -> SessionOut:
    return SessionOut(
        id=s.id,
        church_id=s.church_id,
        service_id=s.service_id,
        service_name=s.service_name_snapshot,
        service_type=s.service_type,
        attendance_date=s.attendance_date,
        description=s.description,
        total_count=s.total_count,
        count_source=s.count_source,
        status="Confirmed" if s.status == "confirmed" else ("Pending" if s.status == "completed" else s.status),
        accumulated_seconds=s.accumulated_seconds,
        duration_seconds=s.duration_seconds,
        effective_seconds=effective_duration(s),
        started_at=s.started_at,
        ended_at=s.ended_at,
        created_by=s.created_by,
        created_by_name=creator_name,
        created_at=s.created_at,
    )


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service_name = payload.service_name.strip()
    service_id = payload.service_id

    if service_id:
        svc = db.scalar(
            select(Service).where(
                Service.id == service_id,
                Service.church_id == current_user.church_id,
            )
        )
        if not svc:
            service_id = None
        else:
            service_name = svc.name

    now = datetime.now(timezone.utc)
    session = AttendanceSession(
        id=uuid.uuid4(),
        church_id=current_user.church_id,
        service_id=service_id,
        created_by=current_user.id,
        service_name_snapshot=service_name,
        service_type=payload.service_type.strip(),
        attendance_date=payload.attendance_date,
        description=payload.description.strip(),
        total_count=0,
        count_source=None,
        status="ready",
        accumulated_seconds=0,
        duration_seconds=0,
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return _to_session_out(session, current_user.full_name)


@router.get("", response_model=list[SessionOut])
def list_sessions(
    service_type: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    search: str | None = Query(None),
    sort_by: str = Query("date", pattern="^(date|attendance|duration)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        select(AttendanceSession, User.full_name)
        .join(User, AttendanceSession.created_by == User.id)
        .where(AttendanceSession.church_id == current_user.church_id)
    )

    if service_type and service_type.lower() != "all":
        query = query.where(AttendanceSession.service_type == service_type)

    if status_filter and status_filter.lower() != "all":
        if status_filter.lower() == "confirmed":
            query = query.where(AttendanceSession.status == "confirmed")
        elif status_filter.lower() == "pending":
            query = query.where(AttendanceSession.status.in_(["completed", "ready", "recording", "paused"]))
        else:
            query = query.where(AttendanceSession.status == status_filter.lower())

    if from_date:
        query = query.where(AttendanceSession.attendance_date >= from_date)
    if to_date:
        query = query.where(AttendanceSession.attendance_date <= to_date)

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.where(
            func.lower(AttendanceSession.service_name_snapshot).like(s)
            | func.lower(AttendanceSession.description).like(s)
        )

    # Sorting
    direction = AttendanceSession.attendance_date.desc()
    if sort_by == "date":
        direction = AttendanceSession.attendance_date.asc() if sort_order == "asc" else AttendanceSession.attendance_date.desc()
    elif sort_by == "attendance":
        direction = AttendanceSession.total_count.asc() if sort_order == "asc" else AttendanceSession.total_count.desc()
    elif sort_by == "duration":
        direction = AttendanceSession.duration_seconds.asc() if sort_order == "asc" else AttendanceSession.duration_seconds.desc()

    query = query.order_by(direction, AttendanceSession.created_at.desc()).limit(limit).offset(offset)
    results = db.execute(query).all()

    return [_to_session_out(row[0], row[1]) for row in results]


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = db.execute(
        select(AttendanceSession, User.full_name)
        .join(User, AttendanceSession.created_by == User.id)
        .where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    ).first()

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    return _to_session_out(result[0], result[1])


@router.post("/{session_id}/start", response_model=SessionOut)
def start_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    try:
        start_session(session)
        db.commit()
        db.refresh(session)
    except TransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc

    return _to_session_out(session, current_user.full_name)


@router.post("/{session_id}/pause", response_model=SessionOut)
def pause_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    try:
        pause_session(session)
        db.commit()
        db.refresh(session)
    except TransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc

    return _to_session_out(session, current_user.full_name)


@router.post("/{session_id}/resume", response_model=SessionOut)
def resume_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    try:
        resume_session(session)
        db.commit()
        db.refresh(session)
    except TransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc

    return _to_session_out(session, current_user.full_name)


@router.post("/{session_id}/end", response_model=SessionOut)
def end_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    try:
        end_session(session)
        db.commit()
        db.refresh(session)
    except TransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc

    return _to_session_out(session, current_user.full_name)


@router.post("/{session_id}/count", response_model=SessionOut)
def update_attendance_count(
    session_id: uuid.UUID,
    payload: SessionCountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    settings = get_settings()
    if payload.count_source == "demo":
        try:
            apply_demo_count(session, payload.total_count, allowed=settings.allow_demo_counts)
        except (TransitionError, PermissionError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    else:
        if session.status == "completed":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A completed session cannot modify count.")
        session.total_count = payload.total_count
        session.count_source = payload.count_source
        session.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)
    return _to_session_out(session, current_user.full_name)


@router.post("/{session_id}/confirm", response_model=SessionOut)
def confirm_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    try:
        confirm_session(session)
        db.commit()
        db.refresh(session)
    except TransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc

    return _to_session_out(session, current_user.full_name)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.id == session_id,
            AttendanceSession.church_id == current_user.church_id,
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    db.delete(session)
    db.commit()
    return None
