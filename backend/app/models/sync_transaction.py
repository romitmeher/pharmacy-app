"""
SmartPharm Backend — Sync Transaction Model.

Implements offline synchronization logging and idempotency tracking per PRD Rule 24:
Local Store (POS Terminal) -> Local Sync Queue -> Cloud Backend -> Central Database

Key design:
- client_tx_id provides strict idempotency: duplicate submissions cannot double-decrement stock.
- payload_json stores the raw transaction for deterministic replay and auditability.
- status tracks lifecycle: PENDING, SYNCED, CONFLICT, FAILED.
"""

import enum
from datetime import datetime, timezone
from app.extensions import db


class SyncStatus(enum.Enum):
    """Synchronization status of an offline transaction."""
    PENDING = "pending"
    SYNCED = "synced"
    CONFLICT = "conflict"
    FAILED = "failed"


class SyncTransaction(db.Model):
    """Represents a transaction generated offline at a store terminal and replayed to cloud MySQL."""
    __tablename__ = "sync_transactions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    # Unique client transaction ID for idempotency (e.g., UUIDv4 or OFFLINE-SALE-...)
    client_tx_id = db.Column(db.String(100), nullable=False, unique=True, index=True)
    tx_type = db.Column(db.String(50), nullable=False, default="OFFLINE_SALE")

    # Serialized JSON payload as submitted by the offline terminal
    payload_json = db.Column(db.Text, nullable=False)

    # Status & Resolution
    status = db.Column(db.Enum(SyncStatus), nullable=False, default=SyncStatus.PENDING, index=True)
    applied_sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=True)
    conflict_reason = db.Column(db.Text, nullable=True)

    # Timestamps
    client_timestamp = db.Column(db.DateTime, nullable=False)
    synced_at = db.Column(db.DateTime, nullable=True)
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
    store = db.relationship("Store", backref="sync_transactions")
    user = db.relationship("User", backref="sync_transactions")
    applied_sale = db.relationship("Sale", backref="sync_origin")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        """Serialize model for API responses."""
        return {
            "id": self.id,
            "store_id": self.store_id,
            "user_id": self.user_id,
            "client_tx_id": self.client_tx_id,
            "tx_type": self.tx_type,
            "status": self.status.value if self.status else None,
            "applied_sale_id": self.applied_sale_id,
            "conflict_reason": self.conflict_reason,
            "client_timestamp": self.client_timestamp.isoformat() if self.client_timestamp else None,
            "synced_at": self.synced_at.isoformat() if self.synced_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<SyncTransaction {self.id}: {self.client_tx_id} status={self.status.value}>"
