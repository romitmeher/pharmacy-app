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
@role_required(UserRole.OWNER, UserRole.MANAGER)
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
@role_required(UserRole.OWNER, UserRole.MANAGER)
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
@role_required(UserRole.OWNER, UserRole.MANAGER)
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


@multibranch_bp.route("/stores", methods=["POST"])
@login_required
@role_required(UserRole.OWNER)
def provision_branch():
    """Create a branch and its initial manager in this installation's chain."""
    import re
    from sqlalchemy import func
    from app.extensions import db
    from app.models.store import Store
    from app.models.user import User
    from app.services.audit_service import log_audit_event

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    store_data = payload.get("store")
    manager_data = payload.get("manager")
    if not isinstance(store_data, dict) or not isinstance(manager_data, dict):
        raise ValidationError("Both store and manager objects are required.")

    def text(data, field, limit, required=False):
        value = data.get(field, "")
        if value is None and not required:
            return None
        if not isinstance(value, str):
            raise ValidationError(f"{field} must be text.")
        value = value.strip()
        if required and not value:
            raise ValidationError(f"{field} is required.")
        if len(value) > limit:
            raise ValidationError(f"{field} must be at most {limit} characters.")
        return value or None

    fields = {
        "name": text(store_data, "name", 200, required=True),
        "address": text(store_data, "address", 2000),
        "phone": text(store_data, "phone", 20),
        "gstin": text(store_data, "gstin", 15),
        "drug_license_number": text(store_data, "drug_license_number", 50),
    }
    if fields["gstin"] and not re.fullmatch(r"[0-9A-Z]{15}", fields["gstin"]):
        raise ValidationError("GSTIN must contain 15 uppercase letters or digits.")
    email = text(manager_data, "email", 200, required=True).lower()
    username = text(manager_data, "username", 100, required=True)
    full_name = text(manager_data, "full_name", 200, required=True)
    phone = text(manager_data, "phone", 20)
    password = manager_data.get("password")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValidationError("A valid manager email address is required.")
    if not isinstance(password, str) or len(password) < 8 or len(password.encode("utf-8")) > 72:
        raise ValidationError("Manager password must be at least 8 characters and at most 72 UTF-8 bytes.")

    # One installation is one pharmacy chain. Serialize branch provisioning so
    # global login identifiers remain unambiguous despite store-scoped indexes.
    Store.query.order_by(Store.id.asc()).with_for_update().first()
    if User.query.filter(func.lower(User.email) == email).with_for_update().first():
        raise ConflictError("Manager email is already in use. Choose a unique login email.")
    if User.query.filter(func.lower(User.username) == username.lower()).with_for_update().first():
        raise ConflictError("Manager username is already in use.")

    try:
        store = Store(**fields)
        db.session.add(store)
        db.session.flush()
        manager = User(store_id=store.id, email=email, username=username, full_name=full_name, phone=phone, role=UserRole.MANAGER)
        manager.set_password(password)
        db.session.add(manager)
        db.session.flush()
        log_audit_event(
            store_id=g.current_store_id, user_id=g.current_user.id,
            entity_type="store", entity_id=store.id, action="BRANCH_CREATED",
            reason="Owner provisioned branch and initial manager account",
            new_values={"store_id": store.id, "name": store.name, "manager_user_id": manager.id},
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify({
        "status": "success",
        "data": {"id": store.id, "name": store.name, "manager_user_id": manager.id, "manager_email": manager.email},
        "message": "Branch and manager created. The manager can now sign in at this branch.",
    }), 201
