"""
SmartPharm - ABDM Drug Registry v3 & Indian Medicine Dataset Loader
Parses local CSV datasets in data/ and loads thousands of national drug registry entries,
generic compositions, strengths, dosage forms, manufacturers, and alias tokens into MySQL/SQLite.
"""

import csv
import os
import re
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.extensions import db
from app.models.medicine import Medicine, MedicineAlias, DosageForm

logger = logging.getLogger(__name__)


@dataclass
class IngestedMedicineItem:
    brand_name: str
    generic_name: str
    strength: Optional[str]
    dosage_form: DosageForm
    manufacturer: Optional[str]
    mrp: Optional[float]
    category: Optional[str]
    is_prescription_only: bool = False
    aliases: List[str] = field(default_factory=list)


def parse_dosage_form_from_text(text: str) -> DosageForm:
    """Extract dosage form enum from medicine description string."""
    t = text.lower()
    if "tablet" in t or "tab" in t or "dt" in t or "dispensable" in t:
        return DosageForm.TABLET
    if "capsule" in t or "cap" in t:
        return DosageForm.CAPSULE
    if "syrup" in t or "syr" in t:
        return DosageForm.SYRUP
    if "suspension" in t or "susp" in t:
        return DosageForm.SUSPENSION
    if "injection" in t or "inj" in t or "vial" in t or "ampoule" in t:
        return DosageForm.INJECTION
    if "cream" in t:
        return DosageForm.CREAM
    if "ointment" in t:
        return DosageForm.OINTMENT
    if "gel" in t:
        return DosageForm.GEL
    if "drop" in t:
        return DosageForm.DROPS
    if "inhaler" in t or "rotacap" in t or "respule" in t:
        return DosageForm.INHALER
    if "spray" in t:
        return DosageForm.SPRAY
    if "lotion" in t:
        return DosageForm.LOTION
    if "powder" in t or "sachet" in t:
        return DosageForm.POWDER
    return DosageForm.OTHER


def parse_strength_from_text(text: str) -> Optional[str]:
    """Extract drug strength pattern (e.g., '100mg', '500mg/125mg', '1% w/w')."""
    matches = re.findall(
        r"\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|iu|ml|%\s*w/w|%\s*w/v|%)\b", text, flags=re.IGNORECASE
    )
    if matches:
        return " / ".join(matches[:3])
    return None


def parse_abdm_csv_file(csv_filepath: str) -> List[IngestedMedicineItem]:
    """
    Parse ABDM Drug Registry v3 CSV export:
    Columns: "Sr No","Drug Code","Generic Name","Unit Size","MRP","Group Name"
    """
    items: List[IngestedMedicineItem] = []
    if not os.path.exists(csv_filepath):
        logger.warning(f"ABDM CSV file not found: {csv_filepath}")
        return items

    with open(csv_filepath, mode="r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_name = (row.get("Generic Name") or row.get("generic_name") or "").strip()
            if not raw_name:
                continue

            raw_mrp = (row.get("MRP") or row.get("mrp") or "0").replace(",", "").strip()
            try:
                mrp_val = float(raw_mrp) if raw_mrp else 0.0
            except ValueError:
                mrp_val = 0.0

            category = (row.get("Group Name") or row.get("group_name") or "General").strip()

            # Clean name and parse properties
            dosage_form = parse_dosage_form_from_text(raw_name)
            strength = parse_strength_from_text(raw_name)

            # Clean brand title
            brand_title = re.sub(
                r"\s+(Tablets|Capsules|Syrup|Suspension|Injection|Gel|Cream|Ointment|Drops|IP|BP|USP)\b.*$",
                "",
                raw_name,
                flags=re.IGNORECASE,
            ).strip()

            aliases = [
                raw_name.upper(),
                brand_title.upper(),
            ]

            items.append(
                IngestedMedicineItem(
                    brand_name=brand_title,
                    generic_name=raw_name,
                    strength=strength,
                    dosage_form=dosage_form,
                    manufacturer="Jan Aushadhi / ABDM Registry",
                    mrp=mrp_val,
                    category=category,
                    is_prescription_only=any(
                        x in category.lower() for x in ["antibiotic", "cns", "oncology", "cardio", "diabetic"]
                    ),
                    aliases=aliases,
                )
            )

    logger.info(f"Parsed {len(items)} items from ABDM CSV: {os.path.basename(csv_filepath)}")
    return items


def parse_az_medicines_csv(csv_filepath: str, max_records: int = 5000) -> List[IngestedMedicineItem]:
    """
    Parse A-Z Medicines Dataset of India CSV:
    Columns: id,name,price(₹),Is_discontinued,manufacturer_name,type,pack_size_label,short_composition1,short_composition2
    """
    items: List[IngestedMedicineItem] = []
    if not os.path.exists(csv_filepath):
        logger.warning(f"A-Z Medicines CSV file not found: {csv_filepath}")
        return items

    with open(csv_filepath, mode="r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            if count >= max_records:
                break

            name = (row.get("name") or "").strip()
            if not name:
                continue

            price_str = (row.get("price(₹)") or row.get("price") or "0").replace(",", "").strip()
            try:
                mrp_val = float(price_str) if price_str else 0.0
            except ValueError:
                mrp_val = 0.0

            mfg = (row.get("manufacturer_name") or row.get("manufacturer") or "").strip()
            comp1 = (row.get("short_composition1") or "").strip()
            comp2 = (row.get("short_composition2") or "").strip()
            generic = " + ".join(filter(None, [comp1, comp2])) or name

            dosage_form = parse_dosage_form_from_text(name + " " + (row.get("pack_size_label") or ""))
            strength = parse_strength_from_text(name + " " + generic)

            aliases = [name.upper()]
            if comp1:
                aliases.append(comp1.upper())

            items.append(
                IngestedMedicineItem(
                    brand_name=name,
                    generic_name=generic,
                    strength=strength,
                    dosage_form=dosage_form,
                    manufacturer=mfg or "Indian Pharma",
                    mrp=mrp_val,
                    category=row.get("type") or "Allopathy",
                    is_prescription_only=True,
                    aliases=aliases,
                )
            )
            count += 1

    logger.info(f"Parsed {len(items)} items from Indian Medicines CSV: {os.path.basename(csv_filepath)}")
    return items


def load_dataset_directory_into_db(data_dir: str, store_id: int = 1) -> Dict[str, int]:
    """
    Reads all available CSV datasets in data_dir and inserts/updates Medicine & MedicineAlias DB records.
    """
    all_parsed_items: List[IngestedMedicineItem] = []

    # 1. ABDM Drug Registry Files
    abdm_file = os.path.join(data_dir, "Product List_17_9_2026 @ 19_54_16.csv")
    if os.path.exists(abdm_file):
        all_parsed_items.extend(parse_abdm_csv_file(abdm_file))

    # 2. A-Z / Indian Medicines Datasets
    sample_file = os.path.join(data_dir, "A_Z_medicines_dataset_of_India(sample).csv")
    if os.path.exists(sample_file):
        all_parsed_items.extend(parse_az_medicines_csv(sample_file, max_records=2000))

    az_file = os.path.join(data_dir, "A_Z_medicines_dataset_of_India.csv")
    if os.path.exists(az_file):
        all_parsed_items.extend(parse_az_medicines_csv(az_file, max_records=3000))

    clean_file = os.path.join(data_dir, "indian_pharmaceutical_products_clean.csv")
    if os.path.exists(clean_file):
        all_parsed_items.extend(parse_az_medicines_csv(clean_file, max_records=3000))

    added_count = 0
    updated_count = 0

    for item in all_parsed_items:
        existing = Medicine.query.filter_by(store_id=store_id, brand_name=item.brand_name).first()
        if not existing:
            med = Medicine(
                store_id=store_id,
                brand_name=item.brand_name,
                generic_name=item.generic_name,
                strength=item.strength,
                dosage_form=item.dosage_form,
                manufacturer=item.manufacturer,
                mrp=item.mrp,
                is_prescription_only=item.is_prescription_only,
                category=item.category,
                is_active=True,
            )
            db.session.add(med)
            db.session.flush()

            for alias_str in item.aliases:
                if alias_str and len(alias_str) > 2:
                    alias = MedicineAlias(medicine_id=med.id, alias_name=alias_str[:290])
                    db.session.add(alias)

            added_count += 1
        else:
            if item.generic_name:
                existing.generic_name = item.generic_name
            if item.mrp and item.mrp > 0:
                existing.mrp = item.mrp
            existing.is_active = True
            updated_count += 1

    db.session.commit()
    logger.info(f"Dataset DB Load Complete for Store #{store_id}: {added_count} added, {updated_count} updated.")
    return {"added": added_count, "updated": updated_count, "total_processed": len(all_parsed_items)}
