"""
SmartPharm Backend — User Model.

Users belong to a store and have a role that determines their permissions.
Roles are defined as an enum per the PRD: OWNER, MANAGER, PHARMACIST, CASHIER, INVENTORY_STAFF.
"""

import enum
from app.extensions import db, bcrypt
from datetime import datetime, timezone


class UserRole(enum.Enum):
    """User roles as defined by the SmartPharm PRD."""

    OWNER = "owner"
    MANAGER = "manager"
    PHARMACIST = "pharmacist"
    CASHIER = "cashier"
    INVENTORY_STAFF = "inventory_staff"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(
        db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True
    )
    email = db.Column(db.String(200), nullable=False)
    username = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(200), nullable=False)
    role = db.Column(db.Enum(UserRole), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Unique constraints: email and username must be unique within a store
    __table_args__ = (
        db.UniqueConstraint("store_id", "email", name="uq_user_store_email"),
        db.UniqueConstraint("store_id", "username", name="uq_user_store_username"),
    )

    # Relationships
    store = db.relationship("Store", back_populates="users")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def set_password(self, password):
        """Hash and store the user's password."""
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    def check_password(self, password):
        """Verify a password against the stored hash."""
        return bcrypt.check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f"<User {self.id}: {self.username} ({self.role.value})>"
