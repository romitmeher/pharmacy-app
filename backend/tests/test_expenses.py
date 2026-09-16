"""
SmartPharm Backend — Operating Expenses & P&L Calculation Tests.

Strict compliance with PRD Rules 7, 8, 22, 26, 29, and 30:
- Operating expense recording with tender tracking
- Mandatory in-transaction audit log creation (EXPENSE_RECORDED)
- Category breakdown and date range aggregation
- Real-time Store P&L statement computation:
  Gross Revenue - Discounts - Refunds - COGS = Gross Profit
  Gross Profit - Operating Expenses = Net Operating Profit
- Strict Role-Based Access Control (OWNER and MANAGER only)
"""

from datetime import date, timedelta
from decimal import Decimal
from app.models.expense import Expense, ExpenseCategory
from app.models.audit_log import AuditLog


def test_record_expense_with_audit_log(client, owner_token, app):
    """Test recording an operating expense and verifying immutable audit log creation."""
    payload = {
        "category": "rent",
        "amount": 45000.00,
        "payment_method": "bank_transfer",
        "expense_date": date.today().isoformat(),
        "vendor_recipient": "DLF Commercial Properties",
        "receipt_reference": "RENT-SEP-2026",
        "notes": "Monthly retail shop floor lease",
    }

    res = client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=payload,
    )
    assert res.status_code == 201
    body = res.get_json()
    assert body["success"] is True
    exp_data = body["data"]
    assert exp_data["category"] == "rent"
    assert exp_data["amount"] == 45000.00
    assert exp_data["expense_number"].startswith("EXP-")
    exp_id = exp_data["id"]

    # Verify audit log exists
    with app.app_context():
        log = AuditLog.query.filter_by(
            entity_type="expense",
            entity_id=str(exp_id),
            action="EXPENSE_RECORDED",
        ).first()
        assert log is not None
        assert "45000" in log.reason


def test_list_expenses_and_category_breakdown(client, owner_token):
    """Test querying expenses with category filtering and aggregate summaries."""
    # Record two expenses in different categories
    client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "category": "utilities_power",
            "amount": 6200.00,
            "vendor_recipient": "Tata Power",
        },
    )
    client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "category": "staff_salary",
            "amount": 25000.00,
            "vendor_recipient": "Pharmacist Assistant",
        },
    )

    # Query all
    res = client.get(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["total"] >= 2
    assert "summary" in data
    assert data["summary"]["total_amount"] >= 31200.00
    assert data["summary"]["by_category"]["utilities_power"] >= 6200.00
    assert data["summary"]["by_category"]["staff_salary"] >= 25000.00

    # Filter by utilities_power
    filter_res = client.get(
        "/api/expenses?category=utilities_power",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert filter_res.status_code == 200
    filter_data = filter_res.get_json()["data"]
    assert all(item["category"] == "utilities_power" for item in filter_data["items"])


def test_pnl_summary_calculation(client, owner_token):
    """Test Store P&L statement generation verifying Gross vs Net Profit (PRD Rules 29 & 30)."""
    # 1. Create a medicine and batch with purchase cost
    med_res = client.post(
        "/api/medicines",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "brand_name": "PNL Test Analgesic",
            "generic_name": "Ibuprofen",
            "dosage_form": "tablet",
            "strength": "400mg",
            "mrp": 50.0,
            "selling_price": 45.0,
        },
    )
    med_id = med_res.get_json()["medicine"]["id"]

    batch_res = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "medicine_id": med_id,
            "batch_number": "PNL-BATCH-01",
            "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
            "purchase_price": 20.0,  # COGS = 20.0 per unit
            "mrp": 50.0,
            "quantity_received": 100,
        },
    )

    # 2. Complete a sale of 10 units at 50.0 (Revenue = 500.0, COGS = 200.0, Gross Profit = 300.0)
    sale_res = client.post(
        "/api/sales",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "items": [{"medicine_id": med_id, "quantity": 10}],
            "payment_method": "cash",
            "amount_paid": 500.0,
        },
    )
    assert sale_res.status_code == 201

    # 3. Record an operating expense of 100.0
    client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "category": "logistics_packaging",
            "amount": 100.0,
            "vendor_recipient": "PharmaPack Co",
        },
    )

    # 4. Fetch P&L statement
    pnl_res = client.get(
        "/api/expenses/pnl-summary",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert pnl_res.status_code == 200
    pnl = pnl_res.get_json()["data"]

    assert pnl["revenue"]["gross_sales"] >= 500.0
    assert pnl["cogs"]["total_cogs"] >= 200.0
    assert pnl["operating_expenses"]["total_expenses"] >= 100.0
    assert "net_operating_profit" in pnl["net_performance"]
    # Net operating profit should equal gross_profit - operating_expenses
    expected_net = pnl["cogs"]["gross_profit"] - pnl["operating_expenses"]["total_expenses"]
    assert abs(pnl["net_performance"]["net_operating_profit"] - expected_net) < 0.01


def test_expense_validation_errors(client, owner_token):
    """Test validation checks on invalid category and negative amounts."""
    # Invalid category
    res_cat = client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"category": "space_travel", "amount": 5000.0},
    )
    assert res_cat.status_code == 400

    # Negative amount
    res_amt = client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"category": "rent", "amount": -100.0},
    )
    assert res_amt.status_code == 400


def test_expense_rbac_enforcement(client, cashier_token):
    """Test that Cashier role cannot record or view store operating expenses."""
    res = client.get(
        "/api/expenses",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert res.status_code == 403

    post_res = client.post(
        "/api/expenses",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"category": "rent", "amount": 1000.0},
    )
    assert post_res.status_code == 403
