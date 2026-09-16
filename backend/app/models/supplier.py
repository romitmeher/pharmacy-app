"""
SmartPharm Backend — Supplier Model.

Represents a distributor / supplier from whom the pharmacy purchases medicines.
"""

from app.extensions import db
from datetime import datetime, timezone


class Supplier(db.Model):
    __tablename__ = "suppliers"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(
        db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True
    )
    name = db.Column(db.String(300), nullable=False)
    contact_person = db.Column(db.String(200), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    email = db.Column(db.String(200), nullable=True)
    address = db.Column(db.Text, nullable=True)
    gstin = db.Column(db.String(15), nullable=True)
    drug_license_number = db.Column(db.String(50), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    # Timestamps
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Unique constraint: supplier names should be unique within a store
    __table_args__ = (
        db.UniqueConstraint("store_id", "name", name="uq_supplier_store_name"),
    )

    # Relationships
    store = db.relationship("Store", back_populates="suppliers")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<Supplier {self.id}: {self.name}>"
