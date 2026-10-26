"""Demo review must never become a verified billing identity or affect normal mode."""
import numpy as np

from app.vision import recognize_medicine_image
from app.vision.ocr_engine import OCRResult
from app.utils.errors import ValidationError


def test_normal_mode_does_not_load_demo_model(app, monkeypatch):
    def forbidden(*args):
        raise AssertionError("Demo model must not run in normal mode")
    monkeypatch.setattr("app.vision.photo_classifier.demo_review_suggestion", forbidden)
    with app.app_context():
        result = recognize_medicine_image(b"corrupted upload", store_id=1)
    assert not result.success
    assert result.demo_suggestion is None


def test_demo_suggestion_is_review_only(app, monkeypatch):
    monkeypatch.setitem(app.config, "DEMO_PHOTO_REVIEW", True)
    suggestion = {"medicine_id": 123, "name": "Example", "message": "Review printed packaging"}
    monkeypatch.setattr("app.vision.photo_classifier.demo_review_suggestion", lambda *args: suggestion)
    def no_barcode(*args):
        raise ValidationError("No readable barcode found")
    monkeypatch.setattr("app.services.barcode_service.decode_barcode_pixels", no_barcode)
    with app.app_context():
        result = recognize_medicine_image(np.full((400, 400, 3), 200, dtype=np.uint8), store_id=1)
    assert result.success
    assert result.demo_suggestion == suggestion
    assert result.human_verification_required
    assert result.match_result.top_candidate is None
    assert result.match_result.low_confidence
    assert not result.quality.is_acceptable  # Quality warning remains truthful.


def test_unmapped_qr_payload_does_not_block_photo_ocr(app, monkeypatch):
    import cv2
    def unsupported(*args):
        raise ValidationError("Scan a barcode containing 4–64 printable characters without spaces.")
    monkeypatch.setattr("app.services.barcode_service.decode_barcode_pixels", unsupported)
    image = np.full((400, 400, 3), 200, dtype=np.uint8)
    cv2.putText(image, "Medicine label", (10, 140), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 3)
    ocr = OCRResult("", [], [], 0)
    with app.app_context():
        result = recognize_medicine_image(image, store_id=1, ocr_override=ocr)
    assert result.success
    assert result.ocr is ocr
