"""
SmartPharm Backend — Offline Catalog Pack Generator.

Generates a compact, portable snapshot of active medicines, available batches,
and prices for local storage at store POS terminals per PRD Rule 24.

Allows cashiers to search catalog and dispense medicines offline during internet outages.
Includes ETag / version hash for bandwidth-efficient cache validation.
"""

import hashlib
import json
from datetime import date, datetime, timezone
from decimal import Decimal

from app.extensions import db
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.models.store import Store
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location


def _serialize_num(val):
    """Convert Decimal or float to float or None."""
    if val is None:
        return 0.0
    return float(val)


def generate_offline_pack(store_id: int, in_stock_only: bool = False) -> dict:
    """
    Build a self-contained offline dataset for a store terminal.
    Includes active medicines, available unexpired batches with stock, and locations.
    """
    store = db.session.get(Store, store_id)
    if not store:
        return {
            "error": f"Store {store_id} not found",
            "medicines": [],
            "locations": [],
            "version": "",
        }

    today = date.today()

    # 1. Fetch active locations
    locations = Location.query.filter_by(store_id=store_id, is_active=True).all()
    loc_map = {
        loc.id: {
            "id": loc.id,
            "name": loc.name,
            "type": loc.location_type.value if hasattr(loc.location_type, "value") else str(loc.location_type),
        }
        for loc in locations
    }

    # 2. Fetch active medicines
    medicine_query = Medicine.query.filter_by(store_id=store_id, is_active=True)
    if in_stock_only:
        # POS needs dispensable stock, not every imported registry entry.
        stocked_ids = (select(Batch.medicine_id).join(Inventory, Inventory.batch_id == Batch.id)
                       .where(Batch.store_id == store_id, Inventory.store_id == store_id,
                              Batch.expiry_date >= today, Inventory.quantity_available > 0))
        medicine_query = medicine_query.filter(Medicine.id.in_(stocked_ids))
    medicines = medicine_query.options(joinedload(Medicine.aliases)).order_by(Medicine.brand_name.asc()).all()

    # 3. Fetch active inventory & batches
    # Filter batches with expiry >= today
    batches = (
        Batch.query.filter(
            Batch.store_id == store_id,
            Batch.expiry_date >= today,
        ).all()
    )

    # Fetch stock in one query instead of a remote round-trip for every batch.
    inventory_by_batch = {}
    inventories = (Inventory.query.join(Batch, Inventory.batch_id == Batch.id)
                   .filter(Inventory.store_id == store_id, Batch.store_id == store_id,
                           Batch.expiry_date >= today).all())
    for inventory in inventories:
        inventory_by_batch.setdefault(inventory.batch_id, []).append(inventory)
    batch_inventory_map = {}
    for b in batches:
        # Sum available inventory
        total_available = 0
        loc_name = "Unassigned"
        for inv in inventory_by_batch.get(b.id, []):
            if inv.store_id == store_id:
                total_available += (inv.quantity_available or 0)
                if inv.location_id and inv.location_id in loc_map:
                    loc_name = loc_map[inv.location_id]["name"]

        if total_available > 0:
            batch_data = {
                "id": b.id,
                "batch_number": b.batch_number,
                "expiry_date": b.expiry_date.isoformat(),
                "mrp": _serialize_num(b.mrp),
                "purchase_price": _serialize_num(b.purchase_price),
                "quantity_available": total_available,
                "location_name": loc_name,
            }
            batch_inventory_map.setdefault(b.medicine_id, []).append(batch_data)

    # Sort each medicine's batches by expiry date (FEFO)
    for med_id in batch_inventory_map:
        batch_inventory_map[med_id].sort(key=lambda x: x["expiry_date"])

    packed_medicines = []
    total_in_stock_batches = 0

    for med in medicines:
        med_batches = batch_inventory_map.get(med.id, [])
        total_in_stock_batches += len(med_batches)
        total_stock = sum(b["quantity_available"] for b in med_batches)

        packed_medicines.append({
            "id": med.id,
            "brand_name": med.brand_name,
            "barcodes": [a.alias_name for a in med.aliases if a.alias_type == "barcode"],
            "generic_name": med.generic_name or "",
            "manufacturer": med.manufacturer or "",
            "strength": med.strength or "",
            "dosage_form": med.dosage_form.value if hasattr(med.dosage_form, "value") else str(med.dosage_form or "other"),
            "category": med.category or "General",
            "prescription_required": bool(getattr(med, "is_prescription_only", False)),
            "mrp": _serialize_num(med.mrp),
            "selling_price": _serialize_num(med.selling_price or med.mrp),
            "gst_percentage": _serialize_num(med.gst_percentage),
            "storage_requirements": med.storage_requirements or "Store in a cool, dry place",
            "total_stock": total_stock,
            "batches": med_batches,
        })

    # 4. Generate hash for versioning / cache invalidation
    serialized_payload = json.dumps(packed_medicines, sort_keys=True)
    version_hash = hashlib.sha256(serialized_payload.encode("utf-8")).hexdigest()[:16]

    return {
        "store_id": store_id,
        "store_name": store.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version_hash": version_hash,
        "total_medicines": len(packed_medicines),
        "total_active_batches": total_in_stock_batches,
        "locations": list(loc_map.values()),
        "medicines": packed_medicines,
    }
