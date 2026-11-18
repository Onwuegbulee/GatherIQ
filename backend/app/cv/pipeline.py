import base64
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("gatheriq.cv")


@dataclass
class DetectionResult:
    total_count: int
    count_source: str  # "ai", "manual", "demo", "unavailable"
    is_genuine_ai: bool
    confidence: float = 0.0
    active_in_frame: int = 0
    message: str = ""


class VisionPipeline:
    """
    Computer Vision Pipeline for GatherIQ.
    Detects people using YOLO (class 0: person) and tracks individuals across frames with ByteTrack.
    Strictly adheres to project boundaries:
      - Total person count only.
      - NO facial recognition or biometric identification.
      - NO gender classification.
      - NO raw video storage.
      - Never fabricates fake AI results.
    """

    def __init__(self, model_name: str = "yolov8n.pt"):
        self.model_name = model_name
        self.model = None
        self.tracker = None
        self.is_ready = False
        self.status_message = "Initializing"
        self._tracked_ids: set[int] = set()

        self._initialize_model()

    def _initialize_model(self) -> None:
        try:
            import numpy as np  # noqa: F401
            import cv2  # noqa: F401
            from ultralytics import YOLO

            logger.info("Loading YOLO model: %s", self.model_name)
            self.model = YOLO(self.model_name)
            self.is_ready = True
            self.status_message = "Ready (YOLO + ByteTrack active)"
        except ImportError as exc:
            self.is_ready = False
            self.status_message = f"Computer vision runtime unavailable: {exc}. Please install Python 3.12 with opencv and ultralytics."
            logger.warning("VisionPipeline: %s", self.status_message)
        except Exception as exc:
            self.is_ready = False
            self.status_message = f"Failed to load vision model: {exc}"
            logger.error("VisionPipeline init error: %s", exc)

    def process_frame(self, frame_bytes: bytes) -> DetectionResult:
        if not self.is_ready or self.model is None:
            return DetectionResult(
                total_count=0,
                count_source="unavailable",
                is_genuine_ai=False,
                message=self.status_message,
            )

        try:
            import cv2
            import numpy as np

            # Decode image from raw bytes
            nparr = np.frombuffer(frame_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return DetectionResult(
                    total_count=len(self._tracked_ids),
                    count_source="ai",
                    is_genuine_ai=True,
                    message="Failed to decode image frame.",
                )

            # Run YOLO detection tracking strictly for person class (class 0 in COCO)
            results = self.model.track(
                source=img,
                classes=[0],  # Class 0: person
                persist=True,
                verbose=False,
                tracker="bytetrack.yaml",
            )

            current_frame_people = 0
            confidences = []

            if results and len(results) > 0 and results[0].boxes is not None:
                boxes = results[0].boxes
                current_frame_people = len(boxes)
                if boxes.id is not None:
                    track_ids = boxes.id.int().cpu().tolist()
                    for tid in track_ids:
                        self._tracked_ids.add(tid)
                if boxes.conf is not None:
                    confidences = boxes.conf.cpu().tolist()

            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
            total_count = len(self._tracked_ids) if self._tracked_ids else current_frame_people

            return DetectionResult(
                total_count=total_count,
                count_source="ai",
                is_genuine_ai=True,
                confidence=round(avg_conf, 2),
                active_in_frame=current_frame_people,
                message="AI detection active",
            )
        except Exception as exc:
            logger.error("Error processing camera frame: %s", exc)
            return DetectionResult(
                total_count=len(self._tracked_ids),
                count_source="unavailable",
                is_genuine_ai=False,
                message=f"Frame processing error: {exc}",
            )

    def reset_session(self) -> None:
        self._tracked_ids.clear()


# Global pipeline instance
vision_pipeline = VisionPipeline()
