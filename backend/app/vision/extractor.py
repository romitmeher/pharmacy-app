"""
SmartPharm Backend — Pharmaceutical Entity Extractor.

Extracts structured pharmaceutical entities from raw OCR text lines and bounding boxes:
- Brand Name
- Active Composition / Generic Name
- Strength (e.g. 500mg, 650 mg, 10mg/5ml)
- Batch Number (B.No, B.N., Batch)
- Expiry Date (Exp. Dt., MM/YYYY, normalized to calendar date)
- Manufacturing Date (Mfg. Dt.)
- MRP (Rs., ₹, M.R.P.)
- Manufacturer (Mfd by, Marketed by)
"""

from dataclasses import dataclass, field
import re
import calendar
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Union

from app.vision.ocr_engine import OCRResult


# Regex Patterns for Indian Medicine Packaging
RE_STRENGTH = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|iu|%|w\/v|w\/w)\b", re.IGNORECASE
)

RE_BATCH = re.compile(
    r"(?:B\.?\s*No\.?|Batch\s*(?:No\.?)?|B\.N\.?|Lot\s*(?:No\.?)?)\s*[:.\-]?\s*([A-Z0-9\-\/]{3,25})",
    re.IGNORECASE,
)

RE_EXPIRY = re.compile(
    r"(?:Exp\.?\s*Date|Expiry|Exp\.?\s*Dt\.?|Exp|Use\s*Before)\s*[:.\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{2,4}|[A-Za-z]{3,4}[\s\.\-\/]*[0-9]{2,4})",
    re.IGNORECASE,
)

RE_MFG = re.compile(
    r"(?:Mfg\.?\s*Date|Mfd\.?\s*Date|Mfg\.?\s*Dt\.?|Mfg|Mfd)\s*[:.\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{2,4}|[A-Za-z]{3,4}[\s\.\-\/]*[0-9]{2,4})",
    re.IGNORECASE,
)

RE_MRP = re.compile(
    r"(?:M\.?R\.?P\.?|Rs\.?|₹|Price)\s*[:.\-]?\s*(?:Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)",
    re.IGNORECASE,
)

RE_MANUFACTURER = re.compile(
    r"(?:Mfg\.?\s*by|Mfd\.?\s*by|Marketed\s*by|Manufactured\s*by)\s*[:.\-]?\s*([A-Za-z0-9\s,\.\-\&]{3,60})",
    re.IGNORECASE,
)

# Common words to filter out when searching for brand name
FILTER_WORDS = {
    "tablet", "tablets", "capsule", "capsules", "syrup", "suspension",
    "ip", "bp", "usp", "mfg", "mfd", "exp", "batch", "mrp", "rx",
    "schedule", "prescription", "store", "below", "dry", "place",
    "warning", "dose", "dosage", "keep", "out", "reach", "children",
}


@dataclass
class ExtractedEntities:
    """Strongly-typed container for entities extracted from packaging text."""
    brand_name: Optional[str] = None
    generic_name: Optional[str] = None
    strength: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    mfg_date: Optional[date] = None
    mrp: Optional[float] = None
    manufacturer: Optional[str] = None
    confidence: float = 0.8
    raw_text: str = ""
    brand_candidates: List[str] = field(default_factory=list)
    strength_inferred: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "brand_name": self.brand_name,
            "generic_name": self.generic_name,
            "strength": self.strength,
            "batch_number": self.batch_number,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "mfg_date": self.mfg_date.isoformat() if self.mfg_date else None,
            "mrp": self.mrp,
            "manufacturer": self.manufacturer,
            "confidence": round(self.confidence, 3),
            "brand_candidates": self.brand_candidates,
            "strength_inferred": self.strength_inferred,
            "raw_text": self.raw_text,
        }


def _parse_pharma_date(date_str: str) -> Optional[date]:
    """Parse common pharmaceutical expiry date strings (e.g. 05/2027, 05/27, MAY 2027, 15/05/2027).

    In Indian pharmacy practice, an expiry like '05/2027' means the medicine is valid
    until the LAST DAY of May 2027.
    """
    if not date_str:
        return None
    s = date_str.strip().replace("-", "/").replace(".", "/")
    parts = s.split("/")

    # Format: MM/YYYY or MM/YY
    if len(parts) == 2:
        try:
            month_part = parts[0].strip()
            year_part = parts[1].strip()

            # Handle 2-digit vs 4-digit year
            year = int(year_part)
            if year < 100:
                year += 2000

            # Month numeric or text (e.g. MAY)
            if month_part.isdigit():
                month = int(month_part)
            else:
                month = datetime.strptime(month_part[:3], "%b").month

            if 1 <= month <= 12:
                last_day = calendar.monthrange(year, month)[1]
                return date(year, month, last_day)
        except Exception:
            pass

    # Format: DD/MM/YYYY
    elif len(parts) == 3:
        try:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            if year < 100:
                year += 2000
            return date(year, month, day)
        except Exception:
            pass

    # Format with text month: e.g. "OCT 2027" or "OCT/2027"
    try:
        dt = datetime.strptime(date_str.strip(), "%b %Y")
        last_day = calendar.monthrange(dt.year, dt.month)[1]
        return date(dt.year, dt.month, last_day)
    except Exception:
        pass

    return None


def extract_entities(ocr_lines: Union[List[Dict[str, Any]], List[str], str, OCRResult]) -> Dict[str, Any]:
    """Legacy dict-based extractor for compatibility with test suites and helpers."""
    if isinstance(ocr_lines, OCRResult):
        confidence_by_text = {word.text: word.confidence for word in ocr_lines.word_boxes}
        lines_list = [{"text": line, "confidence": confidence_by_text.get(line, ocr_lines.avg_confidence)} for line in ocr_lines.lines]
    elif isinstance(ocr_lines, str):
        lines_list = [{"text": l, "confidence": 0.8} for l in ocr_lines.split("\n")]
    elif isinstance(ocr_lines, list) and ocr_lines and isinstance(ocr_lines[0], str):
        lines_list = [{"text": l, "confidence": 0.8} for l in ocr_lines]
    else:
        lines_list = ocr_lines or []

    full_text = " \n ".join(item.get("text", "") for item in lines_list)

    extracted = {
        "raw_text": full_text,
        "brand_name_candidates": [],
        "strength": None,
        "strength_inferred": False,
        "batch_number": None,
        "expiry_date": None,
        "manufacturing_date": None,
        "mrp": None,
        "manufacturer": None,
        "confidence_factors": {},
    }

    # 1. Batch Number
    batch_match = RE_BATCH.search(full_text)
    if batch_match:
        extracted["batch_number"] = batch_match.group(1).strip().upper()
        extracted["confidence_factors"]["batch"] = 0.90
    else:
        for line in lines_list:
            txt = line.get("text", "").strip()
            if txt.upper().startswith(("B ", "B.", "BN ", "BN.", "LOT ")):
                tokens = txt.split()
                if len(tokens) >= 2:
                    extracted["batch_number"] = tokens[1].strip().upper()
                    extracted["confidence_factors"]["batch"] = 0.75
                    break

    # 2. Expiry Date
    exp_match = RE_EXPIRY.search(full_text)
    if exp_match:
        raw_exp = exp_match.group(1).strip()
        parsed_exp = _parse_pharma_date(raw_exp)
        if parsed_exp:
            extracted["expiry_date"] = parsed_exp.isoformat()
            extracted["confidence_factors"]["expiry"] = 0.90

    # 3. Manufacturing Date
    mfg_match = RE_MFG.search(full_text)
    if mfg_match:
        raw_mfg = mfg_match.group(1).strip()
        parsed_mfg = _parse_pharma_date(raw_mfg)
        if parsed_mfg:
            extracted["manufacturing_date"] = parsed_mfg.isoformat()

    # 4. Strength
    str_match = None
    for line in lines_list:
        text = line.get("text", "")
        if re.search(r"\b(?:max(?:imum)?|daily|dosage|dose|hours?|exceed|overdose)\b", text, re.I):
            continue
        str_match = RE_STRENGTH.search(text)
        if str_match:
            break
    if str_match:
        extracted["strength"] = f"{str_match.group(1)} {str_match.group(2).lower()}"
        extracted["confidence_factors"]["strength"] = 0.85
    else:
        # Fallback for Indian pharma convention where strength is part of brand name (e.g. Crocin 650, Dolo 650)
        from app.vision.stocking import product_queries
        product_names = product_queries("\n".join(line.get("text", "") for line in lines_list))
        num_match = re.search(r"\b(\d{1,4})\b", product_names[0]) if product_names else None
        if num_match is None:
            for line in lines_list:
                num_match = re.search(r"\b(?:tablets?|capsules?)\s*(?:I\.?\s*P\.?|I\.?)?\s*(\d{1,4})\s*$",
                                      line.get("text", ""), re.I)
                if num_match:
                    break
        if num_match:
            val = int(num_match.group(1))
            if 1 <= val <= 2000 and val not in (2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030):
                extracted["strength"] = f"{val} mg"
                extracted["strength_inferred"] = True
                extracted["confidence_factors"]["strength"] = 0.75


    # 5. MRP
    mrp_match = RE_MRP.search(full_text)
    if mrp_match:
        try:
            mrp_val = float(mrp_match.group(1))
            if 1.0 <= mrp_val <= 100000.0:
                extracted["mrp"] = mrp_val
                extracted["confidence_factors"]["mrp"] = 0.85
        except ValueError:
            pass

    # 6. Manufacturer
    mfg_match = RE_MANUFACTURER.search(full_text)
    if mfg_match:
        extracted["manufacturer"] = mfg_match.group(1).strip()

    # 7. Brand Name Candidates
    candidates = []
    for line in lines_list:
        txt = line.get("text", "").strip()
        if len(txt) < 3 or len(txt) > 50:
            continue
        words = txt.lower().split()
        if any(w in FILTER_WORDS for w in words):
            if len([w for w in words if w not in FILTER_WORDS]) == 0:
                continue
        if txt.replace(".", "").isdigit() or "/" in txt:
            continue
        candidates.append({
            "text": txt,
            "ocr_confidence": round(float(line.get("confidence", 0.7)), 3),
        })

    from app.vision.stocking import product_queries
    prioritized = product_queries("\n".join(line.get("text", "") for line in lines_list))
    candidates.sort(key=lambda c: c["ocr_confidence"], reverse=True)
    extracted["brand_name_candidates"] = list(dict.fromkeys([*prioritized, *(c["text"] for c in candidates)]))[:20]

    return extracted


class EntityExtractor:
    """Transforms OCR results into ExtractedEntities for DB matching."""

    def extract(self, ocr_result: Union[OCRResult, List[Dict[str, Any]], str]) -> ExtractedEntities:
        raw_dict = extract_entities(ocr_result)
        brand_candidates = raw_dict.get("brand_name_candidates", [])
        top_brand = brand_candidates[0] if brand_candidates else None

        # Parse expiry date object if string
        exp_val = raw_dict.get("expiry_date")
        exp_date = None
        if isinstance(exp_val, str):
            try:
                exp_date = date.fromisoformat(exp_val)
            except Exception:
                exp_date = _parse_pharma_date(exp_val)
        elif isinstance(exp_val, date):
            exp_date = exp_val

        mfg_val = raw_dict.get("manufacturing_date")
        mfg_date = None
        if isinstance(mfg_val, str):
            try:
                mfg_date = date.fromisoformat(mfg_val)
            except Exception:
                mfg_date = _parse_pharma_date(mfg_val)
        elif isinstance(mfg_val, date):
            mfg_date = mfg_val

        # Average confidence from OCR and detected factors
        conf_factors = raw_dict.get("confidence_factors", {})
        base_conf = sum(conf_factors.values()) / len(conf_factors) if conf_factors else 0.5
        if isinstance(ocr_result, OCRResult) and ocr_result.avg_confidence > 0:
            final_conf = (base_conf + ocr_result.avg_confidence) / 2.0
        else:
            final_conf = base_conf

        return ExtractedEntities(
            brand_name=top_brand,
            generic_name=None,
            strength=raw_dict.get("strength"),
            batch_number=raw_dict.get("batch_number"),
            expiry_date=exp_date,
            mfg_date=mfg_date,
            mrp=raw_dict.get("mrp"),
            manufacturer=raw_dict.get("manufacturer"),
            confidence=final_conf,
            raw_text=raw_dict.get("raw_text", ""),
            brand_candidates=brand_candidates,
            strength_inferred=raw_dict.get("strength_inferred", False),
        )


default_entity_extractor = EntityExtractor()
