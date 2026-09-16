"""
SmartPharm Backend — Inventory Model.

Inventory represents physical stock of a specific batch at a specific location.
This is the third and final level of the PRD's critical hierarchy:

    Medicine (permanent identity)
        -> Batch (manufactured batch)
            -> Inventory (physical stock at a location)

Key design decisions:
- quantity_available tracks sellable stock.
- quantity_reserved tracks stock reserved for pending transactions
  (e.g., an in-progress sale or a pending delivery that hasn't been confirmed).
- location_id is nullable to support "unassigned" inventory (not yet placed on a shelf).
- Unique constraint on (batch_id, store_id, location_id) prevents duplicate
  inventory records for the same batch at the same location.
"""

from app.extensions import db
from datetime import datetime, timezone


class Inventory(db.Model):
    __tablename__ = "inventory"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    batch_id = db.Column(
        db.Integer, db.ForeignKey("batches.id"), nullable=False, index=True
    )
    store_id = db.Column(
        db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True
    )
    location_id = db.Column(
        db.Integer, db.ForeignKey("locations.id"), nullable=True, index=True
    )

    # Stock quantities
    quantity_available = db.Column(db.Integer, nullable=False, default=0)
    quantity_reserved = db.Column(db.Integer, nullable=False, default=0)

    # Last physical count
    last_counted_at = db.Column(db.DateTime, nullable=True)

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

    # One inventory record per batch per store per location
    __table_args__ = (
        db.UniqueConstraint(
            "batch_id", "store_id", "location_id",
            name="uq_inventory_batch_store_location",
        ),
    )

    # Relationships
    batch = db.relationship("Batch", back_populates="inventory")
    store = db.relationship("Store", back_populates="inventory")
    location = db.relationship("Location", back_populates="inventory")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return (
            f"<Inventory {self.id}: batch={self.batch_id} "
            f"qty={self.quantity_available}>"
        )
