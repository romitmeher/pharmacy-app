"""
SmartPharm Backend — Supplier API Endpoints.

REST API for medicine distributors and suppliers.
"""

from flask import Blueprint, request, jsonify, g

from app.models.user import UserRole
from app.middleware.auth import login_required, role_required
from app.services import supplier_service
from app.utils.errors import ValidationError

suppliers_bp = Blueprint("suppliers", __name__, url_prefix="/api/suppliers")


@suppliers_bp.route("", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def create_supplier():
    """Create a new distributor / supplier."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    supplier = supplier_service.create_supplier(g.current_store_id, data)
    return jsonify({
        "message": "Supplier created successfully.",
        "supplier": supplier_service.serialize_supplier(supplier),
    }), 201


@suppliers_bp.route("", methods=["GET"])
@login_required
def list_suppliers():
    """List suppliers for the store with search and active filtering."""
    active_param = request.args.get("is_active", "true")
    is_active = None if active_param.lower() == "all" else active_param.lower() in ("true", "1", "yes")
    search = request.args.get("search", None)

    suppliers = supplier_service.list_suppliers(g.current_store_id, is_active=is_active, search=search)
    return jsonify({
        "count": len(suppliers),
        "suppliers": [supplier_service.serialize_supplier(s) for s in suppliers],
    }), 200


@suppliers_bp.route("/<int:supplier_id>", methods=["GET"])
@login_required
def get_supplier(supplier_id):
    """Get single supplier details."""
    supplier = supplier_service.get_supplier(g.current_store_id, supplier_id)
    return jsonify({
        "supplier": supplier_service.serialize_supplier(supplier),
    }), 200


@suppliers_bp.route("/<int:supplier_id>", methods=["PUT", "PATCH"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def update_supplier(supplier_id):
    """Update supplier information."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    supplier = supplier_service.update_supplier(g.current_store_id, supplier_id, data)
    return jsonify({
        "message": "Supplier updated successfully.",
        "supplier": supplier_service.serialize_supplier(supplier),
    }), 200


@suppliers_bp.route("/<int:supplier_id>", methods=["DELETE"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def delete_supplier(supplier_id):
    """Deactivate a supplier."""
    supplier_service.delete_supplier(g.current_store_id, supplier_id)
    return jsonify({
        "message": f"Supplier {supplier_id} deactivated successfully.",
    }), 200
