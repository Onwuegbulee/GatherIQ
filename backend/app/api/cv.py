import asyncio
import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cv.pipeline import vision_pipeline
from app.database import get_db
from app.models import AttendanceSession, User
from app.security import get_current_user

router = APIRouter()

MAX_STILL_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB decoded image cap


class StillImageDetectRequest(BaseModel):
    image: str = Field(..., min_length=1)
    session_id: uuid.UUID | None = None


class StillImageDetectResponse(BaseModel):
    count: int
    count_source: str
    is_genuine_ai: bool
    confidence: float
    boxes: list[dict]
    annotated_image: str
    frame_width: int
    frame_height: int
    latency_ms: float
    message: str


@router.post("/detect-image", response_model=StillImageDetectResponse)
async def detect_still_image(
    payload: StillImageDetectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "super_admin" or current_user.church_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Church administrator account required.",
        )

    b64_str = payload.image.strip()
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]

    try:
        frame_bytes = base64.b64decode(b64_str, validate=True)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 image data.",
        ) from exc

    if len(frame_bytes) > MAX_STILL_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds maximum allowed size (5 MB).",
        )

    result = await asyncio.to_thread(vision_pipeline.detect_still_image, frame_bytes)

    if result.is_genuine_ai and payload.session_id is not None:
        session = db.scalar(
            select(AttendanceSession).where(
                AttendanceSession.id == payload.session_id,
                AttendanceSession.church_id == current_user.church_id,
            )
        )
        if session and session.status in {"ready", "recording", "paused"}:
            session.total_count = result.count
            session.count_source = "ai"
            db.commit()

    return StillImageDetectResponse(
        count=result.count,
        count_source=result.count_source,
        is_genuine_ai=result.is_genuine_ai,
        confidence=result.confidence,
        boxes=result.boxes,
        annotated_image=result.annotated_image,
        frame_width=result.frame_width,
        frame_height=result.frame_height,
        latency_ms=result.latency_ms,
        message=result.message,
    )
