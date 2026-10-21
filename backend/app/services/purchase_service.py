"""
SmartPharm Backend — Purchase & Distributor Invoice Service.

Implements the PRD Rule 8 & 11 transactional lifecycle:
    Invoice Scan / Entry -> Purchase Draft -> Human Verification -> Inventory Acceptance

Features:
- Draft creation without modifying stock
- Discrepancy detection (invoiced vs physically received quantities)
- Atomic batch creation and physical inventory increment upon acceptance
- Cancellation of draft purchases
- Full auditability with verification timestamps and user IDs
"""

from datetime import datetime, date, timezone
from decimal import Decimal, ROUND_HALF_UP

from app.extensions import db
from app.models.supplier import Supplier
from app.models.store import Store
from app.services.audit_service import log_audit_event
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location
from app.models.purchase import PurchaseInvoice, PurchaseItem, PurchaseInvoiceStatus
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _to_decimal(val, default=0.0) -> Decimal:
    """Safely convert value to Decimal."""
    if val is None or val == "":
        return Decimal(str(default))
    try:
        return Decimal(str(val))
    except Exception:
        return Decimal(str(default))


def _quantity(value, field_name: str, minimum: int = 0) -> int:
    try:
        number = Decimal(str(value))
        if isinstance(value, bool) or not number.is_finite() or number != number.to_integral_value() or number < minimum:
            raise ValueError()
        return int(number)
    except (ValueError, ArithmeticError):
        raise ValidationError(f"{field_name} must be a whole number greater than or equal to {minimum}.")


def _locked_purchase_invoice(store_id: int, invoice_id: int) -> PurchaseInvoice:
    # Use the same store-first lock order as sales and offline replay. This also
    # serializes receipts for different invoices that replenish the same batch.
    Store.query.filter_by(id=store_id).populate_existing().with_for_update().first()
    invoice = PurchaseInvoice.query.filter_by(id=invoice_id, store_id=store_id).populate_existing().with_for_update().first()
    if invoice is None:
        raise NotFoundError(f"Purchase invoice {invoice_id} not found.")
    return invoice


def _validate_location(store_id: int, location_id):
    if location_id is None:
        return
    location = Location.query.filter_by(id=location_id, store_id=store_id, is_active=True).first()
    if location is None:
        raise ValidationError("Storage location must be active and belong to this store.")


def _round_currency(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _parse_date(val, field_name: str) -> date:
    if not val:
        return None
    if isinstance(val, (datetime, date)):
        return val if isinstance(val, date) else val.date()
    try:
        return datetime.strptime(str(val).strip(), "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError(f"Invalid date format for {field_name}. Expected YYYY-MM-DD.")


def create_purchase_draft(store_id: int, user_id: int, data: dict) -> PurchaseInvoice:
    """Create a new distributor invoice in DRAFT status.

    CRITICAL (PRD Rule 8 & 11): This does NOT update inventory or create batches!
    """
    if not data:
        raise ValidationError("Request data cannot be empty.")

    supplier_id = data.get("supplier_id")
    if not supplier_id:
        raise ValidationError("supplier_id is required.")

    supplier = Supplier.query.filter_by(id=supplier_id, store_id=store_id, is_active=True).first()
    if not supplier:
        raise NotFoundError(f"Active supplier with ID {supplier_id} not found.")

    invoice_number = str(data.get("invoice_number", "")).strip()
    if not invoice_number:
        raise ValidationError("invoice_number is required.")

    # Unique constraint check (store_id, supplier_id, invoice_number)
    existing = PurchaseInvoice.query.filter_by(
        store_id=store_id, supplier_id=supplier_id, invoice_number=invoice_number
    ).first()
    if existing:
        raise ConflictError(
            f"Invoice '{invoice_number}' already exists for supplier '{supplier.name}'."
        )

    invoice_date = _parse_date(data.get("invoice_date"), "invoice_date") or date.today()

    items_data = data.get("items", [])
    if not items_data or not isinstance(items_data, list):
        raise ValidationError("Purchase invoice must contain at least one line item.")

    invoice = PurchaseInvoice(
        store_id=store_id,
        supplier_id=supplier_id,
        user_id=user_id,
        invoice_number=invoice_number,
        invoice_date=invoice_date,
        status=PurchaseInvoiceStatus.DRAFT,
        notes=data.get("notes", "").strip() or None,
    )
    db.session.add(invoice)
    db.session.flush()

    subtotal = Decimal("0.0")
    total_tax = Decimal("0.0")
    total_discount = Decimal("0.0")

    for item in items_data:
        batch_number = str(item.get("batch_number", "")).strip()
        if not batch_number:
            raise ValidationError("batch_number is required for each purchase line item.")

        expiry_date = _parse_date(item.get("expiry_date"), "expiry_date")
        if not expiry_date:
            raise ValidationError("expiry_date is required for each purchase line item.")

        mfg_date = _parse_date(item.get("manufacturing_date"), "manufacturing_date")
        if mfg_date and mfg_date > expiry_date:
            raise ValidationError("manufacturing_date cannot be later than expiry_date.")

        qty = _quantity(item.get("quantity", 1), "quantity", minimum=1)
        if qty <= 0:
            raise ValidationError("Quantity must be greater than 0.")

        received_qty = _quantity(item.get("received_quantity", qty), "received_quantity")
        if received_qty < 0:
            raise ValidationError("received_quantity cannot be negative.")

        rate = _to_decimal(item.get("purchase_rate"))
        if rate < 0:
            raise ValidationError("purchase_rate cannot be negative.")

        mrp = _to_decimal(item.get("mrp")) if item.get("mrp") is not None else None
        disc_pct = _to_decimal(item.get("discount_percentage", 0.0))
        tax_pct = _to_decimal(item.get("tax_percentage", 0.0))

        gross = rate * qty
        disc_val = _round_currency(gross * (disc_pct / Decimal("100.0")))
        net = gross - disc_val
        tax_val = _round_currency(net * (tax_pct / Decimal("100.0")))
        line_total = net + tax_val

        subtotal += gross
        total_discount += disc_val
        total_tax += tax_val

        medicine_id = item.get("medicine_id")
        if medicine_id:
            med = Medicine.query.filter_by(id=medicine_id, store_id=store_id).first()
            if not med:
                raise NotFoundError(f"Medicine {medicine_id} not found in this store.")

        p_item = PurchaseItem(
            purchase_invoice_id=invoice.id,
            medicine_id=medicine_id,
            raw_medicine_name=item.get("raw_medicine_name", "").strip() or None,
            batch_number=batch_number,
            expiry_date=expiry_date,
            manufacturing_date=mfg_date,
            quantity=qty,
            received_quantity=received_qty,
            purchase_rate=rate,
            mrp=mrp,
            discount_percentage=disc_pct,
            tax_percentage=tax_pct,
            total_amount=line_total,
            is_verified=False,
        )
        db.session.add(p_item)

    invoice.subtotal = _round_currency(subtotal)
    invoice.discount_amount = _round_currency(total_discount)
    invoice.tax_amount = _round_currency(total_tax)
    invoice.total_amount = _round_currency(subtotal - total_discount + total_tax)

    db.session.commit()
    return invoice


def get_purchase_invoice(store_id: int, invoice_id: int) -> PurchaseInvoice:
    """Retrieve purchase invoice details."""
    invoice = PurchaseInvoice.query.filter_by(id=invoice_id, store_id=store_id).first()
    if not invoice:
        raise NotFoundError(f"Purchase invoice {invoice_id} not found.")
    return invoice


def list_purchase_invoices(
    store_id: int,
    page: int = 1,
    per_page: int = 20,
    supplier_id: int = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
):
    """List purchase invoices with filtering and pagination."""
    if page < 1:
        page = 1
    per_page = min(max(1, per_page), 100)

    query = PurchaseInvoice.query.filter_by(store_id=store_id)

    if supplier_id:
        query = query.filter_by(supplier_id=supplier_id)

    if status:
        try:
            status_enum = PurchaseInvoiceStatus(status.strip().lower())
            query = query.filter_by(status=status_enum)
        except ValueError:
            pass

    if start_date:
        s_date = _parse_date(start_date, "start_date")
        if s_date:
            query = query.filter(PurchaseInvoice.invoice_date >= s_date)

    if end_date:
        e_date = _parse_date(end_date, "end_date")
        if e_date:
            query = query.filter(PurchaseInvoice.invoice_date <= e_date)

    query = query.order_by(PurchaseInvoice.invoice_date.desc(), PurchaseInvoice.id.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "items": [serialize_purchase_invoice(pi, detailed=False) for pi in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }


def accept_purchase_invoice(
    store_id: int, invoice_id: int, user_id: int, accept_data: dict = None
) -> PurchaseInvoice:
    """Accept purchase invoice and book items into Batch and Inventory tables.

    CRITICAL (PRD Rule 8 & 11): This is the explicit human-confirmed transactional boundary!
    """
    invoice = _locked_purchase_invoice(store_id, invoice_id)

    if invoice.status in (PurchaseInvoiceStatus.ACCEPTED, PurchaseInvoiceStatus.PARTIAL_ACCEPTED):
        raise ConflictError(f"Invoice {invoice.invoice_number} has already been accepted into inventory.")

    if invoice.status == PurchaseInvoiceStatus.CANCELLED:
        raise ConflictError(f"Invoice {invoice.invoice_number} is cancelled and cannot be accepted.")

    previous_status = invoice.status.value

    # Optional item updates during review
    items_overrides = {}
    default_location_id = None
    if accept_data:
        default_location_id = accept_data.get("default_location_id")
        overrides = accept_data.get("items", [])
        if not isinstance(overrides, list):
            raise ValidationError("items must be a list of purchase line reviews.")
        valid_item_ids = {item.id for item in invoice.items}
        for item_override in overrides:
            if not isinstance(item_override, dict):
                raise ValidationError("Each line review must be an object.")
            item_id = item_override.get("item_id")
            if item_id not in valid_item_ids or item_id in items_overrides:
                raise ValidationError("Each review must reference a unique item in this invoice.")
            items_overrides[item_id] = item_override
    _validate_location(store_id, default_location_id)
    # Validate every count and location before any physical stock is changed.
    for item in invoice.items:
        override = items_overrides.get(item.id, {})
        _quantity(override.get("received_quantity", item.received_quantity), "received_quantity")
        _validate_location(store_id, override.get("location_id", default_location_id))
        medicine_id = override.get("medicine_id", item.medicine_id)
        if not medicine_id or not Medicine.query.filter_by(id=medicine_id, store_id=store_id, is_active=True).first():
            raise ValidationError("Every purchase line must reference an active medicine in this store.")
        if not str(override.get("batch_number", item.batch_number) or "").strip():
            raise ValidationError("batch_number is required for each purchase line.")
        if not _parse_date(override.get("expiry_date", item.expiry_date), "expiry_date"):
            raise ValidationError("expiry_date is required for each purchase line.")

    has_quantity_mismatch = False

    # Process each purchase item into inventory
    for item in invoice.items:
        # Check for overrides provided during acceptance review
        override = items_overrides.get(item.id, {})
        if "medicine_id" in override:
            item.medicine_id = override["medicine_id"]
        if "received_quantity" in override:
            item.received_quantity = _quantity(override["received_quantity"], "received_quantity")
        if "batch_number" in override:
            item.batch_number = str(override["batch_number"]).strip()
        if "expiry_date" in override:
            item.expiry_date = _parse_date(override["expiry_date"], "expiry_date")

        if not item.medicine_id:
            raise ValidationError(
                f"Line item '{item.raw_medicine_name or item.batch_number}' has no linked medicine. "
                "All items must be matched to a medicine before acceptance."
            )

        medicine = Medicine.query.filter_by(id=item.medicine_id, store_id=store_id).first()
        if not medicine:
            raise NotFoundError(f"Medicine with ID {item.medicine_id} not found.")

        # Check for discrepancy
        if item.received_quantity != item.quantity:
            has_quantity_mismatch = True

        received_qty = item.received_quantity
        if received_qty <= 0:
            item.is_verified = True
            continue  # Skip stock booking if 0 units received

        # Item location
        location_id = override.get("location_id", default_location_id)

        # Find or create Batch
        batch = Batch.query.filter_by(
            store_id=store_id, medicine_id=item.medicine_id, batch_number=item.batch_number
        ).populate_existing().with_for_update().first()

        if batch:
            batch.quantity_received += received_qty
            if item.purchase_rate:
                batch.purchase_price = item.purchase_rate
            if item.mrp:
                batch.mrp = item.mrp
        else:
            batch = Batch(
                medicine_id=item.medicine_id,
                store_id=store_id,
                batch_number=item.batch_number,
                expiry_date=item.expiry_date,
                manufacturing_date=item.manufacturing_date,
                purchase_price=item.purchase_rate,
                mrp=item.mrp or medicine.mrp,
                quantity_received=received_qty,
            )
            db.session.add(batch)
            db.session.flush()

        # Find or create Inventory record
        inv = Inventory.query.filter_by(
            store_id=store_id, batch_id=batch.id, location_id=location_id
        ).populate_existing().with_for_update().first()

        if inv:
            inv.quantity_available += received_qty
            inv.last_counted_at = datetime.now(timezone.utc)
        else:
            inv = Inventory(
                batch_id=batch.id,
                store_id=store_id,
                location_id=location_id,
                quantity_available=received_qty,
                quantity_reserved=0,
                last_counted_at=datetime.now(timezone.utc),
            )
            db.session.add(inv)

        item.batch_id = batch.id
        item.is_verified = True

    invoice.status = (
        PurchaseInvoiceStatus.PARTIAL_ACCEPTED
        if has_quantity_mismatch
        else PurchaseInvoiceStatus.ACCEPTED
    )
    invoice.verified_by_user_id = user_id
    invoice.verified_at = datetime.now(timezone.utc)

    log_audit_event(
        store_id, "purchase_invoice", invoice.id, "PURCHASE_ACCEPTED",
        "Physical delivery reviewed and accepted into inventory",
        old_values={"status": previous_status},
        new_values={"status": invoice.status.value, "items": [
            {"item_id": line.id, "batch_id": line.batch_id, "received_quantity": line.received_quantity}
            for line in invoice.items
        ]}, user_id=user_id,
    )
    db.session.commit()
    return invoice


def cancel_purchase_invoice(store_id: int, invoice_id: int, reason: str, user_id: int = None) -> PurchaseInvoice:
    """Cancel a draft purchase invoice."""
    invoice = _locked_purchase_invoice(store_id, invoice_id)

    if invoice.status in (PurchaseInvoiceStatus.ACCEPTED, PurchaseInvoiceStatus.PARTIAL_ACCEPTED):
        raise ConflictError("Cannot cancel an already accepted purchase invoice.")

    if invoice.status == PurchaseInvoiceStatus.CANCELLED:
        raise ConflictError("Purchase invoice is already cancelled.")
    if not isinstance(reason, str) or not reason.strip():
        raise ValidationError("A cancellation reason is required.")
    previous_status = invoice.status.value
    invoice.status = PurchaseInvoiceStatus.CANCELLED
    log_audit_event(
        store_id, "purchase_invoice", invoice.id, "PURCHASE_CANCELLED", reason.strip(),
        old_values={"status": previous_status}, new_values={"status": "cancelled"}, user_id=user_id,
    )
    invoice.notes = f"{invoice.notes or ''}\n[Cancelled]: {reason.strip()}".strip()
    db.session.commit()
    return invoice


def serialize_purchase_invoice(invoice: PurchaseInvoice, detailed: bool = True) -> dict:
    """Serialize PurchaseInvoice model to dictionary."""
    data = {
        "id": invoice.id,
        "store_id": invoice.store_id,
        "supplier_id": invoice.supplier_id,
        "supplier_name": invoice.supplier.name if invoice.supplier else None,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "subtotal": float(invoice.subtotal) if invoice.subtotal is not None else 0.0,
        "discount_amount": float(invoice.discount_amount) if invoice.discount_amount is not None else 0.0,
        "tax_amount": float(invoice.tax_amount) if invoice.tax_amount is not None else 0.0,
        "total_amount": float(invoice.total_amount) if invoice.total_amount is not None else 0.0,
        "status": invoice.status.value if invoice.status else None,
        "verified_by_user_id": invoice.verified_by_user_id,
        "verified_at": invoice.verified_at.isoformat() if invoice.verified_at else None,
        "notes": invoice.notes,
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
    }

    if detailed:
        data["items"] = [
            {
                "id": it.id,
                "medicine_id": it.medicine_id,
                "medicine_name": it.medicine.brand_name if it.medicine else None,
                "raw_medicine_name": it.raw_medicine_name,
                "batch_number": it.batch_number,
                "expiry_date": it.expiry_date.isoformat() if it.expiry_date else None,
                "manufacturing_date": it.manufacturing_date.isoformat() if it.manufacturing_date else None,
                "quantity": it.quantity,
                "received_quantity": it.received_quantity,
                "purchase_rate": float(it.purchase_rate) if it.purchase_rate is not None else 0.0,
                "mrp": float(it.mrp) if it.mrp is not None else None,
                "discount_percentage": float(it.discount_percentage) if it.discount_percentage is not None else 0.0,
                "tax_percentage": float(it.tax_percentage) if it.tax_percentage is not None else 0.0,
                "total_amount": float(it.total_amount) if it.total_amount is not None else 0.0,
                "batch_id": it.batch_id,
                "is_verified": it.is_verified,
            }
            for it in invoice.items
        ]

    return data
