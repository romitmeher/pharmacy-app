"""
SmartPharm - Voice-Assisted Pharmacy Operations Test Suite.
Strict compliance with SmartPharm PRD Phase 6 & Rule 9:
- Spoken text normalization and phonetic brand matching
- Operational intent parsing (LOCATE_SHELF, CHECK_STOCK, FIND_ALTERNATIVE, ADD_TO_BILL)
- Database grounding and explainable confidence scoring
- REST API endpoints with authentication
"""

import datetime
import pytest

from app.models.location import Location, LocationType
from app.models.medicine import Medicine, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.voice.phonetic_matcher import (
    normalize_spoken_query,
    calculate_match_score,
    match_medicine_from_catalog,
)
from app.voice.intent_parser import (
    parse_voice_intent,
    extract_quantity,
    execute_voice_command,
)


@pytest.fixture
def voice_seed_data(db, sample_store):
    """Seed medicines, batches, inventory, and location for voice testing."""
    loc = Location(
        store_id=sample_store.id,
        name="Main Dispense Rack A-1",
        description="Aisle 1 Tier 2",
        location_type=LocationType.SHELF,
        is_active=True,
    )
    db.session.add(loc)
    db.session.flush()

    today = datetime.date.today()

    med1 = Medicine(
        store_id=sample_store.id,
        brand_name="Crocin 650",
        generic_name="Paracetamol",
        manufacturer="GSK Pharma",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        category="Analgesic",
        mrp=32.00,
        selling_price=30.00,
        gst_percentage=12.00,
        is_active=True,
    )
    med2 = Medicine(
        store_id=sample_store.id,
        brand_name="Augmentin 625 Duo",
        generic_name="Amoxicillin and Potassium Clavulanate",
        manufacturer="GlaxoSmithKline",
        strength="625mg",
        dosage_form=DosageForm.TABLET,
        category="Antibiotic",
        mrp=200.00,
        selling_price=190.00,
        gst_percentage=12.00,
        is_active=True,
    )
    db.session.add_all([med1, med2])
    db.session.flush()

    b1 = Batch(
        store_id=sample_store.id,
        medicine_id=med1.id,
        batch_number="CROC-B1",
        expiry_date=today + datetime.timedelta(days=180),
        purchase_price=20.00,
        mrp=32.00,
        quantity_received=100,
    )
    db.session.add(b1)
    db.session.flush()

    inv1 = Inventory(
        store_id=sample_store.id,
        batch_id=b1.id,
        location_id=loc.id,
        quantity_available=40,
    )
    db.session.add(inv1)
    db.session.commit()

    return {
        "store": sample_store,
        "location": loc,
        "med_crocin": med1,
        "med_augmentin": med2,
        "batch_crocin": b1,
        "inventory_crocin": inv1,
    }


def test_phonetic_normalization_and_matching():
    """Test converting spoken numbers and phonetic alignment."""
    # 1. Spoken numbers normalization
    assert "650" in normalize_spoken_query("crocin six fifty")
    assert "500" in normalize_spoken_query("paracetamol five hundred")
    assert "pan-d" in normalize_spoken_query("give me pan d")

    # 2. Phonetic match score
    score1 = calculate_match_score("crosin 650", "Crocin 650")
    assert score1 >= 0.75, f"Expected high match for 'crosin 650', got {score1}"

    score2 = calculate_match_score("augment in six twenty five", "Augmentin 625 Duo")
    assert score2 >= 0.70, f"Expected high match for 'augment in', got {score2}"


def test_voice_intent_classification():
    """Test routing spoken natural language queries to correct pharmacy operational intents."""
    assert parse_voice_intent("Where is Crocin 650?") == "LOCATE_SHELF"
    assert parse_voice_intent("Which shelf is Telma H on?") == "LOCATE_SHELF"
    assert parse_voice_intent("Check stock of Dolo 650") == "CHECK_STOCK"
    assert parse_voice_intent("How much Crocin do we have in stock?") == "CHECK_STOCK"
    assert parse_voice_intent("Substitute for Augmentin 625") == "FIND_ALTERNATIVE"
    assert parse_voice_intent("What can I give instead of Pan D?") == "FIND_ALTERNATIVE"
    assert parse_voice_intent("Add 2 strips of Crocin to bill") == "ADD_TO_BILL"
    assert parse_voice_intent("Bill 5 packs of Paracetamol") == "ADD_TO_BILL"


def test_voice_quantity_extraction():
    """Test extracting integer quantities from voice billing commands."""
    assert extract_quantity("Add 3 strips of Crocin to bill") == 3
    assert extract_quantity("Bill 10 tablets of Dolo") == 10
    assert extract_quantity("Dispense Crocin 650") == 1  # Default to 1


def test_voice_command_execution(voice_seed_data):
    """Test full voice interpretation pipeline with database grounding."""
    store = voice_seed_data["store"]

    # 1. Test LOCATE_SHELF
    res_loc = execute_voice_command(store_id=store.id, transcript="Where is Crocin 650?")
    assert res_loc["status"] == "success"
    assert res_loc["intent"] == "LOCATE_SHELF"
    assert res_loc["action_card"]["action_type"] == "SHELF_LOCATION"
    assert res_loc["action_card"]["requires_pharmacist_confirmation"] is True
    assert "Main Dispense Rack A-1" in res_loc["action_card"]["summary"]

    # 2. Test CHECK_STOCK
    res_stock = execute_voice_command(store_id=store.id, transcript="Check stock of Crocin six fifty")
    assert res_stock["status"] == "success"
    assert res_stock["intent"] == "CHECK_STOCK"
    assert res_stock["action_card"]["action_type"] == "STOCK_AVAILABILITY"
    assert res_stock["action_card"]["total_stock"] == 40

    # 3. Test ADD_TO_BILL
    res_bill = execute_voice_command(store_id=store.id, transcript="Add 3 strips of Crocin 650 to bill")
    assert res_bill["status"] == "success"
    assert res_bill["intent"] == "ADD_TO_BILL"
    assert res_bill["action_card"]["action_type"] == "ADD_TO_POS"
    assert res_bill["action_card"]["requested_quantity"] == 3
    assert res_bill["action_card"]["total_amount"] == 90.00  # 3 * 30.00


def test_voice_api_endpoints(client, owner_token, voice_seed_data):
    """Test REST API endpoints for voice operations."""
    headers = {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}

    # 1. GET /api/voice/sample-commands
    res_samples = client.get("/api/voice/sample-commands", headers=headers)
    assert res_samples.status_code == 200
    samples = res_samples.get_json()["data"]
    assert len(samples) >= 4

    # 2. POST /api/voice/process-command
    payload = {"transcript": "Where is Crocin six fifty?"}
    res_cmd = client.post("/api/voice/process-command", headers=headers, json=payload)
    assert res_cmd.status_code == 200
    data = res_cmd.get_json()["data"]
    assert data["status"] == "success"
    assert data["intent"] == "LOCATE_SHELF"
    assert data["action_card"]["brand_name"] == "Crocin 650"
