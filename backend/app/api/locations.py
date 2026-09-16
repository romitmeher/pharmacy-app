"""
SmartPharm Backend — Location API Endpoints.

REST API for pharmacy physical layout: shelves, racks, drawers, fridges, counters.
"""

from flask import Blueprint, request, jsonify, g

from app.models.user import UserRole
from app.middleware.auth import login_required, role_required
from app.services import location_service
from app.utils.errors import ValidationError

locations_bp = Blueprint("locations", __name__, url_prefix="/api/locations")


@locations_bp.route("", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def create_location():
    """Create a new physical storage location."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    loc = location_service.create_location(g.current_store_id, data)
    return jsonify({
        "message": "Location created successfully.",
        "location": location_service.serialize_location(loc),
    }), 201


@locations_bp.route("", methods=["GET"])
@login_required
def list_locations():
    """List storage locations for the authenticated store."""
    active_param = request.args.get("is_active", "true")
    is_active = None if active_param.lower() == "all" else active_param.lower() in ("true", "1", "yes")

    locations = location_service.list_locations(g.current_store_id, is_active=is_active)
    return jsonify({
        "count": len(locations),
        "locations": [location_service.serialize_location(l) for l in locations],
    }), 200


@locations_bp.route("/<int:location_id>", methods=["GET"])
@login_required
def get_location(location_id):
    """Get location details and current inventory occupying it."""
    include_inv = request.args.get("include_inventory", "true").lower() in ("true", "1", "yes")
    loc = location_service.get_location(g.current_store_id, location_id)
    return jsonify({
        "location": location_service.serialize_location(loc, include_inventory=include_inv),
    }), 200


@locations_bp.route("/<int:location_id>", methods=["PUT", "PATCH"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def update_location(location_id):
    """Update location name, type, or description."""
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    loc = location_service.update_location(g.current_store_id, location_id, data)
    return jsonify({
        "message": "Location updated successfully.",
        "location": location_service.serialize_location(loc),
    }), 200


@locations_bp.route("/<int:location_id>", methods=["DELETE"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def delete_location(location_id):
    """Deactivate location (blocked if active stock is present)."""
    location_service.delete_location(g.current_store_id, location_id)
    return jsonify({
        "message": f"Location {location_id} deactivated successfully.",
    }), 200
