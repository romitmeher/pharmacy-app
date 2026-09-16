"""
SmartPharm Backend — Medicine API Endpoints.

REST API for medicine management, ingredient specification, alias management,
and search/matching for POS and camera/OCR workflows.
"""

from flask import Blueprint, request, jsonify, g

from app.models.user import UserRole
from app.middleware.auth import login_required, role_required
from app.services import medicine_service
from app.utils.errors import ValidationError

medicines_bp = Blueprint("medicines", __name__, url_prefix="/api/medicines")


@medicines_bp.route("", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST)
def create_medicine():
    """Create a new medicine with ingredients and aliases.

    Request body (JSON):
        {
            "brand_name": "Augmentin 625 Duo",
            "generic_name": "Amoxycillin and Potassium Clavulanate",
            "manufacturer": "GlaxoSmithKline",
            "strength": "625mg",
            "dosage_form": "tablet",
            "route": "oral",
            "category": "antibiotic",
            "is_prescription_only": true,
            "mrp": 204.50,
            "selling_price": 190.00,
            "hsn_code": "3004",
            "gst_percentage": 12.0,
            "ingredients": [
                {"name": "Amoxicillin", "strength": "500", "unit": "mg"},
                {"name": "Clavulanic Acid", "strength": "125", "unit": "mg"}
            ],
            "aliases": [
                {"alias_name": "Augmentin 625", "alias_type": "brand_variant"},
                {"alias_name": "Amoxyclav 625", "alias_type": "common_name"}
            ]
        }
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    medicine = medicine_service.create_medicine(g.current_store_id, data)
    return jsonify({
        "message": "Medicine created successfully.",
        "medicine": medicine_service.serialize_medicine(medicine, detailed=True),
    }), 201


@medicines_bp.route("", methods=["GET"])
@login_required
def list_medicines():
    """List medicines for the authenticated store with search and pagination.

    Query params:
        page: int (default 1)
        per_page: int (default 20, max 100)
        search: string (searches brand, generic, manufacturer, aliases)
        category: string
        is_prescription_only: bool
        is_active: bool (default true)
    """
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    search = request.args.get("search", None)
    category = request.args.get("category", None)

    rx_only = request.args.get("is_prescription_only", None)
    if rx_only is not None:
        rx_only = rx_only.lower() in ("true", "1", "yes")

    active_arg = request.args.get("is_active", "true")
    is_active = None if active_arg.lower() == "all" else active_arg.lower() in ("true", "1", "yes")

    result = medicine_service.list_medicines(
        store_id=g.current_store_id,
        page=page,
        per_page=per_page,
        search=search,
        category=category,
        is_prescription_only=rx_only,
        is_active=is_active,
    )
    return jsonify(result), 200


@medicines_bp.route("/<int:medicine_id>", methods=["GET"])
@login_required
def get_medicine(medicine_id):
    """Retrieve details of a single medicine."""
    medicine = medicine_service.get_medicine(g.current_store_id, medicine_id)
    return jsonify({
        "medicine": medicine_service.serialize_medicine(medicine, detailed=True),
    }), 200


@medicines_bp.route("/<int:medicine_id>", methods=["PUT", "PATCH"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST)
def update_medicine(medicine_id):
    """Update medicine fields, ingredients, or aliases."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    medicine = medicine_service.update_medicine(g.current_store_id, medicine_id, data)
    return jsonify({
        "message": "Medicine updated successfully.",
        "medicine": medicine_service.serialize_medicine(medicine, detailed=True),
    }), 200


@medicines_bp.route("/<int:medicine_id>", methods=["DELETE"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def delete_medicine(medicine_id):
    """Soft-delete a medicine (marks is_active = False)."""
    medicine_service.delete_medicine(g.current_store_id, medicine_id)
    return jsonify({
        "message": f"Medicine {medicine_id} deactivated successfully.",
    }), 200


@medicines_bp.route("/search", methods=["GET"])
@login_required
def search_medicines():
    """Fast search and OCR match endpoint for packaging recognition and POS."""
    query = request.args.get("q", "").strip()
    limit = request.args.get("limit", 10, type=int)

    results = medicine_service.search_medicines_for_ocr(
        store_id=g.current_store_id,
        query_text=query,
        limit=limit,
    )
    return jsonify({
        "query": query,
        "count": len(results),
        "results": results,
    }), 200
