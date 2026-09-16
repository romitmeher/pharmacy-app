"""
SmartPharm - Multi-Branch Operations REST API Endpoints.
Strict compliance with SmartPharm PRD Phase 6 & Rule 25:
- GET /api/multibranch/stores: List all branches in the chain
- GET /api/multibranch/stock-comparison/<int:medicine_id>: Live stock lookup across all branches
- GET /api/multibranch/analytics: Consolidated network revenue and margin metrics
- GET /api/multibranch/supplier-price-comparison: Cross-store purchase price benchmarks
- POST /api/multibranch/transfers: Initiate an inter-store stock transfer
- POST /api/multibranch/transfers/<int:transfer_id>/dispatch: Source branch dispatch
- POST /api/multibranch/transfers/<int:transfer_id>/receive: Destination branch receipt
- GET /api/multibranch/transfers: Query transfer pipeline
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.models.stock_transfer import StockTransfer
from app.multibranch.branch_service import (
    get_network_stores,
    get_cross_store_stock,
    get_network_performance_summary,
    compare_supplier_prices,
    create_stock_transfer,
    dispatch_stock_transfer,
    receive_stock_transfer,
)
from app.utils.errors import ValidationError, NotFoundError, ConflictError

logger = logging.getLogger(__name__)

multibranch_bp = Blueprint("multibranch", __name__, url_prefix="/api/multibranch")


@multibranch_bp.route("/stores", methods=["GET"])
@login_required
def list_network_stores():
    """
    Returns all pharmacy stores belonging to the network (PRD Rule 25).
    """
    stores = get_network_stores()
    return jsonify({
        "status": "success",
        "data": stores,
    }), 200


@multibranch_bp.route("/stock-comparison/<int:medicine_id>", methods=["GET"])
@login_required
def get_medicine_network_stock(medicine_id: int):
    """
    Look up stock availability of a medicine across all network branches.
    """
    requesting_store_id = g.current_user.store_id
    try:
        data = get_cross_store_stock(medicine_id=medicine_id, requesting_store_id=requesting_store_id)
        return jsonify({
            "status": "success",
            "data": data,
        }), 200
    except NotFoundError as err:
        return jsonify({"error": "NotFoundError", "message": str(err)}), 404


@multibranch_bp.route("/analytics", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def get_network_analytics():
    """
    Consolidated network performance comparison (Sales, Bills, Gross Margin).
    """
    data = get_network_performance_summary()
    return jsonify({
        "status": "success",
        "data": data,
    }), 200


@multibranch_bp.route("/supplier-price-comparison", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def get_supplier_price_comparison():
    """
    Compare supplier purchase rates across branches to optimize bulk purchasing.
    """
    data = compare_supplier_prices()
    return jsonify({
        "status": "success",
        "data": data,
    }), 200


@multibranch_bp.route("/transfers", methods=["POST"])
@login_required
def create_transfer_endpoint():
    """
    Initiate an inter-store transfer request in DRAFT status.
    """
    payload = request.get_json() or {}
    source_store_id = payload.get("source_store_id")
    destination_store_id = payload.get("destination_store_id", g.current_user.store_id)
    items_data = payload.get("items", [])
    notes = payload.get("notes")

    if not source_store_id:
        return jsonify({"error": "ValidationError", "message": "source_store_id is required."}), 400

    try:
        transfer = create_stock_transfer(
            source_store_id=source_store_id,
            destination_store_id=destination_store_id,
            user_id=g.current_user.id,
            items_data=items_data,
            notes=notes,
        )
        return jsonify({
            "status": "success",
            "data": transfer.to_dict(),
        }), 201
    except (ValidationError, ConflictError) as err:
        return jsonify({"error": type(err).__name__, "message": str(err)}), 400
    except NotFoundError as err:
        return jsonify({"error": "NotFoundError", "message": str(err)}), 404


@multibranch_bp.route("/transfers/<int:transfer_id>/dispatch", methods=["POST"])
@login_required
def dispatch_transfer_endpoint(transfer_id: int):
    """
    Confirm dispatch from source branch, deduct inventory, and transition to IN_TRANSIT.
    """
    try:
        transfer = dispatch_stock_transfer(transfer_id=transfer_id, user_id=g.current_user.id)
        return jsonify({
            "status": "success",
            "data": transfer.to_dict(),
        }), 200
    except (ValidationError, ConflictError) as err:
        return jsonify({"error": type(err).__name__, "message": str(err)}), 400
    except NotFoundError as err:
        return jsonify({"error": "NotFoundError", "message": str(err)}), 404


@multibranch_bp.route("/transfers/<int:transfer_id>/receive", methods=["POST"])
@login_required
def receive_transfer_endpoint(transfer_id: int):
    """
    Confirm physical receipt at destination branch, book inventory, and transition to RECEIVED.
    """
    payload = request.get_json() or {}
    location_id = payload.get("location_id")

    try:
        transfer = receive_stock_transfer(
            transfer_id=transfer_id, user_id=g.current_user.id, destination_location_id=location_id
        )
        return jsonify({
            "status": "success",
            "data": transfer.to_dict(),
        }), 200
    except (ValidationError, ConflictError) as err:
        return jsonify({"error": type(err).__name__, "message": str(err)}), 400
    except NotFoundError as err:
        return jsonify({"error": "NotFoundError", "message": str(err)}), 404


@multibranch_bp.route("/transfers", methods=["GET"])
@login_required
def list_transfers():
    """
    List inter-store transfers with optional store filtering.
    """
    store_id = g.current_user.store_id
    role = g.current_user.role

    query = StockTransfer.query
    # If not owner, filter to transfers where user's store is source or destination
    if role != UserRole.OWNER:
        query = query.filter(
            (StockTransfer.source_store_id == store_id) | (StockTransfer.destination_store_id == store_id)
        )

    transfers = query.order_by(StockTransfer.created_at.desc()).limit(50).all()
    return jsonify({
        "status": "success",
        "data": [t.to_dict() for t in transfers],
    }), 200
