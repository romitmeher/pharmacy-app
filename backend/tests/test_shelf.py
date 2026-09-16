"""
SmartPharm - Shelf & Location Intelligence Test Suite
Strict compliance with SmartPharm PRD Phase 6:
- Physical storage planograms and capacity tracking
- Fast Dispense Locator with FEFO priority
- Cold-Chain and storage compliance audits (PRD Rule 23)
- Shelf cycle count audits with discrepancy detection & reconciliation (PRD Rule 22)
- Shelf REST API endpoints
"""

import datetime
import pytest

from app.models.location import Location, LocationType
from app.models.medicine import Medicine, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.shelf import (
    default_planogram_engine,
    default_compliance_auditor,
    default_shelf_audit_engine,
    StorageClimateZone,
    ComplianceSeverity,
    CycleCountVarianceState,
)


@pytest.fixture
def shelf_seed_data(db, sample_store):
    """Seed multiple storage locations, cold-chain biologics, ambient tablets, and inventory."""
    # 1. Physical Locations
    loc_shelf = Location(
        store_id=sample_store.id,
        name="Shelf A-1",
        description="Main Dispense Rack Aisle 1",
        location_type=LocationType.SHELF,
        is_active=True,
    )
    loc_fridge = Location(
        store_id=sample_store.id,
        name="Main Refrigerator",
        description="Cold storage 2°C - 8°C",
        location_type=LocationType.FRIDGE,
        is_active=True,
    )
    loc_drawer = Location(
        store_id=sample_store.id,
        name="Secure Drawer 1",
        description="Locked narcotic cabinet",
        location_type=LocationType.DRAWER,
        is_active=True,
    )
    db.session.add_all([loc_shelf, loc_fridge, loc_drawer])
    db.session.flush()

    today = datetime.date.today()

    # 2. Ambient Medicine: Crocin 650
    med_crocin = Medicine(
        store_id=sample_store.id,
        brand_name="Crocin 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        storage_requirements="Store below 30°C in a dry place",
        mrp=35.00,
        selling_price=30.00,
        is_active=True,
    )

    # 3. Cold-Chain Medicine: Lantus Solostar (Insulin Glargine - strictly 2-8°C)
    med_insulin = Medicine(
        store_id=sample_store.id,
        brand_name="Lantus Solostar",
        generic_name="Insulin Glargine",
        strength="100 IU/ml",
        dosage_form=DosageForm.INJECTION,
        storage_requirements="Store in refrigerator (2°C - 8°C). Do not freeze.",
        mrp=650.00,
        selling_price=620.00,
        is_active=True,
    )

    # 4. Misplaced Cold-Chain Medicine: Humalog (Stored accidentally on ambient Shelf A-1)
    med_humalog = Medicine(
        store_id=sample_store.id,
        brand_name="Humalog Mix 50",
        generic_name="Insulin Lispro",
        strength="100 IU/ml",
        dosage_form=DosageForm.INJECTION,
        storage_requirements="Refrigerate between 2°C and 8°C",
        mrp=550.00,
        selling_price=510.00,
        is_active=True,
    )
    db.session.add_all([med_crocin, med_insulin, med_humalog])
    db.session.flush()

    # 5. Batches
    # Crocin: 2 batches on Shelf A-1 (to test FEFO priority picking)
    b_crocin_early = Batch(
        store_id=sample_store.id,
        medicine_id=med_crocin.id,
        batch_number="CR-EARLY",
        expiry_date=today + datetime.timedelta(days=60),  # Expires sooner
        purchase_price=20.00,
        mrp=35.00,
        quantity_received=50,
    )
    b_crocin_late = Batch(
        store_id=sample_store.id,
        medicine_id=med_crocin.id,
        batch_number="CR-LATE",
        expiry_date=today + datetime.timedelta(days=365), # Expires later
        purchase_price=20.00,
        mrp=35.00,
        quantity_received=50,
    )

    # Insulin: in fridge (proper)
    b_insulin = Batch(
        store_id=sample_store.id,
        medicine_id=med_insulin.id,
        batch_number="INS-FRIDGE-01",
        expiry_date=today + datetime.timedelta(days=180),
        purchase_price=450.00,
        mrp=650.00,
        quantity_received=20,
    )

    # Humalog: on ambient shelf (VIOLATION)
    b_humalog = Batch(
        store_id=sample_store.id,
        medicine_id=med_humalog.id,
        batch_number="HUM-WARM-01",
        expiry_date=today + datetime.timedelta(days=120),
        purchase_price=380.00,
        mrp=550.00,
        quantity_received=15,
    )
    db.session.add_all([b_crocin_early, b_crocin_late, b_insulin, b_humalog])
    db.session.flush()

    # 6. Physical Inventory allocations
    inv_cr_early = Inventory(
        store_id=sample_store.id,
        batch_id=b_crocin_early.id,
        location_id=loc_shelf.id,
        quantity_available=25,
    )
    inv_cr_late = Inventory(
        store_id=sample_store.id,
        batch_id=b_crocin_late.id,
        location_id=loc_shelf.id,
        quantity_available=30,
    )
    inv_insulin = Inventory(
        store_id=sample_store.id,
        batch_id=b_insulin.id,
        location_id=loc_fridge.id,
        quantity_available=20,
    )
    inv_humalog_violation = Inventory(
        store_id=sample_store.id,
        batch_id=b_humalog.id,
        location_id=loc_shelf.id,  # VIOLATION: on ambient shelf!
        quantity_available=15,
    )
    db.session.add_all([inv_cr_early, inv_cr_late, inv_insulin, inv_humalog_violation])
    db.session.commit()

    return {
        "loc_shelf": loc_shelf,
        "loc_fridge": loc_fridge,
        "loc_drawer": loc_drawer,
        "med_crocin": med_crocin,
        "med_insulin": med_insulin,
        "med_humalog": med_humalog,
        "b_crocin_early": b_crocin_early,
        "b_crocin_late": b_crocin_late,
        "inv_cr_early": inv_cr_early,
        "inv_cr_late": inv_cr_late,
    }


def test_shelf_planogram_generation(db, sample_store, shelf_seed_data):
    """Test full store planogram calculation and climate zone classification."""
    planogram = default_planogram_engine.get_store_planogram(store_id=sample_store.id)

    assert planogram["store_id"] == sample_store.id
    assert planogram["summary"]["total_locations"] == 3
    assert planogram["summary"]["total_occupied_units"] == (25 + 30 + 20 + 15)  # 90 units
    assert planogram["summary"]["store_utilization_pct"] > 0.0

    shelves = {s["name"]: s for s in planogram["shelves"]}
    assert "Shelf A-1" in shelves
    assert "Main Refrigerator" in shelves
    assert "Secure Drawer 1" in shelves

    # Verify climate zones
    assert shelves["Shelf A-1"]["climate_zone"] == StorageClimateZone.AMBIENT.value
    assert shelves["Main Refrigerator"]["climate_zone"] == StorageClimateZone.COLD_CHAIN_FRIDGE.value
    assert shelves["Secure Drawer 1"]["climate_zone"] == StorageClimateZone.SECURE_DRAWER.value

    # Verify coordinate generation
    assert "AISLE" in shelves["Shelf A-1"]["coordinate_code"] or "A-1" in shelves["Shelf A-1"]["coordinate_code"]
    assert len(shelves["Shelf A-1"]["items"]) == 3  # 2 crocin batches + 1 humalog


def test_fast_dispense_locator(db, sample_store, shelf_seed_data):
    """Test rapid picking locator with FEFO prioritization and directional guidance."""
    crocin = shelf_seed_data["med_crocin"]
    picks = default_planogram_engine.locate_medicine_for_dispensing(
        store_id=sample_store.id, medicine_id=crocin.id
    )

    assert len(picks) == 2
    # First pick location must be the FEFO priority (CR-EARLY expires in 60 days vs CR-LATE in 365 days)
    assert picks[0].batch_number == "CR-EARLY"
    assert picks[0].is_fefo_priority is True
    assert picks[1].batch_number == "CR-LATE"
    assert picks[1].is_fefo_priority is False

    # Check directional guide
    assert "Aisle" in picks[0].directional_guide
    assert picks[0].quantity_available == 25


def test_cold_chain_compliance_auditor(db, sample_store, shelf_seed_data):
    """Test detection of cold-chain violations (PRD Rule 23)."""
    alerts = default_compliance_auditor.audit_store_compliance(store_id=sample_store.id)

    # Must catch Humalog (Insulin) stored on Shelf A-1 (Ambient)
    critical_alerts = [a for a in alerts if a.severity == ComplianceSeverity.CRITICAL_VIOLATION]
    assert len(critical_alerts) >= 1

    humalog_alert = next((a for a in critical_alerts if "Humalog" in a.brand_name), None)
    assert humalog_alert is not None
    assert humalog_alert.location_name == "Shelf A-1"
    assert humalog_alert.units_affected == 15
    assert "Cold-Chain" in humalog_alert.issue_title
    assert "transfer" in humalog_alert.action_required.lower()


def test_shelf_cycle_count_audit_and_reconciliation(db, sample_store, shelf_seed_data, sample_owner):
    """Test physical cycle counting, variance detection, and audit reconciliation (PRD Rule 22)."""
    loc_shelf = shelf_seed_data["loc_shelf"]
    med_crocin = shelf_seed_data["med_crocin"]
    med_humalog = shelf_seed_data["med_humalog"]

    # Scanned counts:
    # 1. CR-EARLY: Scanned 25 vs Expected 25 -> MATCHED
    # 2. CR-LATE: Scanned 20 vs Expected 30 -> DEFICIT of -10 units (shrinkage)
    # 3. HUM-WARM-01: Scanned 18 vs Expected 15 -> SURPLUS of +3 units
    scanned_payload = [
        {"medicine_id": med_crocin.id, "batch_number": "CR-EARLY", "scanned_quantity": 25},
        {"medicine_id": med_crocin.id, "batch_number": "CR-LATE", "scanned_quantity": 20},
        {"medicine_id": med_humalog.id, "batch_number": "HUM-WARM-01", "scanned_quantity": 18},
    ]

    # Part 1: Preview audit mode (apply_adjustments=False)
    report_preview = default_shelf_audit_engine.conduct_shelf_audit(
        store_id=sample_store.id,
        location_id=loc_shelf.id,
        scanned_items=scanned_payload,
        user_id=sample_owner.id,
        apply_adjustments=False,
        notes="Routine weekly cycle count",
    )

    assert report_preview.total_items_audited == 3
    assert report_preview.matched_items_count == 1
    assert report_preview.discrepancies_count == 2
    assert report_preview.is_committed is False

    # Check states
    items_by_batch = {it.batch_number: it for it in report_preview.items}
    assert items_by_batch["CR-EARLY"].variance_state == CycleCountVarianceState.MATCHED
    assert items_by_batch["CR-LATE"].variance_state == CycleCountVarianceState.DEFICIT
    assert items_by_batch["CR-LATE"].variance_units == -10
    assert items_by_batch["HUM-WARM-01"].variance_state == CycleCountVarianceState.SURPLUS
    assert items_by_batch["HUM-WARM-01"].variance_units == 3

    # Ensure no database stock was mutated in preview mode
    inv_cr_late = Inventory.query.filter_by(batch_id=shelf_seed_data["b_crocin_late"].id).first()
    assert inv_cr_late.quantity_available == 30

    # Part 2: Commit reconciliation (apply_adjustments=True)
    report_commit = default_shelf_audit_engine.conduct_shelf_audit(
        store_id=sample_store.id,
        location_id=loc_shelf.id,
        scanned_items=scanned_payload,
        user_id=sample_owner.id,
        apply_adjustments=True,
        notes="Reconciled shelf count variance",
    )

    assert report_commit.is_committed is True

    # Verify inventory was updated to scanned counts
    db.session.refresh(inv_cr_late)
    assert inv_cr_late.quantity_available == 20

    # Verify last_counted_at timestamp was refreshed
    assert inv_cr_late.last_counted_at is not None


def test_api_shelf_endpoints(client, owner_token, shelf_seed_data, sample_store):
    """Test all Shelf Intelligence REST API endpoints."""
    auth_headers = {"Authorization": f"Bearer {owner_token}"}
    crocin = shelf_seed_data["med_crocin"]
    loc_shelf = shelf_seed_data["loc_shelf"]

    # 1. GET /api/shelf/layout
    r_layout = client.get("/api/shelf/layout", headers=auth_headers)
    assert r_layout.status_code == 200
    res_l = r_layout.get_json()
    assert res_l["status"] == "success"
    assert res_l["data"]["summary"]["total_locations"] == 3

    # 2. GET /api/shelf/locate/<id>
    r_locate = client.get(f"/api/shelf/locate/{crocin.id}", headers=auth_headers)
    assert r_locate.status_code == 200
    res_loc = r_locate.get_json()
    assert res_loc["status"] == "success"
    assert len(res_loc["data"]["pick_locations"]) == 2

    # 3. GET /api/shelf/compliance-alerts
    r_alerts = client.get("/api/shelf/compliance-alerts", headers=auth_headers)
    assert r_alerts.status_code == 200
    res_a = r_alerts.get_json()
    assert res_a["status"] == "success"
    assert res_a["data"]["summary"]["total_alerts"] >= 1

    # 4. POST /api/shelf/audit-count
    audit_body = {
        "location_id": loc_shelf.id,
        "scanned_items": [
            {"medicine_id": crocin.id, "batch_number": "CR-EARLY", "scanned_quantity": 25}
        ],
        "apply_adjustments": False,
        "notes": "API test audit scan",
    }
    r_audit = client.post("/api/shelf/audit-count", json=audit_body, headers=auth_headers)
    assert r_audit.status_code == 200
    res_aud = r_audit.get_json()
    assert res_aud["status"] == "success"
    assert res_aud["data"]["location_name"] == "Shelf A-1"
