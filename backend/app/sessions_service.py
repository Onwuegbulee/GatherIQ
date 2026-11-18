from datetime import datetime, timezone

from app.models import AttendanceSession

DEMO_SOURCE = "demo"


class TransitionError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _now(now: datetime | None) -> datetime:
    val = now or datetime.now(timezone.utc)
    return _ensure_utc(val)  # type: ignore


def _accrue(session: AttendanceSession, now: datetime) -> None:
    if session.status == "recording" and session.last_resumed_at is not None:
        resumed = _ensure_utc(session.last_resumed_at)
        delta = int((now - resumed).total_seconds())  # type: ignore
        session.accumulated_seconds += max(0, delta)
        session.last_resumed_at = None


def effective_duration(session: AttendanceSession, now: datetime | None = None) -> int:
    if session.status in {"completed", "confirmed"}:
        return session.duration_seconds
    moment = _now(now)
    extra = 0
    if session.status == "recording" and session.last_resumed_at is not None:
        resumed = _ensure_utc(session.last_resumed_at)
        extra = max(0, int((moment - resumed).total_seconds()))  # type: ignore
    return session.accumulated_seconds + extra


def start_session(session: AttendanceSession, now: datetime | None = None) -> None:
    moment = _now(now)
    if session.status != "ready":
        raise TransitionError("A session can only be started from ready.")
    session.status = "recording"
    session.started_at = moment
    session.last_resumed_at = moment
    session.updated_at = moment


def pause_session(session: AttendanceSession, now: datetime | None = None) -> None:
    moment = _now(now)
    if session.status != "recording":
        raise TransitionError("Only a recording session can be paused.")
    _accrue(session, moment)
    session.status = "paused"
    session.updated_at = moment


def resume_session(session: AttendanceSession, now: datetime | None = None) -> None:
    moment = _now(now)
    if session.status != "paused":
        raise TransitionError("Only a paused session can be resumed.")
    session.status = "recording"
    session.last_resumed_at = moment
    session.updated_at = moment


def end_session(session: AttendanceSession, now: datetime | None = None) -> None:
    moment = _now(now)
    if session.status not in {"recording", "paused"}:
        raise TransitionError("Only a recording or paused session can be ended.")
    _accrue(session, moment)
    session.duration_seconds = session.accumulated_seconds
    session.ended_at = moment
    session.status = "completed"
    session.updated_at = moment


def confirm_session(session: AttendanceSession, now: datetime | None = None) -> None:
    moment = _now(now)
    if session.status not in {"completed", "confirmed"}:
        raise TransitionError("Only a completed session can be confirmed.")
    session.status = "confirmed"
    session.updated_at = moment


def apply_demo_count(session: AttendanceSession, total_count: int, *, allowed: bool, now: datetime | None = None) -> None:
    if not allowed:
        raise PermissionError("Demonstration counts are disabled.")
    if session.status == "completed":
        raise TransitionError("A completed session cannot change its count.")
    if session.status not in {"ready", "recording", "paused"}:
        raise TransitionError("This session cannot accept a count.")
    if total_count < 0:
        raise TransitionError("Count cannot be negative.")
    session.total_count = total_count
    session.count_source = DEMO_SOURCE
    session.updated_at = _now(now)
