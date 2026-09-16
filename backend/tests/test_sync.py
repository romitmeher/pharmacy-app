"""
SmartPharm - Offline Synchronization Test Suite.
Strict compliance with SmartPharm PRD Phase 6 & Rule 24:
- Local catalog pack generation and version hashing
- Offline transaction replay with atomic stock deduction
- Strict idempotency protection against duplicate submissions
- Stock conflict detection & conflict logging
- Sync status reporting and conflict resolution endpoints
"""

import datetime
from decimal import Decimal
import pytest

from app.models.location import Location, LocationType
from app.models.medicine import Medicine, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sync_transaction import SyncTransaction, SyncStatus
from app.sync.offline_pack import generate_offline_pack
from app.sync.queue_processor import (
    replay_offline_transaction,
    replay_sync_batch,
    get_sync_status_summary,
    resolve_sync_conflict,
)


@pytest.fixture
def sync_seed_data(db, sample_store):
    """Seed medicines, batches, inventory, and location for sync testing."""
    loc = Location(
        store_id=sample_store.id,
        name="Front Counter Shelf",
        description="POS front shelf",
        location_type=LocationType.COUNTER,
        is_active=True,
    )
    db.session.add(loc)
    db.session.flush()

    today = datetime.date.today()

    med = Medicine(
        store_id=sample_store.id,
        brand_name="Dolo 650",
        generic_name="Paracetamol",
        manufacturer="Micro Labs Ltd",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        category="Analgesic / Antipyretic",
        mrp=30.00,
        selling_price=28.00,
        gst_percentage=12.00,
        is_active=True,
    )
    db.session.add(med)
    db.session.flush()

    batch = Batch(
        store_id=sample_store.id,
        medicine_id=med.id,
        batch_number="DOLO-2026-X1",
        expiry_date=today + datetime.timedelta(days=365),
        purchase_price=18.00,
        mrp=30.00,
        quantity_received=100,
    )
    db.session.add(batch)
    db.session.flush()

    inv = Inventory(
        store_id=sample_store.id,
        batch_id=batch.id,
        location_id=loc.id,
        quantity_available=50,
        quantity_reserved=0,
    )
    db.session.add(inv)
    db.session.commit()

    return {
        "store": sample_store,
        "location": loc,
        "medicine": med,
        "batch": batch,
        "inventory": inv,
    }


def test_generate_offline_pack(sync_seed_data):
    """Test building a self-contained offline catalog snapshot."""
    store = sync_seed_data["store"]
    pack = generate_offline_pack(store_id=store.id)

    assert pack["store_id"] == store.id
    assert pack["total_medicines"] == 1
    assert pack["total_active_batches"] == 1
    assert len(pack["version_hash"]) > 0

    med_pack = pack["medicines"][0]
    assert med_pack["brand_name"] == "Dolo 650"
    assert med_pack["total_stock"] == 50
    assert len(med_pack["batches"]) == 1
    assert med_pack["batches"][0]["batch_number"] == "DOLO-2026-X1"
    assert med_pack["batches"][0]["quantity_available"] == 50


def test_replay_offline_transaction_success(db, sample_owner, sync_seed_data):
    """Test replaying an offline transaction into cloud MySQL with stock deduction."""
    store = sync_seed_data["store"]
    med = sync_seed_data["medicine"]
    batch = sync_seed_data["batch"]
    inv = sync_seed_data["inventory"]

    assert inv.quantity_available == 50

    offline_payload = {
        "client_tx_id": "OFFLINE-SALE-1001-XYZ",
        "client_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tx_type": "OFFLINE_SALE",
        "sale_data": {
            "items": [
                {
                    "medicine_id": med.id,
                    "batch_id": batch.id,
                    "quantity": 5,
                    "discount_percentage": 0.0,
                }
            ],
            "payments": [
                {
                    "payment_method": "cash",
                    "amount": 150.0,
                }
            ],
            "notes": "Counter sale during power cut",
        },
    }

    res = replay_offline_transaction(
        store_id=store.id,
        user_id=sample_owner.id,
        item=offline_payload,
    )

    assert res["status"] == "synced"
    assert res["client_tx_id"] == "OFFLINE-SALE-1001-XYZ"
    assert res["applied_sale_id"] is not None

    # Check stock deduction
    db.session.refresh(inv)
    assert inv.quantity_available == 45

    # Check sync transaction record
    sync_tx = SyncTransaction.query.filter_by(client_tx_id="OFFLINE-SALE-1001-XYZ").first()
    assert sync_tx is not None
    assert sync_tx.status == SyncStatus.SYNCED
    assert sync_tx.applied_sale_id == res["applied_sale_id"]


def test_replay_idempotency(db, sample_owner, sync_seed_data):
    """Test that submitting the same client_tx_id twice does NOT duplicate sales or stock deductions."""
    store = sync_seed_data["store"]
    med = sync_seed_data["medicine"]
    batch = sync_seed_data["batch"]
    inv = sync_seed_data["inventory"]

    offline_payload = {
        "client_tx_id": "OFFLINE-SALE-IDEMPOTENT-001",
        "client_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sale_data": {
            "items": [{"medicine_id": med.id, "batch_id": batch.id, "quantity": 10}],
            "payments": [{"payment_method": "cash", "amount": 300.0}],
        },
    }

    # First attempt: successfully synced
    res1 = replay_offline_transaction(store_id=store.id, user_id=sample_owner.id, item=offline_payload)
    assert res1["status"] == "synced"
    db.session.refresh(inv)
    assert inv.quantity_available == 40

    # Second attempt: must return already_synced without mutating inventory
    res2 = replay_offline_transaction(store_id=store.id, user_id=sample_owner.id, item=offline_payload)
    assert res2["status"] == "already_synced"
    assert res2["applied_sale_id"] == res1["applied_sale_id"]

    db.session.refresh(inv)
    assert inv.quantity_available == 40  # Remains 40, zero double-decrement


def test_replay_conflict_detection(db, sample_owner, sync_seed_data):
    """Test stock deficit conflict detection when cloud inventory is insufficient."""
    store = sync_seed_data["store"]
    med = sync_seed_data["medicine"]
    batch = sync_seed_data["batch"]
    inv = sync_seed_data["inventory"]

    # Request 999 units (only 50 available)
    offline_payload = {
        "client_tx_id": "OFFLINE-SALE-CONFLICT-999",
        "client_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sale_data": {
            "items": [{"medicine_id": med.id, "batch_id": batch.id, "quantity": 999}],
            "payments": [{"payment_method": "cash", "amount": 29970.0}],
        },
    }

    res = replay_offline_transaction(store_id=store.id, user_id=sample_owner.id, item=offline_payload)
    assert res["status"] == "conflict"
    assert "Insufficient stock" in res["conflict_reason"]

    # Check that SyncTransaction was persisted with CONFLICT status
    sync_tx = SyncTransaction.query.filter_by(client_tx_id="OFFLINE-SALE-CONFLICT-999").first()
    assert sync_tx is not None
    assert sync_tx.status == SyncStatus.CONFLICT
    assert "Insufficient stock" in sync_tx.conflict_reason


def test_sync_api_endpoints(client, owner_token, sync_seed_data):
    """Test the complete REST API for offline sync: pack download, replay, status, and conflict resolution."""
    headers = {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
    store = sync_seed_data["store"]
    med = sync_seed_data["medicine"]
    batch = sync_seed_data["batch"]

    # 1. GET /api/sync/offline-pack
    res = client.get("/api/sync/offline-pack", headers=headers)
    assert res.status_code == 200
    pack_data = res.get_json()["data"]
    version_hash = pack_data["version_hash"]
    assert pack_data["total_medicines"] == 1

    # Check cache validation with hash
    res_cache = client.get(f"/api/sync/offline-pack?hash={version_hash}", headers=headers)
    assert res_cache.status_code == 200
    assert res_cache.get_json()["status"] == "not_modified"

    # 2. POST /api/sync/replay (Batch replay)
    batch_payload = {
        "transactions": [
            {
                "client_tx_id": "API-BATCH-TX-01",
                "client_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "sale_data": {
                    "items": [{"medicine_id": med.id, "batch_id": batch.id, "quantity": 2}],
                    "payments": [{"payment_method": "upi", "amount": 60.0}],
                },
            },
            {
                "client_tx_id": "API-BATCH-TX-02-CONFLICT",
                "client_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "sale_data": {
                    "items": [{"medicine_id": med.id, "batch_id": batch.id, "quantity": 500}],
                    "payments": [{"payment_method": "cash", "amount": 15000.0}],
                },
            },
        ]
    }

    res_replay = client.post("/api/sync/replay", headers=headers, json=batch_payload)
    assert res_replay.status_code == 200
    replay_data = res_replay.get_json()["data"]
    assert replay_data["total_submitted"] == 2
    assert replay_data["synced"] == 1
    assert replay_data["conflicts"] == 1

    # 3. GET /api/sync/status
    res_status = client.get("/api/sync/status", headers=headers)
    assert res_status.status_code == 200
    status_data = res_status.get_json()["data"]
    assert status_data["total_synced"] >= 1
    assert status_data["total_conflicts"] >= 1
    assert len(status_data["recent_conflicts"]) >= 1

    conflict_id = status_data["recent_conflicts"][0]["id"]

    # 4. POST /api/sync/resolve-conflict/<id>
    res_resolve = client.post(
        f"/api/sync/resolve-conflict/{conflict_id}",
        headers=headers,
        json={"resolution": "WRITE_OFF", "notes": "Approved stock discrepancy after cycle audit"},
    )
    assert res_resolve.status_code == 200
    assert res_resolve.get_json()["status"] == "success"
