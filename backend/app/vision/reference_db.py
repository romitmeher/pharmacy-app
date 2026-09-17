"""
SmartPharm - Reference Medicine Text Database Normalizer & Seed Loader
Normalizes public Indian pharmaceutical product datasets (brands, generic active ingredients,
strengths, dosage forms, manufacturers, aliases, and combination molecules) into structured database records.
"""

from dataclasses import dataclass, field
import logging
import re
from typing import Any, Dict, List, Optional
from app.extensions import db
from app.models.medicine import Medicine, MedicineAlias, DosageForm

logger = logging.getLogger(__name__)


@dataclass
class ReferenceMedicineRecord:
    brand_name: str
    generic_name: str
    strength: str
    dosage_form: str
    manufacturer: str
    mrp: float
    is_prescription_only: bool
    aliases: List[str] = field(default_factory=list)
    storage_conditions: str = "Store below 30°C in a dry place."
    category: str = "General Pharma"


# Standard reference dataset covering key Indian retail pharmacy formulations
INDIAN_REFERENCE_MEDICINES: List[ReferenceMedicineRecord] = [
    ReferenceMedicineRecord(
        brand_name="Glitch-M1",
        generic_name="Glimepiride + Metformin Hydrochloride SR",
        strength="1mg / 500mg",
        dosage_form="tablet",
        manufacturer="Mecoson Labs",
        mrp=85.50,
        is_prescription_only=True,
        aliases=["GLITCH M1", "GLITCH M1 TABLETS", "GLITCH-M1 SR", "GLIMEPIRIDE METFORMIN 1/500"],
    ),
    ReferenceMedicineRecord(
        brand_name="Glycomet-GP 1",
        generic_name="Glimepiride + Metformin Hydrochloride SR",
        strength="1mg / 500mg",
        dosage_form="tablet",
        manufacturer="USV Private Limited",
        mrp=92.00,
        is_prescription_only=True,
        aliases=["GLYCOMET GP1", "GLYCOMET-GP1 TABLET", "GLYCOMET GP 1MG"],
    ),
    ReferenceMedicineRecord(
        brand_name="Pan-D",
        generic_name="Pantoprazole Sodium + Domperidone",
        strength="40mg / 30mg",
        dosage_form="capsule",
        manufacturer="Alkem Laboratories",
        mrp=145.00,
        is_prescription_only=True,
        aliases=["PAN D", "PAND CAPSULE", "PANTOPRAZOLE DOMPERIDONE PAN D"],
    ),
    ReferenceMedicineRecord(
        brand_name="Augmentin 625 Duo",
        generic_name="Amoxicillin + Potassium Clavulanate",
        strength="500mg / 125mg",
        dosage_form="tablet",
        manufacturer="GlaxoSmithKline Pharmaceuticals Ltd",
        mrp=220.00,
        is_prescription_only=True,
        aliases=["AUGMENTIN 625", "AUGMENTIN DUO 625", "AMOX CLAV 625"],
    ),
    ReferenceMedicineRecord(
        brand_name="Dolo 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form="tablet",
        manufacturer="Micro Labs Limited",
        mrp=34.00,
        is_prescription_only=False,
        aliases=["DOLO 650MG", "PARACETAMOL 650 DOLO", "MICRO LABS DOLO 650"],
    ),
    ReferenceMedicineRecord(
        brand_name="Azithral 500",
        generic_name="Azithromycin",
        strength="500mg",
        dosage_form="tablet",
        manufacturer="Alembic Pharmaceuticals Ltd",
        mrp=119.50,
        is_prescription_only=True,
        aliases=["AZITHRAL 500MG", "AZITHROMYCIN 500 AZITHRAL"],
    ),
    ReferenceMedicineRecord(
        brand_name="Telma 40",
        generic_name="Telmisartan",
        strength="40mg",
        dosage_form="tablet",
        manufacturer="Glenmark Pharmaceuticals",
        mrp=110.00,
        is_prescription_only=True,
        aliases=["TELMA 40MG", "TELMISARTAN 40 TELMA"],
    ),
    ReferenceMedicineRecord(
        brand_name="Atorva 10",
        generic_name="Atorvastatin",
        strength="10mg",
        dosage_form="tablet",
        manufacturer="Zydus Healthcare",
        mrp=75.00,
        is_prescription_only=True,
        aliases=["ATORVA 10MG", "ATORVASTATIN 10 ZYDUS"],
    ),
    ReferenceMedicineRecord(
        brand_name="Montair LC",
        generic_name="Montelukast + Levocetirizine Dihydrochloride",
        strength="10mg / 5mg",
        dosage_form="tablet",
        manufacturer="Cipla Ltd",
        mrp=180.00,
        is_prescription_only=True,
        aliases=["MONTAIR-LC", "MONTAIR LC TABLET", "MONTELUKAST LEVOCETIRIZINE CIPLA"],
    ),
    ReferenceMedicineRecord(
        brand_name="Allegra 120",
        generic_name="Fexofenadine Hydrochloride",
        strength="120mg",
        dosage_form="tablet",
        manufacturer="Sanofi India Ltd",
        mrp=198.00,
        is_prescription_only=False,
        aliases=["ALLEGRA 120MG", "FEXOFENADINE ALLEGRA 120"],
    ),
]


def normalize_text_tokens(text: Optional[str]) -> List[str]:
    """Tokenize and normalize text by stripping special characters and converting to lower case."""
    if not text:
        return []
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return [token for token in cleaned.split() if len(token) > 1]


def seed_reference_medicine_database(store_id: int = 1) -> Dict[str, int]:
    """
    Load reference medicine text records and aliases into store database.
    """
    added_count = 0
    updated_count = 0

    for rec in INDIAN_REFERENCE_MEDICINES:
        # Match by brand_name and store_id
        existing = Medicine.query.filter_by(store_id=store_id, brand_name=rec.brand_name).first()

        dosage_enum = DosageForm.TABLET
        try:
            dosage_enum = DosageForm(rec.dosage_form.lower())
        except ValueError:
            pass

        if not existing:
            med = Medicine(
                store_id=store_id,
                brand_name=rec.brand_name,
                generic_name=rec.generic_name,
                strength=rec.strength,
                dosage_form=dosage_enum,
                manufacturer=rec.manufacturer,
                mrp=rec.mrp,
                is_prescription_only=rec.is_prescription_only,
                storage_requirements=rec.storage_conditions,
                category=rec.category,
                is_active=True,
            )
            db.session.add(med)
            db.session.flush()

            for alias_str in rec.aliases:
                alias = MedicineAlias(medicine_id=med.id, alias_name=alias_str)
                db.session.add(alias)

            added_count += 1
        else:
            existing.generic_name = rec.generic_name
            existing.strength = rec.strength
            existing.manufacturer = rec.manufacturer
            existing.mrp = rec.mrp
            existing.is_active = True
            updated_count += 1

    db.session.commit()
    logger.info(f"Seeded reference medicine DB for store #{store_id}: {added_count} added, {updated_count} updated.")
    return {"added": added_count, "updated": updated_count}
