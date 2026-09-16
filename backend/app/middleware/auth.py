"""
SmartPharm Backend — Authentication Middleware.

Provides decorators for protecting API endpoints:
- @login_required: Ensures user is authenticated via JWT.
- @role_required: Ensures user has one of the specified roles.

Usage:
    @app.route("/api/medicines")
    @login_required
    def list_medicines():
        # g.current_user is available here
        ...

    @app.route("/api/admin/users")
    @login_required
    @role_required(UserRole.OWNER, UserRole.MANAGER)
    def manage_users():
        ...
"""

from functools import wraps

from flask import g, request

from app.extensions import db
from app.models.user import User
from app.services.auth_service import decode_access_token
from app.utils.errors import AuthenticationError, AuthorizationError


def login_required(f):
    """Decorator that requires a valid JWT in the Authorization header.

    Sets g.current_user to the authenticated User object.
    Sets g.current_store_id to the user's store_id.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            raise AuthenticationError(
                "Missing or malformed Authorization header. "
                "Expected: Bearer <token>"
            )

        token = auth_header[7:]  # Strip "Bearer "
        payload = decode_access_token(token)

        # Load the user from the database to ensure they still exist and are active
        user = db.session.get(User, payload["sub"])
        if user is None or not user.is_active:
            raise AuthenticationError("User account not found or deactivated.")

        # Make user available to the route handler
        g.current_user = user
        g.current_store_id = user.store_id

        return f(*args, **kwargs)

    return decorated


def role_required(*allowed_roles):
    """Decorator that restricts access to users with specific roles.

    Must be used AFTER @login_required (so g.current_user exists).

    Args:
        *allowed_roles: UserRole enum values that are permitted.

    Usage:
        @login_required
        @role_required(UserRole.OWNER, UserRole.MANAGER)
        def admin_endpoint():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, "current_user"):
                raise AuthenticationError("Authentication required.")

            if g.current_user.role not in allowed_roles:
                raise AuthorizationError(
                    "You do not have permission to perform this action. "
                    f"Required role: {', '.join(r.value for r in allowed_roles)}"
                )

            return f(*args, **kwargs)

        return decorated

    return decorator
