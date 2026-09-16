"""
SmartPharm Backend — Prescriptions REST API.

Strict adherence to PRD Rules 7, 9, 21, 22, 23, and 26:
- POST /api/prescriptions: Save captured/extracted prescription
- GET /api/prescriptions: Query prescriptions archive with status/search filters
- GET /api/prescriptions/<id>: Detailed prescription view (emits audit access log)
- POST /api/prescriptions/<id>/verify: Pharmacist clinical verification sign-off
- POST /api/prescriptions/<id>/dispense: Mark prescription dispensed against a Sale invoice
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.services.prescription_service import (
    create_prescription,
    verify_prescription,
    get_prescriptions,
    get_prescription_detail,
    link_prescription_to_sale,
)
from app.utils.errors import ValidationError

logger = logging.getLogger(__name__)

prescriptions_bp = Blueprint("prescriptions", __name__, url_prefix="/api/prescriptions")


@prescriptions_bp.route("", methods=["POST"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def save_prescription():
    """Save captured or OCR-extracted prescription."""
    payload = request.get_json()
    if not payload:
        raise ValidationError("Request body is required.")

    store_id = getattr(g, "current_store_id", None) or 1
    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else 1
    ip_address = request.remote_addr

    rx = create_prescription(
        store_id=store_id,
        user_id=user_id,
        data=payload,
        ip_address=ip_address,
    )

    return jsonify({
        "success": True,
        "message": f"Prescription #{rx.prescription_number} saved successfully.",
        "data": rx.to_dict(),
    }), 201


@prescriptions_bp.route("", methods=["GET"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def list_prescriptions():
    """List and filter prescriptions in store archive."""
    store_id = getattr(g, "current_store_id", None) or 1
    status = request.args.get("status")
    customer_id = request.args.get("customer_id", type=int)
    search = request.args.get("search")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    items, total = get_prescriptions(
        store_id=store_id,
        status=status,
        customer_id=customer_id,
        search=search,
        page=page,
        per_page=per_page,
    )

    return jsonify({
        "success": True,
        "data": {
            "items": [item.to_dict() for item in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if total > 0 else 0,
        }
    }), 200


@prescriptions_bp.route("/<int:rx_id>", methods=["GET"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def view_prescription(rx_id: int):
    """Retrieve prescription detail and automatically log regulatory access event."""
    store_id = getattr(g, "current_store_id", None) or 1
    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else 1
    ip_address = request.remote_addr

    rx = get_prescription_detail(
        store_id=store_id,
        prescription_id=rx_id,
        user_id=user_id,
        ip_address=ip_address,
    )

    return jsonify({
        "success": True,
        "data": rx.to_dict(),
    }), 200


@prescriptions_bp.route("/<int:rx_id>/verify", methods=["POST"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
)
def sign_off_prescription(rx_id: int):
    """Pharmacist clinical sign-off and verification (PRD Rule 9 & 21)."""
    payload = request.get_json() or {}
    store_id = getattr(g, "current_store_id", None) or 1
    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else 1
    ip_address = request.remote_addr

    rx = verify_prescription(
        store_id=store_id,
        prescription_id=rx_id,
        user_id=user_id,
        verification_data=payload,
        ip_address=ip_address,
    )

    return jsonify({
        "success": True,
        "message": f"Prescription #{rx.prescription_number} clinically verified by pharmacist.",
        "data": rx.to_dict(),
    }), 200


@prescriptions_bp.route("/<int:rx_id>/dispense", methods=["POST"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def dispense_prescription(rx_id: int):
    """Link verified prescription to a completed Sale invoice."""
    payload = request.get_json() or {}
    sale_id = payload.get("sale_id")
    if not sale_id:
        raise ValidationError("sale_id is required to mark a prescription as dispensed.")

    store_id = getattr(g, "current_store_id", None) or 1
    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else 1
    ip_address = request.remote_addr

    rx = link_prescription_to_sale(
        store_id=store_id,
        prescription_id=rx_id,
        sale_id=sale_id,
        user_id=user_id,
        ip_address=ip_address,
    )

    return jsonify({
        "success": True,
        "message": f"Prescription #{rx.prescription_number} successfully linked to Sale #{sale_id} and marked dispensed.",
        "data": rx.to_dict(),
    }), 200
