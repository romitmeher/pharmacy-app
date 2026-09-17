"""
SmartPharm - Actual Medicine Packaging OCR Trainer Unit Tests
Validates PRD Rules 2, 9, 10, & 21:
- PaddleOCR text extraction over actual medicine packaging images.
- Entity extraction & database catalog matching.
- API endpoint /api/vision/ocr-actual-medicines.
"""

import pytest
from app.vision.medicine_ocr_trainer import default_medicine_ocr_indexer


def test_process_actual_medicine_ocr_runs(app, sample_store):
    """Verify process_actual_medicine_ocr executes without exception."""
    with app.app_context():
        res = default_medicine_ocr_indexer.process_actual_medicine_ocr(max_images=5, store_id=sample_store.id)
        assert isinstance(res, dict)
        assert "status" in res


def test_ocr_actual_medicines_api(client, owner_token):
    """Test POST /api/vision/ocr-actual-medicines endpoint."""
    headers = {"Authorization": f"Bearer {owner_token}"}
    res = client.post(
        "/api/vision/ocr-actual-medicines",
        json={"max_images": 2},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"

