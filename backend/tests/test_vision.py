"""
SmartPharm Vision Pipeline Tests
Tests quality assessment, packaging detector, entity extractor, database matcher,
PRD Rule 9 low-confidence fallbacks, and vision API endpoints.
"""

import base64
import datetime
import pytest
import numpy as np
import cv2

from app.models.medicine import Medicine, MedicineAlias, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location, LocationType
from app.vision.quality import assess_image_quality

from app.vision.detector import detect_package_roi
from app.vision.extractor import default_entity_extractor, _parse_pharma_date
from app.vision.ocr_engine import OCRResult, OCRWordBox
from app.vision.matcher import default_medicine_matcher


@pytest.fixture
def vision_seed_data(db, sample_store):
    """Seed test medicine, batch, location, and inventory for vision matching tests."""
    med = Medicine(
        store_id=sample_store.id,
        brand_name="Crocin 650",
        generic_name="Paracetamol",
        strength="650 mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="GlaxoSmithKline Pharmaceuticals Ltd",
        mrp=35.00,
        selling_price=33.50,
        is_active=True,
    )
    db.session.add(med)
    db.session.flush()

    alias = MedicineAlias(medicine_id=med.id, alias_name="Crocin Advance")
    db.session.add(alias)

    loc = Location(store_id=sample_store.id, name="Vision Shelf 1", location_type=LocationType.SHELF)
    db.session.add(loc)

    db.session.flush()

    batch = Batch(
        medicine_id=med.id,
        store_id=sample_store.id,
        batch_number="CRO-2026-X1",
        expiry_date=datetime.date(2027, 5, 31),
        mrp=35.00,
        purchase_price=28.00,
        quantity_received=100,
    )

    db.session.add(batch)
    db.session.flush()

    inv = Inventory(
        store_id=sample_store.id,
        batch_id=batch.id,
        location_id=loc.id,
        quantity_available=80,
    )
    db.session.add(inv)

    db.session.commit()

    return {
        "store": sample_store,
        "medicine": med,
        "batch": batch,
        "inventory": inv,
        "location": loc,
    }


def _auth_header(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# =====================================================================
# 1. QUALITY ASSESSMENT TESTS
# =====================================================================

def test_quality_sharp_image():
    """Verify sharp synthetic image passes quality checks."""
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    img.fill(180)
    cv2.putText(img, "CROCIN 650", (30, 200), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 3)

    quality = assess_image_quality(img)
    assert quality.is_acceptable is True
    assert quality.is_blurry is False
    assert quality.is_underexposed is False
    assert quality.has_glare is False


def test_quality_blurry_image():
    """Verify heavily blurred image is detected and rejected."""
    img = np.full((300, 300, 3), 150, dtype=np.uint8)
    blurred = cv2.GaussianBlur(img, (25, 25), 0)

    quality = assess_image_quality(blurred, blur_threshold=100.0)
    assert quality.is_blurry is True
    assert quality.is_acceptable is False
    assert any("blurry" in f.lower() for f in quality.feedback)


def test_quality_underexposed_image():
    """Verify dark image is detected and rejected."""
    dark_img = np.full((300, 300, 3), 15, dtype=np.uint8)

    quality = assess_image_quality(dark_img, min_brightness=45.0)
    assert quality.is_underexposed is True
    assert quality.is_acceptable is False
    assert any("dark" in f.lower() or "underexposed" in f.lower() for f in quality.feedback)


def test_quality_specular_glare():
    """Verify severe foil glare detection."""
    img = np.full((300, 300, 3), 100, dtype=np.uint8)
    img[:180, :200] = 255  # Saturate 40% of the image

    quality = assess_image_quality(img, max_glare_ratio=0.15)
    assert quality.has_glare is True
    assert quality.is_acceptable is False
    assert any("glare" in f.lower() for f in quality.feedback)


def test_quality_too_low_resolution():
    """Verify images smaller than 200x200 are rejected."""
    tiny_img = np.zeros((100, 100, 3), dtype=np.uint8)
    quality = assess_image_quality(tiny_img)
    assert quality.is_acceptable is False
    assert any("resolution" in f.lower() for f in quality.feedback)


# =====================================================================
# 2. OBJECT DETECTION / ROI CROPPING TESTS
# =====================================================================

def test_detect_package_roi():
    """Verify detector extracts foreground blister bounding box and ROI."""
    img = np.full((500, 500, 3), 60, dtype=np.uint8)
    cv2.rectangle(img, (50, 80), (450, 420), (240, 240, 240), -1)
    cv2.putText(img, "BLISTER PACK", (80, 250), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 20, 20), 2)

    result = detect_package_roi(img)
    assert result.bounding_box is not None
    x, y, w, h = result.bounding_box
    assert w > 200
    assert h > 200
    assert result.cropped_roi is not None
    assert result.cropped_roi.shape[0] == h
    assert result.cropped_roi.shape[1] == w


# =====================================================================
# 3. PHARMA ENTITY EXTRACTOR & DATE NORMALIZATION TESTS
# =====================================================================

def test_pharma_date_parsing():
    """Verify Indian pharma expiry normalization to end-of-month."""
    # MM/YYYY
    d1 = _parse_pharma_date("05/2027")
    assert d1 == datetime.date(2027, 5, 31)

    # Mon YYYY
    d2 = _parse_pharma_date("DEC 2026")
    assert d2 == datetime.date(2026, 12, 31)

    # Mon-YY
    d3 = _parse_pharma_date("FEB-28")
    assert d3 == datetime.date(2028, 2, 29)  # 2028 leap year

    # MM/YY
    d4 = _parse_pharma_date("04/26")
    assert d4 == datetime.date(2026, 4, 30)


def test_entity_extraction_pharma_label():
    """Verify regex/NLP extraction of brand, strength, batch, expiry, and MRP."""
    sample_text = """
    Crocin 650
    Paracetamol Tablets IP
    B.No. CRO-2026-X1
    MFD. 06/2024
    EXP. 05/2027
    M.R.P. Rs. 35.00
    Mfg. by GlaxoSmithKline Pharmaceuticals Ltd
    """
    ocr_result = OCRResult(
        full_text=sample_text,
        lines=[line.strip() for line in sample_text.strip().split("\n")],
        word_boxes=[OCRWordBox(text="Crocin 650", confidence=0.96)],
        avg_confidence=0.92,
    )

    entities = default_entity_extractor.extract(ocr_result)
    assert entities.brand_name == "Crocin 650"
    assert entities.strength == "650 mg"
    assert entities.batch_number == "CRO-2026-X1"
    assert entities.expiry_date == datetime.date(2027, 5, 31)
    assert entities.mrp == 35.00
    assert "GlaxoSmithKline" in (entities.manufacturer or "")
    assert entities.confidence > 0.80


# =====================================================================
# 4. DATABASE MATCHER & PRD RULE 9 CONFIDENCE SAFEGUARDS
# =====================================================================

def test_matcher_high_confidence(vision_seed_data):
    """Verify database matching yields HIGH confidence for matching medicine and batch."""
    ocr_result = OCRResult(
        full_text="Crocin 650\nB.No: CRO-2026-X1\nEXP: 05/2027\nM.R.P. Rs. 35.00",
        lines=["Crocin 650", "B.No: CRO-2026-X1", "EXP: 05/2027", "M.R.P. Rs. 35.00"],
        word_boxes=[OCRWordBox(text="Crocin 650", confidence=0.95)],
        avg_confidence=0.95,
    )
    entities = default_entity_extractor.extract(ocr_result)
    result = default_medicine_matcher.match(entities, store_id=vision_seed_data["store"].id)

    assert result.low_confidence is False
    assert result.warning_message is None
    assert result.top_candidate is not None
    assert result.top_candidate.name == "Crocin 650"
    assert result.top_candidate.confidence_level == "HIGH"
    assert result.top_candidate.confidence_score >= 75.0
    assert result.top_candidate.matched_batch is not None
    assert result.top_candidate.matched_batch["batch_number"] == "CRO-2026-X1"
    assert result.top_candidate.active_stock == 80


def test_matcher_low_confidence_prd_rule_9(vision_seed_data):
    """
    Verify PRD Rule 9: If confidence < 50%, system NEVER guesses.
    Returns warning: 'Unable to confidently identify this medicine. Capture another image or search manually.'
    """
    ocr_result = OCRResult(
        full_text="XYZUNKNOWN 9999\nRandom garbled text",
        lines=["XYZUNKNOWN 9999", "Random garbled text"],
        word_boxes=[OCRWordBox(text="XYZUNKNOWN", confidence=0.30)],
        avg_confidence=0.30,
    )
    entities = default_entity_extractor.extract(ocr_result)
    result = default_medicine_matcher.match(entities, store_id=vision_seed_data["store"].id)

    assert result.low_confidence is True
    assert result.warning_message == (
        "Unable to confidently identify this medicine. "
        "Capture another image or search manually."
    )
    assert len(result.search_fallbacks) > 0


# =====================================================================
# 5. VISION API ENDPOINT TESTS
# =====================================================================

def test_api_quality_check_success(client, pharmacist_token):
    """Test POST /api/vision/quality-check with clear base64 image."""
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    img.fill(160)
    cv2.putText(img, "TEST QUALITY", (20, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    _, buffer = cv2.imencode(".jpg", img)
    b64 = base64.b64encode(buffer).decode("utf-8")

    res = client.post(
        "/api/vision/quality-check",
        json={"image_base64": b64},
        headers=_auth_header(pharmacist_token),
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["is_acceptable"] is True
    assert data["is_blurry"] is False


def test_api_recognize_full_flow(client, pharmacist_token, vision_seed_data):
    """Test POST /api/vision/recognize with simulated medicine pack."""
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    img.fill(200)
    cv2.putText(img, "Crocin 650", (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
    cv2.putText(img, "B.No: CRO-2026-X1", (30, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(img, "EXP. 05/2027", (30, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(img, "M.R.P. Rs. 35.00", (30, 300), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

    _, buffer = cv2.imencode(".jpg", img)
    b64 = base64.b64encode(buffer).decode("utf-8")

    res = client.post(
        "/api/vision/recognize",
        json={"image_base64": b64},
        headers=_auth_header(pharmacist_token),
    )

    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["status"] == "success"
    data = json_data["data"]
    assert data["human_verification_required"] is True  # PRD Rule 9 check
    assert "match_result" in data


def test_api_pharmacist_verify(client, pharmacist_token, vision_seed_data):
    """Test POST /api/vision/verify endpoint where pharmacist approves recognized item."""
    payload = {
        "medicine_id": vision_seed_data["medicine"].id,
        "batch_number": "CRO-2026-X1",
        "expiry_date": "2027-05-31",
        "quantity": 2,
    }
    res = client.post(
        "/api/vision/verify",
        json=payload,
        headers=_auth_header(pharmacist_token),
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["medicine_id"] == vision_seed_data["medicine"].id
    assert data["medicine_name"] == "Crocin 650"
    assert data["batch_number"] == "CRO-2026-X1"
    assert data["is_existing_batch"] is True
    assert data["verified_quantity"] == 2


def test_missing_ocr_identity_never_returns_arbitrary_medicine(vision_seed_data):
    from app.vision.extractor import ExtractedEntities
    result = default_medicine_matcher.match(
        ExtractedEntities(batch_number="ABC123", confidence=0.99),
        store_id=vision_seed_data["store"].id)
    assert result.low_confidence
    assert result.top_candidate is None


def test_conflicting_strength_is_not_a_packaging_match(vision_seed_data):
    from app.vision.extractor import ExtractedEntities
    result = default_medicine_matcher.match(
        ExtractedEntities(brand_name="Crocin 650", strength="150 mg", confidence=0.99),
        store_id=vision_seed_data["store"].id)
    assert result.low_confidence
    assert result.top_candidate is None


def test_strength_units_cannot_be_interchanged(vision_seed_data):
    from app.vision.extractor import ExtractedEntities
    result = default_medicine_matcher.match(
        ExtractedEntities(brand_name="Crocin 650", strength="650mcg", confidence=0.99),
        store_id=vision_seed_data["store"].id)
    assert result.top_candidate is None


def test_alias_retrieval_does_not_depend_on_first_fifty_medicines(vision_seed_data, db):
    from app.vision.extractor import ExtractedEntities
    med = vision_seed_data["medicine"]
    db.session.add(MedicineAlias(medicine_id=med.id, alias_name="SpecialScanBrand"))
    db.session.commit()
    result = default_medicine_matcher.match(
        ExtractedEntities(brand_name="SpecialScanBrand", strength="650 mg", confidence=0.99),
        store_id=vision_seed_data["store"].id)
    assert result.top_candidate.medicine_id == med.id


def test_partial_word_is_not_a_strong_brand_match():
    from app.vision.matcher import _string_similarity
    assert _string_similarity("art", "paracetamol") < 0.72


def test_white_product_background_is_not_foil_glare():
    image = np.full((400, 400, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (100, 80), (300, 320), (170, 180, 200), -1)
    cv2.putText(image, "MEDICINE", (105, 200), cv2.FONT_HERSHEY_SIMPLEX, .7, (0, 0, 0), 2)
    quality = assess_image_quality(image)
    assert quality.is_acceptable
    assert not quality.is_glare
