"""
SmartPharm - Master AI/ML Training Pipeline Unit Test
Validates PRD Rules 4, 16, 17, 18, 19:
- Executes train_all_models pipeline function safely in app context.
- Verifies return status across catalog vectors, image vectors, forecasting, stockout, and reorder.
"""

import pytest
from app.ml.train_all import train_all_models


def test_train_all_models_execution(app, sample_store):
    """Test full execution of train_all_models pipeline."""
    with app.app_context():
        summary = train_all_models(store_id=sample_store.id)

        assert isinstance(summary, dict)
        assert summary["store_id"] == sample_store.id
        assert "results" in summary

        res = summary["results"]
        assert "catalog_vector_indexing" in res
        assert "prescription_image_vector_indexing" in res
        assert "demand_forecasting" in res
        assert "stockout_and_expiry_risks" in res
        assert "smart_reorder" in res
