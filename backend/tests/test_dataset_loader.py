"""
Unit & Integration Tests for ABDM Drug Registry v3 & Indian Medicine Dataset Loader.
"""

import csv
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


@pytest.fixture
def dataset_dir(tmp_path):
    """Small deterministic registry; no downloaded or ignored files required."""
    path = tmp_path / "Product List_17_9_2026 @ 19_54_16.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Generic Name", "MRP", "Group Name"])
        writer.writeheader()
        for index in range(12):
            writer.writerow({"Generic Name": f"Fixture{index} Tablets IP 500mg",
                             "MRP": "25.50", "Group Name": "General"})
    return tmp_path


def test_parse_abdm_csv_file(dataset_dir):
    items = parse_abdm_csv_file(str(dataset_dir / "Product List_17_9_2026 @ 19_54_16.csv"))
    assert len(items) == 12
    assert items[0].brand_name == "Fixture0"
    assert items[0].mrp == 25.50


def test_load_dataset_directory_into_db(db, app, sample_store, dataset_dir):
    with app.app_context():
        res = load_dataset_directory_into_db(str(dataset_dir), store_id=sample_store.id)
        assert res["total_processed"] == 12
        assert res["added"] == 12
        assert Medicine.query.filter_by(store_id=sample_store.id).count() == 12
        assert MedicineAlias.query.count() >= 12


def test_api_seed_abdm_dataset_endpoint(client, owner_token, db, dataset_dir, monkeypatch):
    # Redirect the local data source while exercising the real ingestion and DB writes.
    def load_fixture_directory(_data_dir, store_id):
        return load_dataset_directory_into_db(str(dataset_dir), store_id=store_id)

    monkeypatch.setattr("app.vision.dataset_loader.load_dataset_directory_into_db",
                        load_fixture_directory)
    res = client.post(
        "/api/vision/seed-abdm-dataset",
        headers={"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"},
    )
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["status"] == "success"
    assert payload["data"]["total_processed"] == 12
    assert payload["data"]["added"] == 12
