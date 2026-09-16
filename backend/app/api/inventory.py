"""
SmartPharm Backend — Batch & Inventory API Endpoints.

REST API for batches, physical stock levels, inter-location movements,
manual adjustments, FEFO summary for POS, and PRD Rule 15 Expiry Tracking.
"""

from flask import Blueprint, request, jsonify, g

from app.models.user import UserRole
from app.middleware.auth import login_required, role_required
from app.services import inventory_service
from app.utils.errors import ValidationError

inventory_bp = Blueprint("inventory", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# Batches Endpoints (/api/batches)
# ---------------------------------------------------------------------------

@inventory_bp.route("/batches", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.INVENTORY_STAFF)
def create_batch():
    """Create a new batch for a medicine and allocate initial stock."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    batch = inventory_service.create_batch(g.current_store_id, data)
    return jsonify({
        "message": "Batch created successfully.",
        "batch": inventory_service.serialize_batch(batch),
    }), 201


@inventory_bp.route("/batches", methods=["GET"])
@login_required
def list_batches():
    """List batches for a store, with optional medicine_id and has_stock filters."""
    med_id = request.args.get("medicine_id", type=int)
    has_stock = request.args.get("has_stock", "false").lower() in ("true", "1", "yes")

    batches = inventory_service.list_batches(
        store_id=g.current_store_id,
        medicine_id=med_id,
        has_stock_only=has_stock,
    )
    return jsonify({
        "count": len(batches),
        "batches": [inventory_service.serialize_batch(b) for b in batches],
    }), 200


@inventory_bp.route("/batches/<int:batch_id>", methods=["GET"])
@login_required
def get_batch(batch_id):
    """Get single batch details including physical stock across locations."""
    batch = inventory_service.get_batch(g.current_store_id, batch_id)
    return jsonify({
        "batch": inventory_service.serialize_batch(batch),
    }), 200


# ---------------------------------------------------------------------------
# Stock Operations Endpoints (/api/inventory/...)
# ---------------------------------------------------------------------------

@inventory_bp.route("/inventory/adjust", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.INVENTORY_STAFF)
def adjust_stock():
    """Adjust stock for an inventory record with a required audit reason.

    Request JSON:
        {
            "inventory_id": 12,
            "new_quantity": 45,
            "reason": "Damaged strip removed during shelf inspection"
        }
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    inventory_id = data.get("inventory_id")
    new_quantity = data.get("new_quantity")
    reason = data.get("reason", "").strip()

    if inventory_id is None or new_quantity is None:
        raise ValidationError("Both inventory_id and new_quantity are required.")

    inv = inventory_service.adjust_stock(
        store_id=g.current_store_id,
        inventory_id=int(inventory_id),
        new_quantity=int(new_quantity),
        reason=reason,
        user_id=g.current_user.id,
    )
    return jsonify({
        "message": "Stock adjusted successfully.",
        "inventory": inventory_service.serialize_inventory(inv),
    }), 200


@inventory_bp.route("/inventory/transfer", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.INVENTORY_STAFF)
def transfer_stock():
    """Move physical stock of a batch between storage locations.

    Request JSON:
        {
            "batch_id": 1,
            "source_location_id": 2,
            "target_location_id": 5,
            "quantity": 10
        }
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    batch_id = data.get("batch_id")
    source_loc = data.get("source_location_id")
    target_loc = data.get("target_location_id")
    quantity = data.get("quantity")

    if not all([batch_id, target_loc, quantity]):
        raise ValidationError("batch_id, target_location_id, and quantity are required.")

    result = inventory_service.transfer_stock(
        store_id=g.current_store_id,
        batch_id=int(batch_id),
        source_location_id=int(source_loc) if source_loc is not None else None,
        target_location_id=int(target_loc),
        quantity=int(quantity),
    )
    return jsonify(result), 200


@inventory_bp.route("/inventory/summary/<int:medicine_id>", methods=["GET"])
@login_required
def get_medicine_inventory_summary(medicine_id):
    """Get aggregated stock and FEFO-sorted batches for a medicine."""
    summary = inventory_service.get_medicine_inventory_summary(
        store_id=g.current_store_id,
        medicine_id=medicine_id,
    )
    return jsonify(summary), 200


@inventory_bp.route("/inventory/expiry", methods=["GET"])
@login_required
def get_expiry_report():
    """PRD Rule 15: Expiry tracking report.

    Query params:
        status: string ('expired', 'critical', 'warning', 'good')
        days: int (items expiring within N days)
    """
    status = request.args.get("status", None)
    days = request.args.get("days", type=int)

    report = inventory_service.get_expiry_report(
        store_id=g.current_store_id,
        status=status,
        days=days,
    )
    return jsonify(report), 200
