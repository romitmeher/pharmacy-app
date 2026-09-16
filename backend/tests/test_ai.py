"""
SmartPharm - AI & RAG Subsystem Test Suite
Tests:
- RAG Intent classification & deterministic database grounding (PRD Rule 19)
- Alternative Medicine Decision Support (PRD Rule 20)
- Doctor Prescription Extraction & Availability Pipeline (PRD Rule 21)
- AI REST API Endpoints:
  - POST /api/ai/copilot/query
  - GET /api/ai/alternatives/<int:medicine_id>
  - POST /api/ai/prescription/scan
"""

import datetime
from decimal import Decimal
import pytest

from app.models.medicine import Medicine, Ingredient, DosageForm
from app.models.location import Location, LocationType
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod, PaymentStatus
from app.ai import (
    default_rag_engine,
    default_alternative_matcher,
    default_prescription_scanner,
    CopilotIntent,
    MANDATORY_SAFETY_DISCLAIMER,
)


@pytest.fixture
def ai_seed_data(db, sample_store):
    """Seed medicines, batches, inventory, and sales for AI RAG evaluation."""
    # 1. Crocin 650 (In stock)
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
    # 2. Dolo 650 (Generic alternative to Crocin, In stock, cheaper)
    med2 = Medicine(
        store_id=sample_store.id,
        brand_name="Dolo 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="Micro Labs",
        mrp=32.00,
        selling_price=30.00,
        is_active=True,
    )
    # 3. Calpol 650 (Generic alternative, OUT OF STOCK)
    med3 = Medicine(
        store_id=sample_store.id,
        brand_name="Calpol 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="GSK",
        mrp=34.00,
        selling_price=31.00,
        is_active=True,
    )
    # 4. Amoxicillin 500 (Different molecule, low stock)
    med4 = Medicine(
        store_id=sample_store.id,
        brand_name="Mox 500",
        generic_name="Amoxicillin",
        strength="500mg",
        dosage_form=DosageForm.CAPSULE,
        manufacturer="Ranbaxy",
        mrp=75.00,
        selling_price=70.00,
        is_active=True,
    )
    db.session.add_all([med1, med2, med3, med4])
    db.session.flush()

    loc1 = Location(store_id=sample_store.id, name="Rack A-1", location_type=LocationType.SHELF)
    loc2 = Location(store_id=sample_store.id, name="Dispensing Bay", location_type=LocationType.SHELF)
    db.session.add_all([loc1, loc2])
    db.session.flush()

    # Batches & Inventory
    today = datetime.date.today()
    batch1 = Batch(
        medicine_id=med1.id,
        store_id=sample_store.id,
        batch_number="CR-2026-X1",
        expiry_date=today + datetime.timedelta(days=20),  # Expiring in 20 days!
        mrp=35.00,
        purchase_price=25.00,
        quantity_received=50,
    )
    batch2 = Batch(
        medicine_id=med2.id,
        store_id=sample_store.id,
        batch_number="DL-2026-B2",
        expiry_date=today + datetime.timedelta(days=400),
        mrp=32.00,
        purchase_price=22.00,
        quantity_received=100,
    )
    batch4 = Batch(
        medicine_id=med4.id,
        store_id=sample_store.id,
        batch_number="MOX-01",
        expiry_date=today + datetime.timedelta(days=200),
        mrp=75.00,
        purchase_price=50.00,
        quantity_received=5,
    )
    db.session.add_all([batch1, batch2, batch4])
    db.session.flush()

    inv1 = Inventory(
        store_id=sample_store.id,
        batch_id=batch1.id,
        location_id=loc1.id,
        quantity_available=40,
    )
    inv2 = Inventory(
        store_id=sample_store.id,
        batch_id=batch2.id,
        location_id=loc2.id,
        quantity_available=85,
    )
    inv4 = Inventory(
        store_id=sample_store.id,
        batch_id=batch4.id,
        location_id=loc1.id,
        quantity_available=4,  # Low stock
    )
    db.session.add_all([inv1, inv2, inv4])

    # Sample today's sale
    sale = Sale(
        store_id=sample_store.id,
        user_id=1,
        invoice_number="SALE-AI-001",
        subtotal=Decimal("66.00"),
        total_amount=Decimal("66.00"),
        payment_status=PaymentStatus.PAID,
    )
    db.session.add(sale)
    db.session.commit()

    return {
        "store": sample_store,
        "med1": med1,
        "med2": med2,
        "med3": med3,
        "med4": med4,
        "batch1": batch1,
        "loc1": loc1,
    }


def test_rag_intent_classification():
    """Test deterministic intent classification for pharmacy copilot."""
    assert default_rag_engine.classify_intent("Where is Crocin 650?") == CopilotIntent.STOCK_LOOKUP
    assert default_rag_engine.classify_intent("What products expire next month?") == CopilotIntent.EXPIRY_RISK
    assert default_rag_engine.classify_intent("Show me low stock warnings") == CopilotIntent.LOW_STOCK
    assert default_rag_engine.classify_intent("What were today's total sales?") == CopilotIntent.SALES_METRICS
    assert default_rag_engine.classify_intent("Are there pending distributor purchases?") == CopilotIntent.PURCHASE_METRICS


def test_rag_stock_lookup_grounded(ai_seed_data):
    """PRD Rule 19: Stock lookup answers strictly grounded in MySQL records."""
    store = ai_seed_data["store"]
    res = default_rag_engine.answer_query("Where is Crocin 650 stored?", store_id=store.id)

    assert res.intent == CopilotIntent.STOCK_LOOKUP
    assert res.is_data_available
    assert "40 units" in res.answer
    assert "CR-2026-X1" in res.answer
    assert "Rack A-1" in res.answer
    assert len(res.grounded_facts) == 1
    assert res.grounded_facts[0].details["brand_name"] == "Crocin 650"


def test_rag_low_stock_and_expiry_risk(ai_seed_data):
    """Test low stock and near-expiry risk queries."""
    store = ai_seed_data["store"]

    # Expiry Risk query (CR-2026-X1 expires in 20 days)
    exp_res = default_rag_engine.answer_query("Which products are near expiry?", store_id=store.id)
    assert exp_res.intent == CopilotIntent.EXPIRY_RISK
    assert "Crocin 650" in exp_res.answer
    assert len(exp_res.grounded_facts) >= 1

    # Low Stock query (Mox 500 has 4 units, Calpol has 0 units)
    low_res = default_rag_engine.answer_query("Show me items with low stock", store_id=store.id)
    assert low_res.intent == CopilotIntent.LOW_STOCK
    assert "Mox 500" in low_res.answer or "Calpol 650" in low_res.answer


def test_alternative_medicine_matching(ai_seed_data):
    """PRD Rule 20: Alternative medicine candidates with availability and safety disclaimer."""
    store = ai_seed_data["store"]
    crocin = ai_seed_data["med1"]

    res = default_alternative_matcher.find_alternatives(crocin.id, store_id=store.id)
    assert res is not None
    assert res.total_candidates_found >= 2
    assert res.disclaimer == MANDATORY_SAFETY_DISCLAIMER

    # Dolo 650 should be the top candidate because it is in stock (85 units) and cheaper
    top_cand = res.candidates[0]
    assert top_cand.brand_name == "Dolo 650"
    assert top_cand.is_available
    assert top_cand.units_in_stock == 85
    assert top_cand.price_difference_pct < 0  # Cheaper than Crocin

    # Calpol 650 should be identified but marked unavailable
    calpol_cand = next(c for c in res.candidates if c.brand_name == "Calpol 650")
    assert not calpol_cand.is_available
    assert calpol_cand.units_in_stock == 0


def test_prescription_scanner_availability_and_alternatives(ai_seed_data):
    """PRD Rule 21: Prescriptions checked against catalog with availability tally."""
    store = ai_seed_data["store"]

    sample_rx_text = """
    DR. SHARMA'S CLINIC
    Patient: Ramesh Kumar, Age: 42
    Date: 14/09/2026
    ---------------------------------------------
    1. Tab Crocin 650mg  1-0-1  5 days
    2. Tab Calpol 650mg  0-0-1  3 days
    """

    res = default_prescription_scanner.parse_prescription_text(sample_rx_text, store_id=store.id)

    assert res.total_detected == 2
    assert res.available_count == 1      # Crocin is available
    assert res.unavailable_count == 1    # Calpol is out of stock
    assert not res.is_fully_dispensable
    assert "2 medicine(s) detected: 1 available in stock, 1 out of stock" in res.notes

    # Verify out-of-stock item has candidate alternative suggested
    calpol_item = next(it for it in res.items if "Calpol" in it.detected_brand_or_generic)
    assert not calpol_item.is_available
    assert len(calpol_item.alternative_candidates) > 0


def test_api_copilot_and_alternatives_endpoints(client, owner_token, ai_seed_data):
    """Test POST /api/ai/copilot/query and GET /api/ai/alternatives/<id>."""
    # 1. Copilot Query
    query_res = client.post(
        "/api/ai/copilot/query",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"query": "Where is Crocin 650?"},
    )
    assert query_res.status_code == 200
    data = query_res.get_json()["data"]
    assert data["intent"] == "STOCK_LOOKUP"
    assert "Crocin 650" in data["answer"]
    assert len(data["grounded_facts"]) > 0

    # 2. Alternative Medicines
    crocin = ai_seed_data["med1"]
    alt_res = client.get(
        f"/api/ai/alternatives/{crocin.id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert alt_res.status_code == 200
    alt_data = alt_res.get_json()["data"]
    assert alt_data["total_candidates_found"] >= 2
    assert "CLINICAL DECISION SUPPORT NOTICE" in alt_data["disclaimer"]


def test_api_prescription_scan_endpoint(client, owner_token, ai_seed_data):
    """Test POST /api/ai/prescription/scan."""
    sample_rx_text = """
    Rx:
    1. Tab Crocin 650mg  1-0-1  5 days
    2. Cap Mox 500mg     1-1-1  7 days
    """

    res = client.post(
        "/api/ai/prescription/scan",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"text": sample_rx_text},
    )
    assert res.status_code == 200
    rx_data = res.get_json()["data"]
    assert rx_data["total_detected"] == 2
    assert len(rx_data["items"]) == 2
