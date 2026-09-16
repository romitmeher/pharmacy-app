"""
SmartPharm Backend — Authentication Service.

Handles JWT token creation, validation, and user authentication.
Keeps auth business logic out of route handlers.
"""

from datetime import datetime, timedelta, timezone

import jwt
from flask import current_app

from app.extensions import db
from app.models.user import User
from app.utils.errors import AuthenticationError, ValidationError


# Token expiration (hours)
ACCESS_TOKEN_EXPIRY_HOURS = 24


def authenticate_user(email, password, store_id=None):
    """Authenticate a user by email and password.

    Args:
        email: User's email address.
        password: Plain-text password to verify.
        store_id: Optional store_id to scope the lookup. If None,
                  looks up across all stores (single-store for now).

    Returns:
        The authenticated User object.

    Raises:
        AuthenticationError: If credentials are invalid.
        ValidationError: If required fields are missing.
    """
    if not email or not password:
        raise ValidationError("Email and password are required.")

    query = User.query.filter_by(email=email, is_active=True)
    if store_id is not None:
        query = query.filter_by(store_id=store_id)

    user = query.first()

    if user is None or not user.check_password(password):
        raise AuthenticationError("Invalid email or password.")

    # Update last login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    return user


def create_access_token(user):
    """Create a JWT access token for an authenticated user.

    Args:
        user: The User object to create a token for.

    Returns:
        Encoded JWT token string.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "store_id": user.store_id,
        "role": user.role.value,
        "iat": now,
        "exp": now + timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS),
    }
    token = jwt.encode(
        payload,
        current_app.config["SECRET_KEY"],
        algorithm="HS256",
    )
    return token


def decode_access_token(token):
    """Decode and validate a JWT access token.

    Args:
        token: The JWT token string.

    Returns:
        The decoded payload dict with keys: sub, store_id, role.

    Raises:
        AuthenticationError: If the token is invalid or expired.
    """
    try:
        payload = jwt.decode(
            token,
            current_app.config["SECRET_KEY"],
            algorithms=["HS256"],
        )
        # Convert sub back to int for internal use
        payload["sub"] = int(payload["sub"])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise AuthenticationError("Invalid token. Please log in again.")
