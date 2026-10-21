from unittest.mock import patch

from app.extensions import db
from app.models.inventory import Inventory
from app.models.sale import Sale
from app.models.sync_transaction import SyncTransaction, SyncStatus
from app.sync.queue_processor import replay_offline_transaction, resolve_sync_conflict
from tests.test_returns import _setup_sale_for_return


def test_interrupted_commit_preserves_idempotent_retry(client, owner_token, sample_owner):
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    payload = {"client_tx_id": "interrupted-commit", "sale_data": {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 2}],
        "payments": [{"payment_method": "cash", "amount": 200}],
    }}
    commit = db.session.commit
    calls = 0

    def interrupt_once():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("Simulated interruption before commit")
        return commit()

    with patch.object(db.session, "commit", side_effect=interrupt_once):
        result = replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)
    assert result["status"] == "failed"
    assert Sale.query.count() == 1  # Only the original fixture sale exists.
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 40
    result = replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)
    assert result["status"] == "synced"
    assert SyncTransaction.query.filter_by(client_tx_id=payload["client_tx_id"]).count() == 1
    assert replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)["status"] == "already_synced"
    assert Sale.query.count() == 2
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 38


def test_stock_correction_resolution_replays_real_sale(client, owner_token, sample_owner):
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    payload = {"client_tx_id": "corrected-stock", "sale_data": {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 41}],
    }}
    assert replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)["status"] == "conflict"
    record = SyncTransaction.query.filter_by(client_tx_id="corrected-stock").one()
    Inventory.query.filter_by(batch_id=batch_id).one().quantity_available = 50
    db.session.commit()
    result = resolve_sync_conflict(sample_owner.store_id, sample_owner.id, record.id,
                                   "MANUAL_INVENTORY_ADJUSTED", "Stock reconciled on shelf")
    assert result["status"] == "synced"
    assert record.status == SyncStatus.SYNCED
    assert record.applied_sale_id is not None
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 9


import json
from datetime import datetime, timezone
import pytest
from app.utils.errors import ValidationError


@pytest.mark.parametrize("error", [ValidationError("Stock changed"), RuntimeError("Interrupted")])
def test_failed_replay_cannot_overwrite_a_concurrent_success(client, owner_token, sample_owner, error):
    """A competing retry may commit while rollback releases our original store lock."""
    from app.sync import queue_processor
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    payload = {"client_tx_id": "concurrent-retry", "sale_data": {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 2}],
    }}
    real_rollback = db.session.rollback
    real_create_sale = queue_processor.create_sale
    first_attempt = True
    other_result = None

    def apply_sale(*args, **kwargs):
        nonlocal first_attempt
        if first_attempt:
            first_attempt = False
            raise error
        return real_create_sale(*args, **kwargs)

    def concurrent_retry_after_rollback():
        nonlocal other_result
        real_rollback()
        other_result = replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)

    with patch.object(queue_processor, "create_sale", side_effect=apply_sale):
        with patch.object(db.session, "rollback", side_effect=concurrent_retry_after_rollback):
            result = replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)
    assert other_result["status"] == "synced"
    assert result["status"] == "already_synced"
    receipt = SyncTransaction.query.filter_by(client_tx_id="concurrent-retry").one()
    assert receipt.status == SyncStatus.SYNCED
    assert receipt.applied_sale_id == result["applied_sale_id"] == other_result["applied_sale_id"]
    assert Sale.query.count() == 2
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 38


@pytest.mark.parametrize("resolution", ["WRITE_OFF", "DISMISSED"])
def test_review_without_sale_retains_conflict(client, owner_token, sample_owner, resolution):
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    payload = {"client_tx_id": "reviewed-receipt", "sale_data": {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 999}],
    }}
    assert replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)["status"] == "conflict"
    receipt = SyncTransaction.query.filter_by(client_tx_id="reviewed-receipt").one()
    result = resolve_sync_conflict(sample_owner.store_id, sample_owner.id, receipt.id,
                                   resolution, "Reviewed discrepancy with terminal operator")
    assert result["status"] == "conflict"
    assert receipt.status == SyncStatus.CONFLICT
    assert receipt.applied_sale_id is None
    assert receipt.synced_at is None
    assert resolution in receipt.conflict_reason
    assert replay_offline_transaction(sample_owner.store_id, sample_owner.id, payload)["status"] == "conflict"
    assert Sale.query.count() == 1


def test_failed_existing_receipt_retries_original_payload(client, owner_token, sample_owner):
    med_id, batch_id, _, _ = _setup_sale_for_return(client, owner_token)
    original = {"client_tx_id": "durable-original", "sale_data": {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 2}],
    }}
    receipt = SyncTransaction(store_id=sample_owner.store_id, user_id=sample_owner.id,
                              client_tx_id=original["client_tx_id"], payload_json=json.dumps(original),
                              status=SyncStatus.FAILED, client_timestamp=datetime.now(timezone.utc))
    db.session.add(receipt)
    db.session.commit()
    receipt_id = receipt.id
    changed = {**original, "sale_data": {
        "items": [{"medicine_id": med_id, "batch_id": batch_id, "quantity": 10}],
    }}
    result = replay_offline_transaction(sample_owner.store_id, sample_owner.id, changed)
    assert result["status"] == "synced"
    assert SyncTransaction.query.filter_by(client_tx_id=original["client_tx_id"]).one().id == receipt_id
    assert Inventory.query.filter_by(batch_id=batch_id).one().quantity_available == 38
