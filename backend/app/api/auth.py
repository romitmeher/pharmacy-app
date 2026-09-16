"""
SmartPharm Backend — Authentication API.

Endpoints:
    POST /api/auth/login     — Authenticate and receive a JWT token.
    GET  /api/auth/me         — Get the current authenticated user's profile.
    POST /api/auth/setup      — Initial store + owner setup (first-time only).
"""

from flask import Blueprint, request, jsonify, g

from app.extensions import db
from app.models.store import Store
from app.models.user import User, UserRole
from app.middleware.auth import login_required
from app.services.auth_service import authenticate_user, create_access_token
from app.utils.errors import ValidationError, ConflictError


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and return a JWT access token.

    Request body:
        {
            "email": "user@pharmacy.com",
            "password": "password123"
        }

    Returns:
        {
            "token": "<jwt_token>",
            "user": { id, email, username, full_name, role, store_id }
        }
    """
    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    email = data.get("email", "").strip()
    password = data.get("password", "")

    user = authenticate_user(email, password)
    token = create_access_token(user)

    return jsonify({
        "token": token,
        "user": _serialize_user(user),
    }), 200


@auth_bp.route("/me", methods=["GET"])
@login_required
def get_current_user():
    """Return the authenticated user's profile.

    Requires: Authorization: Bearer <token>
    """
    return jsonify({
        "user": _serialize_user(g.current_user),
    }), 200


@auth_bp.route("/setup", methods=["POST"])
def initial_setup():
    """One-time store + owner account creation.

    This endpoint is only available when no stores exist in the database.
    Used for first-time setup of the pharmacy system.

    Request body:
        {
            "store": {
                "name": "My Pharmacy",
                "phone": "9876543210",
                "address": "...",
                "gstin": "...",
                "drug_license_number": "..."
            },
            "owner": {
                "email": "owner@pharmacy.com",
                "username": "owner",
                "password": "securepassword",
                "full_name": "Pharmacy Owner",
                "phone": "9876543210"
            }
        }
    """
    # Only allow setup if no stores exist
    if Store.query.first() is not None:
        raise ConflictError(
            "Initial setup has already been completed. "
            "Use the login endpoint instead."
        )

    data = request.get_json(silent=True)
    if not data:
        raise ValidationError("Request body must be JSON.")

    store_data = data.get("store")
    owner_data = data.get("owner")

    if not store_data or not owner_data:
        raise ValidationError("Both 'store' and 'owner' are required.")

    # Validate required store fields
    if not store_data.get("name", "").strip():
        raise ValidationError("Store name is required.")

    # Validate required owner fields
    for field in ("email", "username", "password", "full_name"):
        if not owner_data.get(field, "").strip():
            raise ValidationError(f"Owner {field} is required.")

    if len(owner_data["password"]) < 8:
        raise ValidationError("Password must be at least 8 characters.")

    # Create store
    store = Store(
        name=store_data["name"].strip(),
        address=store_data.get("address", "").strip() or None,
        phone=store_data.get("phone", "").strip() or None,
        email=store_data.get("email", "").strip() or None,
        gstin=store_data.get("gstin", "").strip() or None,
        drug_license_number=store_data.get("drug_license_number", "").strip() or None,
    )
    db.session.add(store)
    db.session.flush()  # Get store.id before creating user

    # Create owner user
    owner = User(
        store_id=store.id,
        email=owner_data["email"].strip(),
        username=owner_data["username"].strip(),
        full_name=owner_data["full_name"].strip(),
        phone=owner_data.get("phone", "").strip() or None,
        role=UserRole.OWNER,
    )
    owner.set_password(owner_data["password"])
    db.session.add(owner)
    db.session.commit()

    # Auto-login after setup
    token = create_access_token(owner)

    return jsonify({
        "message": "Store and owner account created successfully.",
        "token": token,
        "store": {
            "id": store.id,
            "name": store.name,
        },
        "user": _serialize_user(owner),
    }), 201


def _serialize_user(user):
    """Serialize a User object for API responses."""
    return {
        "id": user.id,
        "store_id": user.store_id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role.value,
        "phone": user.phone,
        "is_active": user.is_active,
    }
