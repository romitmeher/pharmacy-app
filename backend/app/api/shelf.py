"""
SmartPharm - Shelf & Location Intelligence REST API Endpoints
Strict compliance with SmartPharm PRD Phase 6:
- GET /api/shelf/layout: Physical store storage planogram and capacity utilization
- GET /api/shelf/locate/<int:medicine_id>: Fast Dispense Locator for counter checkout
- GET /api/shelf/compliance-alerts: Cold-chain safety & storage climate auditing
- POST /api/shelf/audit-count: Shelf-by-shelf cycle count & variance reconciliation
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.models.medicine import Medicine
from app.models.location import Location
from app.shelf import (
    default_planogram_engine,
    default_compliance_auditor,
    default_shelf_audit_engine,
)

logger = logging.getLogger(__name__)

shelf_bp = Blueprint("shelf", __name__, url_prefix="/api/shelf")


@shelf_bp.route("/layout", methods=["GET"])
@login_required
def get_store_layout():
    """
    Physical Planogram Layout API (PRD Phase 6).
    Returns all storage zones, aisles, racks, tiers, and bin occupancies.
    """
    store_id = g.current_user.store_id
    planogram = default_planogram_engine.get_store_planogram(store_id=store_id)
    return jsonify({
        "status": "success",
        "data": planogram,
    }), 200


@shelf_bp.route("/locate/<int:medicine_id>", methods=["GET"])
@login_required
def locate_medicine(medicine_id: int):
    """
    Fast Dispense Locator API (PRD Phase 6).
    Returns physical coordinates, climate zone, and directional picking guide for a medicine.
    """
    store_id = g.current_user.store_id
    medicine = Medicine.query.filter_by(id=medicine_id, store_id=store_id, is_active=True).first()
    if not medicine:
        return jsonify({"error": "NotFoundError", "message": f"Medicine #{medicine_id} not found."}), 404

    pick_locations = default_planogram_engine.locate_medicine_for_dispensing(
        store_id=store_id, medicine_id=medicine_id
    )

    return jsonify({
        "status": "success",
        "data": {
            "medicine_id": medicine.id,
            "brand_name": medicine.brand_name,
            "pick_locations": [pl.to_dict() for pl in pick_locations],
            "total_available_locations": len(pick_locations),
        },
    }), 200


@shelf_bp.route("/compliance-alerts", methods=["GET"])
@login_required
def get_compliance_alerts():
    """
    Storage & Cold-Chain Compliance Auditor API (PRD Phase 6).
    Audits active inventory for temperature mismatches (cold-chain drugs in ambient racks)
    and location capacity overloads.
    """
    store_id = g.current_user.store_id
    alerts = default_compliance_auditor.audit_store_compliance(store_id=store_id)

    critical_count = sum(1 for a in alerts if a.severity.value == "CRITICAL_VIOLATION")
    warning_count = sum(1 for a in alerts if a.severity.value == "WARNING")
    tip_count = sum(1 for a in alerts if a.severity.value == "OPTIMIZATION_TIP")

    return jsonify({
        "status": "success",
        "data": {
            "alerts": [a.to_dict() for a in alerts],
            "summary": {
                "total_alerts": len(alerts),
                "critical_violations": critical_count,
                "warnings": warning_count,
                "optimization_tips": tip_count,
            },
        },
    }), 200


@shelf_bp.route("/audit-count", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.INVENTORY_STAFF, UserRole.PHARMACIST)
def conduct_shelf_audit():
    """
    Shelf Cycle Count & Variance API (PRD Phase 6 & Rule 22).
    Evaluates physical shelf count against database recorded stock.
    Non-destructive preview by default; reconciliation applied only when requested.
    """
    data = request.get_json(silent=True) or {}
    location_id = data.get("location_id")
    scanned_items = data.get("scanned_items", [])
    apply_adjustments = bool(data.get("apply_adjustments", False))
    notes = data.get("notes")

    if not location_id:
        return jsonify({"error": "ValidationError", "message": "location_id is required."}), 400

    store_id = g.current_user.store_id
    user_id = g.current_user.id

    location = Location.query.filter_by(id=location_id, store_id=store_id).first()
    if not location:
        return jsonify({"error": "NotFoundError", "message": f"Location #{location_id} not found."}), 404

    try:
        report = default_shelf_audit_engine.conduct_shelf_audit(
            store_id=store_id,
            location_id=location_id,
            scanned_items=scanned_items,
            user_id=user_id,
            apply_adjustments=apply_adjustments,
            notes=notes,
        )

        return jsonify({
            "status": "success",
            "message": "Shelf cycle count executed successfully.",
            "data": report.to_dict(),
        }), 200
    except Exception as exc:
        logger.exception("Failed to execute shelf cycle count audit")
        return jsonify({"error": "InternalError", "message": str(exc)}), 500
