import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AttendanceSession, Service, User
from app.schemas import ServiceCreate, ServiceOut, ServiceUpdate
from app.security import get_current_user, require_admin

router = APIRouter()


@router.get("", response_model=list[ServiceOut])
def list_services(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    services = db.scalars(
        select(Service)
        .where(Service.church_id == current_user.church_id)
        .order_by(Service.name)
    ).all()

    stats_query = (
        select(
            AttendanceSession.service_id,
            func.count(AttendanceSession.id).label("count"),
            func.avg(AttendanceSession.total_count).label("avg"),
        )
        .where(
            AttendanceSession.church_id == current_user.church_id,
            AttendanceSession.service_id.isnot(None),
        )
        .group_by(AttendanceSession.service_id)
    )
    stats_map = {row[0]: (row[1], int(row[2] or 0)) for row in db.execute(stats_query)}

    out = []
    for s in services:
        count, avg_att = stats_map.get(s.id, (0, 0))
        item = ServiceOut(
            id=s.id,
            church_id=s.church_id,
            name=s.name,
            description=s.description,
            created_at=s.created_at,
            session_count=count,
            average_attendance=avg_att,
        )
        out.append(item)
    return out


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    existing = db.scalar(
        select(Service).where(
            Service.church_id == current_user.church_id,
            func.lower(Service.name) == name.lower(),
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A service with this name already exists.",
        )

    now = datetime.now(timezone.utc)
    service = Service(
        id=uuid.uuid4(),
        church_id=current_user.church_id,
        name=name,
        description=payload.description.strip(),
        created_at=now,
        updated_at=now,
    )
    db.add(service)
    db.commit()
    db.refresh(service)

    return ServiceOut(
        id=service.id,
        church_id=service.church_id,
        name=service.name,
        description=service.description,
        created_at=service.created_at,
        session_count=0,
        average_attendance=0,
    )


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: uuid.UUID,
    payload: ServiceUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.church_id == current_user.church_id,
        )
    )
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if payload.name is not None:
        name = payload.name.strip()
        existing = db.scalar(
            select(Service).where(
                Service.church_id == current_user.church_id,
                func.lower(Service.name) == name.lower(),
                Service.id != service_id,
            )
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A service with this name already exists.",
            )
        service.name = name

    if payload.description is not None:
        service.description = payload.description.strip()

    service.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(service)

    stats = db.execute(
        select(
            func.count(AttendanceSession.id),
            func.avg(AttendanceSession.total_count),
        ).where(AttendanceSession.service_id == service.id)
    ).first()
    count = stats[0] if stats else 0
    avg_att = int(stats[1] or 0) if stats else 0

    return ServiceOut(
        id=service.id,
        church_id=service.church_id,
        name=service.name,
        description=service.description,
        created_at=service.created_at,
        session_count=count,
        average_attendance=avg_att,
    )


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.church_id == current_user.church_id,
        )
    )
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    db.delete(service)
    db.commit()
    return None
