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
from app.middleware.auth import login_required, role_required
from app.services.auth_service import authenticate_user, create_access_token
from app.utils.errors import ValidationError, ConflictError, NotFoundError


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and return a JWT access token."""
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
    """Return the authenticated user's profile."""
    return jsonify({
        "user": _serialize_user(g.current_user),
    }), 200


@auth_bp.route("/me", methods=["PUT"])
@login_required
def update_current_user():
    """Update current user profile and credentials."""
    user = g.current_user
    data = request.get_json(silent=True) or {}

    if "full_name" in data and data["full_name"].strip():
        user.full_name = data["full_name"].strip()
    if "phone" in data:
        user.phone = data["phone"].strip() or None
    if "password" in data and data["password"]:
        if len(data["password"]) < 8:
            raise ValidationError("Password must be at least 8 characters.")
        user.set_password(data["password"])

    db.session.commit()
    return jsonify({
        "success": True,
        "message": "User profile updated successfully.",
        "user": _serialize_user(user),
    }), 200


@auth_bp.route("/store", methods=["GET"])
@login_required
def get_current_store():
    """Return the authenticated user's pharmacy store details."""
    store = db.session.get(Store, g.current_user.store_id)
    if not store:
        raise NotFoundError("Store not found.")
    return jsonify({
        "success": True,
        "store": _serialize_store(store),
    }), 200


@auth_bp.route("/store", methods=["PUT"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def update_current_store():
    """Update active pharmacy store profile and regulatory credentials."""
    store = db.session.get(Store, g.current_user.store_id)
    if not store:
        raise NotFoundError("Store not found.")

    data = request.get_json(silent=True) or {}
    if "name" in data and data["name"].strip():
        store.name = data["name"].strip()
    if "address" in data:
        store.address = data["address"].strip() or None
    if "phone" in data:
        store.phone = data["phone"].strip() or None
    if "email" in data:
        store.email = data["email"].strip() or None
    if "gstin" in data:
        store.gstin = data["gstin"].strip().upper() or None
    if "drug_license_number" in data:
        store.drug_license_number = data["drug_license_number"].strip() or None

    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Store profile updated successfully.",
        "store": _serialize_store(store),
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


def _serialize_store(store):
    """Serialize a Store object for API responses."""
    return {
        "id": store.id,
        "name": store.name,
        "address": store.address,
        "phone": store.phone,
        "email": store.email,
        "gstin": store.gstin,
        "drug_license_number": store.drug_license_number,
        "is_active": store.is_active,
        "created_at": store.created_at.isoformat() if store.created_at else None,
        "updated_at": store.updated_at.isoformat() if store.updated_at else None,
    }


def _staff_fields(data, creating=False):
    """Validate staff input before any user or audit record is changed."""
    import re
    allowed = {"full_name", "email", "username", "phone", "password", "role", "is_active"}
    if not isinstance(data, dict) or not data or set(data) - allowed:
        raise ValidationError("Provide only staff name, email, username, phone, password, role and active status.")
    fields = {}
    for field, limit in (("full_name", 200), ("email", 200), ("username", 100), ("phone", 20)):
        if field not in data and not (creating and field != "phone"):
            continue
        value = data.get(field, "")
        if field == "phone" and value is None:
            fields[field] = None
            continue
        if not isinstance(value, str) or len(value.strip()) > limit or (field != "phone" and not value.strip()):
            raise ValidationError(f"{field} must be valid text up to {limit} characters.")
        fields[field] = value.strip() or None
    if "email" in fields:
        fields["email"] = fields["email"].lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", fields["email"]):
            raise ValidationError("A valid staff email is required.")
    if "role" in data or creating:
        try:
            fields["role"] = UserRole(data.get("role"))
        except (ValueError, TypeError):
            raise ValidationError("Select a valid staff role.")
        allowed_roles = {UserRole.PHARMACIST, UserRole.CASHIER, UserRole.INVENTORY_STAFF}
        if g.current_user.role == UserRole.OWNER:
            allowed_roles.add(UserRole.MANAGER)
        if fields["role"] not in allowed_roles:
            from app.utils.errors import AuthorizationError
            raise AuthorizationError("You cannot assign this role.")
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise ValidationError("is_active must be a boolean.")
        fields["is_active"] = data["is_active"]
    if "password" in data or creating:
        password = data.get("password")
        if not isinstance(password, str) or len(password) < 8 or len(password.encode("utf-8")) > 72:
            raise ValidationError("Password must be at least 8 characters and at most 72 UTF-8 bytes.")
        fields["password"] = password
    return fields


def _validate_staff_identifiers(fields, user_id=None):
    from sqlalchemy import func
    # Shared with branch provisioning: serialize globally unique logins across
    # this installation's chain, despite the original store-scoped indexes.
    Store.query.order_by(Store.id.asc()).with_for_update().first()
    for field in ("email", "username"):
        if field not in fields:
            continue
        query = User.query.filter(func.lower(getattr(User, field)) == fields[field].lower())
        if user_id is not None:
            query = query.filter(User.id != user_id)
        if query.with_for_update().first():
            raise ConflictError(f"Staff {field} is already in use.")


@auth_bp.route("/users", methods=["GET"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def list_store_staff():
    """List accounts only within the actor's current store."""
    users = User.query.filter_by(store_id=g.current_store_id).order_by(User.full_name.asc(), User.id.asc()).all()
    return jsonify({"users": [_serialize_user(user) for user in users]}), 200


@auth_bp.route("/users", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def create_store_staff():
    from app.services.audit_service import log_audit_event
    fields = _staff_fields(request.get_json(silent=True), creating=True)
    _validate_staff_identifiers(fields)
    password = fields.pop("password")
    try:
        user = User(store_id=g.current_store_id, **fields)
        user.set_password(password)
        db.session.add(user)
        db.session.flush()
        log_audit_event(g.current_store_id, "user", user.id, "STAFF_CREATED", "Store staff account created", user_id=g.current_user.id, new_values={"role": user.role.value, "is_active": user.is_active})
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify({"message": "Staff account created.", "user": _serialize_user(user)}), 201


@auth_bp.route("/users/<int:user_id>", methods=["PATCH"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def update_store_staff(user_id):
    from app.utils.errors import AuthorizationError
    from app.services.audit_service import log_audit_event
    # Use the same lock order as creation and branch provisioning.
    Store.query.order_by(Store.id.asc()).with_for_update().first()
    target = User.query.filter_by(id=user_id, store_id=g.current_store_id).with_for_update().first()
    if target is None:
        raise NotFoundError("Staff member not found in your store.")
    if target.id == g.current_user.id or target.role == UserRole.OWNER:
        raise AuthorizationError("Owner and self accounts cannot be changed through team management.")
    if g.current_user.role == UserRole.MANAGER and target.role == UserRole.MANAGER:
        raise AuthorizationError("Managers cannot change manager accounts.")
    fields = _staff_fields(request.get_json(silent=True))
    _validate_staff_identifiers(fields, target.id)
    previous = {"role": target.role.value, "is_active": target.is_active}
    password = fields.pop("password", None)
    try:
        for field, value in fields.items():
            setattr(target, field, value)
        if password is not None:
            target.set_password(password)
        log_audit_event(g.current_store_id, "user", target.id, "STAFF_UPDATED", "Store staff access or profile updated", user_id=g.current_user.id, old_values=previous, new_values={"role": target.role.value, "is_active": target.is_active, "changed_fields": list(fields) + (["password_reset"] if password else [])})
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify({"message": "Staff account updated.", "user": _serialize_user(target)}), 200

