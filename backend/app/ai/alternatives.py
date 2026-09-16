"""
SmartPharm - Alternative Medicine Decision Support Engine
Strict compliance with SmartPharm PRD Rule 20:
- Decision support for pharmacist review.
- Matches candidate alternatives based on:
  - Active ingredient (generic/composition)
  - Strength
  - Dosage form
  - Physical stock availability in store
  - Price comparison (cost savings for patient)
- Communicates clearly that the PHARMACIST must verify:
  appropriateness, prescription requirements, formulation, and substitution rules.
- The AI must NOT autonomously prescribe or substitute medicines.
"""

from dataclasses import dataclass, field
from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.medicine import Medicine, Ingredient, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory

logger = logging.getLogger(__name__)

MANDATORY_SAFETY_DISCLAIMER = (
    "CLINICAL DECISION SUPPORT NOTICE: These alternative medicine candidates are provided for "
    "licensed pharmacist professional review only. The system does NOT autonomously substitute "
    "or prescribe medications. The dispensing pharmacist must verify active ingredients, salt form, "
    "dosage, route, bioequivalence, and regulatory prescription substitution requirements before dispensing."
)


@dataclass
class AlternativeCandidate:
    medicine_id: int
    brand_name: str
    generic_name: str
    strength: Optional[str]
    dosage_form: Optional[str]
    manufacturer: Optional[str]
    mrp: float
    selling_price: float
    units_in_stock: int
    is_available: bool
    price_difference_pct: float  # negative means cheaper than original
    match_reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "generic_name": self.generic_name,
            "strength": self.strength,
            "dosage_form": self.dosage_form,
            "manufacturer": self.manufacturer,
            "mrp": round(self.mrp, 2),
            "selling_price": round(self.selling_price, 2),
            "units_in_stock": self.units_in_stock,
            "is_available": self.is_available,
            "price_difference_pct": round(self.price_difference_pct, 1),
            "match_reasons": self.match_reasons,
        }


@dataclass
class AlternativeMedicineResponse:
    original_medicine_id: int
    original_brand_name: str
    original_generic_name: str
    original_strength: Optional[str]
    original_mrp: float
    original_in_stock: int
    candidates: List[AlternativeCandidate]
    total_candidates_found: int
    available_candidates_count: int
    disclaimer: str = MANDATORY_SAFETY_DISCLAIMER

    def to_dict(self) -> Dict[str, Any]:
        return {
            "original_medicine": {
                "id": self.original_medicine_id,
                "brand_name": self.original_brand_name,
                "generic_name": self.original_generic_name,
                "strength": self.original_strength,
                "mrp": round(self.original_mrp, 2),
                "in_stock": self.original_in_stock,
            },
            "total_candidates_found": self.total_candidates_found,
            "available_candidates_count": self.available_candidates_count,
            "candidates": [c.to_dict() for c in self.candidates],
            "disclaimer": self.disclaimer,
        }


class AlternativeMedicineMatcher:
    """
    Evaluates generic active ingredients and finds bio-equivalent/therapeutic
    candidates with live inventory stock indicators.
    """

    def find_alternatives(self, medicine_id: int, store_id: int) -> Optional[AlternativeMedicineResponse]:
        orig = Medicine.query.filter_by(id=medicine_id, store_id=store_id).first()
        if not orig:
            return None

        # Determine original active ingredients
        active_molecules: List[str] = []
        if orig.generic_name:
            active_molecules.append(orig.generic_name.strip().lower())

        for ing in orig.ingredients:
            if ing.name:
                active_molecules.append(ing.name.strip().lower())

        # Original stock count
        orig_stock = (
            db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
            .join(Batch, Inventory.batch_id == Batch.id)
            .filter(Inventory.store_id == store_id, Batch.medicine_id == orig.id)
            .scalar()
        )

        orig_price = float(orig.selling_price or orig.mrp or 1.0)

        candidates: List[AlternativeCandidate] = []

        # Find potential substitutes in store catalog
        query = Medicine.query.filter(
            Medicine.store_id == store_id,
            Medicine.id != orig.id,
            Medicine.is_active == True,
        )

        # Match by generic name or ingredient
        potential_meds = query.all()
        for cand in potential_meds:
            reasons = []
            is_ingredient_match = False

            # Check generic name match
            cand_generic = (cand.generic_name or "").strip().lower()
            if cand_generic and any(mol in cand_generic or cand_generic in mol for mol in active_molecules):
                is_ingredient_match = True
                reasons.append(f"Identical active molecule: {cand.generic_name}")

            # Check ingredients relationship
            if not is_ingredient_match:
                cand_ing_names = [ing.name.strip().lower() for ing in cand.ingredients]
                if any(mol in cand_ing_names for mol in active_molecules):
                    is_ingredient_match = True
                    reasons.append("Matching active ingredient composition")

            if not is_ingredient_match:
                continue

            # Check strength match
            cand_strength = (cand.strength or "").strip().lower()
            orig_strength = (orig.strength or "").strip().lower()
            if orig_strength and cand_strength:
                if orig_strength == cand_strength:
                    reasons.append(f"Exact strength match ({cand.strength})")
                else:
                    reasons.append(f"Different strength: {cand.strength} vs {orig.strength}")

            # Check dosage form match
            if orig.dosage_form and cand.dosage_form:
                if orig.dosage_form == cand.dosage_form:
                    reasons.append(f"Identical dosage form ({cand.dosage_form.value})")

            # Check physical stock availability
            cand_stock = (
                db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
                .join(Batch, Inventory.batch_id == Batch.id)
                .filter(Inventory.store_id == store_id, Batch.medicine_id == cand.id)
                .scalar()
            )

            cand_price = float(cand.selling_price or cand.mrp or 0.0)
            diff_pct = 0.0
            if orig_price > 0:
                diff_pct = ((cand_price - orig_price) / orig_price) * 100.0

            candidates.append(
                AlternativeCandidate(
                    medicine_id=cand.id,
                    brand_name=cand.brand_name,
                    generic_name=cand.generic_name or "Unknown Molecule",
                    strength=cand.strength,
                    dosage_form=cand.dosage_form.value if cand.dosage_form else None,
                    manufacturer=cand.manufacturer,
                    mrp=float(cand.mrp or 0.0),
                    selling_price=cand_price,
                    units_in_stock=int(cand_stock),
                    is_available=(cand_stock > 0),
                    price_difference_pct=diff_pct,
                    match_reasons=reasons,
                )
            )

        # Sort: available items first, then by price difference (cheaper first)
        candidates.sort(key=lambda c: (not c.is_available, c.price_difference_pct))

        available_count = sum(1 for c in candidates if c.is_available)

        return AlternativeMedicineResponse(
            original_medicine_id=orig.id,
            original_brand_name=orig.brand_name,
            original_generic_name=orig.generic_name or "Unknown",
            original_strength=orig.strength,
            original_mrp=float(orig.mrp or 0.0),
            original_in_stock=int(orig_stock),
            candidates=candidates,
            total_candidates_found=len(candidates),
            available_candidates_count=available_count,
        )


default_alternative_matcher = AlternativeMedicineMatcher()
