"""
SmartPharm Backend — Inventory & Batch Service.

Maintains the core PRD hierarchy:
    Medicine (Identity) -> Batch (Manufacture & Expiry) -> Inventory (Physical stock at Location)

Handles:
- Batch creation and batch-specific pricing
- Inventory tracking per shelf/rack location
- Stock adjustments with audit reason
- Stock transfers between locations
- FEFO (First Expiring, First Out) batch resolution for POS billing
- Expiry tracking (expired, <= 30 days critical, <= 90 days warning) per PRD Rule 15
"""

from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from sqlalchemy import func

from app.extensions import db
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location
from app.services.audit_service import log_audit_event
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _parse_date(val, field_name: str) -> date:
    """Safely parse a date string or object."""
    if not val:
        return None
    if isinstance(val, (datetime, date)):
        return val if isinstance(val, date) else val.date()
    try:
        return datetime.strptime(str(val).strip(), "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError(f"Invalid date format for {field_name}. Expected YYYY-MM-DD.")


def _parse_decimal(val, field_name: str) -> Decimal:
    if val is None or val == "":
        return None
    try:
        d = Decimal(str(val))
        if d < 0:
            raise ValidationError(f"{field_name} cannot be negative.")
        return d
    except (ValueError, ArithmeticError):
        raise ValidationError(f"Invalid numeric value for {field_name}.")


def create_batch(store_id: int, data: dict) -> Batch:
    """Create a new batch for a medicine and initialize its inventory record."""
    if not data:
        raise ValidationError("Request data cannot be empty.")

    medicine_id = data.get("medicine_id")
    if not medicine_id:
        raise ValidationError("medicine_id is required.")

    # Validate medicine exists and belongs to store
    medicine = Medicine.query.filter_by(id=medicine_id, store_id=store_id, is_active=True).first()
    if not medicine:
        raise NotFoundError(f"Active medicine with ID {medicine_id} not found in this store.")

    batch_number = str(data.get("batch_number", "")).strip()
    if not batch_number:
        raise ValidationError("batch_number is required.")

    # Check unique constraint (medicine_id, store_id, batch_number)
    existing = Batch.query.filter_by(
        store_id=store_id, medicine_id=medicine_id, batch_number=batch_number
    ).first()
    if existing:
        raise ConflictError(
            f"Batch '{batch_number}' already exists for medicine '{medicine.brand_name}'."
        )

    expiry_date = _parse_date(data.get("expiry_date"), "expiry_date")
    if not expiry_date:
        raise ValidationError("expiry_date is required.")

    mfg_date = _parse_date(data.get("manufacturing_date"), "manufacturing_date")
    if mfg_date and mfg_date > expiry_date:
        raise ValidationError("manufacturing_date cannot be later than expiry_date.")

    purchase_price = _parse_decimal(data.get("purchase_price"), "purchase_price")
    mrp = _parse_decimal(data.get("mrp"), "mrp")
    if mrp is None:
        mrp = medicine.mrp  # Inherit default medicine MRP if not provided

    qty_received = int(data.get("quantity_received", 0))
    if qty_received < 0:
        raise ValidationError("quantity_received cannot be negative.")

    # Optional location
    location_id = data.get("location_id")
    if location_id:
        location = Location.query.filter_by(id=location_id, store_id=store_id, is_active=True).first()
        if not location:
            raise NotFoundError(f"Active location with ID {location_id} not found.")

    batch = Batch(
        medicine_id=medicine_id,
        store_id=store_id,
        batch_number=batch_number,
        expiry_date=expiry_date,
        manufacturing_date=mfg_date,
        purchase_price=purchase_price,
        mrp=mrp,
        quantity_received=qty_received,
    )
    db.session.add(batch)
    db.session.flush()

    # Initialize inventory record for physical stock
    inventory = Inventory(
        batch_id=batch.id,
        store_id=store_id,
        location_id=location_id,
        quantity_available=qty_received,
        quantity_reserved=0,
        last_counted_at=datetime.now(timezone.utc),
    )
    db.session.add(inventory)
    db.session.commit()

    return batch


def get_batch(store_id: int, batch_id: int) -> Batch:
    """Retrieve a single batch with associated inventory records."""
    batch = Batch.query.filter_by(id=batch_id, store_id=store_id).first()
    if not batch:
        raise NotFoundError(f"Batch with ID {batch_id} not found.")
    return batch


def list_batches(store_id: int, medicine_id: int = None, has_stock_only: bool = False) -> list:
    """List batches for a store, optionally filtered by medicine and current stock."""
    query = Batch.query.filter_by(store_id=store_id)
    if medicine_id:
        query = query.filter_by(medicine_id=medicine_id)

    batches = query.order_by(Batch.expiry_date.asc()).all()

    if has_stock_only:
        batches = [
            b for b in batches
            if sum(inv.quantity_available for inv in b.inventory) > 0
        ]

    return batches


def adjust_stock(
    store_id: int,
    inventory_id: int,
    new_quantity: int,
    reason: str,
    user_id: int = None,
) -> Inventory:
    """Explicitly adjust stock for an inventory record with an audit reason."""
    if new_quantity < 0:
        raise ValidationError("Stock quantity cannot be negative.")

    if not reason or not reason.strip():
        raise ValidationError("A reason is required for manual stock adjustments.")

    inventory = Inventory.query.filter_by(id=inventory_id, store_id=store_id).first()
    if not inventory:
        raise NotFoundError(f"Inventory record with ID {inventory_id} not found.")

    old_qty = inventory.quantity_available
    inventory.quantity_available = new_quantity
    inventory.last_counted_at = datetime.now(timezone.utc)

    # Record immutable audit log entry within the same transaction (PRD Rule 8 & 22)
    log_audit_event(
        store_id=store_id,
        entity_type="inventory",
        entity_id=inventory.id,
        action="MANUAL_ADJUSTMENT",
        reason=reason.strip(),
        old_values={"quantity_available": old_qty, "batch_id": inventory.batch_id, "location_id": inventory.location_id},
        new_values={"quantity_available": new_quantity, "batch_id": inventory.batch_id, "location_id": inventory.location_id},
        user_id=user_id,
    )

    db.session.commit()
    return inventory


def transfer_stock(
    store_id: int,
    batch_id: int,
    source_location_id: int,
    target_location_id: int,
    quantity: int,
) -> dict:
    """Transfer physical stock of a batch from one location to another."""
    if quantity <= 0:
        raise ValidationError("Transfer quantity must be greater than 0.")

    if source_location_id == target_location_id:
        raise ValidationError("Source and target locations must be different.")

    # Verify target location exists
    target_loc = Location.query.filter_by(id=target_location_id, store_id=store_id, is_active=True).first()
    if not target_loc:
        raise NotFoundError(f"Target location {target_location_id} not found or inactive.")

    # Find source inventory
    source_inv = Inventory.query.filter_by(
        batch_id=batch_id, store_id=store_id, location_id=source_location_id
    ).first()
    if not source_inv or source_inv.quantity_available < quantity:
        available = source_inv.quantity_available if source_inv else 0
        raise ValidationError(
            f"Insufficient stock at source location. Available: {available}, requested: {quantity}"
        )

    # Find or create target inventory
    target_inv = Inventory.query.filter_by(
        batch_id=batch_id, store_id=store_id, location_id=target_location_id
    ).first()

    if not target_inv:
        target_inv = Inventory(
            batch_id=batch_id,
            store_id=store_id,
            location_id=target_location_id,
            quantity_available=0,
            quantity_reserved=0,
            last_counted_at=datetime.now(timezone.utc),
        )
        db.session.add(target_inv)
        db.session.flush()

    source_inv.quantity_available -= quantity
    target_inv.quantity_available += quantity
    db.session.commit()

    return {
        "message": f"Successfully moved {quantity} units to {target_loc.name}.",
        "source": serialize_inventory(source_inv),
        "target": serialize_inventory(target_inv),
    }


def get_medicine_inventory_summary(store_id: int, medicine_id: int) -> dict:
    """Return aggregated stock and FEFO-sorted batches for a medicine.

    Used by POS / Billing to suggest the optimal batch to sell first.
    """
    medicine = Medicine.query.filter_by(id=medicine_id, store_id=store_id).first()
    if not medicine:
        raise NotFoundError(f"Medicine with ID {medicine_id} not found.")

    batches = (
        Batch.query.filter_by(medicine_id=medicine_id, store_id=store_id)
        .order_by(Batch.expiry_date.asc())
        .all()
    )

    today = date.today()
    total_available = 0
    total_reserved = 0
    batch_summaries = []

    for b in batches:
        b_available = sum(inv.quantity_available for inv in b.inventory)
        b_reserved = sum(inv.quantity_reserved for inv in b.inventory)
        total_available += b_available
        total_reserved += b_reserved

        days_remaining = (b.expiry_date - today).days
        is_expired = b.expiry_date < today

        batch_summaries.append({
            "id": b.id,
            "batch_number": b.batch_number,
            "expiry_date": b.expiry_date.isoformat(),
            "mrp": float(b.mrp) if b.mrp is not None else None,
            "purchase_price": float(b.purchase_price) if b.purchase_price is not None else None,
            "is_expired": is_expired,
            "days_until_expiry": days_remaining,
            "quantity_available": b_available,
            "quantity_reserved": b_reserved,
            "locations": [
                {
                    "location_id": inv.location_id,
                    "location_name": inv.location.name if inv.location else "Unassigned",
                    "quantity": inv.quantity_available,
                }
                for inv in b.inventory
                if inv.quantity_available > 0
            ],
        })

    return {
        "medicine_id": medicine.id,
        "brand_name": medicine.brand_name,
        "generic_name": medicine.generic_name,
        "total_available": total_available,
        "total_reserved": total_reserved,
        "batches": batch_summaries,
    }


def get_expiry_report(store_id: int, status: str = None, days: int = None) -> dict:
    """Return inventory items grouped by expiry risk per PRD Rule 15.

    Urgency categories:
    - expired: expiry_date < today
    - critical: today <= expiry_date <= today + 30 days
    - warning: today + 30 days < expiry_date <= today + 90 days
    - good: expiry_date > today + 90 days
    """
    today = date.today()
    batches = (
        Batch.query.filter_by(store_id=store_id)
        .order_by(Batch.expiry_date.asc())
        .all()
    )

    items = []
    counts = {"expired": 0, "critical": 0, "warning": 0, "good": 0}

    for b in batches:
        qty_available = sum(inv.quantity_available for inv in b.inventory)
        if qty_available <= 0:
            continue  # Only report items with physical stock

        days_left = (b.expiry_date - today).days
        if days_left < 0:
            cat = "expired"
        elif days_left <= 30:
            cat = "critical"
        elif days_left <= 90:
            cat = "warning"
        else:
            cat = "good"

        counts[cat] += 1

        # Check filters
        if status and status.lower() != cat:
            continue
        if days is not None and days_left > days:
            continue

        for inv in b.inventory:
            if inv.quantity_available <= 0:
                continue
            items.append({
                "batch_id": b.id,
                "batch_number": b.batch_number,
                "medicine_id": b.medicine_id,
                "brand_name": b.medicine.brand_name if b.medicine else None,
                "generic_name": b.medicine.generic_name if b.medicine else None,
                "location_id": inv.location_id,
                "location_name": inv.location.name if inv.location else "Unassigned",
                "expiry_date": b.expiry_date.isoformat(),
                "days_until_expiry": days_left,
                "status": cat,
                "quantity_available": inv.quantity_available,
                "mrp": float(b.mrp) if b.mrp is not None else None,
            })

    return {
        "summary": counts,
        "count": len(items),
        "items": items,
    }


def serialize_batch(batch: Batch, include_inventory: bool = True) -> dict:
    """Serialize Batch model to dictionary representation."""
    data = {
        "id": batch.id,
        "medicine_id": batch.medicine_id,
        "store_id": batch.store_id,
        "batch_number": batch.batch_number,
        "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
        "manufacturing_date": batch.manufacturing_date.isoformat() if batch.manufacturing_date else None,
        "purchase_price": float(batch.purchase_price) if batch.purchase_price is not None else None,
        "mrp": float(batch.mrp) if batch.mrp is not None else None,
        "quantity_received": batch.quantity_received,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "updated_at": batch.updated_at.isoformat() if batch.updated_at else None,
    }

    if batch.medicine:
        data["medicine"] = {
            "id": batch.medicine.id,
            "brand_name": batch.medicine.brand_name,
            "generic_name": batch.medicine.generic_name,
            "strength": batch.medicine.strength,
        }

    if include_inventory:
        data["inventory"] = [serialize_inventory(inv) for inv in batch.inventory]
        data["total_available"] = sum(inv.quantity_available for inv in batch.inventory)
        data["total_reserved"] = sum(inv.quantity_reserved for inv in batch.inventory)

    return data


def serialize_inventory(inv: Inventory) -> dict:
    """Serialize Inventory model to dictionary representation."""
    return {
        "id": inv.id,
        "batch_id": inv.batch_id,
        "store_id": inv.store_id,
        "location_id": inv.location_id,
        "location_name": inv.location.name if inv.location else "Unassigned",
        "quantity_available": inv.quantity_available,
        "quantity_reserved": inv.quantity_reserved,
        "last_counted_at": inv.last_counted_at.isoformat() if inv.last_counted_at else None,
    }
