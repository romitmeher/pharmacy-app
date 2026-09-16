"""
SmartPharm Backend — Store Model.

Represents a physical pharmacy store.
All transactional data (medicines, batches, inventory, sales, purchases)
is scoped to a store via store_id foreign keys.
"""

from app.extensions import db
from datetime import datetime, timezone


class Store(db.Model):
    __tablename__ = "stores"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(200), nullable=False)
    address = db.Column(db.Text, nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(200), nullable=True)
    gstin = db.Column(db.String(15), nullable=True)  # 15-char Indian GSTIN
    drug_license_number = db.Column(db.String(50), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    users = db.relationship("User", back_populates="store", lazy="dynamic")
    medicines = db.relationship("Medicine", back_populates="store", lazy="dynamic")
    batches = db.relationship("Batch", back_populates="store", lazy="dynamic")
    inventory = db.relationship("Inventory", back_populates="store", lazy="dynamic")
    locations = db.relationship("Location", back_populates="store", lazy="dynamic")
    suppliers = db.relationship("Supplier", back_populates="store", lazy="dynamic")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<Store {self.id}: {self.name}>"
