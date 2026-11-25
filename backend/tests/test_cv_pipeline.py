import os
from unittest.mock import patch

import numpy as np

from app.cv.pipeline import AttendanceCounter, VisionPipeline, vision_pipeline


def _encode_blank_jpeg(width: int = 640, height: int = 480) -> bytes:
    import cv2

    img = np.zeros((height, width, 3), dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_real_yolo_model_initialization():
    """Real integration check: YOLOv8 + ByteTrack initializes cleanly in this environment."""
    assert vision_pipeline.is_ready is True
    assert vision_pipeline.model is not None
    assert "Ready" in vision_pipeline.status_message


def test_real_yolo_inference_on_blank_frame():
    """Real model inference on a valid blank JPEG returns 0 people and does not fabricate counts."""
    frame_bytes = _encode_blank_jpeg(800, 600)
    tracker = vision_pipeline.create_session_tracker()
    res = tracker.process_frame(frame_bytes)
    assert res.is_genuine_ai is True
    assert res.count_source == "ai"
    assert res.active_in_frame == 0
    assert res.total_count == 0
    assert res.frame_width <= 640
    assert res.frame_height <= 640
    assert res.latency_ms >= 0.0


def test_real_yolo_inference_on_sample_people_image_if_present():
    """Real model inference on ultralytics bundled zidane/bus asset (if installed) detects only person class."""
    import ultralytics

    assets_dir = os.path.join(os.path.dirname(ultralytics.__file__), "assets")
    bus_path = os.path.join(assets_dir, "bus.jpg")
    if not os.path.exists(bus_path):
        return  # asset not bundled in this wheel

    with open(bus_path, "rb") as f:
        frame_bytes = f.read()

    tracker = vision_pipeline.create_session_tracker()
    res1 = tracker.process_frame(frame_bytes)
    assert res1.is_genuine_ai is True
    assert res1.count_source == "ai"
    assert res1.active_in_frame >= 1
    assert res1.ai_unique_count == res1.active_in_frame
    assert all(b["confidence"] >= 0.35 for b in res1.boxes)

    # Repeated identical frame must NOT inflate unique attendance total
    res2 = tracker.process_frame(frame_bytes)
    assert res2.is_genuine_ai is True
    assert res2.total_count == res1.total_count


def test_invalid_and_empty_frames():
    tracker = vision_pipeline.create_session_tracker()

    empty_res = tracker.process_frame(b"")
    assert empty_res.is_genuine_ai is False
    assert empty_res.count_source == "unavailable"
    assert "Empty" in empty_res.message

    bad_res = tracker.process_frame(b"not_a_valid_jpeg_frame")
    assert bad_res.is_genuine_ai is False
    assert bad_res.count_source == "unavailable"
    assert "Invalid" in bad_res.message


def test_attendance_counter_unit_tracking_and_manual_separation():
    """Unit test (no model): verifies deduplication, temporary disappearance, and manual separation."""
    counter = AttendanceCounter(min_hits=1)

    # Frame 1: two people tracked
    assert counter.update([1, 2]) == 2
    # Repeated frames: same IDs must NOT increment count
    assert counter.update([1, 2]) == 2
    assert counter.update([1, 2]) == 2
    # Temporary disappearance: count preserved
    assert counter.update([]) == 2
    # Re-acquired with same IDs + 1 new person
    assert counter.update([1, 2, 3]) == 3
    assert counter.ai_unique_count == 3

    # Manual adjustment stays separate from AI unique count
    assert counter.adjust_manual(2) == 5
    assert counter.ai_unique_count == 3
    assert counter.manual_adjustment == 2

    counter.reset()
    assert counter.total_count == 0
    assert counter.ai_unique_count == 0
    assert counter.manual_adjustment == 0


def test_per_session_tracker_isolation():
    """Two concurrent sessions must never share ByteTrack or AttendanceCounter state."""
    tracker_a = vision_pipeline.create_session_tracker()
    tracker_b = vision_pipeline.create_session_tracker()

    tracker_a.counter.update([10, 11, 12])
    assert tracker_a.counter.total_count == 3
    assert tracker_b.counter.total_count == 0

    tracker_a.reset()
    assert tracker_a.counter.total_count == 0
    assert tracker_b.counter.total_count == 0


def test_ai_unavailable_never_fabricates_counts():
    """Mocked unavailable runtime must honestly report unavailable and 0 count."""
    with patch.object(VisionPipeline, "_initialize_model", return_value=None):
        p = VisionPipeline()
        p.is_ready = False
        p.status_message = "Computer vision runtime unavailable"
        res = p.process_frame(b"fake_bytes")
        assert res.is_genuine_ai is False
        assert res.count_source == "unavailable"
        assert res.total_count == 0
        assert "unavailable" in res.message.lower()


def test_cv_pipeline_reset():
    vision_pipeline._tracked_ids.add(101)
    vision_pipeline.reset_session()
    assert len(vision_pipeline._tracked_ids) == 0
