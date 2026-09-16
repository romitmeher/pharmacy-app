"""
SmartPharm Backend — Offline Queue Replay Engine.

Replays offline transactions submitted from local POS store terminals into
central cloud MySQL with strict idempotency and conflict resolution per PRD Rule 24:

Local Store (POS Terminal) -> Local Sync Queue -> Cloud Backend -> Central Database

Guarantees:
1. Idempotency: Duplicate submissions with the same `client_tx_id` will never
   duplicate sales or double-decrement batch inventory.
2. Financial Continuity: Offline cash/UPI collections are preserved even if cloud
   stock was depleted in the interim.
3. Auditability: Every replayed transaction logs timestamps and user accountability.
"""

import json
from datetime import datetime, timezone
from app.extensions import db
from app.models.sync_transaction import SyncTransaction, SyncStatus
from app.models.sale import Sale
from app.services.sales_service import create_sale
from app.services.inventory_service import adjust_stock
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def replay_offline_transaction(store_id: int, user_id: int, item: dict) -> dict:
    """
    Replay a single offline transaction into cloud MySQL.
    """
    client_tx_id = item.get("client_tx_id")
    if not client_tx_id:
        return {
            "client_tx_id": None,
            "status": "failed",
            "error": "Missing client_tx_id for offline transaction.",
        }

    # 1. Idempotency Check
    existing = SyncTransaction.query.filter_by(
        store_id=store_id, client_tx_id=client_tx_id
    ).first()

    if existing:
        if existing.status == SyncStatus.SYNCED:
            return {
                "client_tx_id": client_tx_id,
                "status": "already_synced",
                "applied_sale_id": existing.applied_sale_id,
                "synced_at": existing.synced_at.isoformat() if existing.synced_at else None,
                "message": "Transaction was already synced to cloud database.",
            }
        elif existing.status == SyncStatus.CONFLICT:
            return {
                "client_tx_id": client_tx_id,
                "status": "conflict",
                "applied_sale_id": existing.applied_sale_id,
                "conflict_reason": existing.conflict_reason,
                "message": "Transaction previously flagged with stock/data conflict.",
            }

    # Parse client timestamp
    raw_ts = item.get("client_timestamp")
    client_ts = None
    if raw_ts:
        try:
            # Handle ISO format with or without Z
            clean_ts = raw_ts.replace("Z", "+00:00")
            client_ts = datetime.fromisoformat(clean_ts)
        except Exception:
            client_ts = datetime.now(timezone.utc)
    else:
        client_ts = datetime.now(timezone.utc)

    sale_data = item.get("sale_data") or {}
    tx_type = item.get("tx_type", "OFFLINE_SALE")

    # 2. Create SyncTransaction record in pending state
    sync_tx = SyncTransaction(
        store_id=store_id,
        user_id=user_id,
        client_tx_id=client_tx_id,
        tx_type=tx_type,
        payload_json=json.dumps(item),
        status=SyncStatus.PENDING,
        client_timestamp=client_ts,
    )
    db.session.add(sync_tx)
    db.session.flush()

    # 3. Attempt to apply the sale transaction
    try:
        # Append an offline sync note
        notes = sale_data.get("notes", "") or ""
        sale_data["notes"] = f"{notes} [Offline Sync: {client_tx_id}]".strip()

        sale = create_sale(store_id=store_id, user_id=user_id, data=sale_data)

        # Mark successfully synced
        sync_tx.status = SyncStatus.SYNCED
        sync_tx.applied_sale_id = sale.id
        sync_tx.synced_at = datetime.now(timezone.utc)
        db.session.commit()

        return {
            "client_tx_id": client_tx_id,
            "status": "synced",
            "applied_sale_id": sale.id,
            "invoice_number": sale.invoice_number,
            "total_amount": float(sale.total_amount),
            "synced_at": sync_tx.synced_at.isoformat(),
        }

    except (ValidationError, NotFoundError, ConflictError) as err:
        # Stock variance or batch conflict occurred while terminal was disconnected
        db.session.rollback()

        # Re-fetch or re-create the sync_tx since rollback cleared session
        sync_tx = SyncTransaction.query.filter_by(
            store_id=store_id, client_tx_id=client_tx_id
        ).first()

        if not sync_tx:
            sync_tx = SyncTransaction(
                store_id=store_id,
                user_id=user_id,
                client_tx_id=client_tx_id,
                tx_type=tx_type,
                payload_json=json.dumps(item),
                status=SyncStatus.CONFLICT,
                client_timestamp=client_ts,
                conflict_reason=str(err),
            )
            db.session.add(sync_tx)
        else:
            sync_tx.status = SyncStatus.CONFLICT
            sync_tx.conflict_reason = str(err)

        db.session.commit()

        return {
            "client_tx_id": client_tx_id,
            "status": "conflict",
            "conflict_reason": str(err),
            "message": f"Sync conflict detected: {str(err)}. Flagged for manager review.",
        }

    except Exception as exc:
        db.session.rollback()
        # Save as failed
        sync_tx = SyncTransaction.query.filter_by(
            store_id=store_id, client_tx_id=client_tx_id
        ).first()

        if not sync_tx:
            sync_tx = SyncTransaction(
                store_id=store_id,
                user_id=user_id,
                client_tx_id=client_tx_id,
                tx_type=tx_type,
                payload_json=json.dumps(item),
                status=SyncStatus.FAILED,
                client_timestamp=client_ts,
                conflict_reason=f"Unexpected error: {str(exc)}",
            )
            db.session.add(sync_tx)
        else:
            sync_tx.status = SyncStatus.FAILED
            sync_tx.conflict_reason = f"Unexpected error: {str(exc)}"

        db.session.commit()

        return {
            "client_tx_id": client_tx_id,
            "status": "failed",
            "error": str(exc),
        }


def replay_sync_batch(store_id: int, user_id: int, transactions: list) -> dict:
    """
    Replay an array of queued offline transactions.
    """
    if not isinstance(transactions, list) or not transactions:
        return {
            "total_submitted": 0,
            "synced": 0,
            "already_synced": 0,
            "conflicts": 0,
            "failed": 0,
            "results": [],
        }

    results = []
    synced_count = 0
    already_synced_count = 0
    conflict_count = 0
    failed_count = 0

    for item in transactions:
        res = replay_offline_transaction(store_id=store_id, user_id=user_id, item=item)
        results.append(res)
        status = res.get("status")
        if status == "synced":
            synced_count += 1
        elif status == "already_synced":
            already_synced_count += 1
        elif status == "conflict":
            conflict_count += 1
        else:
            failed_count += 1

    return {
        "total_submitted": len(transactions),
        "synced": synced_count,
        "already_synced": already_synced_count,
        "conflicts": conflict_count,
        "failed": failed_count,
        "results": results,
    }


def get_sync_status_summary(store_id: int) -> dict:
    """
    Get synchronization health and conflict statistics for a store.
    """
    total_synced = (
        SyncTransaction.query.filter_by(store_id=store_id, status=SyncStatus.SYNCED).count()
    )
    total_conflicts = (
        SyncTransaction.query.filter_by(store_id=store_id, status=SyncStatus.CONFLICT).count()
    )
    total_failed = (
        SyncTransaction.query.filter_by(store_id=store_id, status=SyncStatus.FAILED).count()
    )

    last_synced_tx = (
        SyncTransaction.query.filter_by(store_id=store_id, status=SyncStatus.SYNCED)
        .order_by(SyncTransaction.synced_at.desc())
        .first()
    )

    recent_conflicts = (
        SyncTransaction.query.filter_by(store_id=store_id, status=SyncStatus.CONFLICT)
        .order_by(SyncTransaction.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "store_id": store_id,
        "total_synced": total_synced,
        "total_conflicts": total_conflicts,
        "total_failed": total_failed,
        "last_synced_at": last_synced_tx.synced_at.isoformat() if last_synced_tx and last_synced_tx.synced_at else None,
        "recent_conflicts": [c.to_dict() for c in recent_conflicts],
    }


def resolve_sync_conflict(store_id: int, user_id: int, sync_id: int, resolution: str, notes: str = None) -> dict:
    """
    Resolve a flagged sync conflict with manager sign-off.
    Resolutions: 'WRITE_OFF', 'MANUAL_INVENTORY_ADJUSTED', 'DISMISSED'.
    """
    sync_tx = SyncTransaction.query.filter_by(id=sync_id, store_id=store_id).first()
    if not sync_tx:
        raise NotFoundError(f"SyncTransaction with ID {sync_id} not found.")

    if sync_tx.status != SyncStatus.CONFLICT:
        return {
            "id": sync_tx.id,
            "status": sync_tx.status.value,
            "message": "Transaction is not in conflict status.",
        }

    resolution_note = f"Resolved via {resolution}. Manager Notes: {notes or 'None'}"
    sync_tx.conflict_reason = f"{sync_tx.conflict_reason or ''} | [{resolution_note}]"
    sync_tx.status = SyncStatus.SYNCED
    sync_tx.synced_at = datetime.now(timezone.utc)

    db.session.commit()

    return {
        "id": sync_tx.id,
        "client_tx_id": sync_tx.client_tx_id,
        "status": sync_tx.status.value,
        "resolution": resolution,
        "message": "Conflict successfully resolved and logged.",
    }
