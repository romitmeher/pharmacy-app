"""
SmartPharm Backend — Multi-Branch Domain Service.
Strict compliance with SmartPharm PRD Phase 6 & Rule 25:
- Network-wide stock comparison across physical pharmacy stores
- Inter-store stock transfer lifecycle (Draft -> In Transit -> Received)
- Consolidated owner sales & margin analytics
- Supplier purchase price benchmarks across stores
- Strict atomic transaction boundaries (PRD Rule 8 & 22)
"""

from datetime import datetime, timezone, date
from decimal import Decimal
from typing import List, Dict, Any, Optional

from app.extensions import db
from app.models.store import Store
from app.models.user import User
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location
from app.models.sale import Sale, SaleItem
from app.models.supplier import Supplier
from app.models.purchase import PurchaseInvoice, PurchaseItem
from app.models.stock_transfer import StockTransfer, StockTransferItem, TransferStatus
from app.services.audit_service import log_audit_event
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _generate_transfer_number(source_store_id: int) -> str:
    """Generate sequential transfer tracking number: TRF-YYYYMM-XXXXX."""
    now = datetime.now(timezone.utc)
    prefix = f"TRF-{now.strftime('%Y%m')}"
    count = (
        StockTransfer.query.filter(
            StockTransfer.source_store_id == source_store_id,
            StockTransfer.transfer_number.like(f"{prefix}-%"),
        ).count()
        + 1
    )
    return f"{prefix}-{count:05d}"


def get_network_stores() -> List[Dict[str, Any]]:
    """
    List all pharmacy branches in the owner's store network.
    """
    stores = Store.query.filter_by(is_active=True).all()
    results = []
    for s in stores:
        staff_count = User.query.filter_by(store_id=s.id, is_active=True).count()
        med_count = Medicine.query.filter_by(store_id=s.id, is_active=True).count()
        results.append({
            "id": s.id,
            "name": s.name,
            "address": s.address,
            "phone": s.phone,
            "gstin": s.gstin,
            "drug_license_number": s.drug_license_number,
            "staff_count": staff_count,
            "total_medicines": med_count,
            "is_active": s.is_active,
        })
    return results


def get_cross_store_stock(medicine_id: int, requesting_store_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Compare stock of a medicine across all network branches (PRD Rule 25).
    Matches by permanent brand name and generic molecule across stores.
    """
    target_med = db.session.get(Medicine, medicine_id)
    if not target_med:
        raise NotFoundError(f"Medicine #{medicine_id} not found.")

    brand_name = target_med.brand_name.strip()
    generic_name = (target_med.generic_name or "").strip()

    all_stores = Store.query.filter_by(is_active=True).all()
    store_stocks = []
    total_network_stock = 0

    for store in all_stores:
        # Look for identical medicine in this store
        med_in_store = Medicine.query.filter_by(
            store_id=store.id, brand_name=brand_name, is_active=True
        ).first()

        store_qty = 0
        batch_details = []

        if med_in_store:
            # Query active batches with stock
            batches = Batch.query.filter_by(store_id=store.id, medicine_id=med_in_store.id).all()
            for b in batches:
                # Sum available inventory
                b_qty = sum(
                    inv.quantity_available
                    for inv in b.inventory
                    if inv.store_id == store.id and inv.quantity_available > 0
                )
                if b_qty > 0:
                    store_qty += b_qty
                    batch_details.append({
                        "batch_id": b.id,
                        "batch_number": b.batch_number,
                        "expiry_date": b.expiry_date.isoformat(),
                        "quantity_available": b_qty,
                        "mrp": float(b.mrp or med_in_store.mrp or 0.0),
                    })

        total_network_stock += store_qty
        store_stocks.append({
            "store_id": store.id,
            "store_name": store.name,
            "is_current_store": (store.id == requesting_store_id),
            "medicine_id": med_in_store.id if med_in_store else None,
            "total_stock": store_qty,
            "is_in_stock": store_qty > 0,
            "batches": batch_details,
        })

    # Sort so stores with stock appear first
    store_stocks.sort(key=lambda x: (not x["is_in_stock"], -x["total_stock"]))

    return {
        "medicine_id": medicine_id,
        "brand_name": brand_name,
        "generic_name": generic_name,
        "strength": target_med.strength,
        "total_network_stock": total_network_stock,
        "stores_with_stock_count": sum(1 for s in store_stocks if s["is_in_stock"]),
        "stores": store_stocks,
    }


def get_network_performance_summary() -> Dict[str, Any]:
    """
    Consolidated network sales, bills, and gross margins across stores (PRD Rule 25).
    """
    stores = Store.query.filter_by(is_active=True).all()
    branch_metrics = []
    network_total_sales = Decimal("0.0")
    network_total_bills = 0

    for s in stores:
        sales = Sale.query.filter_by(store_id=s.id).all()
        store_sales_vol = sum((sale.total_amount or Decimal("0.0")) for sale in sales)
        bills_count = len(sales)

        # Estimate gross margin from purchase prices if line items exist
        total_cost = Decimal("0.0")
        total_rev = Decimal("0.0")

        for sale in sales:
            for item in sale.items:
                qty = item.quantity or 0
                rev = (item.unit_price or Decimal("0.0")) * qty
                cost = (item.batch.purchase_price or Decimal("0.0")) * qty if item.batch else Decimal("0.0")
                total_rev += rev
                total_cost += cost

        gross_profit = total_rev - total_cost
        margin_pct = float((gross_profit / total_rev * 100).quantize(Decimal("0.1"))) if total_rev > 0 else 0.0

        network_total_sales += store_sales_vol
        network_total_bills += bills_count

        branch_metrics.append({
            "store_id": s.id,
            "store_name": s.name,
            "total_sales": float(store_sales_vol),
            "total_bills": bills_count,
            "gross_profit": float(gross_profit),
            "margin_percentage": margin_pct,
        })

    branch_metrics.sort(key=lambda x: -x["total_sales"])

    return {
        "network_total_sales": float(network_total_sales),
        "network_total_bills": network_total_bills,
        "total_branches": len(stores),
        "branch_performance": branch_metrics,
    }


def compare_supplier_prices() -> List[Dict[str, Any]]:
    """
    PRD Rule 25: Supplier price comparison across stores.
    Identifies variance in purchase rates for identical medicines purchased across branches.
    """
    # Fetch all batches across all stores
    batches = Batch.query.all()
    medicine_purchase_rates: Dict[str, List[Dict[str, Any]]] = {}

    for b in batches:
        if not b.purchase_price or not b.medicine:
            continue
        brand = b.medicine.brand_name.strip()
        medicine_purchase_rates.setdefault(brand, []).append({
            "batch_id": b.id,
            "batch_number": b.batch_number,
            "store_id": b.store_id,
            "store_name": b.store.name if b.store else f"Store #{b.store_id}",
            "purchase_price": float(b.purchase_price),
            "mrp": float(b.mrp or 0.0),
        })

    discrepancies = []

    for brand, rates in medicine_purchase_rates.items():
        unique_stores = set(r["store_id"] for r in rates)
        if len(unique_stores) < 2:
            continue  # Need at least 2 stores to compare rates

        prices = [r["purchase_price"] for r in rates]
        min_price = min(prices)
        max_price = max(prices)

        if max_price > min_price:
            variance_pct = round(((max_price - min_price) / min_price) * 100, 1)
            discrepancies.append({
                "medicine_brand": brand,
                "min_purchase_rate": min_price,
                "max_purchase_rate": max_price,
                "variance_percentage": variance_pct,
                "potential_savings_per_unit": round(max_price - min_price, 2),
                "store_rates": rates,
            })

    discrepancies.sort(key=lambda x: -x["variance_percentage"])
    return discrepancies


def create_stock_transfer(
    source_store_id: int,
    destination_store_id: int,
    user_id: int,
    items_data: List[Dict[str, Any]],
    notes: Optional[str] = None,
) -> StockTransfer:
    """
    Initiate an inter-store stock transfer request in DRAFT status (PRD Rule 8 & 22: zero initial inventory mutation).
    """
    if source_store_id == destination_store_id:
        raise ValidationError("Source store and destination store cannot be the same.")

    source_store = db.session.get(Store, source_store_id)
    if not source_store:
        raise NotFoundError(f"Source store #{source_store_id} not found.")

    dest_store = db.session.get(Store, destination_store_id)
    if not dest_store:
        raise NotFoundError(f"Destination store #{destination_store_id} not found.")

    if not items_data:
        raise ValidationError("Transfer must contain at least one line item.")

    transfer_num = _generate_transfer_number(source_store_id)

    transfer = StockTransfer(
        transfer_number=transfer_num,
        source_store_id=source_store_id,
        destination_store_id=destination_store_id,
        created_by_user_id=user_id,
        status=TransferStatus.DRAFT,
        notes=notes,
    )
    db.session.add(transfer)
    db.session.flush()

    for item in items_data:
        med_id = item.get("medicine_id")
        batch_id = item.get("batch_id")
        qty = int(item.get("quantity", 0))

        if qty <= 0:
            raise ValidationError("Transfer quantity must be greater than zero.")

        batch = Batch.query.filter_by(id=batch_id, store_id=source_store_id, medicine_id=med_id).first()
        if not batch:
            raise NotFoundError(f"Batch #{batch_id} not found in source store.")

        # Check available stock
        avail = sum(inv.quantity_available for inv in batch.inventory if inv.store_id == source_store_id)
        if avail < qty:
            raise ValidationError(
                f"Insufficient stock for batch {batch.batch_number} in source store. Available: {avail}, requested: {qty}."
            )

        transfer_item = StockTransferItem(
            transfer_id=transfer.id,
            medicine_id=med_id,
            batch_id=batch_id,
            quantity=qty,
        )
        db.session.add(transfer_item)

    db.session.commit()
    return transfer


def dispatch_stock_transfer(transfer_id: int, user_id: int) -> StockTransfer:
    """
    Confirm dispatch from source store: decrements available stock and transitions to IN_TRANSIT.
    """
    transfer = db.session.get(StockTransfer, transfer_id)
    if not transfer:
        raise NotFoundError(f"StockTransfer #{transfer_id} not found.")

    if transfer.status != TransferStatus.DRAFT:
        raise ConflictError(f"Transfer is in '{transfer.status.value}' state; only DRAFT transfers can be dispatched.")

    # Atomic deduction at source store
    for item in transfer.items:
        batch = db.session.get(Batch, item.batch_id)
        qty_needed = item.quantity

        for inv in batch.inventory:
            if inv.store_id == transfer.source_store_id and inv.quantity_available > 0:
                deduct = min(inv.quantity_available, qty_needed)
                inv.quantity_available -= deduct
                qty_needed -= deduct
                if qty_needed == 0:
                    break

        if qty_needed > 0:
            db.session.rollback()
            raise ConflictError(
                f"Stock deficit occurred before dispatch for batch {batch.batch_number}. Remaining needed: {qty_needed}."
            )

    transfer.status = TransferStatus.IN_TRANSIT
    transfer.dispatched_at = datetime.now(timezone.utc)

    # Immutable audit record (PRD Rule 8 & 22)
    log_audit_event(
        store_id=transfer.source_store_id,
        entity_type="stock_transfer",
        entity_id=transfer.id,
        action="TRANSFER_DISPATCHED",
        reason=f"Dispatched transfer #{transfer.transfer_number} to Store #{transfer.destination_store_id}",
        old_values={"status": "draft"},
        new_values={"status": "in_transit", "item_count": len(transfer.items)},
        user_id=user_id,
    )

    db.session.commit()
    return transfer


def receive_stock_transfer(
    transfer_id: int, user_id: int, destination_location_id: Optional[int] = None
) -> StockTransfer:
    """
    Confirm physical receipt at destination store: creates/books inventory and sets status to RECEIVED.
    """
    transfer = db.session.get(StockTransfer, transfer_id)
    if not transfer:
        raise NotFoundError(f"StockTransfer #{transfer_id} not found.")

    if transfer.status != TransferStatus.IN_TRANSIT:
        raise ConflictError(
            f"Transfer is in '{transfer.status.value}' state; only IN_TRANSIT transfers can be received."
        )

    dest_store_id = transfer.destination_store_id

    for item in transfer.items:
        source_med = db.session.get(Medicine, item.medicine_id)
        source_batch = db.session.get(Batch, item.batch_id)

        # 1. Resolve or clone Medicine in destination store
        dest_med = Medicine.query.filter_by(
            store_id=dest_store_id, brand_name=source_med.brand_name, is_active=True
        ).first()

        if not dest_med:
            dest_med = Medicine(
                store_id=dest_store_id,
                brand_name=source_med.brand_name,
                generic_name=source_med.generic_name,
                manufacturer=source_med.manufacturer,
                strength=source_med.strength,
                dosage_form=source_med.dosage_form,
                category=source_med.category,
                mrp=source_med.mrp,
                selling_price=source_med.selling_price,
                gst_percentage=source_med.gst_percentage,
                is_active=True,
            )
            db.session.add(dest_med)
            db.session.flush()

        # 2. Resolve or clone Batch in destination store
        dest_batch = Batch.query.filter_by(
            store_id=dest_store_id,
            medicine_id=dest_med.id,
            batch_number=source_batch.batch_number,
        ).first()

        if not dest_batch:
            dest_batch = Batch(
                store_id=dest_store_id,
                medicine_id=dest_med.id,
                batch_number=source_batch.batch_number,
                expiry_date=source_batch.expiry_date,
                purchase_price=source_batch.purchase_price,
                mrp=source_batch.mrp,
                quantity_received=item.quantity,
            )
            db.session.add(dest_batch)
            db.session.flush()
        else:
            dest_batch.quantity_received = (dest_batch.quantity_received or 0) + item.quantity

        # 3. Book physical Inventory record in destination store
        dest_inv = Inventory.query.filter_by(
            store_id=dest_store_id,
            batch_id=dest_batch.id,
            location_id=destination_location_id,
        ).first()

        if not dest_inv:
            dest_inv = Inventory(
                store_id=dest_store_id,
                batch_id=dest_batch.id,
                location_id=destination_location_id,
                quantity_available=item.quantity,
                quantity_reserved=0,
            )
            db.session.add(dest_inv)
        else:
            dest_inv.quantity_available += item.quantity

    transfer.status = TransferStatus.RECEIVED
    transfer.received_at = datetime.now(timezone.utc)

    # Immutable audit record (PRD Rule 8 & 22)
    log_audit_event(
        store_id=dest_store_id,
        entity_type="stock_transfer",
        entity_id=transfer.id,
        action="TRANSFER_RECEIVED",
        reason=f"Received transfer #{transfer.transfer_number} from Store #{transfer.source_store_id}. Stock booked.",
        old_values={"status": "in_transit"},
        new_values={"status": "received", "item_count": len(transfer.items)},
        user_id=user_id,
    )

    db.session.commit()
    return transfer
