"""
SmartPharm - Master AI/ML Training Pipeline Unit Test
Validates PRD Rules 4, 16, 17, 18, 19:
- Executes train_all_models pipeline function safely in app context.
- Verifies return status across catalog vectors, image vectors, forecasting, stockout, and reorder.
"""

import pytest
from app.ml.train_all import train_all_models


def test_train_all_models_execution(app, sample_store, monkeypatch):
    """Test full execution of train_all_models pipeline."""
    from app.ml import train_all
    monkeypatch.setattr(train_all.default_image_vector_indexer, "index_all_images", lambda **kw: {"status": "success", "total_indexed": 0})
    monkeypatch.setattr(train_all.default_medicine_ocr_indexer, "process_actual_medicine_ocr", lambda **kw: {"status": "success", "total_processed": 0})
    with app.app_context():
        summary = train_all_models(store_id=sample_store.id)

        assert isinstance(summary, dict)
        assert summary["store_id"] == sample_store.id
        assert "results" in summary

        res = summary["results"]
        assert "catalog_vector_indexing" in res
        assert "image_vector_indexing" in res
        assert "demand_forecasting" in res
        assert "stockout_and_expiry_risks" in res
        assert "smart_reorder" in res

        assert all(stage["status"] == "success" for stage in res.values())
