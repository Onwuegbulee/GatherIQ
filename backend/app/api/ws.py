import asyncio
import base64
import json
import logging
import uuid

from contextlib import contextmanager

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.cv.pipeline import vision_pipeline
from app.database import SessionLocal, get_db
from app.models import AttendanceSession
from app.security import decode_access_token

logger = logging.getLogger("gatheriq.ws")
router = APIRouter()

MAX_FRAME_BYTES = 2 * 1024 * 1024  # 2 MB cap per sampled frame


@contextmanager
def _ws_db(websocket: WebSocket):
    override = websocket.app.dependency_overrides.get(get_db)
    if override is not None:
        gen = override()
        db = next(gen)
        try:
            yield db
        finally:
            try:
                next(gen)
            except StopIteration:
                pass
    else:
        with SessionLocal() as db:
            yield db


@router.websocket("/session/{session_id}")
async def attendance_session_websocket(
    websocket: WebSocket,
    session_id: uuid.UUID,
):
    await websocket.accept()

    # Authenticate token via query param (required for church tenant isolation)
    token = websocket.query_params.get("token")
    if not token:
        await websocket.send_json({
            "type": "error",
            "message": "Authentication required.",
        })
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_access_token(token)
        uuid.UUID(payload["sub"])
        church_id = uuid.UUID(payload["church_id"])
    except Exception:
        await websocket.send_json({
            "type": "error",
            "message": "Authentication failed: invalid or expired token.",
        })
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Verify session belongs to authenticated church
    with _ws_db(websocket) as db:
        session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == session_id))
        if not session:
            await websocket.send_json({"type": "error", "message": "Attendance session not found."})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if session.church_id != church_id:
            await websocket.send_json({"type": "error", "message": "Access denied: session belongs to another church."})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        initial_total = session.total_count

    # Create an isolated per-session tracker so concurrent sessions/churches never share state
    tracker = vision_pipeline.create_session_tracker(initial_manual_adjustment=initial_total)
    logger.info("WebSocket connected for session=%s church=%s cv_ready=%s", session_id, church_id, vision_pipeline.is_ready)

    await websocket.send_json({
        "type": "connected",
        "session_id": str(session_id),
        "cv_ready": vision_pipeline.is_ready,
        "cv_status": vision_pipeline.status_message,
        "current_total": tracker.counter.total_count,
        "ai_unique_count": tracker.counter.ai_unique_count,
        "manual_adjustment": tracker.counter.manual_adjustment,
    })

    try:
        while True:
            message = await websocket.receive()
            frame_bytes: bytes | None = None

            if "bytes" in message and message["bytes"]:
                frame_bytes = message["bytes"]
            elif "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})
                        continue
                    elif msg_type == "frame" and "image" in data:
                        b64_str = data["image"]
                        if not isinstance(b64_str, str) or not b64_str:
                            await websocket.send_json({"type": "error", "message": "Invalid frame payload."})
                            continue
                        if "," in b64_str:
                            b64_str = b64_str.split(",", 1)[1]
                        try:
                            frame_bytes = base64.b64decode(b64_str, validate=True)
                        except Exception:
                            await websocket.send_json({"type": "error", "message": "Invalid base64 frame data."})
                            continue
                    elif msg_type in {"manual_adjust", "demo_adjust"}:
                        source = "manual" if msg_type == "manual_adjust" else "demo"
                        delta = int(data.get("delta", 0))
                        new_total = tracker.counter.adjust_manual(delta)
                        with _ws_db(websocket) as db:
                            curr_session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == session_id))
                            if curr_session and curr_session.status not in {"completed", "confirmed"}:
                                curr_session.total_count = new_total
                                curr_session.count_source = "ai" if (tracker.counter.ai_unique_count > 0 and vision_pipeline.is_ready) else source
                                db.commit()
                                await websocket.send_json({
                                    "type": "count_update",
                                    "total_count": curr_session.total_count,
                                    "ai_unique_count": tracker.counter.ai_unique_count,
                                    "manual_adjustment": tracker.counter.manual_adjustment,
                                    "count_source": curr_session.count_source,
                                    "is_genuine_ai": vision_pipeline.is_ready and tracker.counter.ai_unique_count > 0,
                                    "message": "Count adjusted manually",
                                })
                        continue
                except Exception as exc:
                    logger.warning("Error parsing WebSocket text message for session=%s: %s", session_id, exc)
                    continue

            if frame_bytes is not None:
                if len(frame_bytes) > MAX_FRAME_BYTES:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Frame exceeds maximum allowed size (2 MB).",
                    })
                    continue

                # Run CPU-bound YOLO + ByteTrack inference off the async event loop
                result = await asyncio.to_thread(tracker.process_frame, frame_bytes)

                if result.is_genuine_ai:
                    with _ws_db(websocket) as db:
                        curr_session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == session_id))
                        if curr_session and curr_session.status in {"recording", "ready", "paused"}:
                            curr_session.total_count = result.total_count
                            curr_session.count_source = "ai"
                            db.commit()

                await websocket.send_json({
                    "type": "detection_result",
                    "session_id": str(session_id),
                    "total_count": result.total_count,
                    "ai_unique_count": result.ai_unique_count,
                    "manual_adjustment": result.manual_adjustment,
                    "active_in_frame": result.active_in_frame,
                    "active_track_ids": result.active_track_ids,
                    "boxes": result.boxes,
                    "count_source": result.count_source,
                    "is_genuine_ai": result.is_genuine_ai,
                    "confidence": result.confidence,
                    "latency_ms": result.latency_ms,
                    "message": result.message,
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session=%s", session_id)
    except Exception as exc:
        logger.error("WebSocket unhandled exception for session=%s: %s", session_id, exc)
    finally:
        # Release per-session tracker resources
        del tracker
