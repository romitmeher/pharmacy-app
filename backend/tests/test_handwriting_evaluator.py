"""
SmartPharm - Handwriting Evaluator Unit Tests
Tests CER calculation, dataset discovery, benchmark evaluation, and Flask endpoints.
"""

import pytest
from app.vision.handwriting_evaluator import (
    compute_character_error_rate,
    HandwritingDatasetEvaluator,
    default_handwriting_evaluator,
)


def test_compute_character_error_rate():
    assert compute_character_error_rate("", "") == 0.0
    assert compute_character_error_rate("Naprosyn", "Naprosyn") == 0.0
    assert compute_character_error_rate("Dexter", "Dexter 60") > 0.0
    # 1 edit distance over 5 characters = 0.2 CER
    assert compute_character_error_rate("Monas", "Monaz") == pytest.approx(0.2, 0.01)


def test_discover_datasets():
    datasets = default_handwriting_evaluator.discover_datasets()
    assert isinstance(datasets, list)
    assert len(datasets) > 0
    ds_names = [d["dataset_name"] for d in datasets]
    assert "RxHandBD_BDHandwritten_Merged" in ds_names


def test_evaluate_dataset_samples(db, sample_store):
    eval_res = default_handwriting_evaluator.evaluate_dataset_samples(
        dataset_name="RxHandBD_BDHandwritten_Merged",
        max_samples=5,
        split="train",
    )
    assert "total_evaluated" in eval_res
    assert eval_res["total_evaluated"] == 5
    assert "medicine_catalog_resolution_rate_pct" in eval_res


def test_api_handwriting_endpoints(client, pharmacist_token):
    headers = {"Authorization": f"Bearer {pharmacist_token}"}

    # 1. GET /api/vision/handwriting-datasets
    resp = client.get("/api/vision/handwriting-datasets", headers=headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "success"
    assert len(body["data"]) > 0

    # 2. POST /api/vision/evaluate-handwriting
    resp2 = client.post(
        "/api/vision/evaluate-handwriting",
        headers=headers,
        json={"dataset_name": "RxHandBD_BDHandwritten_Merged", "max_samples": 3, "split": "train"},
    )
    assert resp2.status_code == 200
    body2 = resp2.get_json()
    assert body2["status"] == "success"
    assert body2["data"]["total_evaluated"] == 3

