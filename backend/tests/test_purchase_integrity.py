"""Purchase receipts must preserve counted quantities, store ownership and audit history."""
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.inventory import Inventory
from app.models.location import Location, LocationType
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus
from app.models.store import Store
from app.services.purchase_service import accept_purchase_invoice, cancel_purchase_invoice
from tests.test_purchases import _setup_medicine_and_supplier


@pytest.fixture
def purchase(client, owner_token):
    medicine_id, supplier_id = _setup_medicine_and_supplier(client, owner_token)
    response = client.post("/api/purchases", headers={"Authorization": f"Bearer {owner_token}"}, json={
        "supplier_id": supplier_id, "invoice_number": "INTEGRITY-RECEIPT",
        "items": [{"medicine_id": medicine_id, "batch_number": "INTEGRITY-BATCH", "quantity": 10,
                   "purchase_rate": 15, "expiry_date": (date.today() + timedelta(days=365)).isoformat()}],
    })
    assert response.status_code == 201
    return response.get_json()["invoice"]


@pytest.mark.parametrize("quantity", [-1, 1.5, "1.5", "invalid", None, True])
def test_accept_rejects_invalid_count_before_booking(client, owner_token, purchase, quantity):
    response = client.post(f"/api/purchases/{purchase['id']}/accept",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"items": [{"item_id": purchase["items"][0]["id"], "received_quantity": quantity}]})
    assert response.status_code == 400
    assert Inventory.query.count() == 0
    assert db.session.get(PurchaseInvoice, purchase["id"]).status == PurchaseInvoiceStatus.DRAFT


@pytest.mark.parametrize("per_line", [False, True])
@pytest.mark.parametrize("foreign", [False, True])
def test_accept_requires_active_store_location(client, owner_token, sample_owner, purchase, per_line, foreign):
    store_id = sample_owner.store_id
    if foreign:
        other = Store(name="Another pharmacy")
        db.session.add(other)
        db.session.flush()
        store_id = other.id
    location = Location(store_id=store_id, name="Invalid receipt destination", location_type=LocationType.SHELF,
                        is_active=foreign)
    db.session.add(location)
    db.session.commit()
    payload = {"default_location_id": location.id}
    if per_line:
        payload = {"items": [{"item_id": purchase["items"][0]["id"], "location_id": location.id}]}
    response = client.post(f"/api/purchases/{purchase['id']}/accept",
        headers={"Authorization": f"Bearer {owner_token}"}, json=payload)
    assert response.status_code == 400
    assert Inventory.query.count() == 0


def test_receipt_books_actual_count_to_reviewed_location_and_audits(client, owner_token, sample_owner, purchase):
    location = Location(store_id=sample_owner.store_id, name="Received shelf", location_type=LocationType.SHELF)
    db.session.add(location)
    db.session.commit()
    response = client.post(f"/api/purchases/{purchase['id']}/accept",
        headers={"Authorization": f"Bearer {owner_token}"}, json={"default_location_id": location.id,
        "items": [{"item_id": purchase["items"][0]["id"], "received_quantity": 7}]})
    assert response.status_code == 200
    row = Inventory.query.one()
    assert row.quantity_available == 7
    assert row.location_id == location.id
    audit = AuditLog.query.filter_by(action="PURCHASE_ACCEPTED").one()
    assert audit.user_id == sample_owner.id
    assert audit.new_values["status"] == "partial_accepted"
    repeat = client.post(f"/api/purchases/{purchase['id']}/accept", headers={"Authorization": f"Bearer {owner_token}"})
    assert repeat.status_code == 409
    assert row.quantity_available == 7
    assert AuditLog.query.filter_by(action="PURCHASE_ACCEPTED").count() == 1


def test_purchase_audit_and_stock_share_transaction(client, owner_token, sample_owner, purchase):
    with patch("app.services.purchase_service.log_audit_event", side_effect=RuntimeError("Audit failed")):
        with pytest.raises(RuntimeError, match="Audit failed"):
            accept_purchase_invoice(sample_owner.store_id, purchase["id"], sample_owner.id)
    db.session.rollback()
    assert Inventory.query.count() == 0
    assert db.session.get(PurchaseInvoice, purchase["id"]).status == PurchaseInvoiceStatus.DRAFT


def test_cancellation_records_actor_and_reason(client, owner_token, sample_owner, purchase):
    invoice = cancel_purchase_invoice(sample_owner.store_id, purchase["id"], "Wrong delivery", user_id=sample_owner.id)
    assert invoice.status == PurchaseInvoiceStatus.CANCELLED
    audit = AuditLog.query.filter_by(action="PURCHASE_CANCELLED").one()
    assert audit.user_id == sample_owner.id
    assert audit.reason == "Wrong delivery"
    assert Inventory.query.count() == 0
