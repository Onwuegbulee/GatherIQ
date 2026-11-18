import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Church, ChurchSettings, Service, User, utcnow
from app.security import hash_password

DEFAULT_SERVICES: list[tuple[str, str]] = [
    ("Sunday Service", "Main weekly worship service"),
    ("Wednesday Service", "Midweek Bible study and prayer"),
    ("Special Programmes", "Conferences, crusades and special events"),
    ("Workers' Meeting", "Meeting for ministry workers and ushers"),
]


def create_church_with_admin(
    db: Session,
    *,
    church_name: str,
    church_location: str,
    full_name: str,
    email: str,
    password: str,
    role: str = "admin",
) -> User:
    """Create a new church and its first administrator. Never attaches a user to an existing church."""
    normalized = email.strip().lower()
    existing = db.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        raise ValueError("An account with this email already exists.")
    now = utcnow()
    church = Church(id=uuid.uuid4(), name=church_name.strip(), location=church_location.strip(), created_at=now, updated_at=now)
    db.add(church)
    db.flush()
    db.add(
        ChurchSettings(
            church_id=church.id,
            attendance_target=1300,
            notify_on_save=True,
            notify_weekly=False,
            compact_tables=False,
            updated_at=now,
        )
    )
    for name, description in DEFAULT_SERVICES:
        db.add(Service(church_id=church.id, name=name, description=description, created_at=now, updated_at=now))
    user = User(
        church_id=church.id,
        full_name=full_name.strip(),
        email=normalized,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
        created_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
