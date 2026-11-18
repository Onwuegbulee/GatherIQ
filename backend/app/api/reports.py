from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AttendanceSession, ChurchSettings, User
from app.schemas import AnalyticsOverview
from app.security import get_current_user

router = APIRouter()


@router.get("/overview", response_model=AnalyticsOverview)
def get_analytics_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = db.scalars(
        select(AttendanceSession)
        .where(AttendanceSession.church_id == current_user.church_id)
        .order_by(AttendanceSession.attendance_date.desc())
    ).all()

    settings = db.scalar(
        select(ChurchSettings).where(ChurchSettings.church_id == current_user.church_id)
    )
    target = settings.attendance_target if settings else 1300

    total_sessions = len(sessions)
    total_attendance = sum(s.total_count for s in sessions)
    confirmed_sessions = sum(1 for s in sessions if s.status == "confirmed")
    pending_sessions = total_sessions - confirmed_sessions
    latest_attendance = sessions[0].total_count if sessions else 0

    sundays = [s for s in sessions if "sunday" in s.service_type.lower()]
    sunday_avg = int(sum(s.total_count for s in sundays) / len(sundays)) if sundays else 0

    # Growth rate between latest Sunday and previous Sunday
    growth = 0.0
    if len(sundays) >= 2 and sundays[1].total_count > 0:
        prev = sundays[1].total_count
        curr = sundays[0].total_count
        growth = round(((curr - prev) / prev) * 100.0, 1)

    target_pct = round((sundays[0].total_count / max(1, target)) * 100.0, 1) if sundays else 0.0

    return AnalyticsOverview(
        total_attendance=total_attendance,
        total_sessions=total_sessions,
        confirmed_sessions=confirmed_sessions,
        pending_sessions=pending_sessions,
        latest_attendance=latest_attendance,
        sunday_average=sunday_avg,
        growth_rate=growth,
        target_completion_pct=target_pct,
    )
