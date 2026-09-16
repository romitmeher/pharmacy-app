"""
SmartPharm Backend — Purchase & Distributor Invoice Models.

Implements the PRD Rule 8 & 11 data structures:
- PurchaseInvoice: Distributor invoices supporting a strict two-stage
  lifecycle: Draft -> Human Review -> Acceptance -> Inventory Update.
- PurchaseItem: Individual lines on the invoice tracking invoiced quantity vs.
  physically received quantity and batch booking.
"""

import enum
from datetime import datetime, timezone, date
from app.extensions import db


class PurchaseInvoiceStatus(enum.Enum):
    """Lifecycle status of a distributor purchase invoice."""
    DRAFT = "draft"
    VERIFIED = "verified"
    ACCEPTED = "accepted"
    PARTIAL_ACCEPTED = "partial_accepted"
    CANCELLED = "cancelled"


class PurchaseInvoice(db.Model):
    """Distributor purchase invoice for inventory replenishment."""
    __tablename__ = "purchase_invoices"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    invoice_number = db.Column(db.String(100), nullable=False)
    invoice_date = db.Column(db.Date, nullable=False, default=date.today)

    subtotal = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    discount_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    tax_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)

    status = db.Column(
        db.Enum(PurchaseInvoiceStatus),
        nullable=False,
        default=PurchaseInvoiceStatus.DRAFT,
        index=True,
    )

    verified_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    verified_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint("store_id", "supplier_id", "invoice_number", name="uq_purchase_store_sup_inv"),
        db.Index("ix_purchase_store_date", "store_id", "invoice_date"),
    )

    store = db.relationship("Store", backref="purchase_invoices")
    supplier = db.relationship("Supplier", backref="purchase_invoices")
    created_by = db.relationship("User", foreign_keys=[user_id], backref="created_purchases")
    verified_by = db.relationship("User", foreign_keys=[verified_by_user_id], backref="verified_purchases")
    items = db.relationship("PurchaseItem", back_populates="purchase_invoice", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<PurchaseInvoice {self.id}: {self.invoice_number} status={self.status.value}>"


class PurchaseItem(db.Model):
    """Line item in a distributor purchase invoice."""
    __tablename__ = "purchase_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    purchase_invoice_id = db.Column(
        db.Integer, db.ForeignKey("purchase_invoices.id"), nullable=False, index=True
    )
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True, index=True)

    raw_medicine_name = db.Column(db.String(300), nullable=True)  # Verbatim from invoice or OCR
    batch_number = db.Column(db.String(100), nullable=False)
    expiry_date = db.Column(db.Date, nullable=False)
    manufacturing_date = db.Column(db.Date, nullable=True)

    quantity = db.Column(db.Integer, nullable=False, default=1)  # Quantity on distributor invoice
    received_quantity = db.Column(db.Integer, nullable=False, default=1)  # Physically received

    purchase_rate = db.Column(db.Numeric(10, 2), nullable=False)  # Cost per unit
    mrp = db.Column(db.Numeric(10, 2), nullable=True)
    discount_percentage = db.Column(db.Numeric(5, 2), nullable=False, default=0.0)
    tax_percentage = db.Column(db.Numeric(5, 2), nullable=False, default=0.0)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)

    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"), nullable=True, index=True)
    is_verified = db.Column(db.Boolean, nullable=False, default=False)

    purchase_invoice = db.relationship("PurchaseInvoice", back_populates="items")
    medicine = db.relationship("Medicine", backref="purchase_items")
    batch = db.relationship("Batch", backref="purchase_items")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return (
            f"<PurchaseItem {self.id}: med={self.medicine_id} "
            f"batch={self.batch_number} qty={self.received_quantity}>"
        )
