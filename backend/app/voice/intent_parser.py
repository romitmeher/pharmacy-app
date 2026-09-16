"""
SmartPharm Backend — Voice Intent Parser & Pharmacy Database Grounding.
Strict compliance with SmartPharm PRD Phase 6 & Rule 9:
- Classifies spoken intent: LOCATE_SHELF, CHECK_STOCK, FIND_ALTERNATIVE, ADD_TO_BILL, SEARCH_MEDICINE
- Grounds extracted entities against live MySQL models (Medicine, Inventory, Batch, Location)
- Adheres to PRD Rule 9 human-in-the-loop review boundary (zero silent mutations)
"""

import re
from typing import Dict, Any, Optional

from app.extensions import db
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.voice.phonetic_matcher import (
    normalize_spoken_query,
    match_medicine_from_catalog,
)
from app.shelf import default_planogram_engine
from app.ai.alternatives import default_alternative_matcher


def parse_voice_intent(raw_transcript: str) -> str:
    """
    Classify operational intent from spoken transcript.
    """
    t = raw_transcript.lower().strip()

    # 1. Locate / Shelf query
    if any(k in t for k in ["where is", "where's", "find location", "which shelf", "locate", "shelf of"]):
        return "LOCATE_SHELF"

    # 2. Stock / Availability query
    if any(k in t for k in ["how much", "how many", "check stock", "do we have", "availability", "stock of", "in stock"]):
        return "CHECK_STOCK"

    # 3. Alternative / Substitution query
    if any(k in t for k in ["substitute", "alternative", "instead of", "generic for", "similar to"]):
        return "FIND_ALTERNATIVE"

    # 4. Add to Bill / POS query
    if any(k in t for k in ["add to bill", "bill", "dispense", "add to pos", "add"]):
        return "ADD_TO_BILL"

    # 5. Default search
    return "SEARCH_MEDICINE"


def extract_quantity(transcript: str) -> int:
    """
    Extract requested quantity from spoken transcript (e.g. 'add 2 strips' -> 2).
    Distinguishes dispense quantities from pharmaceutical strength values (e.g. 'Crocin 650').
    """
    t = normalize_spoken_query(transcript)

    # 1. Explicit quantity with packaging unit (e.g. "3 strips", "10 tablets", "2 boxes")
    unit_match = re.search(r"\b(\d+)\s*(?:strips?|tablets?|boxes?|packs?|units?|bottles?)\b", t)
    if unit_match:
        try:
            return max(1, min(500, int(unit_match.group(1))))
        except Exception:
            pass

    # 2. Command pattern e.g. "add 2 crocin", "bill 5 dolo"
    cmd_match = re.search(r"\b(?:add|bill|dispense)\s+(\d{1,2})\b", t)
    if cmd_match:
        try:
            return max(1, min(500, int(cmd_match.group(1))))
        except Exception:
            pass

    return 1


def clean_medicine_query(transcript: str, intent: str) -> str:
    """
    Remove intent command keywords from transcript to isolate the medicine name.
    """
    t = normalize_spoken_query(transcript)

    # Keywords to strip
    stop_phrases = [
        "where is", "where's", "find location of", "which shelf is", "locate", "shelf of",
        "how much", "how many", "check stock of", "do we have", "availability of", "stock of",
        "substitute for", "alternative for", "instead of", "generic for", "similar to",
        "add to bill", "add", "to bill", "dispense", "strips of", "tablets of", "packs of",
        "units of", "boxes of", "bottles of", "please", "can you", "show me", "tell me",
    ]

    for p in stop_phrases:
        t = re.sub(r"\b" + re.escape(p) + r"\b", " ", t)

    # Strip pure leading/trailing numbers if they were quantity
    t = re.sub(r"^\s*\d+\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def execute_voice_command(store_id: int, transcript: str) -> Dict[str, Any]:
    """
    Complete end-to-end voice interpretation pipeline:
    Transcript -> Intent -> Catalog Matching -> Grounded Action Card.
    """
    if not transcript or not transcript.strip():
        return {
            "status": "error",
            "message": "Empty voice transcript provided.",
            "intent": "UNKNOWN",
        }

    raw_text = transcript.strip()
    intent = parse_voice_intent(raw_text)
    qty = extract_quantity(raw_text)
    med_query = clean_medicine_query(raw_text, intent)

    # Fetch store medicine catalog
    medicines = Medicine.query.filter_by(store_id=store_id, is_active=True).all()
    catalog = [
        {
            "id": m.id,
            "brand_name": m.brand_name,
            "generic_name": m.generic_name or "",
            "strength": m.strength or "",
            "dosage_form": m.dosage_form.value if hasattr(m.dosage_form, "value") else str(m.dosage_form or "other"),
            "mrp": float(m.mrp or 0.0),
            "selling_price": float(m.selling_price or m.mrp or 0.0),
        }
        for m in medicines
    ]

    matched = match_medicine_from_catalog(med_query or raw_text, catalog)

    if not matched:
        return {
            "status": "no_match",
            "raw_transcript": raw_text,
            "intent": intent,
            "extracted_query": med_query,
            "confidence": 0.0,
            "message": f"Could not confidently match '{med_query or raw_text}' in store catalog. Please speak clearly or search manually (PRD Rule 9).",
            "action_card": None,
        }

    med_data, confidence = matched
    med_id = med_data["id"]
    db_med = db.session.get(Medicine, med_id)
    if not db_med:
        return {
            "status": "error",
            "message": f"Medicine #{med_id} not found in store database.",
            "action_card": None,
        }

    # Build Intent-Specific Action Card
    action_card: Dict[str, Any] = {
        "medicine_id": med_id,
        "brand_name": db_med.brand_name,
        "strength": db_med.strength,
        "generic_name": db_med.generic_name,
        "unit_price": float(db_med.selling_price or db_med.mrp or 0.0),
        "confidence": confidence,
        "requires_pharmacist_confirmation": True,  # PRD Rule 9
    }

    if intent == "LOCATE_SHELF":
        # Call shelf locator
        pick_locs = default_planogram_engine.locate_medicine_for_dispensing(store_id=store_id, medicine_id=med_id)
        loc_dicts = [p.to_dict() if hasattr(p, "to_dict") else p for p in pick_locs]
        action_card["action_type"] = "SHELF_LOCATION"
        action_card["locations"] = loc_dicts
        action_card["summary"] = (
            f"Stored at {loc_dicts[0]['location_name']} ({loc_dicts[0].get('climate_zone', 'Ambient')})"
            if loc_dicts else "No assigned physical shelf found."
        )

    elif intent == "CHECK_STOCK":
        # Calculate active inventory
        batches = Batch.query.filter_by(store_id=store_id, medicine_id=med_id).all()
        total_avail = 0
        batch_details = []
        for b in batches:
            b_stock = sum(inv.quantity_available for inv in b.inventory if inv.store_id == store_id)
            if b_stock > 0:
                total_avail += b_stock
                batch_details.append({
                    "batch_id": b.id,
                    "batch_number": b.batch_number,
                    "stock": b_stock,
                    "expiry_date": b.expiry_date.isoformat(),
                })

        action_card["action_type"] = "STOCK_AVAILABILITY"
        action_card["total_stock"] = total_avail
        action_card["active_batches"] = batch_details
        action_card["summary"] = f"{total_avail} units available across {len(batch_details)} active batches."

    elif intent == "FIND_ALTERNATIVE":
        # Bio-equivalent substitutes
        alt_resp = default_alternative_matcher.find_alternatives(medicine_id=med_id, store_id=store_id)
        alt_dict = alt_resp.to_dict() if alt_resp else {}
        action_card["action_type"] = "ALTERNATIVE_SUBSTITUTES"
        action_card["alternatives"] = alt_dict.get("candidates", [])
        action_card["clinical_disclaimer"] = alt_dict.get("disclaimer", "Pharmacist verification mandatory.")
        action_card["summary"] = f"Found {len(alt_dict.get('candidates', []))} bio-equivalent candidate(s) for clinical review."

    elif intent == "ADD_TO_BILL":
        # Generate POS line item proposal
        action_card["action_type"] = "ADD_TO_POS"
        action_card["requested_quantity"] = qty
        action_card["total_amount"] = round(float(db_med.selling_price or db_med.mrp or 0.0) * qty, 2)
        action_card["summary"] = f"Ready to bill {qty} unit(s) of {db_med.brand_name} (Total: ₹{action_card['total_amount']})."

    else:
        # General Search
        action_card["action_type"] = "MEDICINE_DETAILS"
        action_card["summary"] = f"{db_med.brand_name} ({db_med.generic_name}) - MRP: ₹{db_med.mrp}."

    return {
        "status": "success",
        "raw_transcript": raw_text,
        "intent": intent,
        "extracted_query": med_query,
        "confidence": confidence,
        "action_card": action_card,
    }
