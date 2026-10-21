"""
SmartPharm Backend — Sales Returns & Refunds Tests.

Strict compliance with PRD Rules 7, 8, 14, and 22:
- Verification of returnable quantities against original sale line items
- Restocking to physical inventory vs damaged write-off boundaries
- Atomic financial refund calculation
- Automatic audit log creation upon return completion
- Transition of original sale payment status (PARTIAL -> REFUNDED)
"""

from datetime import date, timedelta
from app.models.inventory import Inventory
from app.models.audit_log import AuditLog
from app.models.sale import PaymentStatus
from app.models.sale_return import RestockCondition


def _setup_sale_for_return(client, owner_token):
    """Helper to create a medicine, batch with inventory, and a completed sale."""
    # 1. Create medicine
    med_res = client.post(
        "/api/medicines",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "brand_name": "Returnable Amoxicillin",
            "generic_name": "Amoxicillin",
            "dosage_form": "capsule",
            "strength": "500mg",
            "mrp": 100.0,
            "selling_price": 90.0,
        },
    )
    assert med_res.status_code == 201
    med_id = med_res.get_json()["medicine"]["id"]

    # 2. Create batch with 50 units
    batch_res = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "medicine_id": med_id,
            "batch_number": "RET-AMOX-01",
            "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
            "purchase_price": 50.0,
            "mrp": 100.0,
            "quantity_received": 50,
        },
    )
    assert batch_res.status_code == 201
    batch_id = batch_res.get_json()["batch"]["id"]

    # 3. Create POS sale of 10 units
    sale_res = client.post(
        "/api/sales",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "items": [
                {
                    "medicine_id": med_id,
                    "batch_id": batch_id,
                    "quantity": 10,
                    "unit_price": 90.0,
                }
            ],
            "payments": [
                {
                    "payment_method": "cash",
                    "amount": 1000.0,
                }
            ],
        },
    )
    assert sale_res.status_code == 201
    sale_data = sale_res.get_json()["sale"]
    sale_id = sale_data["id"]
    sale_item_id = sale_data["items"][0]["id"]

    return med_id, batch_id, sale_id, sale_item_id


def test_get_eligible_return_items(client, owner_token):
    """Fetch returnable line items from a sale invoice."""
    med_id, batch_id, sale_id, sale_item_id = _setup_sale_for_return(client, owner_token)

    res = client.get(
        f"/api/returns/eligible-items/{sale_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    by_number = client.get(f"/api/returns/eligible-items/{data['invoice_number']}",
                          headers={"Authorization": f"Bearer {owner_token}"})
    assert by_number.status_code == 200
    assert by_number.json["data"]["sale_id"] == sale_id
    assert data["sale_id"] == sale_id
    assert data["total_remaining_units"] == 10
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity_eligible_for_return"] == 10


def test_process_return_restocked_to_inventory(client, owner_token):
    """Customer return with restocked_to_inventory increments physical stock and logs audit trail."""
    med_id, batch_id, sale_id, sale_item_id = _setup_sale_for_return(client, owner_token)

    # Initial stock was 50, sold 10 -> 40 remaining
    inv_before = Inventory.query.filter_by(batch_id=batch_id).first()
    assert inv_before.quantity_available == 40

    # Process return of 4 units, restocked to shelf
    ret_res = client.post(
        "/api/returns",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "sale_id": sale_id,
            "reason": "Customer purchased extra box by mistake. Box intact and sealed.",
            "refund_method": "cash",
            "items": [
                {
                    "sale_item_id": sale_item_id,
                    "quantity_returned": 4,
                    "restock_condition": RestockCondition.RESTOCKED_TO_INVENTORY.value,
                }
            ],
        },
    )
    assert ret_res.status_code == 201
    ret_data = ret_res.get_json()["data"]
    assert ret_data["total_refund_amount"] == 400.0  # 4 * 100.0 (batch MRP)

    # Stock should be 40 + 4 = 44
    inv_after = Inventory.query.filter_by(batch_id=batch_id).first()
    assert inv_after.quantity_available == 44

    # Audit log should be generated
    audit_entry = AuditLog.query.filter_by(action="SALE_RETURN", entity_id=str(sale_id)).first()
    assert audit_entry is not None
    assert "Customer Return" in audit_entry.reason


def test_process_return_written_off_damaged(client, owner_token):
    """Damaged customer return is NOT added back to saleable stock."""
    med_id, batch_id, sale_id, sale_item_id = _setup_sale_for_return(client, owner_token)

    inv_before = Inventory.query.filter_by(batch_id=batch_id).first()
    assert inv_before.quantity_available == 40

    # Process return of 3 units with written_off_damaged
    ret_res = client.post(
        "/api/returns",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "sale_id": sale_id,
            "reason": "Customer returned opened strip with broken foil seal",
            "refund_method": "upi",
            "items": [
                {
                    "sale_item_id": sale_item_id,
                    "quantity_returned": 3,
                    "restock_condition": RestockCondition.WRITTEN_OFF_DAMAGED.value,
                }
            ],
        },
    )
    assert ret_res.status_code == 201

    # Stock remains 40 (not incremented)
    inv_after = Inventory.query.filter_by(batch_id=batch_id).first()
    assert inv_after.quantity_available == 40


def test_return_quantity_exceeds_sold_fails(client, owner_token):
    """Attempting to return more than purchased units returns 400 ValidationError."""
    med_id, batch_id, sale_id, sale_item_id = _setup_sale_for_return(client, owner_token)

    ret_res = client.post(
        "/api/returns",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "sale_id": sale_id,
            "reason": "Test excess return",
            "items": [
                {
                    "sale_item_id": sale_item_id,
                    "quantity_returned": 15,  # only 10 were sold
                }
            ],
        },
    )
    assert ret_res.status_code == 400
    assert "Cannot return 15 units" in ret_res.get_json()["message"]


def test_partial_return_then_full_refund_status(client, owner_token):
    """Partial return sets sale status to PARTIAL, second return of rest sets to REFUNDED."""
    med_id, batch_id, sale_id, sale_item_id = _setup_sale_for_return(client, owner_token)

    # 1. First return 4 of 10
    client.post(
        "/api/returns",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "sale_id": sale_id,
            "reason": "Partial return part 1",
            "items": [{"sale_item_id": sale_item_id, "quantity_returned": 4}],
        },
    )
    from app.extensions import db
    from app.models.sale import Sale
    s1 = db.session.get(Sale, sale_id)
    assert s1.payment_status == PaymentStatus.PARTIAL

    # 2. Return remaining 6 of 10
    client.post(
        "/api/returns",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "sale_id": sale_id,
            "reason": "Partial return part 2 (remaining)",
            "items": [{"sale_item_id": sale_item_id, "quantity_returned": 6}],
        },
    )
    s2 = db.session.get(Sale, sale_id)
    assert s2.payment_status == PaymentStatus.REFUNDED


def test_list_and_detail_returns(client, owner_token):
    """List return records and fetch single return detail."""
    med_id, batch_id, sale_id, sale_item_id = _setup_sale_for_return(client, owner_token)

    ret_res = client.post(
        "/api/returns",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "sale_id": sale_id,
            "reason": "Routine customer return",
            "items": [{"sale_item_id": sale_item_id, "quantity_returned": 2}],
        },
    )
    return_id = ret_res.get_json()["data"]["id"]

    # List returns
    list_res = client.get("/api/returns", headers={"Authorization": f"Bearer {owner_token}"})
    assert list_res.status_code == 200
    data = list_res.get_json()["data"]
    assert any(r["id"] == return_id for r in data)

    # Detail
    detail_res = client.get(f"/api/returns/{return_id}", headers={"Authorization": f"Bearer {owner_token}"})
    assert detail_res.status_code == 200
    detail = detail_res.get_json()["data"]
    assert detail["id"] == return_id
    assert len(detail["items"]) == 1
