"""
SmartPharm - Distributor Intelligence Test Suite
Tests:
- Invoice text parsing (headers, line items, multi-format tables)
- Catalog auto-matching and supplier resolution
- Physical delivery verification comparison engine (PRD Rule 12: all 7 discrepancy types)
- Distributor API endpoints:
  - POST /api/distributor/scan-invoice (creates DRAFT, PRD Rule 8/11: zero inventory mutation)
  - POST /api/distributor/verify-delivery (audit discrepancy report)
  - POST /api/distributor/confirm-delivery (human review boundary -> books batches & stock)
"""

import datetime
import secrets
import pytest
from app.models.user import User, UserRole
from app.models.medicine import Medicine, DosageForm
from app.models.location import Location, LocationType
from app.models.supplier import Supplier
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus
from app.distributor import (
    default_invoice_parser,
    default_catalog_matcher,
    default_delivery_verifier,
    ExpectedItem,
    ActualScannedItem,
    DiscrepancyType,
)


SAMPLE_INVOICE_TEXT = """
================================================================================
                    MAHAVIR PHARMA DISTRIBUTORS PVT LTD
             24 Wholesale Market, Kalbadevi, Mumbai - 400002
GSTIN: 27AAACM1234F1Z5                  DL No: 20B/21B-45892
--------------------------------------------------------------------------------
Invoice No: MP-2026-9842                Date: 15/09/2026
Customer: Test Pharmacy                 Due Date: 30/09/2026
--------------------------------------------------------------------------------
Item Description           Pack    HSN      Batch No    Exp Date   Qty  Rate    MRP    GST%  Amount
--------------------------------------------------------------------------------
CROCIN 650 MG TAB         15's    300490   CR-9921     08/2028    50   24.50   35.00  12%   1225.00
AZITHRAL 500 MG TAB        5's     300490   AZ-4410     11/2027    20   85.00  118.00  12%   1700.00
AUGMENTIN 625 DUO TAB     10's    300490   AUG-102     04/2027    10  160.00  204.00  12%   1600.00
--------------------------------------------------------------------------------
Subtotal: Rs. 4525.00
GST Total: Rs. 543.00
Grand Total: Rs. 5068.00
================================================================================
"""


@pytest.fixture
def distributor_seed(db, sample_store):
    """Seed existing medicines, locations, and suppliers for distributor matching."""
    med1 = Medicine(
        store_id=sample_store.id,
        brand_name="Crocin 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="GSK",
        mrp=35.00,
        selling_price=33.00,
        is_active=True,
    )
    med2 = Medicine(
        store_id=sample_store.id,
        brand_name="Azithral 500",
        generic_name="Azithromycin",
        strength="500mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="Alembic",
        mrp=118.00,
        selling_price=110.00,
        is_active=True,
    )
    db.session.add_all([med1, med2])
    db.session.flush()

    supplier = Supplier(
        store_id=sample_store.id,
        name="Mahavir Pharma Distributors Pvt Ltd",
        gstin="27AAACM1234F1Z5",
        phone="02223456789",
        is_active=True,
    )
    db.session.add(supplier)

    loc = Location(
        store_id=sample_store.id,
        name="Receiving Bay 1",
        location_type=LocationType.SHELF,
    )
    db.session.add(loc)
    db.session.commit()

    return {
        "store": sample_store,
        "med1": med1,
        "med2": med2,
        "supplier": supplier,
        "location": loc,
    }


def test_invoice_parser_headers_and_line_items():
    """Test extracting distributor metadata, totals, and line items from text."""
    parsed = default_invoice_parser.parse_text(SAMPLE_INVOICE_TEXT)

    assert "MAHAVIR PHARMA" in parsed.distributor_name.upper()
    assert parsed.distributor_gstin == "27AAACM1234F1Z5"
    assert parsed.invoice_number == "MP-2026-9842"
    assert str(parsed.invoice_date) == "2026-09-15"
    assert parsed.total_amount == 5068.00

    assert len(parsed.items) == 3
    crocin_item = parsed.items[0]
    assert "CROCIN" in crocin_item.raw_item_name.upper()
    assert crocin_item.batch_number == "CR-9921"
    assert crocin_item.quantity == 50
    assert crocin_item.purchase_rate == 24.50
    assert crocin_item.mrp == 35.00
    assert crocin_item.expiry_date == datetime.date(2028, 8, 31)


def test_catalog_matching_existing_and_new(db, distributor_seed):
    """Test catalog matcher linking existing catalog medicines and flagging new products."""
    parsed = default_invoice_parser.parse_text(SAMPLE_INVOICE_TEXT)
    store = distributor_seed["store"]

    matched_draft = default_catalog_matcher.match(parsed, store_id=store.id)

    assert matched_draft.supplier_id == distributor_seed["supplier"].id
    assert len(matched_draft.items) == 3

    # Crocin 650 should match existing med1
    item0 = matched_draft.items[0]
    assert item0.medicine_id == distributor_seed["med1"].id
    assert not item0.is_new_medicine

    # Azithral 500 should match existing med2
    item1 = matched_draft.items[1]
    assert item1.medicine_id == distributor_seed["med2"].id
    assert not item1.is_new_medicine

    # Augmentin 625 Duo was not in seed data -> should be flagged as new medicine
    item2 = matched_draft.items[2]
    assert item2.medicine_id is None
    assert item2.is_new_medicine


def test_delivery_verifier_all_seven_scenarios():
    """
    Test delivery verification engine covering all 7 discrepancy conditions (PRD Rule 12).
    """
    expected = [
        ExpectedItem(
            item_id=1,
            medicine_name="Crocin 650",
            batch_number="CR-100",
            expiry_date="2027-06-30",
            expected_quantity=50,
            purchase_rate=20.0,
            mrp=35.0,
        ),
        ExpectedItem(
            item_id=2,
            medicine_name="Azithral 500",
            batch_number="AZ-200",
            expiry_date="2027-08-31",
            expected_quantity=20,
            purchase_rate=80.0,
            mrp=118.0,
        ),
        ExpectedItem(
            item_id=3,
            medicine_name="Dolo 650",
            batch_number="DL-300",
            expiry_date="2027-10-31",
            expected_quantity=30,
            purchase_rate=22.0,
            mrp=33.0,
        ),
        ExpectedItem(
            item_id=4,
            medicine_name="Augmentin 625",
            batch_number="AUG-400",
            expiry_date="2027-12-31",
            expected_quantity=10,
            purchase_rate=150.0,
            mrp=200.0,
        ),
    ]

    actual = [
        # 1. MATCHED: Exact quantity, batch, expiry, mrp
        ActualScannedItem(
            medicine_name="Crocin 650",
            batch_number="CR-100",
            expiry_date="2027-06-30",
            actual_quantity=50,
            mrp=35.0,
        ),
        # 2. QUANTITY_MISMATCH: Short delivered 15 instead of 20
        ActualScannedItem(
            medicine_name="Azithral 500",
            batch_number="AZ-200",
            expiry_date="2027-08-31",
            actual_quantity=15,
            mrp=118.0,
        ),
        # 3. Dolo 650 is completely missing from physical delivery (not in actual)
        # 4. Augmentin 625 has BATCH_MISMATCH and PRICING_DISCREPANCY
        ActualScannedItem(
            medicine_name="Augmentin 625",
            batch_number="AUG-999",  # different batch
            expiry_date="2027-12-31",
            actual_quantity=10,
            mrp=210.0,  # MRP discrepancy 210 vs 200
        ),
        # 5. EXTRA_ITEM: Item physically delivered that was not invoiced
        ActualScannedItem(
            medicine_name="Allegra 120",
            batch_number="AL-777",
            expiry_date="2028-01-31",
            actual_quantity=5,
            mrp=140.0,
        ),
    ]

    report = default_delivery_verifier.verify(expected, actual)

    assert report.total_expected_items == 4
    assert report.total_actual_items == 4
    assert report.discrepancy_count >= 3
    assert report.has_discrepancies

    status_map = {item.medicine_name: item.status for item in report.lines}
    assert status_map["Crocin 650"] == DiscrepancyType.MATCHED
    assert status_map["Azithral 500"] == DiscrepancyType.QUANTITY_MISMATCH
    assert status_map["Dolo 650"] == DiscrepancyType.MISSING_ITEM
    assert status_map["Allegra 120"] == DiscrepancyType.EXTRA_ITEM

    # Check financial difference calculation on short-delivered Azithral: -5 * 80.0 = -400.0
    az_item = next(i for i in report.lines if i.medicine_name == "Azithral 500")
    assert az_item.quantity_difference == -5
    assert az_item.financial_difference == -400.0


def test_api_scan_invoice_creates_draft_no_inventory(client, owner_token, distributor_seed):
    """
    PRD Rule 8 & 11:
    POST /api/distributor/scan-invoice MUST create a purchase draft and
    MUST NOT mutate physical inventory units.
    """
    initial_inventory_count = Inventory.query.count()
    initial_batch_count = Batch.query.count()

    response = client.post(
        "/api/distributor/scan-invoice",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"raw_text": SAMPLE_INVOICE_TEXT},
    )

    assert response.status_code == 201
    data = response.get_json()["data"]
    purchase_invoice_id = data["purchase_invoice_id"]
    assert data["status"].lower() == "draft"
    assert data["invoice_number"] == "MP-2026-9842"
    assert data["items_count"] == 3

    # CRITICAL CHECK: Ensure ZERO batches and ZERO inventory mutated
    assert Batch.query.count() == initial_batch_count
    assert Inventory.query.count() == initial_inventory_count

    # Verify invoice status in database is DRAFT
    from app.extensions import db
    inv = db.session.get(PurchaseInvoice, purchase_invoice_id)
    assert inv.status == PurchaseInvoiceStatus.DRAFT
    assert len(inv.items) == 3


def test_api_verify_delivery_endpoint(client, owner_token, distributor_seed):
    """Test POST /api/distributor/verify-delivery comparison API."""
    # First create invoice draft
    scan_res = client.post(
        "/api/distributor/scan-invoice",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"raw_text": SAMPLE_INVOICE_TEXT},
    )
    assert scan_res.status_code == 201
    invoice_id = scan_res.get_json()["data"]["purchase_invoice_id"]

    # Submit camera scan readings with one short delivery
    actual_scans = [
        {
            "medicine_name": "CROCIN 650 MG TAB",
            "batch_number": "CR-9921",
            "expiry_date": "2028-08-31",
            "actual_quantity": 48,  # short 2 units
            "mrp": 35.00,
        },
        {
            "medicine_name": "AZITHRAL 500 MG TAB",
            "batch_number": "AZ-4410",
            "expiry_date": "2027-11-30",
            "actual_quantity": 20,
            "mrp": 118.00,
        },
    ]

    verify_res = client.post(
        "/api/distributor/verify-delivery",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "purchase_invoice_id": invoice_id,
            "actual_scans": actual_scans,
        },
    )

    assert verify_res.status_code == 200
    report = verify_res.get_json()["report"]
    assert report["total_expected_items"] == 3
    assert report["discrepancy_count"] >= 1
    assert report["has_discrepancies"]


def test_api_confirm_delivery_books_inventory(client, owner_token, distributor_seed):
    """
    Test POST /api/distributor/confirm-delivery.
    Human confirmation commits verified stock into Batch and Inventory.
    """
    # 1. Create draft
    scan_res = client.post(
        "/api/distributor/scan-invoice",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"raw_text": SAMPLE_INVOICE_TEXT},
    )
    invoice_id = scan_res.get_json()["data"]["purchase_invoice_id"]
    from app.extensions import db
    inv = db.session.get(PurchaseInvoice, invoice_id)
    crocin_item = next(i for i in inv.items if "CROCIN" in i.raw_medicine_name.upper())
    aug_item = next(i for i in inv.items if "AUGMENTIN" in i.raw_medicine_name.upper())

    # Link the newly arrived Augmentin medicine to catalog before acceptance
    med3 = Medicine(
        store_id=distributor_seed["store"].id,
        brand_name="Augmentin 625 Duo",
        dosage_form=DosageForm.TABLET,
        mrp=204.00,
        selling_price=190.00,
    )
    db.session.add(med3)
    db.session.flush()
    aug_item.medicine_id = med3.id
    db.session.commit()

    # 2. Confirm delivery with verified received quantities and designated storage shelf
    loc_id = distributor_seed["location"].id
    confirm_res = client.post(
        "/api/distributor/confirm-delivery",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "purchase_invoice_id": invoice_id,
            "location_id": loc_id,
            "received_items": [
                {
                    "item_id": crocin_item.id,
                    "received_quantity": 50,
                    "batch_number": "CR-9921",
                    "expiry_date": "2028-08-31",
                    "purchase_rate": 24.50,
                    "mrp": 35.00,
                }
            ],
        },
    )

    assert confirm_res.status_code == 200
    res_data = confirm_res.get_json()
    assert res_data["status"] == "success"

    # Verify batch was created and inventory booked
    created_batch = Batch.query.filter_by(batch_number="CR-9921").first()
    assert created_batch is not None
    assert created_batch.quantity_received == 50

    created_inv = Inventory.query.filter_by(batch_id=created_batch.id).first()
    assert created_inv is not None
    assert created_inv.quantity_available == 50
    assert created_inv.location_id == loc_id


def test_role_authorization_enforced(client, distributor_seed):
    """Ensure CASHIER role is prohibited from creating purchase drafts (PRD Rule 26)."""
    store = distributor_seed["store"]
    cashier = User(
        store_id=store.id,
        email="cashier@testpharmacy.com",
        username="cashier",
        full_name="Cashier User",
        role=UserRole.CASHIER,
    )
    cashier.set_password(secrets.token_urlsafe(24))
    from app.extensions import db
    db.session.add(cashier)
    db.session.commit()

    from app.services.auth_service import create_access_token
    cashier_token = create_access_token(cashier)

    response = client.post(
        "/api/distributor/scan-invoice",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"raw_text": SAMPLE_INVOICE_TEXT},
    )
    assert response.status_code == 403
