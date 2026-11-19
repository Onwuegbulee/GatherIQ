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
    church_email: str = "",
    church_phone: str = "",
    must_change_password: bool = False,
    role: str = "admin",
) -> User:
    """Create a new church and its first administrator. Never attaches a user to an existing church."""
    normalized = email.strip().lower()
    existing = db.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        raise ValueError("An account with this email already exists.")
    now = utcnow()
    church = Church(
        id=uuid.uuid4(),
        name=church_name.strip(),
        location=church_location.strip(),
        email=church_email.strip(),
        phone=church_phone.strip(),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
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
        must_change_password=must_change_password,
        created_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def ensure_initial_super_admin(
    db: Session,
    *,
    email: str = "superadmin@gatheriq.dev",
    password: str = "GatherIQ@Admin2026!",
    full_name: str = "Platform Super Admin",
) -> User:
    """
    Provision initial Super Admin account idempotently.
    - If user exists: do not overwrite password.
    - If user does not exist: create with role super_admin, church_id None, must_change_password True.
    """
    normalized = email.strip().lower()
    existing = db.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        return existing

    now = utcnow()
    super_admin = User(
        id=uuid.uuid4(),
        church_id=None,
        full_name=full_name.strip(),
        email=normalized,
        password_hash=hash_password(password),
        role="super_admin",
        is_active=True,
        must_change_password=True,
        created_at=now,
    )
    db.add(super_admin)
    db.commit()
    db.refresh(super_admin)
    return super_admin
