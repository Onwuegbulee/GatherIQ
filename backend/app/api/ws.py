import base64
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.cv.pipeline import vision_pipeline
from app.database import SessionLocal
from app.models import AttendanceSession, User
from app.security import decode_access_token

logger = logging.getLogger("gatheriq.ws")
router = APIRouter()


@router.websocket("/session/{session_id}")
async def attendance_session_websocket(
    websocket: WebSocket,
    session_id: uuid.UUID,
):
    await websocket.accept()

    # Authenticate token via query param
    token = websocket.query_params.get("token")
    user_id = None
    church_id = None

    if token:
        try:
            payload = decode_access_token(token)
            user_id = uuid.UUID(payload["sub"])
            church_id = uuid.UUID(payload["church_id"])
        except Exception:
            await websocket.send_json({
                "type": "error",
                "message": "Authentication failed: invalid or expired token.",
            })
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # Verify session belongs to authenticated church
    with SessionLocal() as db:
        session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == session_id))
        if not session:
            await websocket.send_json({"type": "error", "message": "Attendance session not found."})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if church_id and session.church_id != church_id:
            await websocket.send_json({"type": "error", "message": "Access denied: session belongs to another church."})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    vision_pipeline.reset_session()
    await websocket.send_json({
        "type": "connected",
        "session_id": str(session_id),
        "cv_ready": vision_pipeline.is_ready,
        "cv_status": vision_pipeline.status_message,
        "current_total": session.total_count,
    })

    try:
        while True:
            # Handle text JSON or binary frame
            message = await websocket.receive()
            frame_bytes = None

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
                        # Base64 encoded frame
                        b64_str = data["image"]
                        if "," in b64_str:
                            b64_str = b64_str.split(",", 1)[1]
                        frame_bytes = base64.b64decode(b64_str)
                    elif msg_type == "demo_adjust":
                        # Demo adjustments explicitly labeled as demo
                        delta = int(data.get("delta", 0))
                        with SessionLocal() as db:
                            curr_session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == session_id))
                            if curr_session and curr_session.status != "completed":
                                curr_session.total_count = max(0, curr_session.total_count + delta)
                                curr_session.count_source = "demo"
                                db.commit()
                                await websocket.send_json({
                                    "type": "count_update",
                                    "total_count": curr_session.total_count,
                                    "count_source": "demo",
                                    "is_genuine_ai": False,
                                    "message": "Demo count adjusted manually",
                                })
                        continue
                except Exception as exc:
                    logger.warning("Error parsing text message: %s", exc)
                    continue

            if frame_bytes:
                result = vision_pipeline.process_frame(frame_bytes)

                if result.is_genuine_ai:
                    with SessionLocal() as db:
                        curr_session = db.scalar(select(AttendanceSession).where(AttendanceSession.id == session_id))
                        if curr_session and curr_session.status in {"recording", "ready"}:
                            curr_session.total_count = result.total_count
                            curr_session.count_source = "ai"
                            db.commit()

                await websocket.send_json({
                    "type": "detection_result",
                    "session_id": str(session_id),
                    "total_count": result.total_count,
                    "active_in_frame": result.active_in_frame,
                    "count_source": result.count_source,
                    "is_genuine_ai": result.is_genuine_ai,
                    "confidence": result.confidence,
                    "message": result.message,
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception as exc:
        logger.error("WebSocket unhandled exception: %s", exc)
