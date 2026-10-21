"""
SmartPharm Backend — Sales Returns & Refunds REST API.

Strict compliance with PRD Rules 7, 8, 14, and 22:
- GET /api/returns/eligible-items/<sale_id>: Fetch returnable line items
- POST /api/returns: Submit customer return with restocking vs write-off decisions
- GET /api/returns: List store return transactions
- GET /api/returns/<id>: Detailed return view
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.services.sale_return_service import (
    get_eligible_return_items,
    create_sale_return,
    get_sale_returns,
    get_sale_return_detail,
)
from app.utils.errors import ValidationError

logger = logging.getLogger(__name__)

returns_bp = Blueprint("returns", __name__, url_prefix="/api/returns")


@returns_bp.route("/eligible-items/<sale_reference>", methods=["GET"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def fetch_eligible_return_items(sale_reference: str):
    """Fetch original sale items and eligible remaining returnable quantities."""
    store_id = getattr(g, "current_store_id", None) or 1
    from app.models.sale import Sale
    from app.utils.errors import NotFoundError
    if sale_reference.isdigit():
        sale_id = int(sale_reference)
    else:
        sale = Sale.query.filter_by(store_id=store_id, invoice_number=sale_reference).first()
        if sale is None:
            raise NotFoundError("Invoice not found in this store.")
        sale_id = sale.id
    data = get_eligible_return_items(store_id=store_id, sale_id=sale_id)
    return jsonify({
        "success": True,
        "data": data,
    }), 200


@returns_bp.route("", methods=["POST"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def process_return():
    """
    Process a customer return in an atomic transaction:
    Restocks valid inventory, calculates refund amounts, updates sale status,
    and creates an immutable audit trail entry.
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be valid JSON.")

    sale_id = data.get("sale_id")
    items = data.get("items", [])
    refund_method = data.get("refund_method", "cash")
    reason = data.get("reason", "")

    if not sale_id:
        raise ValidationError("sale_id is required.")

    store_id = getattr(g, "current_store_id", None) or 1
    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else 1

    return_record = create_sale_return(
        store_id=store_id,
        sale_id=int(sale_id),
        user_id=user_id,
        items_data=items,
        refund_method=refund_method,
        reason=reason,
    )

    return jsonify({
        "success": True,
        "message": f"Return #{return_record.return_number} processed successfully.",
        "data": return_record.to_dict(),
    }), 201


@returns_bp.route("", methods=["GET"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def list_returns():
    """List historical customer return invoices."""
    store_id = getattr(g, "current_store_id", None) or 1
    sale_id = request.args.get("sale_id", type=int)
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    returns, total_count, total_pages = get_sale_returns(
        store_id=store_id,
        sale_id=sale_id,
        page=page,
        per_page=per_page,
    )

    return jsonify({
        "success": True,
        "data": [ret.to_dict() for ret in returns],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total_count": total_count,
            "total_pages": total_pages,
        },
    }), 200


@returns_bp.route("/<int:return_id>", methods=["GET"])
@login_required
@role_required(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
)
def get_return(return_id: int):
    """Retrieve detailed return record."""
    store_id = getattr(g, "current_store_id", None) or 1
    ret = get_sale_return_detail(store_id=store_id, return_id=return_id)
    return jsonify({
        "success": True,
        "data": ret.to_dict(),
    }), 200
