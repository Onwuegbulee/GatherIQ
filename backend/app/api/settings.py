from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Church, ChurchSettings, User
from app.schemas import ChurchSettingsOut, ChurchSettingsUpdate
from app.security import get_current_user, require_admin

router = APIRouter()


@router.get("", response_model=ChurchSettingsOut)
def get_church_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    church = db.scalar(select(Church).where(Church.id == current_user.church_id))
    if not church:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Church not found.")

    settings = db.scalar(select(ChurchSettings).where(ChurchSettings.church_id == current_user.church_id))
    if not settings:
        now = datetime.now(timezone.utc)
        settings = ChurchSettings(
            church_id=current_user.church_id,
            attendance_target=1300,
            notify_on_save=True,
            notify_weekly=False,
            compact_tables=False,
            updated_at=now,
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return ChurchSettingsOut(
        church_id=settings.church_id,
        attendance_target=settings.attendance_target,
        notify_on_save=settings.notify_on_save,
        notify_weekly=settings.notify_weekly,
        compact_tables=settings.compact_tables,
        church_name=church.name,
        church_location=church.location,
        updated_at=settings.updated_at,
    )


@router.put("", response_model=ChurchSettingsOut)
def update_church_settings(
    payload: ChurchSettingsUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    church = db.scalar(select(Church).where(Church.id == current_user.church_id))
    if not church:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Church not found.")

    settings = db.scalar(select(ChurchSettings).where(ChurchSettings.church_id == current_user.church_id))
    now = datetime.now(timezone.utc)
    if not settings:
        settings = ChurchSettings(church_id=current_user.church_id, updated_at=now)
        db.add(settings)

    if payload.attendance_target is not None:
        settings.attendance_target = payload.attendance_target
    if payload.notify_on_save is not None:
        settings.notify_on_save = payload.notify_on_save
    if payload.notify_weekly is not None:
        settings.notify_weekly = payload.notify_weekly
    if payload.compact_tables is not None:
        settings.compact_tables = payload.compact_tables

    if payload.church_name is not None:
        church.name = payload.church_name.strip()
        church.updated_at = now
    if payload.church_location is not None:
        church.location = payload.church_location.strip()
        church.updated_at = now

    settings.updated_at = now
    db.commit()
    db.refresh(settings)
    db.refresh(church)

    return ChurchSettingsOut(
        church_id=settings.church_id,
        attendance_target=settings.attendance_target,
        notify_on_save=settings.notify_on_save,
        notify_weekly=settings.notify_weekly,
        compact_tables=settings.compact_tables,
        church_name=church.name,
        church_location=church.location,
        updated_at=settings.updated_at,
    )
