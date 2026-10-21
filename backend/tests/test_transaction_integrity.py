"""Money, stock and authority regressions across complete operational workflows."""
from decimal import Decimal

import pytest

from app.extensions import db
from app.models.inventory import Inventory
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod
from app.models.sale_return import Return
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.location import Location, LocationType
from app.services.sale_return_service import create_sale_return
from app.services.sales_service import refund_sale, create_sale
from app.services.expense_service import get_store_pnl_summary
from app.multibranch.branch_service import (
    create_stock_transfer, dispatch_stock_transfer, receive_stock_transfer,
)
from app.utils.errors import AuthorizationError, ValidationError
from tests.test_returns import _setup_sale_for_return


def test_sale_refreshes_stale_inventory_before_deduction(client, owner_token, sample_owner):
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    stale = Inventory.query.filter_by(batch_id=batch_id).one()
    assert stale.quantity_available == 40
    # Simulate another terminal's committed return without expiring this ORM
    # identity map. Locking reads must fetch current balances, not stale objects.
    with db.engine.begin() as connection:
        connection.execute(Inventory.__table__.update().where(Inventory.id == stale.id)
                           .values(quantity_available=41))
    assert stale.quantity_available == 40
    create_sale(sample_owner.store_id, sample_owner.id, {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 1}],
    })
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 40


def test_cent_allocations_never_exceed_collected_cash():
    from app.services.sale_return_service import refundable_line_total
    sale = Sale(id=10, total_amount=Decimal("0.04"))
    sale.items = [SaleItem(id=i, quantity=1, unit_price=Decimal("0.01"),
                           total_price=Decimal("0.01")) for i in range(1, 5)]
    sale.payments = [Payment(amount=Decimal("0.02"), payment_method=PaymentMethod.CASH)]
    allocated = [refundable_line_total(sale, line) for line in sale.items]
    assert all(amount >= 0 for amount in allocated)
    assert sum(allocated) == Decimal("0.02")
    sale.payments = [Payment(amount=Decimal("0.04"), payment_method=PaymentMethod.CREDIT)]
    assert sum(refundable_line_total(sale, line) for line in sale.items) == 0


def test_mixed_gst_return_reverses_its_own_tax(client, owner_token, sample_owner):
    med_id, batch_id, sale_id, line_id = _setup_sale_for_return(client, owner_token)
    sale = db.session.get(Sale, sale_id)
    first = sale.items[0]
    first.quantity = 1
    first.unit_price = Decimal("100")
    first.total_price = Decimal("112")
    first.tax_percentage = Decimal("12")
    sale.items.append(SaleItem(medicine_id=med_id, batch_id=batch_id, quantity=1,
                               unit_price=Decimal("100"), total_price=Decimal("100"),
                               tax_percentage=0, discount_percentage=0))
    sale.subtotal, sale.tax_amount, sale.total_amount = Decimal("200"), Decimal("12"), Decimal("212")
    db.session.commit()
    returned = create_sale_return(sample_owner.store_id, sale_id, sample_owner.id,
                                  [{"sale_item_id": line_id, "quantity_returned": 1}], reason="Mixed GST test")
    assert returned.total_refund_amount == Decimal("112")
    pnl = get_store_pnl_summary(sample_owner.store_id)
    assert pnl["revenue"]["refunds"] == 100.0
    assert pnl["revenue"]["net_revenue"] == 100.0


def test_partial_then_full_refund_conserves_stock_and_money(client, owner_token, sample_owner):
    _, batch_id, sale_id, line_id = _setup_sale_for_return(client, owner_token)
    sale = db.session.get(Sale, sale_id)
    # Include item tax/discount and a bill discount: refund the actual invoice.
    sale.items[0].total_price = Decimal("954.00")
    sale.subtotal = Decimal("1000.00")
    sale.discount_amount = Decimal("150.00")
    sale.tax_amount = Decimal("54.00")
    sale.total_amount = Decimal("904.00")
    db.session.commit()
    first = create_sale_return(sample_owner.store_id, sale_id, sample_owner.id,
                               [{"sale_item_id": line_id, "quantity_returned": 3}], reason="Partial return")
    assert first.total_refund_amount == Decimal("271.20")
    refund_sale(sample_owner.store_id, sale_id, "Return remaining goods", sample_owner.id)
    assert Inventory.query.filter_by(batch_id=batch_id).first().quantity_available == 50
    assert sum((r.total_refund_amount for r in Return.query.filter_by(sale_id=sale_id)), Decimal(0)) == sale.total_amount


def test_return_recreates_missing_inventory_and_reverses_cost(client, owner_token, sample_owner):
    _, batch_id, sale_id, line_id = _setup_sale_for_return(client, owner_token)
    Inventory.query.filter_by(batch_id=batch_id).delete()
    db.session.commit()
    create_sale_return(sample_owner.store_id, sale_id, sample_owner.id,
                       [{"sale_item_id": line_id, "quantity_returned": 2}], reason="Sealed goods")
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 2
    assert get_store_pnl_summary(sample_owner.store_id)["cogs"]["total_cogs"] == 400.0


@pytest.mark.parametrize("item", [
    {"quantity_returned": 1, "restock_condition": "invalid"},
    {"quantity_returned": 1.5},
])
def test_invalid_return_cannot_mutate_stock(client, owner_token, sample_owner, item):
    _, batch_id, sale_id, line_id = _setup_sale_for_return(client, owner_token)
    with pytest.raises(ValidationError):
        create_sale_return(sample_owner.store_id, sale_id, sample_owner.id,
                           [{"sale_item_id": line_id, **item}], reason="Rejected input")
    db.session.rollback()
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 40
    assert Return.query.count() == 0


def test_transfer_authority_and_destination_shelf(client, owner_token, sample_owner):
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    destination = Store(name="Destination")
    db.session.add(destination)
    db.session.flush()
    manager = User(store_id=destination.id, email="dest@example.test", username="dest",
                   full_name="Destination manager", role=UserRole.MANAGER)
    manager.set_password("TestPassword123!")
    shelf = Location(store_id=sample_owner.store_id, name="Wrong branch shelf", location_type=LocationType.SHELF)
    db.session.add_all([manager, shelf])
    db.session.commit()
    transfer = create_stock_transfer(sample_owner.store_id, destination.id, sample_owner.id,
                                     [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 2}])
    with pytest.raises(AuthorizationError):
        dispatch_stock_transfer(transfer.id, manager.id)
    db.session.rollback()
    dispatch_stock_transfer(transfer.id, sample_owner.id)
    with pytest.raises(ValidationError):
        receive_stock_transfer(transfer.id, manager.id, shelf.id)
    db.session.rollback()
    assert Inventory.query.filter_by(store_id=destination.id).count() == 0
    receive_stock_transfer(transfer.id, manager.id)
    assert Inventory.query.filter_by(store_id=destination.id).one().quantity_available == 2
