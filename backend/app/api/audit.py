"""
SmartPharm Backend — Audit Trail REST API.

Provides immutable compliance and operational audit log access
strictly restricted to OWNER and MANAGER roles per PRD Rule 22 & 26:
- GET /api/audit-logs: Filterable, paginated audit records
- GET /api/audit-logs/summary: Executive audit metrics
- GET /api/audit-logs/<id>: Detailed audit log entry with change diff
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.models.audit_log import AuditLog
from app.services.audit_service import (
    get_audit_logs,
    get_audit_summary_metrics,
)
from app.utils.errors import NotFoundError

logger = logging.getLogger(__name__)

audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit-logs")


@audit_bp.route("", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def list_audit_logs():
    """
    Query immutable pharmacy audit trail records.
    Filterable by entity_type, action, user_id, search term, and date range.
    """
    store_id = request.args.get("store_id", type=int) or getattr(g, "current_store_id", None) or 1
    entity_type = request.args.get("entity_type")
    action = request.args.get("action")
    user_id = request.args.get("user_id", type=int)
    search = request.args.get("search")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    logs, total_count, total_pages = get_audit_logs(
        store_id=store_id,
        entity_type=entity_type,
        action=action,
        user_id=user_id,
        search=search,
        start_date=start_date,
        end_date=end_date,
        page=page,
        per_page=per_page,
    )

    return jsonify({
        "success": True,
        "data": [log.to_dict() for log in logs],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total_count": total_count,
            "total_pages": total_pages,
        },
    }), 200


@audit_bp.route("/summary", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def audit_summary():
    """
    Retrieve summary audit counts and recent variance activities.
    """
    store_id = request.args.get("store_id", type=int) or getattr(g, "current_store_id", None) or 1
    metrics = get_audit_summary_metrics(store_id=store_id)
    return jsonify({
        "success": True,
        "data": metrics,
    }), 200


@audit_bp.route("/<int:log_id>", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def get_audit_detail(log_id: int):
    """
    Retrieve a specific audit event with full state diff.
    """
    store_id = request.args.get("store_id", type=int) or getattr(g, "current_store_id", None) or 1
    log_entry = AuditLog.query.filter_by(id=log_id, store_id=store_id).first()

    if not log_entry:
        raise NotFoundError(f"Audit log #{log_id} not found.")

    return jsonify({
        "success": True,
        "data": log_entry.to_dict(),
    }), 200
