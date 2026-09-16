"""
SmartPharm Backend — Audit Log Model.

Defines the centralized, immutable AuditLog entity per PRD Rule 7 & 22:
- Tracks inventory adjustments, price changes, discounts, returns,
  stock transfers, shelf cycle reconciliations, and critical actions.
- Preserves old vs new state diffs in JSON.
- Links acting user, pharmacy store, timestamp, and audit justification.
"""

from datetime import datetime, timezone
from app.extensions import db


class AuditLog(db.Model):
    """Immutable audit trail record for consequential pharmacy operations."""
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)

    # Entity classification (e.g., 'inventory', 'sale', 'purchase', 'shelf', 'stock_transfer')
    entity_type = db.Column(db.String(50), nullable=False, index=True)
    entity_id = db.Column(db.String(100), nullable=False, index=True)

    # Consequential action (e.g., 'MANUAL_ADJUSTMENT', 'PRICE_OVERRIDE', 'DISCOUNT_APPLIED', 'CYCLE_COUNT_RECONCILE')
    action = db.Column(db.String(50), nullable=False, index=True)

    # State capture for change diffing
    old_values = db.Column(db.JSON, nullable=True)
    new_values = db.Column(db.JSON, nullable=True)

    # Mandatory operational reason
    reason = db.Column(db.Text, nullable=False)

    # Client context
    ip_address = db.Column(db.String(45), nullable=True)

    # Immutable timestamp
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Relationships
    store = db.relationship("Store", backref="audit_logs")
    user = db.relationship("User", backref="audit_logs")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        """Serialize audit log record to dictionary."""
        return {
            "id": self.id,
            "store_id": self.store_id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else "System",
            "user_role": self.user.role.value if self.user and self.user.role else "system",
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "action": self.action,
            "old_values": self.old_values or {},
            "new_values": self.new_values or {},
            "reason": self.reason,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<AuditLog {self.id}: {self.action} on {self.entity_type}:{self.entity_id} by user {self.user_id}>"
