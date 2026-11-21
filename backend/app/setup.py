import argparse
import getpass
import logging
import sys
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import Church, ChurchSettings, Service, User, utcnow
from app.security import hash_password

logger = logging.getLogger("gatheriq.setup")

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
    email: Optional[str] = None,
    password: Optional[str] = None,
    full_name: Optional[str] = None,
) -> Optional[User]:
    """
    Provision initial Super Admin account idempotently.
    - If user exists: do not overwrite password.
    - In production, passwords are never hardcoded. If SUPER_ADMIN_PASSWORD is not provided,
      auto-provisioning is skipped to protect production databases.
    - In development/testing environments, falls back to default test credentials when omitted.
    """
    settings = get_settings()

    target_email = (email or settings.super_admin_email or "superadmin@gatheriq.dev").strip().lower()
    target_name = (full_name or settings.super_admin_name or "Platform Super Admin").strip()

    target_password = password or settings.super_admin_password
    if not target_password:
        if settings.is_production:
            logger.warning(
                "Super Admin auto-provisioning skipped: SUPER_ADMIN_PASSWORD is not configured in environment variables. "
                "To provision a Super Admin in production, configure SUPER_ADMIN_PASSWORD in Render or run: "
                "python -m app.setup in the Render Shell."
            )
            return None
        # Non-production default for seamless local development and tests
        target_password = "GatherIQ@Admin2026!"

    existing = db.scalar(select(User).where(User.email == target_email))
    if existing is not None:
        return existing

    now = utcnow()
    super_admin = User(
        id=uuid.uuid4(),
        church_id=None,
        full_name=target_name,
        email=target_email,
        password_hash=hash_password(target_password),
        role="super_admin",
        is_active=True,
        must_change_password=True,
        created_at=now,
    )
    db.add(super_admin)
    db.commit()
    db.refresh(super_admin)
    return super_admin


def provision_super_admin_cli():
    """CLI utility for provisioning or resetting the Super Admin account."""
    parser = argparse.ArgumentParser(description="GatherIQ Super Admin Provisioning Utility")
    parser.add_argument("--email", default=None, help="Super Admin email address (defaults to SUPER_ADMIN_EMAIL or superadmin@gatheriq.dev)")
    parser.add_argument("--name", default=None, help="Super Admin full name")
    parser.add_argument("--password", default=None, help="Super Admin password (if omitted, will prompt securely)")
    parser.add_argument("--reset-password", action="store_true", help="Reset password if user already exists")

    args = parser.parse_args()
    settings = get_settings()

    email = (args.email or settings.super_admin_email or "superadmin@gatheriq.dev").strip().lower()
    name = (args.name or settings.super_admin_name or "Platform Super Admin").strip()
    password = args.password or settings.super_admin_password

    if not password:
        if sys.stdin.isatty():
            password = getpass.getpass(f"Enter password for Super Admin ({email}): ")
            confirm = getpass.getpass("Confirm password: ")
            if password != confirm:
                print("Error: Passwords do not match.")
                sys.exit(1)
        else:
            print("Error: Password not provided. Set SUPER_ADMIN_PASSWORD env var or pass --password.")
            sys.exit(1)

    if len(password) < 8:
        print("Error: Password must be at least 8 characters long.")
        sys.exit(1)

    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            if args.reset_password:
                existing.password_hash = hash_password(password)
                existing.must_change_password = False
                existing.is_active = True
                db.commit()
                print(f"[OK] Password reset successfully for Super Admin: {email}")
            else:
                print(f"[INFO] Super Admin account already exists: {email}. Use --reset-password to update.")
        else:
            user = ensure_initial_super_admin(db, email=email, password=password, full_name=name)
            if user:
                print(f"[SUCCESS] Super Admin account created: {email} (ID: {user.id})")
            else:
                print("[ERROR] Failed to provision Super Admin.")
                sys.exit(1)


if __name__ == "__main__":
    provision_super_admin_cli()
