from app.cv.pipeline import VisionPipeline


def test_cv_pipeline_integrity():
    pipeline = VisionPipeline()
    # If YOLO/OpenCV libraries are not installed in the host runtime,
    # the pipeline must report unavailable and MUST NOT fabricate fake AI counts
    if not pipeline.is_ready:
        res = pipeline.process_frame(b"fake_frame_bytes")
        assert res.is_genuine_ai is False
        assert res.count_source == "unavailable"
        assert "Computer vision runtime unavailable" in res.message or "Failed to load" in res.message
    else:
        assert pipeline.is_ready is True
        assert pipeline.model is not None


def test_cv_pipeline_reset():
    pipeline = VisionPipeline()
    pipeline._tracked_ids.add(101)
    pipeline.reset_session()
    assert len(pipeline._tracked_ids) == 0
