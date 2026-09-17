"""
Unit & Integration Tests for ABDM Drug Registry v3 & Indian Medicine Dataset Loader.
"""

import os
import pytest
from app.models.medicine import Medicine, MedicineAlias, DosageForm
from app.vision.dataset_loader import (
    parse_dosage_form_from_text,
    parse_strength_from_text,
    parse_abdm_csv_file,
    parse_az_medicines_csv,
    load_dataset_directory_into_db,
)


def test_parse_dosage_form_and_strength_regex():
    """Verify regex parsers correctly identify dosage forms and strengths."""
    assert parse_dosage_form_from_text("Aceclofenac 100mg Tablets") == DosageForm.TABLET
    assert parse_dosage_form_from_text("Pregabalin Capsules IP 75 mg") == DosageForm.CAPSULE
    assert parse_dosage_form_from_text("Paracetamol Syrup 125mg/5ml") == DosageForm.SYRUP
    assert parse_dosage_form_from_text("Diclofenac Gel 1.16%w/w") == DosageForm.GEL
    assert parse_dosage_form_from_text("Salbutamol Inhaler 100mcg") == DosageForm.INHALER

    assert parse_strength_from_text("Aceclofenac 100mg and Paracetamol 325mg Tablets") == "100mg / 325mg"
    assert parse_strength_from_text("Clotrimazole Cream IP 1% w/w") == "1% w/w"


def test_parse_abdm_csv_file():
    """Verify ABDM v3 CSV parser reads data directory."""
    data_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data")
    )
    abdm_file = os.path.join(data_dir, "Product List_17_9_2026 @ 19_54_16.csv")
    if os.path.exists(abdm_file):
        items = parse_abdm_csv_file(abdm_file)
        assert len(items) > 100
        assert items[0].brand_name != ""
        assert items[0].mrp >= 0.0


def test_load_dataset_directory_into_db(db, app):
    """Verify dataset loader populates Medicine and MedicineAlias DB tables."""
    data_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data")
    )
    with app.app_context():
        res = load_dataset_directory_into_db(data_dir, store_id=1)
        assert res["total_processed"] > 0
        assert res["added"] > 0 or res["updated"] > 0

        # Verify DB entries
        count = Medicine.query.filter_by(store_id=1).count()
        assert count > 10

        alias_count = MedicineAlias.query.count()
        assert alias_count > 10


def test_api_seed_abdm_dataset_endpoint(client, owner_token, db):
    """Test POST /api/vision/seed-abdm-dataset endpoint."""
    res = client.post(
        "/api/vision/seed-abdm-dataset",
        headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"},
    )
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["status"] == "success"
    assert "data" in json_data
    assert json_data["data"]["total_processed"] > 0
