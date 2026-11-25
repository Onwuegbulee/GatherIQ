from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("gatheriq.cv")

MAX_INFERENCE_DIM = 640
DEFAULT_CONF_THRESHOLD = 0.35


@dataclass
class DetectionResult:
    total_count: int
    count_source: str  # "ai", "manual", "unavailable"
    is_genuine_ai: bool
    confidence: float = 0.0
    active_in_frame: int = 0
    ai_unique_count: int = 0
    manual_adjustment: int = 0
    active_track_ids: list[int] = field(default_factory=list)
    boxes: list[dict[str, Any]] = field(default_factory=list)
    frame_width: int = 0
    frame_height: int = 0
    latency_ms: float = 0.0
    message: str = ""


class AttendanceCounter:
    """
    Dedicated attendance counting layer that consumes ByteTrack track IDs.

    - Counts each continuously tracked person ID once per session.
    - Keeps AI unique tracked count separate from manual adjustments.
    - Preserves totals across pause/resume cycles.
    - Does not use gender, age, facial recognition, or biometric identity.
    """

    def __init__(self, *, min_hits: int = 1, initial_manual_adjustment: int = 0) -> None:
        self.min_hits = max(1, min_hits)
        self.counted_ids: set[int] = set()
        self.hit_counts: dict[int, int] = {}
        self.manual_adjustment: int = initial_manual_adjustment

    @property
    def ai_unique_count(self) -> int:
        return len(self.counted_ids)

    @property
    def total_count(self) -> int:
        return max(0, self.ai_unique_count + self.manual_adjustment)

    def update(self, track_ids: list[int]) -> int:
        """Register active track IDs for the current frame and return updated total_count."""
        for tid in track_ids:
            if tid < 0:
                continue
            hits = self.hit_counts.get(tid, 0) + 1
            self.hit_counts[tid] = hits
            if hits >= self.min_hits:
                self.counted_ids.add(tid)
        return self.total_count

    def adjust_manual(self, delta: int) -> int:
        """Apply a manual adjustment without corrupting AI unique tracked IDs."""
        new_total = max(0, self.total_count + delta)
        self.manual_adjustment = new_total - self.ai_unique_count
        return self.total_count

    def reset(self) -> None:
        self.counted_ids.clear()
        self.hit_counts.clear()
        self.manual_adjustment = 0


def _build_bytetrack_args() -> Any:
    from ultralytics.utils import IterableSimpleNamespace

    return IterableSimpleNamespace(
        tracker_type="bytetrack",
        track_high_thresh=0.45,
        track_low_thresh=0.15,
        new_track_thresh=0.5,
        track_buffer=30,
        match_thresh=0.8,
        fuse_score=True,
        gmc_method="sparseOptFlow",
        frame_rate=2,
    )


def _resize_for_inference(img: Any, cv2_mod: Any, max_dim: int = MAX_INFERENCE_DIM) -> Any:
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / float(max(h, w))
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return cv2_mod.resize(img, (new_w, new_h), interpolation=cv2_mod.INTER_AREA)


class SessionVisionTracker:
    """
    Per-session isolated YOLOv8 + ByteTrack + AttendanceCounter processor.
    Ensures different churches and concurrent sessions never share tracker state.
    """

    def __init__(
        self,
        pipeline: VisionPipeline,
        *,
        min_hits: int = 1,
        initial_manual_adjustment: int = 0,
    ) -> None:
        self.pipeline = pipeline
        self.counter = AttendanceCounter(
            min_hits=min_hits,
            initial_manual_adjustment=initial_manual_adjustment,
        )
        self._tracker: Any = None
        if self.pipeline.is_ready:
            try:
                from ultralytics.trackers.byte_tracker import BYTETracker

                self._tracker = BYTETracker(_build_bytetrack_args())
            except Exception as exc:
                logger.warning("Failed to initialize per-session ByteTrack: %s", exc)
                self._tracker = None

    def reset(self) -> None:
        self.counter.reset()
        if self.pipeline.is_ready:
            try:
                from ultralytics.trackers.byte_tracker import BYTETracker

                self._tracker = BYTETracker(_build_bytetrack_args())
            except Exception as exc:
                logger.warning("Failed to reset ByteTrack: %s", exc)
                self._tracker = None

    def process_frame(self, frame_bytes: bytes) -> DetectionResult:
        t0 = time.perf_counter()

        if not self.pipeline.is_ready or self.pipeline.model is None:
            return DetectionResult(
                total_count=self.counter.total_count,
                ai_unique_count=self.counter.ai_unique_count,
                manual_adjustment=self.counter.manual_adjustment,
                count_source="unavailable",
                is_genuine_ai=False,
                message=self.pipeline.status_message,
            )

        if not frame_bytes:
            return DetectionResult(
                total_count=self.counter.total_count,
                ai_unique_count=self.counter.ai_unique_count,
                manual_adjustment=self.counter.manual_adjustment,
                count_source="unavailable",
                is_genuine_ai=False,
                message="Empty image frame received.",
            )

        try:
            import cv2
            import numpy as np

            nparr = np.frombuffer(frame_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return DetectionResult(
                    total_count=self.counter.total_count,
                    ai_unique_count=self.counter.ai_unique_count,
                    manual_adjustment=self.counter.manual_adjustment,
                    count_source="unavailable",
                    is_genuine_ai=False,
                    message="Invalid or corrupted image frame.",
                )

            img = _resize_for_inference(img, cv2)
            frame_h, frame_w = img.shape[:2]

            boxes_np = self.pipeline.detect_persons(img)
            active_track_ids: list[int] = []
            confidences: list[float] = []
            out_boxes: list[dict[str, Any]] = []

            if boxes_np is not None and len(boxes_np) > 0:
                if self._tracker is not None:
                    tracks = self._tracker.update(boxes_np, img=img)
                    if tracks is not None and len(tracks) > 0:
                        for row in tracks:
                            x1, y1, x2, y2, tid, score = (
                                float(row[0]),
                                float(row[1]),
                                float(row[2]),
                                float(row[3]),
                                int(row[4]),
                                float(row[5]),
                            )
                            active_track_ids.append(tid)
                            confidences.append(score)
                            out_boxes.append({
                                "x1": round(max(0.0, min(1.0, x1 / frame_w)), 4),
                                "y1": round(max(0.0, min(1.0, y1 / frame_h)), 4),
                                "x2": round(max(0.0, min(1.0, x2 / frame_w)), 4),
                                "y2": round(max(0.0, min(1.0, y2 / frame_h)), 4),
                                "track_id": tid,
                                "confidence": round(score, 2),
                            })
                else:
                    # If ByteTrack failed to initialize, report detections without fabricating IDs
                    for i in range(len(boxes_np)):
                        xyxy = boxes_np.xyxy[i]
                        score = float(boxes_np.conf[i])
                        confidences.append(score)
                        out_boxes.append({
                            "x1": round(max(0.0, min(1.0, float(xyxy[0]) / frame_w)), 4),
                            "y1": round(max(0.0, min(1.0, float(xyxy[1]) / frame_h)), 4),
                            "x2": round(max(0.0, min(1.0, float(xyxy[2]) / frame_w)), 4),
                            "y2": round(max(0.0, min(1.0, float(xyxy[3]) / frame_h)), 4),
                            "track_id": None,
                            "confidence": round(score, 2),
                        })

            total_count = self.counter.update(active_track_ids)
            active_in_frame = len(out_boxes)
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)

            logger.debug(
                "CV frame=%dx%d detections=%d active_ids=%s ai_unique=%d total=%d latency=%.1fms",
                frame_w,
                frame_h,
                active_in_frame,
                active_track_ids,
                self.counter.ai_unique_count,
                total_count,
                latency_ms,
            )

            return DetectionResult(
                total_count=total_count,
                ai_unique_count=self.counter.ai_unique_count,
                manual_adjustment=self.counter.manual_adjustment,
                count_source="ai",
                is_genuine_ai=True,
                confidence=round(avg_conf, 2),
                active_in_frame=active_in_frame,
                active_track_ids=active_track_ids,
                boxes=out_boxes,
                frame_width=frame_w,
                frame_height=frame_h,
                latency_ms=latency_ms,
                message="AI detection active",
            )
        except Exception as exc:
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            logger.error("Error processing camera frame (%.1fms): %s", latency_ms, exc)
            return DetectionResult(
                total_count=self.counter.total_count,
                ai_unique_count=self.counter.ai_unique_count,
                manual_adjustment=self.counter.manual_adjustment,
                count_source="unavailable",
                is_genuine_ai=False,
                latency_ms=latency_ms,
                message=f"Frame processing error: {exc}",
            )


class VisionPipeline:
    """
    Shared YOLOv8 model loader for GatherIQ.
    Detects people only (COCO class 0: person) and provides per-session isolated trackers.
    """

    def __init__(self, model_name: str = "yolov8n.pt", conf_threshold: float = DEFAULT_CONF_THRESHOLD) -> None:
        self.model_name = model_name
        self.conf_threshold = conf_threshold
        self.model: Any = None
        self.is_ready = False
        self.status_message = "Initializing"
        self._initialize_model()
        self._default_tracker = SessionVisionTracker(self)

    @property
    def _tracked_ids(self) -> set[int]:
        return self._default_tracker.counter.counted_ids

    def _initialize_model(self) -> None:
        try:
            import numpy as np  # noqa: F401
            import cv2  # noqa: F401
            from ultralytics import YOLO

            logger.info("Loading YOLO model: %s", self.model_name)
            self.model = YOLO(self.model_name)
            self.is_ready = True
            self.status_message = "Ready (YOLO + ByteTrack active)"
            logger.info("VisionPipeline ready: %s", self.status_message)
        except ImportError as exc:
            self.is_ready = False
            self.status_message = f"Computer vision runtime unavailable: {exc}. Please install Python 3.12 with opencv-python-headless and ultralytics."
            logger.warning("VisionPipeline unavailable: %s", self.status_message)
        except Exception as exc:
            self.is_ready = False
            self.status_message = f"Failed to load vision model: {exc}"
            logger.error("VisionPipeline init error: %s", exc)

    def detect_persons(self, img: Any) -> Any:
        """Run YOLOv8 inference strictly filtered to COCO class 0 (person)."""
        if not self.is_ready or self.model is None:
            return None
        results = self.model.predict(
            source=img,
            classes=[0],
            conf=self.conf_threshold,
            imgsz=MAX_INFERENCE_DIM,
            verbose=False,
        )
        if results and len(results) > 0 and results[0].boxes is not None:
            return results[0].boxes.cpu().numpy()
        return None

    def create_session_tracker(
        self,
        *,
        min_hits: int = 1,
        initial_manual_adjustment: int = 0,
    ) -> SessionVisionTracker:
        return SessionVisionTracker(
            self,
            min_hits=min_hits,
            initial_manual_adjustment=initial_manual_adjustment,
        )

    def process_frame(self, frame_bytes: bytes) -> DetectionResult:
        return self._default_tracker.process_frame(frame_bytes)

    def reset_session(self) -> None:
        self._default_tracker.reset()


# Global shared model loader instance
vision_pipeline = VisionPipeline()
