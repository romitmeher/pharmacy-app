"""
SmartPharm Backend — Sales Returns & Refunds Models.

Defines the transactional Return entities per PRD Rule 7, 8, 14, and 22:
- Return: Financial and operational header for a customer return
- ReturnItem: Line items specifying quantity, refund amount, and restock condition
"""

import enum
from datetime import datetime, timezone
from app.extensions import db


class ReturnStatus(enum.Enum):
    """Lifecycle status of a return request."""
    COMPLETED = "completed"
    REJECTED = "rejected"


class RestockCondition(enum.Enum):
    """Physical condition determining inventory restocking behavior (PRD Rule 8 & 14)."""
    RESTOCKED_TO_INVENTORY = "restocked_to_inventory"
    WRITTEN_OFF_DAMAGED = "written_off_damaged"
    DISCARDED_EXPIRED = "discarded_expired"


class Return(db.Model):
    """A customer return record linked to an original POS sale."""
    __tablename__ = "returns"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    return_number = db.Column(db.String(50), nullable=False)
    return_date = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    total_refund_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    refund_method = db.Column(db.String(50), nullable=False, default="cash")  # cash, upi, credit, original_tender
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.Enum(ReturnStatus), nullable=False, default=ReturnStatus.COMPLETED)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint("store_id", "return_number", name="uq_return_store_number"),
        db.Index("ix_return_store_date", "store_id", "return_date"),
    )

    # Relationships
    store = db.relationship("Store", backref="returns")
    sale = db.relationship("Sale", backref="returns")
    user = db.relationship("User", backref="returns")
    items = db.relationship("ReturnItem", back_populates="return_record", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "store_id": self.store_id,
            "sale_id": self.sale_id,
            "sale_invoice_number": self.sale.invoice_number if self.sale else None,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "return_number": self.return_number,
            "return_date": self.return_date.isoformat() if self.return_date else None,
            "total_refund_amount": float(self.total_refund_amount),
            "refund_method": self.refund_method,
            "reason": self.reason,
            "status": self.status.value,
            "items": [item.to_dict() for item in self.items],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Return {self.id}: {self.return_number} for Sale #{self.sale_id}>"


class ReturnItem(db.Model):
    """Line item within a customer return."""
    __tablename__ = "return_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    return_id = db.Column(db.Integer, db.ForeignKey("returns.id"), nullable=False, index=True)
    sale_item_id = db.Column(db.Integer, db.ForeignKey("sale_items.id"), nullable=False, index=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"), nullable=False, index=True)

    quantity_returned = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    refund_amount = db.Column(db.Numeric(10, 2), nullable=False)

    restock_condition = db.Column(
        db.Enum(RestockCondition),
        nullable=False,
        default=RestockCondition.RESTOCKED_TO_INVENTORY,
    )

    # Relationships
    return_record = db.relationship("Return", back_populates="items")
    sale_item = db.relationship("SaleItem")
    medicine = db.relationship("Medicine")
    batch = db.relationship("Batch")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "return_id": self.return_id,
            "sale_item_id": self.sale_item_id,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.brand_name if self.medicine else None,
            "batch_id": self.batch_id,
            "batch_number": self.batch.batch_number if self.batch else None,
            "quantity_returned": self.quantity_returned,
            "unit_price": float(self.unit_price),
            "refund_amount": float(self.refund_amount),
            "restock_condition": self.restock_condition.value,
        }

    def __repr__(self):
        return f"<ReturnItem {self.id}: Med #{self.medicine_id} x{self.quantity_returned}>"
