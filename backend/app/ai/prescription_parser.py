"""
SmartPharm - Doctor Prescription Scanner & Availability Pipeline
Strict compliance with SmartPharm PRD Rule 21:
- Workflow:
  Prescription -> OCR + Vision -> Medicine Extraction -> Database Matching -> Availability -> Pharmacist Verification.
- Summarizes detection tally (e.g. 5 detected, 4 available, 1 unavailable).
- Proposes candidate generic alternatives for out-of-stock items for pharmacist review.
- Strictly bounds AI assistance: does NOT make autonomous medical decisions or override prescriptions.
"""

from dataclasses import dataclass, field
import datetime
import logging
import re
from typing import Any, Dict, List, Optional
import numpy as np

from app.extensions import db
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.vision.ocr_engine import default_ocr_engine
from app.ai.alternatives import default_alternative_matcher, AlternativeCandidate

logger = logging.getLogger(__name__)

RE_DOSAGE_SIG = re.compile(
    r"\b(?:(1-0-1|1-0-0|0-0-1|1-1-1|0-1-0|OD|BD|TDS|QID|HS|SOS|STAT|BEFORE FOOD|AFTER FOOD))\b",
    re.IGNORECASE,
)
RE_DURATION = re.compile(r"\b(\d+)\s*(?:days?|weeks?|months?|d|w)\b", re.IGNORECASE)


@dataclass
class PrescribedMedicineItem:
    raw_text: str
    detected_brand_or_generic: str
    strength: Optional[str] = None
    dosage_instructions: Optional[str] = None
    duration: Optional[str] = None
    quantity_to_dispense: int = 10
    matched_medicine_id: Optional[int] = None
    matched_brand_name: Optional[str] = None
    matched_mrp: Optional[float] = None
    is_available: bool = False
    available_units: int = 0
    confidence: float = 0.85
    alternative_candidates: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_text": self.raw_text,
            "detected_brand_or_generic": self.detected_brand_or_generic,
            "strength": self.strength,
            "dosage_instructions": self.dosage_instructions,
            "duration": self.duration,
            "quantity_to_dispense": self.quantity_to_dispense,
            "matched_medicine_id": self.matched_medicine_id,
            "matched_brand_name": self.matched_brand_name,
            "matched_mrp": self.matched_mrp,
            "is_available": self.is_available,
            "available_units": self.available_units,
            "confidence": round(self.confidence, 2),
            "alternative_candidates": self.alternative_candidates,
        }


@dataclass
class PrescriptionExtractionResult:
    total_detected: int
    available_count: int
    unavailable_count: int
    items: List[PrescribedMedicineItem] = field(default_factory=list)
    raw_ocr_text: str = ""
    is_fully_dispensable: bool = False
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_detected": self.total_detected,
            "available_count": self.available_count,
            "unavailable_count": self.unavailable_count,
            "is_fully_dispensable": self.is_fully_dispensable,
            "notes": self.notes,
            "items": [it.to_dict() for it in self.items],
            "raw_ocr_text": self.raw_ocr_text,
        }


class PrescriptionScanner:
    """
    Scans prescription notes or image crops, identifies prescribed medicines,
    checks live store availability, and suggests in-stock substitutes for missing items.
    """

    def parse_prescription_text(self, text: str, store_id: int) -> PrescriptionExtractionResult:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        prescribed_items: List[PrescribedMedicineItem] = []

        for line in lines:
            # Skip header lines like "Rx", "Dr. Name", "Clinic", "Date:"
            lower_l = line.lower()
            if any(h in lower_l for h in ["dr.", "clinic", "hospital", "patient", "age", "date:", "weight", "reg no"]):
                continue

            # Strip leading bullet points or numbered list tokens (e.g. "1.", "Tab", "Cap", "Inj", "Rx")
            cleaned_line = line
            cleaned_line = re.sub(r"^(?:\d+\.|\*|-|•|\(?\d+\)?)\s*", "", cleaned_line).strip()
            cleaned_line = re.sub(r"^(?:rx|tab(?:let)?\.?|cap(?:sule)?\.?|syr(?:up)?\.?|inj(?:ection)?\.?|oint(?:ment)?\.?)\s*", "", cleaned_line, flags=re.IGNORECASE).strip()
            if len(cleaned_line) < 3:
                continue

            # Extract dosage instructions (e.g. 1-0-1 or BD)
            dosage_sig = None
            sig_match = RE_DOSAGE_SIG.search(cleaned_line)
            if sig_match:
                dosage_sig = sig_match.group(0).upper()

            # Extract duration (e.g. 5 days)
            duration = None
            dur_match = RE_DURATION.search(cleaned_line)
            if dur_match:
                duration = dur_match.group(0)

            # Extract strength (e.g. 650mg, 500 mg, 10ml)
            strength_match = re.search(r"\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu))\b", cleaned_line, re.IGNORECASE)
            strength_val = strength_match.group(0).lower() if strength_match else None

            # Isolate drug name token (stop at dosage sig or duration)
            tokens = cleaned_line.split()
            drug_tokens = []
            for t in tokens:
                lower_t = t.lower()
                if any(x in lower_t for x in ["1-0", "0-0", "1-1", "0-1", "od", "bd", "tds", "qid", "hs", "day", "days", "week", "weeks"]):
                    break
                if lower_t in ["tab", "cap", "syr", "inj", "tablet", "capsule"]:
                    continue
                drug_tokens.append(t)

            drug_name = " ".join(drug_tokens).strip(" -:;,")
            if not drug_name:
                continue

            # Clean drug name for search (remove strength suffix if present e.g. "Crocin 650mg" -> "Crocin")
            clean_search_name = drug_name
            if strength_val:
                clean_search_name = re.sub(r"\b" + re.escape(strength_val) + r"\b", "", drug_name, flags=re.I).strip()
            if not clean_search_name:
                clean_search_name = drug_name

            # Query store catalog for drug name match
            med = (
                Medicine.query.filter(
                    Medicine.store_id == store_id,
                    Medicine.is_active == True,
                    (Medicine.brand_name.ilike(f"%{clean_search_name}%") | Medicine.generic_name.ilike(f"%{clean_search_name}%")),
                )
                .first()
            )

            is_avail = False
            stock_qty = 0
            med_id = None
            matched_name = None
            mrp_val = None
            alternatives: List[Dict[str, Any]] = []

            if med:
                med_id = med.id
                matched_name = med.brand_name
                mrp_val = float(med.selling_price or med.mrp or 0.0)

                # Query current physical stock
                stock_qty = (
                    db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
                    .join(Batch, Inventory.batch_id == Batch.id)
                    .filter(Inventory.store_id == store_id, Batch.medicine_id == med.id)
                    .scalar()
                )
                stock_qty = int(stock_qty)
                is_avail = stock_qty > 0

                # If unavailable, query alternative generic candidates
                if not is_avail:
                    alt_res = default_alternative_matcher.find_alternatives(med.id, store_id)
                    if alt_res and alt_res.candidates:
                        alternatives = [c.to_dict() for c in alt_res.candidates[:3]]

            # Default dispensing quantity
            dispense_qty = 10
            if duration and "day" in duration.lower():
                try:
                    num_days = int(re.search(r"\d+", duration).group(0))
                    doses_per_day = 2 if dosage_sig in ["1-0-1", "BD"] else 3 if dosage_sig in ["1-1-1", "TDS"] else 1
                    dispense_qty = num_days * doses_per_day
                except Exception:
                    pass

            item = PrescribedMedicineItem(
                raw_text=line,
                detected_brand_or_generic=drug_name,
                strength=strength_val,
                dosage_instructions=dosage_sig,
                duration=duration,
                quantity_to_dispense=dispense_qty,
                matched_medicine_id=med_id,
                matched_brand_name=matched_name,
                matched_mrp=mrp_val,
                is_available=is_avail,
                available_units=stock_qty,
                confidence=0.90 if med else 0.65,
                alternative_candidates=alternatives,
            )
            prescribed_items.append(item)

        total_det = len(prescribed_items)
        avail_count = sum(1 for it in prescribed_items if it.is_available)
        unavail_count = total_det - avail_count

        note = f"{total_det} medicine(s) detected: {avail_count} available in stock, {unavail_count} out of stock."
        if unavail_count > 0:
            note += " Candidate alternatives are provided for pharmacist verification."

        return PrescriptionExtractionResult(
            total_detected=total_det,
            available_count=avail_count,
            unavailable_count=unavail_count,
            items=prescribed_items,
            raw_ocr_text=text,
            is_fully_dispensable=(unavail_count == 0 and total_det > 0),
            notes=note,
        )

    def scan_prescription_image(self, image: np.ndarray, store_id: int) -> PrescriptionExtractionResult:
        ocr_res = default_ocr_engine.run_ocr(image)
        return self.parse_prescription_text(ocr_res.full_text, store_id)


default_prescription_scanner = PrescriptionScanner()
