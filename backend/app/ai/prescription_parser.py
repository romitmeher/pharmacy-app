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
    quantity_to_dispense: Optional[int] = None
    matched_medicine_id: Optional[int] = None
    matched_brand_name: Optional[str] = None
    matched_mrp: Optional[float] = None
    is_available: bool = False
    available_units: int = 0
    confidence: Optional[float] = None
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
            "confidence": self.confidence,
            "requires_review": True,
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
    warnings: List[str] = field(default_factory=list)
    engine: str = "local_text"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_detected": self.total_detected,
            "available_count": self.available_count,
            "unavailable_count": self.unavailable_count,
            "is_fully_dispensable": self.is_fully_dispensable,
            "notes": self.notes,
            "items": [it.to_dict() for it in self.items],
            "raw_ocr_text": self.raw_ocr_text,
            "warnings": self.warnings,
            "engine": self.engine,
            "requires_verification": True,
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
            if re.match(r"^(?:dr\.?\s|clinic\b|hospital\b|patient\b|age\b|date\b|weight\b|reg\s*no\b)", lower_l):
                continue

            # Strip leading bullet points or numbered list tokens (e.g. "1.", "Tab", "Cap", "Inj", "Rx")
            cleaned_line = line
            cleaned_line = re.sub(r"^(?:\d+\.|\*|-|•|\(?\d+\)?)\s*", "", cleaned_line).strip()
            has_marker = bool(re.match(r"^(?:t\.?\s|tab\b|tablet\b|cap\b|capsule\b|syr\b|inj\b|oint\b)", cleaned_line, re.I))
            cleaned_line = re.sub(r"^(?:rx\b\s*:?|t\.?\s|tab(?:let)?\b\.?|cap(?:sule)?\b\.?|syr(?:up)?\b\.?|inj(?:ection)?\b\.?|oint(?:ment)?\b\.?)\s*", "", cleaned_line, flags=re.IGNORECASE).strip()
            if re.match(r"^(?:name|sex|mob|bp|b\.p|hr|spo2|temp|timing|for medicine|diagnosis|h/o|fever)\b", cleaned_line, re.I):
                continue
            if not has_marker and not (RE_DOSAGE_SIG.search(cleaned_line) or re.search(r"\d\s*(mg|mcg|ml)\b", cleaned_line, re.I)):
                continue
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
                if RE_DOSAGE_SIG.fullmatch(t.strip(".,")) or re.fullmatch(r"\d+-\d+-\d+|days?|weeks?|months?", lower_t):
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
                .limit(20).all()
            )
            # Do not silently pick the first medicine when several strengths match.
            if strength_val:
                normalize = lambda value: re.sub(r"\W", "", (value or "").lower())
                med = [m for m in med if normalize(m.strength) == normalize(strength_val)]
            def name_key(value):
                value = re.sub(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu)?\b", "", value or "", flags=re.I)
                return re.sub(r"\W", "", value.casefold())
            med = [m for m in med if name_key(clean_search_name) in {name_key(m.brand_name), name_key(m.generic_name)}]
            med = med[0] if len(med) == 1 else None

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
                    .filter(Inventory.store_id == store_id, Batch.store_id == store_id,
                            Batch.medicine_id == med.id, Batch.expiry_date >= datetime.date.today())
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
            # A schedule/circled duration is not an explicit dispensing quantity.
            dispense_qty = None

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
                confidence=None,
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
            is_fully_dispensable=False,
            notes=note,
        )

    def scan_prescription_image(self, image: np.ndarray, store_id: int, use_handwriting=False) -> PrescriptionExtractionResult:
        if use_handwriting:
            from app.ai.prescription_vision import read_handwriting
            try:
                reading = read_handwriting(image)
            except Exception as error:
                # Never log a provider exception body, key or prescription contents.
                logger.warning("Prescription handwriting service unavailable (%s)", type(error).__name__)
                return PrescriptionExtractionResult(0, 0, 0, engine="handwriting_unavailable",
                    warnings=["Handwriting AI is unavailable. Retry later, choose local printed OCR, or enter the medicine rows manually."],
                    notes="No medicines guessed. No prescription has been saved.")
            result = PrescriptionExtractionResult(0, 0, 0, engine="handwriting_ai",
                raw_ocr_text="\n".join(row["raw_text"] for row in reading["items"]), warnings=reading["warnings"])
            for row in reading["items"]:
                name = row.get("name")
                uncertain = row["uncertain"] or not name
                result.items.append(PrescribedMedicineItem(
                    raw_text=row["raw_text"],
                    detected_brand_or_generic=(row["raw_text"] if uncertain else name),
                    strength=row.get("strength"), dosage_instructions=row.get("dosage_instructions"),
                    duration=row.get("duration"), quantity_to_dispense=row.get("quantity")))
                if uncertain:
                    result.warnings.append(f"Unclear medicine name in row {len(result.items)}: compare with the original or contact the prescriber.")
            result.total_detected = len(result.items)
            result.unavailable_count = result.total_detected
            result.notes = "Draft transcription only. Check every medicine name, strength, schedule and quantity before saving. No automatic catalog link or dispensing approval."
            return result
        import cv2
        # Local-only shadow correction helps phone photographs of paper. Keep
        # both readings visible; do not invent a more plausible handwritten drug.
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        background = cv2.GaussianBlur(gray, (0, 0), 25)
        normalized = cv2.divide(gray, background, scale=255)
        normalized = cv2.cvtColor(normalized, cv2.COLOR_GRAY2BGR)
        readings = [default_ocr_engine.run_ocr(image), default_ocr_engine.run_ocr(normalized)]
        candidates = []
        for reading in readings:
            # Rejoin OCR boxes on a visual row; OCR engines otherwise return
            # disconnected words in reading order, losing the T./Tab marker.
            boxes = [w for w in reading.word_boxes if len(w.box) == 4]
            rows = []
            for word in sorted(boxes, key=lambda w: sum(p[1] for p in w.box)/4):
                center = sum(p[1] for p in word.box)/4
                height = max(p[1] for p in word.box)-min(p[1] for p in word.box)
                if rows and abs(center-rows[-1][0]) < max(8, min(height, rows[-1][1])*.65):
                    rows[-1][2].append(word)
                else:
                    rows.append([center, height, [word]])
            text = "\n".join(" ".join(w.text for w in sorted(row[2], key=lambda w: min(p[0] for p in w.box))) for row in rows) if rows else reading.full_text
            candidates.append(self.parse_prescription_text(text, store_id))
        result = max(candidates, key=lambda candidate: candidate.total_detected)
        # Local printed OCR does not establish a handwritten identity. Preserve
        # the visible draft but require a pharmacist to choose any catalog link.
        for item in result.items:
            item.matched_medicine_id = None
            item.matched_brand_name = None
            item.matched_mrp = None
            item.is_available = False
            item.available_units = 0
            item.alternative_candidates = []
        result.available_count = 0
        result.unavailable_count = result.total_detected
        result.engine = "local_ocr"
        result.warnings = ["Local OCR is designed for printed text and may misread handwriting. Review the original and edit every medicine row; no automatic catalog links or quantities were assigned."]
        result.notes = "Draft reading only. Unclear handwriting must be transcribed or confirmed by a pharmacist."
        return result


default_prescription_scanner = PrescriptionScanner()
