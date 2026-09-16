"""
SmartPharm Backend — Operating Expenses & P&L REST API.

Strict compliance with PRD Rules 7, 8, 22, 26, 29, and 30:
- POST /api/expenses: Record an operating expenditure with tender tracking
- GET /api/expenses: List store expenses with filters, totals, and category breakdown
- GET /api/expenses/pnl-summary: Real-time database P&L computing Net Operating Profit
- GET /api/expenses/<id>: Retrieve single expense record
- Strict OWNER and MANAGER role enforcement
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.services.expense_service import (
    record_expense,
    get_expenses,
    get_store_pnl_summary,
)
from app.models.expense import Expense
from app.utils.errors import ValidationError, NotFoundError

logger = logging.getLogger(__name__)

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")


@expenses_bp.route("", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def add_expense():
    """Record a pharmacy operating expenditure."""
    payload = request.get_json()
    if not payload:
        raise ValidationError("Request body is required.")

    store_id = getattr(g, "current_store_id", None) or 1
    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else 1
    ip_address = request.remote_addr

    expense = record_expense(
        store_id=store_id,
        user_id=user_id,
        data=payload,
        ip_address=ip_address,
    )

    return jsonify({
        "success": True,
        "message": f"Expense #{expense.expense_number} recorded successfully.",
        "data": expense.to_dict(),
    }), 201


@expenses_bp.route("", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def list_expenses():
    """List and aggregate store operating expenses."""
    store_id = getattr(g, "current_store_id", None) or 1
    category = request.args.get("category")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    items, total, summary = get_expenses(
        store_id=store_id,
        category=category,
        start_date=start_date,
        end_date=end_date,
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
            "summary": summary,
        }
    }), 200


@expenses_bp.route("/pnl-summary", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def get_pnl():
    """Calculate database-grounded Store Profit & Loss summary."""
    store_id = getattr(g, "current_store_id", None) or 1
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    pnl = get_store_pnl_summary(
        store_id=store_id,
        start_date=start_date,
        end_date=end_date,
    )

    return jsonify({
        "success": True,
        "data": pnl,
    }), 200


@expenses_bp.route("/<int:exp_id>", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def get_expense_detail(exp_id: int):
    """Retrieve details of a single operating expense."""
    store_id = getattr(g, "current_store_id", None) or 1
    exp = Expense.query.filter_by(id=exp_id, store_id=store_id).first()
    if not exp:
        raise NotFoundError(f"Expense #{exp_id} not found in this store.")

    return jsonify({
        "success": True,
        "data": exp.to_dict(),
    }), 200
