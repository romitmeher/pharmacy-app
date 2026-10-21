"""
SmartPharm Backend — Sales Returns & Refunds Domain Service.

Strict adherence to PRD Rules 7, 8, 14, and 22:
- Return quantity validation against original sale line items
- Restocking vs write-off physical inventory boundaries
- Atomic financial refund calculation
- Automatic audit log creation within the same transaction
"""

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any, Optional, Tuple

from app.extensions import db
from app.services.stock_lock import lock_stores
from app.models.sale import Sale, SaleItem, PaymentStatus, PaymentMethod
from app.models.sale_return import Return, ReturnItem, ReturnStatus, RestockCondition
from app.models.inventory import Inventory
from app.models.batch import Batch
from app.models.medicine import Medicine
from app.services.audit_service import log_audit_event
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _generate_return_number(store_id: int) -> str:
    """Generate sequential return tracking identifier: RET-YYYYMM-XXXXX."""
    now = datetime.now(timezone.utc)
    prefix = f"RET-{now.strftime('%Y%m')}-"
    last_return = (
        Return.query.filter(
            Return.store_id == store_id,
            Return.return_number.like(f"{prefix}%"),
        )
        .order_by(Return.id.desc())
        .first()
    )

    if last_return and last_return.return_number:
        try:
            seq = int(last_return.return_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


def refundable_line_total(sale, item):
    """Allocate bill discounts across tax-inclusive lines, preserving invoice cents."""
    lines = sorted(sale.items, key=lambda line: line.id)
    gross = sum((Decimal(str(line.total_price)) for line in lines), Decimal("0"))
    if gross <= 0:
        return Decimal("0.00")
    # Cash refunds cannot exceed tender actually collected (credit debt is not cash).
    collected = sum((Decimal(str(payment.amount)) for payment in sale.payments
                     if payment.payment_method != PaymentMethod.CREDIT), Decimal("0"))
    refundable = min(Decimal(str(sale.total_amount)), collected)
    allocated = Decimal("0.00")
    cumulative = Decimal("0.00")
    for line in lines:
        cumulative += Decimal(str(line.total_price))
        through_line = (refundable * cumulative / gross).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        amount = through_line - allocated
        if line.id == item.id:
            return amount
        allocated = through_line
    return Decimal("0.00")


def get_eligible_return_items(store_id: int, sale_id: int) -> Dict[str, Any]:
    """
    Retrieve line items from an original sale eligible for return.
    Calculates previous return history to determine remaining refundable quantities.
    """
    sale = Sale.query.filter_by(id=sale_id, store_id=store_id).with_for_update().first()
    if not sale:
        raise NotFoundError(f"Sale invoice #{sale_id} not found in this store.")

    eligible_items = []
    total_remaining_units = 0

    for item in sale.items:
        # Calculate already returned quantity for this line item
        returned_units = (
            db.session.query(db.func.coalesce(db.func.sum(ReturnItem.quantity_returned), 0))
            .filter(ReturnItem.sale_item_id == item.id)
            .scalar()
        )

        remaining_returnable = max(0, item.quantity - returned_units)
        total_remaining_units += remaining_returnable

        eligible_items.append({
            "sale_item_id": item.id,
            "medicine_id": item.medicine_id,
            "medicine_name": item.medicine.brand_name if item.medicine else "Unknown Medicine",
            "batch_id": item.batch_id,
            "batch_number": item.batch.batch_number if item.batch else "Unknown Batch",
            "quantity_sold": int(item.quantity),
            "quantity_already_returned": int(returned_units),
            "quantity_eligible_for_return": int(remaining_returnable),
            "unit_price": float(refundable_line_total(sale, item) / item.quantity),
            "total_line_amount": float(item.total_price),
        })

    return {
        "sale_id": sale.id,
        "invoice_number": sale.invoice_number,
        "sale_date": sale.sale_date.isoformat() if sale.sale_date else None,
        "customer_id": sale.customer_id,
        "customer_name": sale.customer.name if sale.customer else "Walk-in Patient",
        "total_amount": float(sale.total_amount),
        "payment_status": sale.payment_status.value,
        "total_remaining_units": total_remaining_units,
        "is_fully_returned": (total_remaining_units == 0),
        "items": eligible_items,
    }


def create_sale_return(
    store_id: int,
    sale_id: int,
    user_id: int,
    items_data: List[Dict[str, Any]],
    refund_method: str = "cash",
    reason: str = "",
) -> Return:
    """
    Process a customer return in an atomic transaction:
    - Verifies returned quantities against original sale
    - Restocks units to physical inventory or writes off damaged stock
    - Issues refund credit / tender
    - Updates sale payment status (REFUNDED or PARTIAL)
    - Records immutable audit trail (PRD Rule 8 & 22)
    """
    if not items_data:
        raise ValidationError("At least one line item must be selected for return.")

    if not reason or not reason.strip():
        raise ValidationError("A clear operational reason is required for processing returns.")

    lock_stores(store_id)
    sale = Sale.query.filter_by(id=sale_id, store_id=store_id).populate_existing().with_for_update().first()
    if not sale:
        raise NotFoundError(f"Original sale invoice #{sale_id} not found.")

    if sale.payment_status == PaymentStatus.REFUNDED:
        raise ConflictError("This sale has already been fully refunded.")
    if refund_method.lower() not in ("cash", "upi", "card", "credit"):
        raise ValidationError("Invalid refund method.")

    return_num = _generate_return_number(store_id)
    return_record = Return(
        store_id=store_id,
        sale_id=sale_id,
        user_id=user_id,
        return_number=return_num,
        refund_method=refund_method.lower(),
        reason=reason.strip(),
        status=ReturnStatus.COMPLETED,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(return_record)
    db.session.flush()

    total_refund = Decimal("0.0")

    for item_input in items_data:
        sale_item_id = item_input.get("sale_item_id")
        try:
            raw_quantity = Decimal(str(item_input.get("quantity_returned", 0)))
            if not raw_quantity.is_finite() or raw_quantity != raw_quantity.to_integral_value():
                raise ValueError()
            qty_return = int(raw_quantity)
        except (ValueError, ArithmeticError):
            raise ValidationError("Quantity returned must be a whole number.")
        cond_str = item_input.get("restock_condition", RestockCondition.RESTOCKED_TO_INVENTORY.value)

        try:
            restock_cond = RestockCondition(cond_str)
        except ValueError:
            raise ValidationError("Invalid restock condition.")

        if qty_return <= 0:
            raise ValidationError("Quantity returned must be greater than zero.")

        sale_item = SaleItem.query.filter_by(id=sale_item_id, sale_id=sale.id).populate_existing().with_for_update().first()
        if not sale_item:
            raise NotFoundError(f"Sale line item #{sale_item_id} not found in this sale.")

        # Check previously returned quantity
        prev_returned = (
            db.session.query(db.func.coalesce(db.func.sum(ReturnItem.quantity_returned), 0))
            .filter(ReturnItem.sale_item_id == sale_item.id)
            .scalar()
        )
        remaining = sale_item.quantity - prev_returned
        if qty_return > remaining:
            raise ValidationError(
                f"Cannot return {qty_return} units of {sale_item.medicine.brand_name}. "
                f"Only {remaining} units remaining from original purchase of {sale_item.quantity}."
            )

        entitlement = refundable_line_total(sale, sale_item)
        previously_refunded = db.session.query(
            db.func.coalesce(db.func.sum(ReturnItem.refund_amount), 0)
        ).filter(ReturnItem.sale_item_id == sale_item.id).scalar()
        cumulative_refund = (entitlement * Decimal(prev_returned + qty_return) /
                             Decimal(sale_item.quantity)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        line_refund = cumulative_refund - Decimal(str(previously_refunded))
        total_refund += line_refund

        return_item = ReturnItem(
            return_id=return_record.id,
            sale_item_id=sale_item.id,
            medicine_id=sale_item.medicine_id,
            batch_id=sale_item.batch_id,
            quantity_returned=qty_return,
            unit_price=(entitlement / sale_item.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            refund_amount=line_refund,
            restock_condition=restock_cond,
        )
        db.session.add(return_item)

        # Inventory restocking logic (PRD Rule 8)
        if restock_cond == RestockCondition.RESTOCKED_TO_INVENTORY:
            # Find an active inventory record for this batch in the store
            inv = Inventory.query.filter_by(
                store_id=store_id,
                batch_id=sale_item.batch_id,
            ).populate_existing().with_for_update().first()

            if inv:
                inv.quantity_available += qty_return
                inv.last_counted_at = datetime.now(timezone.utc)
            else:
                # Re-create inventory on first active location or shelf
                inv = Inventory(
                    store_id=store_id,
                    batch_id=sale_item.batch_id,
                    quantity_available=qty_return,
                    quantity_reserved=0,
                )
                db.session.add(inv)

    return_record.total_refund_amount = total_refund

    # Update original sale payment status
    old_status = sale.payment_status.value
    # Check if all items in sale are now fully returned
    total_original_units = sum(si.quantity for si in sale.items)
    all_returned_units = (
        db.session.query(db.func.coalesce(db.func.sum(ReturnItem.quantity_returned), 0))
        .join(SaleItem, ReturnItem.sale_item_id == SaleItem.id)
        .filter(SaleItem.sale_id == sale.id)
        .scalar()
    )

    if all_returned_units >= total_original_units:
        sale.payment_status = PaymentStatus.REFUNDED
    else:
        sale.payment_status = PaymentStatus.PARTIAL

    # Record immutable audit event in the same transaction (PRD Rule 8 & 22)
    log_audit_event(
        store_id=store_id,
        entity_type="sale",
        entity_id=sale.id,
        action="SALE_RETURN",
        reason=f"Customer Return #{return_num}: {reason.strip()}",
        old_values={"payment_status": old_status},
        new_values={
            "return_id": return_record.id,
            "return_number": return_num,
            "total_refund_amount": float(total_refund),
            "refund_method": refund_method,
            "new_payment_status": sale.payment_status.value,
            "items_count": len(items_data),
        },
        user_id=user_id,
    )

    db.session.commit()
    return return_record


def get_sale_returns(
    store_id: int,
    sale_id: Optional[int] = None,
    page: int = 1,
    per_page: int = 25,
) -> Tuple[List[Return], int, int]:
    """Retrieve filterable, paginated returns history."""
    query = Return.query.filter(Return.store_id == store_id)
    if sale_id:
        query = query.filter(Return.sale_id == sale_id)

    query = query.order_by(Return.created_at.desc())
    total_count = query.count()
    total_pages = (total_count + per_page - 1) // per_page if per_page > 0 else 1

    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return items, total_count, total_pages


def get_sale_return_detail(store_id: int, return_id: int) -> Return:
    """Retrieve detailed return record with line items."""
    ret = Return.query.filter_by(id=return_id, store_id=store_id).first()
    if not ret:
        raise NotFoundError(f"Return record #{return_id} not found.")
    return ret
