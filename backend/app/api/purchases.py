"""
SmartPharm Backend — Purchase & Distributor Invoice API Endpoints.

REST API for distributor invoices, purchase drafts, and human verification
before inventory acceptance per PRD Rule 8 & 11.
"""

from flask import Blueprint, request, jsonify, g

from app.models.user import UserRole
from app.middleware.auth import login_required, role_required
from app.services import purchase_service
from app.utils.errors import ValidationError

purchases_bp = Blueprint("purchases", __name__, url_prefix="/api/purchases")


@purchases_bp.route("", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.INVENTORY_STAFF)
def create_purchase():
    """Create a new distributor invoice draft.

    CRITICAL (PRD Rule 8 & 11): This generates a DRAFT and does NOT mutate inventory.
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    invoice = purchase_service.create_purchase_draft(
        store_id=g.current_store_id,
        user_id=g.current_user.id,
        data=data,
    )
    return jsonify({
        "message": "Purchase invoice draft created successfully.",
        "invoice": purchase_service.serialize_purchase_invoice(invoice, detailed=True),
    }), 201


@purchases_bp.route("", methods=["GET"])
@login_required
def list_purchases():
    """List purchase invoices with status and supplier filters."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    supplier_id = request.args.get("supplier_id", type=int)
    status = request.args.get("status", None)
    start_date = request.args.get("start_date", None)
    end_date = request.args.get("end_date", None)

    result = purchase_service.list_purchase_invoices(
        store_id=g.current_store_id,
        page=page,
        per_page=per_page,
        supplier_id=supplier_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )
    return jsonify(result), 200


@purchases_bp.route("/<int:invoice_id>", methods=["GET"])
@login_required
def get_purchase(invoice_id):
    """Get full purchase invoice details and line items."""
    invoice = purchase_service.get_purchase_invoice(g.current_store_id, invoice_id)
    return jsonify({
        "invoice": purchase_service.serialize_purchase_invoice(invoice, detailed=True),
    }), 200


@purchases_bp.route("/<int:invoice_id>/accept", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.INVENTORY_STAFF)
def accept_purchase(invoice_id):
    """Accept purchase invoice after human review, booking batches and incrementing inventory.

    CRITICAL (PRD Rule 8 & 11): Explicit human confirmation is required to book inventory!
    """
    accept_data = request.get_json(silent=True) or {}
    invoice = purchase_service.accept_purchase_invoice(
        store_id=g.current_store_id,
        invoice_id=invoice_id,
        user_id=g.current_user.id,
        accept_data=accept_data,
    )
    return jsonify({
        "message": f"Purchase invoice {invoice.invoice_number} accepted and inventory updated successfully.",
        "invoice": purchase_service.serialize_purchase_invoice(invoice, detailed=True),
    }), 200


@purchases_bp.route("/<int:invoice_id>/cancel", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def cancel_purchase(invoice_id):
    """Cancel a draft purchase invoice."""
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Cancelled by pharmacy manager")

    invoice = purchase_service.cancel_purchase_invoice(
        store_id=g.current_store_id,
        invoice_id=invoice_id,
        reason=reason,
    )
    return jsonify({
        "message": f"Purchase invoice {invoice.invoice_number} cancelled.",
        "invoice": purchase_service.serialize_purchase_invoice(invoice, detailed=True),
    }), 200
