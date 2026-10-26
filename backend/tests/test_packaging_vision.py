"""Cloud transcription remains evidence, never a bypass of catalog dose checks."""
from types import SimpleNamespace
from unittest.mock import Mock
import numpy as np
import pytest
from app.vision.packaging_vision import reading_entities, read_package
from app.vision.matcher import default_medicine_matcher
from app.models.medicine import Medicine


def reading(**changes):
    value = dict(brand="Cyclomine", strength="20 mg + 325 mg", manufacturer=None,
                 visible_text="Cyclomine Dicyclomine 20 mg Paracetamol 325 mg", uncertain=False)
    return {**value, **changes}


@pytest.mark.parametrize("changes", [dict(uncertain=True), dict(brand=None),
    dict(brand="Another Drug"), dict(strength="20 mg + 500 mg"), dict(strength="500")])
def test_ambiguous_or_unsupported_reading_rejected(changes):
    assert reading_entities(reading(**changes)) is None


def test_provider_does_not_invent_ocr_confidence_or_transaction_fields():
    entities = reading_entities(reading())
    assert entities.confidence == 0
    assert entities.batch_number is None and entities.expiry_date is None and entities.mrp is None


@pytest.mark.parametrize("strength,accepted", [("20 mg + 325 mg", True), ("20 mg + 500 mg", False)])
def test_cloud_reading_still_checks_catalog_doses(db, sample_store, strength, accepted):
    db.session.add(Medicine(store_id=sample_store.id, brand_name="Cyclomine",
        strength="20 mg + 325 mg", is_active=True)); db.session.flush()
    entities = reading_entities(reading(strength=strength,
        visible_text=f"Cyclomine Dicyclomine / Paracetamol {strength}"))
    result = default_medicine_matcher.match(entities, store_id=sample_store.id)
    assert bool(result.top_candidate and not result.low_confidence) == accepted


def test_testing_never_calls_external_provider(app):
    with app.app_context():
        assert read_package(np.zeros((100,100,3), np.uint8)) is None


def test_verified_cloud_candidate_skips_slow_local_ocr(app, monkeypatch):
    import app.vision as pipeline
    import app.vision.packaging_vision as cloud
    import app.services.barcode_service as barcodes
    entities = reading_entities(reading())
    candidate = SimpleNamespace(strength="20 mg + 325 mg")
    match = SimpleNamespace(top_candidate=candidate, low_confidence=False)
    monkeypatch.setattr(barcodes, "decode_barcode_pixels", lambda image: None)
    monkeypatch.setattr(pipeline, "assess_image_quality", lambda image: SimpleNamespace(is_acceptable=True))
    monkeypatch.setattr(cloud, "read_package", lambda image: entities)
    monkeypatch.setattr(pipeline.default_medicine_matcher, "match", lambda *a, **k: match)
    local = Mock(side_effect=AssertionError("Accepted cloud reading should not initialize Paddle"))
    monkeypatch.setattr(pipeline, "_packaging_ocr", local)
    with app.app_context():
        result = pipeline.recognize_medicine_image(np.zeros((400,500,3), np.uint8), store_id=1)
    assert result.recognition_engine == "google_package_transcription"
    assert result.human_verification_required and result.ocr.avg_confidence == 0
    local.assert_not_called()


@pytest.mark.parametrize("failure", [True, False])
def test_cloud_failure_or_missing_dose_falls_back_locally(app, monkeypatch, failure):
    import app.vision as pipeline
    import app.vision.packaging_vision as cloud
    import app.vision.packaging_orientation as orientation
    import app.services.barcode_service as barcodes
    from app.vision.ocr_engine import OCRResult
    from app.vision.visual_indexer import default_visual_indexer
    monkeypatch.setattr(barcodes, "decode_barcode_pixels", lambda image: None)
    monkeypatch.setattr(pipeline, "assess_image_quality", lambda image: SimpleNamespace(is_acceptable=True))
    def provider(image):
        if failure:
            raise TimeoutError("Provider timeout")
        return reading_entities(reading(strength=None))
    monkeypatch.setattr(cloud, "read_package", provider)
    monkeypatch.setattr(pipeline.default_medicine_matcher, "match", lambda *a, **k:
        SimpleNamespace(top_candidate=SimpleNamespace(strength="20 mg + 325 mg"), low_confidence=False))
    rejected = SimpleNamespace(top_candidate=None, low_confidence=True)
    local = Mock(return_value=(OCRResult("", [], [], 0), None, rejected, 0))
    monkeypatch.setattr(orientation, "read_packaging_orientations", local)
    monkeypatch.setattr(default_visual_indexer, "search_similar", lambda *a, **k: [])
    with app.app_context():
        result = pipeline.recognize_medicine_image(np.zeros((400,500,3), np.uint8), store_id=1)
    assert result.match_result.low_confidence and result.recognition_engine == "local_ocr"
    local.assert_called_once()
