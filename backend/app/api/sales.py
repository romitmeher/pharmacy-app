"""
SmartPharm Backend — Sales & Billing API Endpoints.

REST API for POS sales, customer management, digital receipt generation,
and product returns / refunds.
"""

from flask import Blueprint, request, jsonify, g

from app.models.user import UserRole
from app.models.sale import Customer
from app.middleware.auth import login_required, role_required
from app.services import sales_service
from app.utils.errors import ValidationError

sales_bp = Blueprint("sales", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# Sales / POS Endpoints
# ---------------------------------------------------------------------------

@sales_bp.route("/sales", methods=["POST"])
@login_required
def create_sale():
    """Create a new sale invoice with FEFO inventory deduction and payments.

    Available to all billing staff: OWNER, MANAGER, PHARMACIST, CASHIER.
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    sale = sales_service.create_sale(
        store_id=g.current_store_id,
        user_id=g.current_user.id,
        data=data,
    )
    return jsonify({
        "message": "Sale completed successfully.",
        "sale": sales_service.serialize_sale(sale, detailed=True),
    }), 201


@sales_bp.route("/sales", methods=["GET"])
@login_required
def list_sales():
    """List sales with pagination, date range, and status filters."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    start_date = request.args.get("start_date", None)
    end_date = request.args.get("end_date", None)
    payment_status = request.args.get("payment_status", None)
    customer_id = request.args.get("customer_id", type=int)

    result = sales_service.list_sales(
        store_id=g.current_store_id,
        page=page,
        per_page=per_page,
        start_date=start_date,
        end_date=end_date,
        payment_status=payment_status,
        customer_id=customer_id,
    )
    return jsonify(result), 200


@sales_bp.route("/sales/<int:sale_id>", methods=["GET"])
@login_required
def get_sale(sale_id):
    """Get detailed sale invoice and printable receipt data."""
    sale = sales_service.get_sale(g.current_store_id, sale_id)
    return jsonify({
        "sale": sales_service.serialize_sale(sale, detailed=True),
    }), 200


@sales_bp.route("/sales/<int:sale_id>/refund", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def refund_sale(sale_id):
    """Process a refund for a sale, restocking items back into batches."""
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "").strip()

    sale = sales_service.refund_sale(
        store_id=g.current_store_id,
        sale_id=sale_id,
        reason=reason,
        user_id=g.current_user.id,
    )
    return jsonify({
        "message": f"Sale {sale.invoice_number} has been refunded and stock restored.",
        "sale": sales_service.serialize_sale(sale, detailed=True),
    }), 200


# ---------------------------------------------------------------------------
# Customer Endpoints
# ---------------------------------------------------------------------------

@sales_bp.route("/customers", methods=["GET"])
@login_required
def list_customers():
    """Search / list customers for the store."""
    search = request.args.get("search", "").strip()
    query = Customer.query.filter_by(store_id=g.current_store_id)

    if search:
        term = f"%{search}%"
        query = query.filter((Customer.name.ilike(term)) | (Customer.phone.ilike(term)))

    customers = query.order_by(Customer.name.asc()).limit(50).all()
    return jsonify({
        "count": len(customers),
        "customers": [sales_service.serialize_customer(c) for c in customers],
    }), 200


@sales_bp.route("/customers", methods=["POST"])
@login_required
def create_customer():
    """Create or update a customer profile."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    customer = sales_service.get_or_create_customer(g.current_store_id, data)
    if not customer:
        raise ValidationError("Customer name or phone is required.")

    return jsonify({
        "message": "Customer saved successfully.",
        "customer": sales_service.serialize_customer(customer),
    }), 201
