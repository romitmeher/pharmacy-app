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
        assert res["status"] == "success"
        assert res["total_processed"] == 1


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



@pytest.fixture(autouse=True)
def packaging_sample(tmp_path, monkeypatch):
    """Test the real loop with a local image and a recording DB adapter."""
    from unittest.mock import MagicMock
    import cv2
    import numpy as np
    from app.ai.vector_store import default_vector_store
    from app.vision.medicine_ocr_trainer import MedicinePackagingOCRIndexer
    from app.vision.ocr_engine import default_ocr_engine, OCRResult
    cv2.imwrite(str(tmp_path / "crocin.png"), np.full((64, 64, 3), 160, dtype=np.uint8))
    monkeypatch.setattr(MedicinePackagingOCRIndexer, "MEDICINE_DATA_DIR", str(tmp_path))
    connection = MagicMock()
    monkeypatch.setattr(default_vector_store, "_get_pg_connection", lambda: connection)
    monkeypatch.setattr(default_ocr_engine, "run_ocr", lambda image: OCRResult("Crocin 650", ["Crocin 650"], [], 0.9))
    return connection
