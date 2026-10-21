"""
SmartPharm Backend — Operating Expenses & P&L Domain Service.

Strict compliance with PRD Rules 7, 8, 22, 29, and 30:
- Operating expenditure recording with category and tender tracking
- In-transaction audit log creation (EXPENSE_RECORDED)
- Date-range filtering and category aggregation
- Live database-grounded Store P&L computation:
  Gross Sales - Returns - COGS = Gross Profit
  Gross Profit - Operating Expenses = Net Operating Profit
"""

from datetime import datetime, timezone, date
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import func

from app.extensions import db
from app.models.expense import Expense, ExpenseCategory, ExpensePaymentMethod
from app.models.sale import Sale, SaleItem, PaymentStatus
from app.models.sale_return import Return, ReturnStatus, RestockCondition
from app.models.batch import Batch
from app.services.audit_service import log_audit_event
from app.utils.errors import ValidationError, NotFoundError


def _generate_expense_number(store_id: int) -> str:
    """Generate sequential expense identifier: EXP-YYYYMM-XXXX."""
    now = datetime.now(timezone.utc)
    prefix = f"EXP-{now.strftime('%Y%m')}-"
    last_exp = (
        Expense.query.filter(
            Expense.store_id == store_id,
            Expense.expense_number.like(f"{prefix}%"),
        )
        .order_by(Expense.id.desc())
        .first()
    )

    if last_exp and last_exp.expense_number:
        try:
            seq = int(last_exp.expense_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


def record_expense(
    store_id: int,
    user_id: int,
    data: Dict[str, Any],
    ip_address: Optional[str] = None,
) -> Expense:
    """
    Record an operating expenditure with in-transaction audit trail.
    """
    raw_category = data.get("category", "").strip().lower()
    try:
        category_enum = ExpenseCategory(raw_category)
    except ValueError:
        valid_cats = [c.value for c in ExpenseCategory]
        raise ValidationError(f"Invalid expense category '{raw_category}'. Must be one of: {valid_cats}")

    raw_amount = data.get("amount")
    if raw_amount is None:
        raise ValidationError("Expense amount is required.")
    try:
        amount_dec = Decimal(str(raw_amount))
        if not amount_dec.is_finite() or amount_dec <= 0:
            raise ValidationError("Expense amount must be strictly greater than zero.")
    except Exception:
        raise ValidationError("Invalid numeric amount format.")

    raw_method = data.get("payment_method", "bank_transfer").strip().lower()
    try:
        method_enum = ExpensePaymentMethod(raw_method)
    except ValueError:
        method_enum = ExpensePaymentMethod.BANK_TRANSFER

    # Parse date
    raw_date = data.get("expense_date")
    if raw_date:
        try:
            exp_date = date.fromisoformat(str(raw_date)[:10])
        except ValueError:
            exp_date = date.today()
    else:
        exp_date = date.today()

    expense_num = data.get("expense_number") or _generate_expense_number(store_id)

    expense = Expense(
        store_id=store_id,
        user_id=user_id,
        expense_number=expense_num,
        category=category_enum,
        amount=amount_dec,
        payment_method=method_enum,
        expense_date=exp_date,
        vendor_recipient=data.get("vendor_recipient", "").strip() or None,
        receipt_reference=data.get("receipt_reference", "").strip() or None,
        receipt_image_path=data.get("receipt_image_path"),
        notes=data.get("notes", "").strip() or None,
    )
    db.session.add(expense)
    db.session.flush()

    # Log audit event
    log_audit_event(
        store_id=store_id,
        entity_type="expense",
        entity_id=str(expense.id),
        action="EXPENSE_RECORDED",
        reason=f"Operating expense {expense.expense_number} recorded: {expense.category.value} for INR {expense.amount}",
        old_values=None,
        new_values=expense.to_dict(),
        user_id=user_id,
        ip_address=ip_address,
    )

    db.session.commit()
    return expense


def get_expenses(
    store_id: int,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
) -> Tuple[List[Expense], int, Dict[str, Any]]:
    """List and aggregate store operating expenses."""
    query = Expense.query.filter(Expense.store_id == store_id)

    if category:
        try:
            cat_enum = ExpenseCategory(category.strip().lower())
            query = query.filter(Expense.category == cat_enum)
        except ValueError:
            pass

    if start_date:
        try:
            s_date = date.fromisoformat(start_date[:10])
            query = query.filter(Expense.expense_date >= s_date)
        except ValueError:
            pass

    if end_date:
        try:
            e_date = date.fromisoformat(end_date[:10])
            query = query.filter(Expense.expense_date <= e_date)
        except ValueError:
            pass

    total = query.count()
    items = (
        query.order_by(Expense.expense_date.desc(), Expense.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Compute period totals and category breakdown
    breakdown_rows = (
        db.session.query(Expense.category, func.sum(Expense.amount))
        .filter(Expense.store_id == store_id)
    )
    if start_date:
        try:
            breakdown_rows = breakdown_rows.filter(Expense.expense_date >= date.fromisoformat(start_date[:10]))
        except ValueError:
            pass
    if end_date:
        try:
            breakdown_rows = breakdown_rows.filter(Expense.expense_date <= date.fromisoformat(end_date[:10]))
        except ValueError:
            pass

    category_totals = {c.value: 0.0 for c in ExpenseCategory}
    grand_total = Decimal("0.00")
    for cat_enum, total_amt in breakdown_rows.group_by(Expense.category).all():
        val = float(total_amt or 0)
        category_totals[cat_enum.value] = val
        grand_total += Decimal(str(val))

    summary = {
        "total_amount": float(grand_total),
        "by_category": category_totals,
    }

    return items, total, summary


def get_store_pnl_summary(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate database-grounded Profit & Loss statement for store (PRD Rules 29 & 30):
    - Gross Sales: Revenue from POS sales
    - Discounts: Given at POS
    - Returns / Refunds: Processed customer returns
    - COGS: Cost of Goods Sold from Batch purchase prices
    - Gross Profit = Net Revenue - COGS
    - Operating Expenses = Sum of store expenses
    - Net Operating Profit = Gross Profit - Operating Expenses
    """
    # 1. Sales query
    sales_q = Sale.query.filter(Sale.store_id == store_id)
    returns_q = Return.query.filter(Return.store_id == store_id, Return.status == ReturnStatus.COMPLETED)
    expenses_q = Expense.query.filter(Expense.store_id == store_id)

    if start_date:
        try:
            sd = date.fromisoformat(start_date[:10])
            sales_q = sales_q.filter(func.date(Sale.created_at) >= sd)
            returns_q = returns_q.filter(func.date(Return.created_at) >= sd)
            expenses_q = expenses_q.filter(Expense.expense_date >= sd)
        except ValueError:
            pass

    if end_date:
        try:
            ed = date.fromisoformat(end_date[:10])
            sales_q = sales_q.filter(func.date(Sale.created_at) <= ed)
            returns_q = returns_q.filter(func.date(Return.created_at) <= ed)
            expenses_q = expenses_q.filter(Expense.expense_date <= ed)
        except ValueError:
            pass

    sales = sales_q.all()
    returns = returns_q.all()
    expenses = expenses_q.all()

    # Aggregate Sales & COGS
    gross_sales = Decimal("0.00")
    total_discounts = Decimal("0.00")
    cogs = Decimal("0.00")
    total_bills = len(sales)

    for s in sales:
        gross_sales += Decimal(str(s.subtotal if s.subtotal is not None else s.total_amount))
        total_discounts += Decimal(str(s.discount_amount or 0))

        for item in s.items:
            # Look up purchase price from batch
            qty = Decimal(str(item.quantity))
            if item.batch and item.batch.purchase_price:
                item_cost = Decimal(str(item.batch.purchase_price)) * qty
            elif item.medicine and item.medicine.mrp:
                # Approximate 70% wholesale if batch cost not set
                item_cost = Decimal(str(item.medicine.mrp)) * Decimal("0.70") * qty
            else:
                item_cost = Decimal("0.00")
            cogs += item_cost

    # Aggregate Returns
    total_refunds = Decimal("0.00")
    for r in returns:
        # Reverse the returned line's own tax, including its share of the bill
        # discount. Invoice-average GST is wrong for mixed-rate medicine baskets.
        line_sum = sum((Decimal(str(line.total_price)) for line in r.sale.items), Decimal("0"))
        invoice_total = Decimal(str(r.sale.total_amount or 0))
        for returned in r.items:
            original = returned.sale_item
            line_total = Decimal(str(original.total_price))
            gross = Decimal(str(original.unit_price)) * original.quantity
            pretax_line = gross * (1 - Decimal(str(original.discount_percentage or 0)) / 100)
            original_tax = line_total - pretax_line
            discounted_line = line_total * invoice_total / line_sum if line_sum > 0 else Decimal("0")
            pretax_ratio = max(Decimal("0"), (discounted_line - original_tax) / discounted_line) if discounted_line > 0 else Decimal("0")
            total_refunds += Decimal(str(returned.refund_amount or 0)) * pretax_ratio
        # Only goods restored to sellable inventory reverse cost of goods sold.
        for returned in r.items:
            if returned.restock_condition == RestockCondition.RESTOCKED_TO_INVENTORY:
                if returned.batch and returned.batch.purchase_price is not None:
                    unit_cost = Decimal(str(returned.batch.purchase_price))
                elif returned.medicine and returned.medicine.mrp:
                    unit_cost = Decimal(str(returned.medicine.mrp)) * Decimal("0.70")
                else:
                    unit_cost = Decimal("0")
                cogs -= unit_cost * returned.quantity_returned

    # Net Revenue
    net_revenue = gross_sales - total_discounts - total_refunds
    gross_profit = net_revenue - cogs
    gross_margin_pct = float((gross_profit / net_revenue * 100).quantize(Decimal("0.01"))) if net_revenue > 0 else 0.0

    # Aggregate Expenses
    total_operating_expenses = Decimal("0.00")
    expense_breakdown = {c.value: 0.0 for c in ExpenseCategory}

    for exp in expenses:
        amt = Decimal(str(exp.amount))
        total_operating_expenses += amt
        expense_breakdown[exp.category.value] += float(amt)

    # Net Operating Profit
    net_profit = gross_profit - total_operating_expenses
    net_margin_pct = float((net_profit / net_revenue * 100).quantize(Decimal("0.01"))) if net_revenue > 0 else 0.0

    return {
        "period": {
            "start_date": start_date,
            "end_date": end_date,
        },
        "revenue": {
            "total_bills": total_bills,
            "gross_sales": float(gross_sales),
            "discounts": float(total_discounts),
            "refunds": float(total_refunds),
            "net_revenue": float(net_revenue),
        },
        "cogs": {
            "total_cogs": float(cogs),
            "gross_profit": float(gross_profit),
            "gross_margin_percentage": gross_margin_pct,
        },
        "operating_expenses": {
            "total_expenses": float(total_operating_expenses),
            "by_category": expense_breakdown,
        },
        "net_performance": {
            "net_operating_profit": float(net_profit),
            "net_margin_percentage": net_margin_pct,
            "is_profitable": net_profit > 0,
        },
    }
