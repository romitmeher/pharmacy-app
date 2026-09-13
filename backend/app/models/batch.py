"""
SmartPharm Backend — Batch Model.

A Batch represents a specific manufactured batch of a medicine.
This is the second level of the PRD's critical hierarchy:

    Medicine (permanent identity)
        -> Batch (manufactured batch with expiry, purchase price, MRP)
            -> Inventory (physical stock at a location)

Key design decisions:
- MRP lives on Batch because different batches of the same medicine can have
  different MRPs (common in Indian pharma). Medicine.mrp is the default/display value.
- batch_number + medicine_id + store_id is unique — you can't have two records
  for the same batch of the same medicine in the same store.
"""

from app.extensions import db
from datetime import datetime, timezone


class Batch(db.Model):
    __tablename__ = "batches"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    medicine_id = db.Column(
        db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True
    )
    store_id = db.Column(
        db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True
    )

    # Batch identity
    batch_number = db.Column(db.String(100), nullable=False)
    expiry_date = db.Column(db.Date, nullable=False)
    manufacturing_date = db.Column(db.Date, nullable=True)

    # Pricing for this batch
    purchase_price = db.Column(db.Numeric(10, 2), nullable=True)
    mrp = db.Column(db.Numeric(10, 2), nullable=True)

    # Quantity received when this batch was first added (audit reference)
    quantity_received = db.Column(db.Integer, nullable=False, default=0)

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

    # Unique constraint: one record per batch_number per medicine per store
    __table_args__ = (
        db.UniqueConstraint(
            "medicine_id", "store_id", "batch_number",
            name="uq_batch_medicine_store_number",
        ),
        db.Index("ix_batch_expiry", "store_id", "expiry_date"),
    )

    # Relationships
    medicine = db.relationship("Medicine", back_populates="batches")
    store = db.relationship("Store", back_populates="batches")
    inventory = db.relationship(
        "Inventory", back_populates="batch", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Batch {self.id}: {self.batch_number} exp={self.expiry_date}>"
