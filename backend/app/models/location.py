"""
SmartPharm Backend — Location Model.

Represents a physical location within a store (shelf, rack, drawer, fridge, counter).
Used for shelf/location intelligence — knowing WHERE medicines are stored.
"""

import enum
from app.extensions import db
from datetime import datetime, timezone


class LocationType(enum.Enum):
    """Types of physical storage locations within a pharmacy."""

    SHELF = "shelf"
    RACK = "rack"
    DRAWER = "drawer"
    FRIDGE = "fridge"
    COUNTER = "counter"
    OTHER = "other"


class Location(db.Model):
    __tablename__ = "locations"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(
        db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True
    )
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(300), nullable=True)
    location_type = db.Column(db.Enum(LocationType), nullable=False)
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

    # Unique constraint: location names must be unique within a store
    __table_args__ = (
        db.UniqueConstraint("store_id", "name", name="uq_location_store_name"),
    )

    # Relationships
    store = db.relationship("Store", back_populates="locations")
    inventory = db.relationship("Inventory", back_populates="location", lazy="dynamic")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<Location {self.id}: {self.name} ({self.location_type.value})>"
