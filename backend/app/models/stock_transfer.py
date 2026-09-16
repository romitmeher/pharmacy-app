"""
SmartPharm Backend — Multi-Branch Stock Transfer Models.
Strict compliance with SmartPharm PRD Rule 8, 22, & 25:
- Enables inter-store stock transfers across pharmacy network branches
- Tracks transfer lifecycle: DRAFT -> IN_TRANSIT -> RECEIVED -> CANCELLED
- Atomic transactional inventory boundaries preventing uncontrolled mutations
"""

import enum
from datetime import datetime, timezone
from app.extensions import db


class TransferStatus(enum.Enum):
    """Lifecycle stages of an inter-store stock transfer."""
    DRAFT = "draft"
    IN_TRANSIT = "in_transit"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class StockTransfer(db.Model):
    """Represents an inter-branch transfer order between two physical pharmacy stores."""
    __tablename__ = "stock_transfers"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    transfer_number = db.Column(db.String(50), nullable=False, unique=True, index=True)

    source_store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    destination_store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    status = db.Column(db.Enum(TransferStatus), nullable=False, default=TransferStatus.DRAFT, index=True)

    dispatched_at = db.Column(db.DateTime, nullable=True)
    received_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    source_store = db.relationship("Store", foreign_keys=[source_store_id], backref="transfers_out")
    destination_store = db.relationship("Store", foreign_keys=[destination_store_id], backref="transfers_in")
    created_by = db.relationship("User", backref="created_transfers")
    items = db.relationship("StockTransferItem", back_populates="transfer", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        """Serialize transfer record for API responses."""
        return {
            "id": self.id,
            "transfer_number": self.transfer_number,
            "source_store_id": self.source_store_id,
            "source_store_name": self.source_store.name if self.source_store else None,
            "destination_store_id": self.destination_store_id,
            "destination_store_name": self.destination_store.name if self.destination_store else None,
            "created_by_user_id": self.created_by_user_id,
            "status": self.status.value if self.status else None,
            "dispatched_at": self.dispatched_at.isoformat() if self.dispatched_at else None,
            "received_at": self.received_at.isoformat() if self.received_at else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "items": [item.to_dict() for item in self.items],
        }

    def __repr__(self):
        return f"<StockTransfer {self.id}: {self.transfer_number} ({self.status.value})>"


class StockTransferItem(db.Model):
    """Line item in an inter-store stock transfer."""
    __tablename__ = "stock_transfer_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    transfer_id = db.Column(db.Integer, db.ForeignKey("stock_transfers.id"), nullable=False, index=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"), nullable=False, index=True)

    quantity = db.Column(db.Integer, nullable=False)

    transfer = db.relationship("StockTransfer", back_populates="items")
    medicine = db.relationship("Medicine", backref="transfer_items")
    batch = db.relationship("Batch", backref="transfer_items")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        """Serialize transfer line item for API responses."""
        return {
            "id": self.id,
            "transfer_id": self.transfer_id,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.brand_name if self.medicine else None,
            "strength": self.medicine.strength if self.medicine else None,
            "batch_id": self.batch_id,
            "batch_number": self.batch.batch_number if self.batch else None,
            "expiry_date": self.batch.expiry_date.isoformat() if self.batch and self.batch.expiry_date else None,
            "quantity": self.quantity,
        }

    def __repr__(self):
        return f"<StockTransferItem {self.id}: med={self.medicine_id} batch={self.batch_id} qty={self.quantity}>"
