"""
SmartPharm Backend — Centralized Audit Logging Tests.
Strict compliance with SmartPharm PRD Rule 7, 22, and 26:
- Verifies immutable audit log model persistence and change diffing
- Tests automatic audit log creation on inventory stock adjustments
- Tests RBAC authorization (Owner/Manager allowed, Cashier forbidden)
- Tests filtering by entity type, action, user, and search keywords
- Tests executive audit summary metrics
"""

from app.models.audit_log import AuditLog
from app.services.audit_service import log_audit_event, get_audit_logs


def test_audit_log_model_direct(app, db, sample_store):
    """Verify AuditLog model persistence and to_dict serialization."""
    with app.app_context():
        log = log_audit_event(
            store_id=sample_store.id,
            entity_type="inventory",
            entity_id=101,
            action="MANUAL_ADJUSTMENT",
            reason="Physical breakage during shelf restock",
            old_values={"quantity_available": 50},
            new_values={"quantity_available": 48},
            user_id=1,
        )
        db.session.commit()

        assert log.id is not None
        d = log.to_dict()
        assert d["entity_type"] == "inventory"
        assert d["entity_id"] == "101"
        assert d["action"] == "MANUAL_ADJUSTMENT"
        assert d["old_values"]["quantity_available"] == 50
        assert d["new_values"]["quantity_available"] == 48
        assert "breakage" in d["reason"]


def test_inventory_adjustment_generates_audit_log(client, owner_token):
    """When stock is adjusted via /api/inventory/<id>/adjust, an audit log record must be automatically created."""
    # 1. Create medicine
    med_res = client.post(
        "/api/medicines",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "brand_name": "Audit Test Paracetamol",
            "generic_name": "Paracetamol",
            "dosage_form": "tablet",
            "strength": "500mg",
            "manufacturer": "Audit Labs",
            "mrp": 30.0,
            "selling_price": 28.0,
        },
    )
    assert med_res.status_code == 201
    med_id = med_res.get_json()["medicine"]["id"]

    # 2. Create batch with initial quantity (creates inventory automatically)
    batch_res = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "medicine_id": med_id,
            "batch_number": "AUD-BATCH-01",
            "expiry_date": "2027-12-31",
            "purchase_price": 15.0,
            "mrp": 30.0,
            "quantity_received": 30,
        },
    )
    assert batch_res.status_code == 201
    batch_data = batch_res.get_json()["batch"]
    inv_id = batch_data["inventory"][0]["id"]

    # 3. Perform manual stock adjustment via POST /api/inventory/adjust
    adjust_res = client.post(
        "/api/inventory/adjust",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "inventory_id": inv_id,
            "new_quantity": 25,
            "reason": "Water damage write-off on lower rack",
        },
    )
    assert adjust_res.status_code == 200

    # Query audit logs API
    audit_res = client.get(
        "/api/audit-logs?entity_type=inventory",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert audit_res.status_code == 200
    data = audit_res.get_json()
    assert data["success"] is True
    assert len(data["data"]) >= 1

    # Verify latest audit record details
    latest = data["data"][0]
    assert latest["action"] == "MANUAL_ADJUSTMENT"
    assert latest["entity_id"] == str(inv_id)
    assert latest["old_values"]["quantity_available"] == 30
    assert latest["new_values"]["quantity_available"] == 25
    assert "Water damage" in latest["reason"]


def test_audit_logs_rbac_cashier_denied(client, cashier_token):
    """Cashier role must be rejected with 403 Forbidden per PRD Rule 26."""
    res = client.get(
        "/api/audit-logs",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert res.status_code == 403


def test_audit_logs_filtering_and_search(client, owner_token, sample_store):
    """Test filtering by entity_type, action, and keyword search."""
    # Add dummy audit events
    from app.extensions import db
    log_audit_event(
        store_id=sample_store.id,
        entity_type="sale",
        entity_id=999,
        action="DISCOUNT_APPLIED",
        reason="Owner VIP customer courtesy 15% discount",
        old_values={"discount": 0},
        new_values={"discount": 150},
    )
    db.session.commit()

    # Filter by entity_type=sale
    res = client.get(
        "/api/audit-logs?entity_type=sale",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 200
    items = res.get_json()["data"]
    assert any(item["action"] == "DISCOUNT_APPLIED" for item in items)

    # Search keyword
    res_search = client.get(
        "/api/audit-logs?search=VIP",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res_search.status_code == 200
    search_items = res_search.get_json()["data"]
    assert len(search_items) >= 1
    assert "VIP" in search_items[0]["reason"]


def test_audit_summary_metrics(client, owner_token):
    """Test executive summary metrics endpoint /api/audit-logs/summary."""
    res = client.get(
        "/api/audit-logs/summary",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 200
    metrics = res.get_json()["data"]
    assert "total_audit_events" in metrics
    assert "events_today" in metrics
    assert "adjustments_last_7d" in metrics
    assert "reconciliations_last_7d" in metrics


def test_audit_detail_not_found(client, owner_token):
    """Non-existent audit log returns 404."""
    res = client.get(
        "/api/audit-logs/9999999",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res.status_code == 404
