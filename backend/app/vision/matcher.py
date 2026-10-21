"""
SmartPharm - Medicine & Batch Database Matcher
Cross-references extracted visual/OCR entities against the pharmaceutical database
(Medicines, Aliases, Active Ingredients, Batches, and Store Inventory).

Strict compliance with SmartPharm PRD:
- Rule 9: Human verification is mandatory. If confidence < 50%, NEVER guess.
  Provide warning: "Unable to confidently identify this medicine. Capture another image or search manually."
- Rule 10: Mathematical, explainable confidence scoring based on Brand, Strength,
  Manufacturer, Batch, and OCR quality (No fabricated confidence values).
- Rule 13: Maintain strict distinction: MEDICINE != BATCH != INVENTORY UNIT.
"""

from dataclasses import dataclass, field
from datetime import date
import difflib
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import or_, func
from sqlalchemy.orm import selectinload

from app.models.medicine import Medicine, MedicineAlias
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.vision.extractor import ExtractedEntities

logger = logging.getLogger(__name__)


@dataclass
class MatchCandidate:
    """A scored medicine match candidate for pharmacist review."""
    medicine_id: int
    name: str
    generic_name: Optional[str]
    strength: Optional[str]
    dosage_form: Optional[str]
    manufacturer: Optional[str]
    mrp: Optional[float]
    confidence_score: float  # Range: 0.0 to 100.0
    confidence_level: str    # "HIGH" (>=75), "MEDIUM" (50-74), "LOW" (<50)
    score_breakdown: Dict[str, float] = field(default_factory=dict)
    matched_batch: Optional[Dict[str, Any]] = None
    is_new_batch: bool = False
    active_stock: int = 0

    def to_dict(self) -> dict:
        return {
            "medicine_id": self.medicine_id,
            "name": self.name,
            "generic_name": self.generic_name,
            "strength": self.strength,
            "dosage_form": self.dosage_form,
            "manufacturer": self.manufacturer,
            "mrp": float(self.mrp) if self.mrp is not None else None,
            "confidence_score": round(self.confidence_score, 1),
            "confidence_level": self.confidence_level,
            "score_breakdown": {k: round(v, 1) for k, v in self.score_breakdown.items()},
            "matched_batch": self.matched_batch,
            "is_new_batch": self.is_new_batch,
            "active_stock": self.active_stock,
        }


@dataclass
class MatchResult:
    """Top-level database matching result for the pharmacist interface."""
    top_candidate: Optional[MatchCandidate]
    alternatives: List[MatchCandidate]
    low_confidence: bool
    warning_message: Optional[str]
    search_fallbacks: List[str]

    def to_dict(self) -> dict:
        return {
            "top_candidate": self.top_candidate.to_dict() if self.top_candidate else None,
            "alternatives": [alt.to_dict() for alt in self.alternatives],
            "low_confidence": self.low_confidence,
            "warning_message": self.warning_message,
            "search_fallbacks": self.search_fallbacks,
        }


import re

def _string_similarity(str1: Optional[str], str2: Optional[str]) -> float:
    """Compute normalized token-sort SequenceMatcher ratio between two strings."""
    if not str1 or not str2:
        return 0.0
    s1 = str1.strip().lower()
    s2 = str2.strip().lower()
    if s1 == s2:
        return 1.0

    # Token sort ratio (handles word order differences and punctuation variations)
    t1 = " ".join(sorted(re.findall(r"\w+", s1)))
    t2 = " ".join(sorted(re.findall(r"\w+", s2)))
    if t1 and t2 and t1 == t2:
        return 0.98

    # Containment check
    if (t1 and t2) and (set(t1.split()) <= set(t2.split()) or set(t2.split()) <= set(t1.split())):
        return 0.92

    ratio_raw = difflib.SequenceMatcher(None, s1, s2).ratio()
    ratio_tok = difflib.SequenceMatcher(None, t1, t2).ratio() if t1 and t2 else 0.0
    return max(ratio_raw, ratio_tok)


def _brand_key(value):
    value = re.sub(r"(?<=\d)\s*(?:mcg|mg|g)\b", "", (value or "").casefold())
    value = re.sub(r"\b(?:tablets?|capsules?|injections?|syrups?|ip|i\.p)\b", "", value)
    return re.sub(r"[^a-z0-9]", "", value)


def _brand_similarity(left, right):
    a, b = _brand_key(left), _brand_key(right)
    if a and a == b:
        return 1.0
    return _string_similarity(left, right)


class MedicineMatcher:
    """
    Evaluates extracted packaging tokens against database records
    using multi-factor explainable scoring.
    """

    LOW_CONFIDENCE_THRESHOLD = 50.0
    HIGH_CONFIDENCE_THRESHOLD = 75.0
    PRD_LOW_CONFIDENCE_WARNING = (
        "Unable to confidently identify this medicine. "
        "Capture another image or search manually."
    )

    def match(
        self,
        entities: ExtractedEntities,
        store_id: Optional[int] = None,
        max_candidates: int = 5,
    ) -> MatchResult:
        """
        Match ExtractedEntities against Medicine, MedicineAlias, and Batch tables.

        Scoring weights (Total: 100):
        - Brand name similarity: 40 pts
        - Strength match: 20 pts
        - Manufacturer similarity: 15 pts
        - Batch verification: 15 pts
        - Extraction quality (OCR tokens): 10 pts
        """
        # Step 1: Candidate retrieval queries
        # Search candidate medicines by brand or alias
        names = list(dict.fromkeys([name.strip() for name in [entities.brand_name, *entities.brand_candidates] if name and name.strip()]))
        if not names:
            return MatchResult(None, [], True, self.PRD_LOW_CONFIDENCE_WARNING, ["Manual name search"])
        search_terms = list(names)
        if entities.brand_name:
            search_terms.append(entities.brand_name.strip())
        if entities.manufacturer:
            search_terms.append(entities.manufacturer.strip())

        candidates_query = Medicine.query.filter(Medicine.is_active == True)  # noqa: E712
        if store_id:
            candidates_query = candidates_query.filter(Medicine.store_id == store_id)

        if search_terms:
            conditions = []
            for term in search_terms:
                like_pattern = f"%{term}%"
                conditions.append(Medicine.brand_name.ilike(like_pattern))
                conditions.append(Medicine.aliases.any(MedicineAlias.alias_name.ilike(like_pattern)))
                compact_brand = func.replace(func.replace(func.replace(func.lower(Medicine.brand_name), " ", ""), "-", ""), ".", "")
                compact_term = re.sub(r"[ .-]", "", term.lower())
                if len(compact_term) >= 3:
                    conditions.append(compact_brand.ilike(f"%{compact_term}%"))
            candidates_query = candidates_query.filter(or_(*conditions))

        candidate_meds = candidates_query.options(selectinload(Medicine.aliases)).limit(100).all()

        # If strict term query yielded no candidates, fetch wider active pool if brand is present
        if not candidate_meds and entities.brand_name:
            fallback_query = Medicine.query.filter(Medicine.is_active == True)  # noqa: E712
            if store_id:
                fallback_query = fallback_query.filter(Medicine.store_id == store_id)
            tokens = [token for name in names for token in re.findall(r"[a-zA-Z]{4,}", name)
                      if token.lower() not in {"tablet", "tablets", "capsule", "capsules", "injection"}]
            if not tokens:
                return MatchResult(None, [], True, self.PRD_LOW_CONFIDENCE_WARNING, names)
            fallback_query = fallback_query.filter(or_(*[
                Medicine.brand_name.ilike(f"%{token}%") for token in tokens]))
            candidate_meds = fallback_query.options(selectinload(Medicine.aliases)).limit(50).all()

        scored_candidates: List[MatchCandidate] = []

        for med in candidate_meds:
            breakdown: Dict[str, float] = {}

            # 1. Brand name similarity (0 - 40 pts)
            best_name_sim = max(
                (_brand_similarity(name, target) for name in names
                 for target in [med.brand_name, *(alias.alias_name for alias in med.aliases if alias.alias_type != "barcode")]),
                default=0.0,
            )
            # OCR quality, packaging colour and batch-like text are not identity.
            if best_name_sim < 0.72:
                continue
            if entities.strength and med.strength:
                detected_numbers = re.findall(r"\d+(?:\.\d+)?", entities.strength)
                medicine_numbers = re.findall(r"\d+(?:\.\d+)?", med.strength)
                if detected_numbers and medicine_numbers and detected_numbers != medicine_numbers:
                    # Some combination brands print their total dose (625), while
                    # the verified catalog lists components (500 + 125).
                    total_agrees = (entities.strength_inferred and len(detected_numbers) == 1 and
                        "+" in med.strength and "/" not in med.strength and
                        len(set(re.findall(r"\d\s*(mcg|mg|g|ml|iu)\b", med.strength.lower()))) == 1 and
                        float(detected_numbers[0]) == sum(float(n) for n in medicine_numbers) and
                        detected_numbers[0] in re.findall(r"\d+(?:\.\d+)?", med.brand_name))
                    if not total_agrees:
                        continue
                detected_units = re.findall(r"\d\s*(mcg|mg|g|ml|iu)\b", entities.strength.lower())
                medicine_units = re.findall(r"\d\s*(mcg|mg|g|ml|iu)\b", med.strength.lower())
                if not entities.strength_inferred and detected_units and medicine_units and detected_units != medicine_units:
                    continue
            brand_pts = round(best_name_sim * 40.0, 2)
            breakdown["brand_score"] = brand_pts

            # 2. Strength match (0 - 20 pts)
            strength_pts = 0.0
            if entities.strength and med.strength:
                s_sim = _string_similarity(entities.strength, med.strength)
                if entities.strength_inferred:
                    strength_pts = 10.0
                    breakdown["strength_from_product_name"] = 0.0  # evidence label, not an extra score
                elif s_sim >= 0.85:
                    strength_pts = 20.0
                elif s_sim >= 0.50:
                    strength_pts = 10.0
            breakdown["strength_score"] = strength_pts

            # 3. Manufacturer similarity (0 - 15 pts)
            mfg_pts = 0.0
            if entities.manufacturer and med.manufacturer:
                m_sim = _string_similarity(entities.manufacturer, med.manufacturer)
                if m_sim >= 0.80:
                    mfg_pts = 15.0
                elif m_sim >= 0.50:
                    mfg_pts = 7.5
            breakdown["manufacturer_score"] = mfg_pts

            # 4. Batch verification (0 - 15 pts)
            batch_pts = 0.0
            matched_batch_info = None
            is_new_batch = False

            if entities.batch_number:
                # Query existing batch for this medicine
                batch_rec = Batch.query.filter(
                    Batch.medicine_id == med.id,
                    Batch.batch_number.ilike(entities.batch_number.strip()),
                ).first()

                if batch_rec:
                    batch_pts = 15.0
                    matched_batch_info = {
                        "batch_id": batch_rec.id,
                        "batch_number": batch_rec.batch_number,
                        "expiry_date": batch_rec.expiry_date.isoformat() if batch_rec.expiry_date else None,
                        "mrp": float(batch_rec.mrp) if batch_rec.mrp else None,
                        "purchase_price": float(batch_rec.purchase_price) if batch_rec.purchase_price else None,
                    }
                else:
                    is_new_batch = True
                    # Partial score for having recognized a valid batch pattern
                    batch_pts = 5.0
            breakdown["batch_score"] = batch_pts

            # 5. Extraction quality contribution (0 - 10 pts)
            quality_pts = round(entities.confidence * 10.0, 2)
            breakdown["ocr_quality_score"] = quality_pts

            # Total score calculation
            total_score = min(100.0, sum(breakdown.values()))

            # Classify level
            if total_score >= self.HIGH_CONFIDENCE_THRESHOLD:
                level = "HIGH"
            elif total_score >= self.LOW_CONFIDENCE_THRESHOLD:
                level = "MEDIUM"
            else:
                level = "LOW"

            # Check active inventory stock if store_id is given
            active_stock = 0

            dosage_str = med.dosage_form.value if hasattr(med.dosage_form, "value") else str(med.dosage_form or "")

            scored_candidates.append(
                MatchCandidate(
                    medicine_id=med.id,
                    name=med.brand_name,
                    generic_name=med.generic_name,
                    strength=med.strength,
                    dosage_form=dosage_str,
                    manufacturer=med.manufacturer,
                    mrp=med.mrp,
                    confidence_score=total_score,
                    confidence_level=level,
                    score_breakdown=breakdown,
                    matched_batch=matched_batch_info,
                    is_new_batch=is_new_batch,
                    active_stock=active_stock,
                )
            )


        # Sort candidates descending by confidence score
        scored_candidates.sort(key=lambda c: c.confidence_score, reverse=True)

        if store_id and scored_candidates:
            ids = [candidate.medicine_id for candidate in scored_candidates[:max_candidates]]
            rows = (Inventory.query.with_entities(Batch.medicine_id, func.sum(Inventory.quantity_available))
                    .join(Batch, Inventory.batch_id == Batch.id)
                    .filter(Inventory.store_id == store_id, Batch.store_id == store_id,
                            Batch.medicine_id.in_(ids), Batch.expiry_date >= date.today())
                    .group_by(Batch.medicine_id).all())
            stock = dict(rows)
            for candidate in scored_candidates[:max_candidates]:
                candidate.active_stock = int(stock.get(candidate.medicine_id, 0))

        top = scored_candidates[0] if scored_candidates else None
        alternatives = scored_candidates[1:max_candidates] if len(scored_candidates) > 1 else []

        # PRD Rule 9 check: if top score < 50%, flag low confidence and warn
        low_confidence = top is None or top.confidence_score < self.LOW_CONFIDENCE_THRESHOLD
        if top and len(scored_candidates) > 1 and top.confidence_score - scored_candidates[1].confidence_score < 3:
            low_confidence = True
        warning_message = self.PRD_LOW_CONFIDENCE_WARNING if low_confidence else None

        # Build fallback search queries for pharmacist manual search
        fallbacks: List[str] = []
        if entities.brand_name:
            fallbacks.append(f"Brand: '{entities.brand_name}'")
        if entities.strength:
            fallbacks.append(f"Strength: '{entities.strength}'")
        if entities.manufacturer:
            fallbacks.append(f"Manufacturer: '{entities.manufacturer}'")
        if not fallbacks:
            fallbacks.append("Manual name search")

        return MatchResult(
            top_candidate=None if low_confidence else top,
            alternatives=alternatives,
            low_confidence=low_confidence,
            warning_message=warning_message,
            search_fallbacks=fallbacks,
        )


default_medicine_matcher = MedicineMatcher()
