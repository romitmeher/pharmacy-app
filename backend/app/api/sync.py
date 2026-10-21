"""
SmartPharm - Offline Synchronization REST API Endpoints.
Strict compliance with SmartPharm PRD Phase 6 & Rule 24:
- GET /api/sync/offline-pack: Download lightweight catalog & batch snapshot for local caching
- POST /api/sync/replay: Replay queued offline sales transactions with idempotency protection
- GET /api/sync/status: Monitor store sync health, conflict count, and last sync timestamp
- POST /api/sync/resolve-conflict/<int:sync_id>: Manager sign-off for inventory conflict reconciliation
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.sync.offline_pack import generate_offline_pack
from app.sync.queue_processor import (
    replay_offline_transaction,
    replay_sync_batch,
    get_sync_status_summary,
    resolve_sync_conflict,
)
from app.utils.errors import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

sync_bp = Blueprint("sync", __name__, url_prefix="/api/sync")


@sync_bp.route("/offline-pack", methods=["GET"])
@login_required
def get_offline_pack():
    """
    Download or validate local store offline catalog pack.
    Optionally pass ?hash=<version_hash> to verify cache validity.
    """
    store_id = g.current_user.store_id
    client_hash = request.args.get("hash")

    pack = generate_offline_pack(store_id=store_id, in_stock_only=request.args.get("in_stock_only", "false").lower() == "true")
    if client_hash and pack.get("version_hash") == client_hash:
        return jsonify({
            "status": "not_modified",
            "version_hash": client_hash,
            "message": "Local catalog snapshot is already up to date.",
        }), 200

    return jsonify({
        "status": "success",
        "data": pack,
    }), 200


@sync_bp.route("/replay", methods=["POST"])
@login_required
def replay_queue():
    """
    Replay queued offline transactions with idempotency and conflict isolation.
    Accepts either a single transaction object or a list under 'transactions'.
    """
    store_id = g.current_user.store_id
    user_id = g.current_user.id
    payload = request.get_json() or {}

    # Check if bulk array or single transaction
    if "transactions" in payload and isinstance(payload["transactions"], list):
        summary = replay_sync_batch(
            store_id=store_id,
            user_id=user_id,
            transactions=payload["transactions"],
        )
        return jsonify({
            "status": "success",
            "data": summary,
        }), 200
    elif "client_tx_id" in payload:
        res = replay_offline_transaction(
            store_id=store_id,
            user_id=user_id,
            item=payload,
        )
        status_code = 200 if res.get("status") in ("synced", "already_synced") else 409 if res.get("status") == "conflict" else 400
        return jsonify({
            "status": "success" if status_code == 200 else "conflict" if status_code == 409 else "failed",
            "data": res,
        }), status_code
    else:
        return jsonify({
            "error": "ValidationError",
            "message": "Payload must contain either 'client_tx_id' or 'transactions' list.",
        }), 400


@sync_bp.route("/status", methods=["GET"])
@login_required
def get_sync_status():
    """
    Returns synchronization summary: total synced transactions, unresolved conflicts, and last sync timestamp.
    """
    store_id = g.current_user.store_id
    summary = get_sync_status_summary(store_id=store_id)
    return jsonify({
        "status": "success",
        "data": summary,
    }), 200


@sync_bp.route("/resolve-conflict/<int:sync_id>", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def resolve_conflict_endpoint(sync_id: int):
    """
    Manager endpoint to review and resolve a sync inventory conflict.
    """
    store_id = g.current_user.store_id
    user_id = g.current_user.id
    payload = request.get_json() or {}
    resolution = payload.get("resolution", "WRITE_OFF")
    notes = payload.get("notes", "")

    try:
        res = resolve_sync_conflict(
            store_id=store_id,
            user_id=user_id,
            sync_id=sync_id,
            resolution=resolution,
            notes=notes,
        )
        return jsonify({
            "status": "success",
            "data": res,
        }), 200
    except NotFoundError as err:
        return jsonify({"error": "NotFoundError", "message": str(err)}), 404
    except Exception as exc:
        return jsonify({"error": "ServerError", "message": str(exc)}), 500
