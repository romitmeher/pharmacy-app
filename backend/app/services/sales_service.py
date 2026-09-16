"""
SmartPharm Backend — Sales & Billing Service.

Implements core POS billing workflows per PRD Rule 8 & 14:
- Batch-aware selling with automatic FEFO (First Expiring, First Out) stock resolution
- Atomic transactional inventory deduction
- Strict prevention of selling expired medicines
- Multiple / split payment methods (Cash, UPI, Card, Credit)
- Printable / digital invoice metadata with GSTIN and Drug License details
- Product refunds with automatic stock restoration
"""

from datetime import datetime, date, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import func

from app.extensions import db
from app.models.store import Store
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sale import Customer, Sale, SaleItem, Payment, PaymentMethod, PaymentStatus
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _to_decimal(val, default=0.0) -> Decimal:
    """Safely convert value to Decimal."""
    if val is None:
        return Decimal(str(default))
    try:
        return Decimal(str(val))
    except Exception:
        return Decimal(str(default))


def _round_currency(val: Decimal) -> Decimal:
    """Round currency to 2 decimal places."""
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _generate_invoice_number(store_id: int) -> str:
    """Generate sequential invoice number: INV-YYYYMM-XXXXX."""
    now = datetime.now(timezone.utc)
    prefix = f"INV-{now.strftime('%Y%m')}"

    # Count sales with matching prefix in this store
    count = (
        Sale.query.filter(
            Sale.store_id == store_id,
            Sale.invoice_number.like(f"{prefix}-%"),
        ).count()
        + 1
    )
    return f"{prefix}-{count:05d}"


def _parse_payment_method(val) -> PaymentMethod:
    """Parse payment method string into PaymentMethod enum."""
    if not val:
        return PaymentMethod.CASH
    if isinstance(val, PaymentMethod):
        return val
    val_str = str(val).strip().lower()
    for pm in PaymentMethod:
        if pm.value == val_str:
            return pm
    valid_methods = [pm.value for pm in PaymentMethod]
    raise ValidationError(
        f"Invalid payment_method '{val}'. Valid options: {', '.join(valid_methods)}"
    )


def get_or_create_customer(store_id: int, customer_data: dict) -> Customer:
    """Look up customer by phone number or create a new customer record."""
    if not customer_data:
        return None

    name = customer_data.get("name", "").strip()
    phone = customer_data.get("phone", "").strip() or None

    if not name and not phone:
        return None

    customer = None
    if phone:
        customer = Customer.query.filter_by(store_id=store_id, phone=phone).first()

    if customer:
        # Update details if provided
        if name and not customer.name:
            customer.name = name
        if customer_data.get("email"):
            customer.email = customer_data["email"].strip()
        if customer_data.get("address"):
            customer.address = customer_data["address"].strip()
        if customer_data.get("doctor_name"):
            customer.doctor_name = customer_data["doctor_name"].strip()
    else:
        if not name:
            name = f"Customer {phone[-4:] if phone and len(phone) >= 4 else 'Walk-in'}"
        customer = Customer(
            store_id=store_id,
            name=name,
            phone=phone,
            email=customer_data.get("email", "").strip() or None,
            address=customer_data.get("address", "").strip() or None,
            doctor_name=customer_data.get("doctor_name", "").strip() or None,
        )
        db.session.add(customer)
        db.session.flush()

    return customer


def create_sale(store_id: int, user_id: int, data: dict) -> Sale:
    """Create a POS sale transaction with atomic FEFO stock deduction and payment logging."""
    if not data:
        raise ValidationError("Request body cannot be empty.")

    items_data = data.get("items", [])
    if not items_data or not isinstance(items_data, list):
        raise ValidationError("Sale must include at least one line item.")

    # 1. Customer resolution
    customer = None
    if data.get("customer"):
        customer = get_or_create_customer(store_id, data["customer"])
    elif data.get("customer_id"):
        customer = Customer.query.filter_by(id=data["customer_id"], store_id=store_id).first()
        if not customer:
            raise NotFoundError(f"Customer {data['customer_id']} not found.")

    today = date.today()
    invoice_number = _generate_invoice_number(store_id)

    sale = Sale(
        store_id=store_id,
        user_id=user_id,
        customer_id=customer.id if customer else None,
        invoice_number=invoice_number,
        sale_date=datetime.now(timezone.utc),
        notes=data.get("notes", "").strip() or None,
    )
    db.session.add(sale)
    db.session.flush()

    subtotal = Decimal("0.0")
    total_tax = Decimal("0.0")
    total_item_discount = Decimal("0.0")

    # 2. Process Line Items
    for item in items_data:
        medicine_id = item.get("medicine_id")
        if not medicine_id:
            raise ValidationError("Each item must have a medicine_id.")

        medicine = Medicine.query.filter_by(id=medicine_id, store_id=store_id, is_active=True).first()
        if not medicine:
            raise NotFoundError(f"Active medicine with ID {medicine_id} not found.")

        qty_requested = int(item.get("quantity", 0))
        if qty_requested <= 0:
            raise ValidationError(f"Quantity for {medicine.brand_name} must be greater than 0.")

        item_discount_pct = _to_decimal(item.get("discount_percentage", 0.0))
        item_tax_pct = _to_decimal(medicine.gst_percentage or 0.0)

        batch_id = item.get("batch_id")

        # Case A: Explicit batch selected by cashier
        if batch_id:
            batch = Batch.query.filter_by(id=batch_id, store_id=store_id, medicine_id=medicine_id).first()
            if not batch:
                raise NotFoundError(
                    f"Batch {batch_id} not found for medicine '{medicine.brand_name}'."
                )

            # Check expiry
            if batch.expiry_date < today:
                raise ValidationError(
                    f"Batch {batch.batch_number} for '{medicine.brand_name}' expired on {batch.expiry_date}. "
                    "Expired medicines cannot be sold."
                )

            # Check stock
            available_stock = sum(inv.quantity_available for inv in batch.inventory)
            if available_stock < qty_requested:
                raise ValidationError(
                    f"Insufficient stock for '{medicine.brand_name}' (Batch {batch.batch_number}). "
                    f"Available: {available_stock}, requested: {qty_requested}."
                )

            # Deduct inventory
            _deduct_batch_inventory(batch, qty_requested)

            # Price calculation
            unit_price = _to_decimal(batch.mrp or medicine.selling_price or medicine.mrp or 0.0)
            gross = unit_price * qty_requested
            discount_val = _round_currency(gross * (item_discount_pct / Decimal("100.0")))
            net_before_tax = gross - discount_val
            tax_val = _round_currency(net_before_tax * (item_tax_pct / Decimal("100.0")))
            line_total = net_before_tax + tax_val

            subtotal += gross
            total_item_discount += discount_val
            total_tax += tax_val

            sale_item = SaleItem(
                sale_id=sale.id,
                medicine_id=medicine.id,
                batch_id=batch.id,
                quantity=qty_requested,
                unit_price=unit_price,
                discount_percentage=item_discount_pct,
                tax_percentage=item_tax_pct,
                total_price=line_total,
            )
            db.session.add(sale_item)

        # Case B: Automatic FEFO batch resolution
        else:
            eligible_batches = (
                Batch.query.filter_by(medicine_id=medicine.id, store_id=store_id)
                .filter(Batch.expiry_date >= today)
                .order_by(Batch.expiry_date.asc())
                .all()
            )

            # Check total unexpired stock
            total_unexpired = sum(
                sum(inv.quantity_available for inv in b.inventory)
                for b in eligible_batches
            )
            if total_unexpired < qty_requested:
                raise ValidationError(
                    f"Insufficient unexpired stock for '{medicine.brand_name}'. "
                    f"Available: {total_unexpired}, requested: {qty_requested}."
                )

            remaining_to_deduct = qty_requested
            for batch in eligible_batches:
                if remaining_to_deduct <= 0:
                    break

                batch_stock = sum(inv.quantity_available for inv in batch.inventory)
                if batch_stock <= 0:
                    continue

                portion = min(remaining_to_deduct, batch_stock)
                _deduct_batch_inventory(batch, portion)
                remaining_to_deduct -= portion

                unit_price = _to_decimal(batch.mrp or medicine.selling_price or medicine.mrp or 0.0)
                gross = unit_price * portion
                discount_val = _round_currency(gross * (item_discount_pct / Decimal("100.0")))
                net_before_tax = gross - discount_val
                tax_val = _round_currency(net_before_tax * (item_tax_pct / Decimal("100.0")))
                line_total = net_before_tax + tax_val

                subtotal += gross
                total_item_discount += discount_val
                total_tax += tax_val

                sale_item = SaleItem(
                    sale_id=sale.id,
                    medicine_id=medicine.id,
                    batch_id=batch.id,
                    quantity=portion,
                    unit_price=unit_price,
                    discount_percentage=item_discount_pct,
                    tax_percentage=item_tax_pct,
                    total_price=line_total,
                )
                db.session.add(sale_item)

    # 3. Bill Totals
    bill_discount = _to_decimal(data.get("discount_amount", 0.0))
    final_discount = total_item_discount + bill_discount
    final_total = max(Decimal("0.0"), subtotal - final_discount + total_tax)

    sale.subtotal = _round_currency(subtotal)
    sale.discount_amount = _round_currency(final_discount)
    sale.tax_amount = _round_currency(total_tax)
    sale.total_amount = _round_currency(final_total)

    # 4. Payments
    payments_data = data.get("payments", [])
    total_paid = Decimal("0.0")

    if payments_data and isinstance(payments_data, list):
        for p in payments_data:
            p_amount = _to_decimal(p.get("amount", 0.0))
            if p_amount <= 0:
                continue
            method = _parse_payment_method(p.get("payment_method"))
            total_paid += p_amount

            payment = Payment(
                sale_id=sale.id,
                store_id=store_id,
                payment_method=method,
                amount=_round_currency(p_amount),
                transaction_reference=p.get("transaction_reference", "").strip() or None,
                payment_date=datetime.now(timezone.utc),
            )
            db.session.add(payment)

    if total_paid >= final_total:
        sale.payment_status = PaymentStatus.PAID
    elif total_paid > 0:
        sale.payment_status = PaymentStatus.PARTIAL
    else:
        sale.payment_status = PaymentStatus.UNPAID

    db.session.commit()
    return sale


def _deduct_batch_inventory(batch: Batch, quantity_to_deduct: int):
    """Deduct quantity from an inventory record belonging to a batch."""
    remaining = quantity_to_deduct
    # Prioritize inventory records that have stock
    for inv in batch.inventory:
        if inv.quantity_available <= 0:
            continue
        take = min(remaining, inv.quantity_available)
        inv.quantity_available -= take
        remaining -= take
        if remaining <= 0:
            break

    if remaining > 0:
        raise ValidationError(
            f"Unable to fulfill stock deduction for batch {batch.batch_number}. Missing {remaining} units."
        )


def get_sale(store_id: int, sale_id: int) -> Sale:
    """Retrieve a single sale by ID within a store."""
    sale = Sale.query.filter_by(id=sale_id, store_id=store_id).first()
    if not sale:
        raise NotFoundError(f"Sale with ID {sale_id} not found.")
    return sale


def list_sales(
    store_id: int,
    page: int = 1,
    per_page: int = 20,
    start_date: str = None,
    end_date: str = None,
    payment_status: str = None,
    customer_id: int = None,
):
    """List sales with pagination and filters."""
    if page < 1:
        page = 1
    per_page = min(max(1, per_page), 100)

    query = Sale.query.filter_by(store_id=store_id)

    if customer_id:
        query = query.filter_by(customer_id=customer_id)

    if payment_status:
        try:
            status_enum = PaymentStatus(payment_status.strip().lower())
            query = query.filter_by(payment_status=status_enum)
        except ValueError:
            pass

    if start_date:
        try:
            s_date = datetime.strptime(start_date.strip(), "%Y-%m-%d")
            query = query.filter(Sale.sale_date >= s_date)
        except ValueError:
            pass

    if end_date:
        try:
            e_date = datetime.strptime(end_date.strip(), "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(Sale.sale_date < e_date)
        except ValueError:
            pass

    query = query.order_by(Sale.sale_date.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "items": [serialize_sale(s) for s in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }


def refund_sale(store_id: int, sale_id: int, reason: str, user_id: int) -> Sale:
    """Refund a sale and restore inventory stock to the respective batches."""
    sale = get_sale(store_id, sale_id)

    if sale.payment_status == PaymentStatus.REFUNDED:
        raise ConflictError(f"Sale {sale.invoice_number} has already been refunded.")

    if not reason or not reason.strip():
        raise ValidationError("A refund reason is required.")

    # Restore stock for each item
    for item in sale.items:
        batch = item.batch
        if batch and batch.inventory:
            # Add back to the first inventory record of the batch
            batch.inventory[0].quantity_available += item.quantity

    sale.payment_status = PaymentStatus.REFUNDED
    sale.notes = f"{sale.notes or ''}\n[Refunded on {datetime.now(timezone.utc).isoformat()} by User {user_id}]: {reason.strip()}".strip()
    db.session.commit()
    return sale


def serialize_sale(sale: Sale, detailed: bool = True) -> dict:
    """Serialize Sale model to dictionary suitable for receipts and digital display."""
    data = {
        "id": sale.id,
        "store_id": sale.store_id,
        "invoice_number": sale.invoice_number,
        "sale_date": sale.sale_date.isoformat() if sale.sale_date else None,
        "biller_user_id": sale.user_id,
        "biller_name": sale.user.full_name if sale.user else None,
        "customer": serialize_customer(sale.customer) if sale.customer else None,
        "subtotal": float(sale.subtotal) if sale.subtotal is not None else 0.0,
        "discount_amount": float(sale.discount_amount) if sale.discount_amount is not None else 0.0,
        "tax_amount": float(sale.tax_amount) if sale.tax_amount is not None else 0.0,
        "total_amount": float(sale.total_amount) if sale.total_amount is not None else 0.0,
        "payment_status": sale.payment_status.value if sale.payment_status else None,
        "notes": sale.notes,
    }

    if detailed:
        # Store metadata for receipt printing
        if sale.store:
            data["store"] = {
                "name": sale.store.name,
                "phone": sale.store.phone,
                "address": sale.store.address,
                "gstin": sale.store.gstin,
                "drug_license_number": sale.store.drug_license_number,
            }

        # Line items
        data["items"] = [
            {
                "id": it.id,
                "medicine_id": it.medicine_id,
                "brand_name": it.medicine.brand_name if it.medicine else None,
                "generic_name": it.medicine.generic_name if it.medicine else None,
                "strength": it.medicine.strength if it.medicine else None,
                "hsn_code": it.medicine.hsn_code if it.medicine else None,
                "batch_id": it.batch_id,
                "batch_number": it.batch.batch_number if it.batch else None,
                "expiry_date": it.batch.expiry_date.isoformat() if it.batch and it.batch.expiry_date else None,
                "quantity": it.quantity,
                "unit_price": float(it.unit_price) if it.unit_price is not None else 0.0,
                "discount_percentage": float(it.discount_percentage) if it.discount_percentage is not None else 0.0,
                "tax_percentage": float(it.tax_percentage) if it.tax_percentage is not None else 0.0,
                "total_price": float(it.total_price) if it.total_price is not None else 0.0,
            }
            for it in sale.items
        ]

        # Payments recorded
        data["payments"] = [
            {
                "id": p.id,
                "payment_method": p.payment_method.value if p.payment_method else None,
                "amount": float(p.amount) if p.amount is not None else 0.0,
                "transaction_reference": p.transaction_reference,
                "payment_date": p.payment_date.isoformat() if p.payment_date else None,
            }
            for p in sale.payments
        ]

    return data


def serialize_customer(customer: Customer) -> dict:
    """Serialize Customer model to dictionary."""
    if not customer:
        return None
    return {
        "id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "doctor_name": customer.doctor_name,
    }
