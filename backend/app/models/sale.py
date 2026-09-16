"""
SmartPharm Backend — Sales & Billing Models.

Defines the transactional sales entities per PRD Rule 7 & 14:
- Customer: Pharmacy customers / patients
- Sale: POS invoices with financial totals and audit tracking
- SaleItem: Line items linking Medicine -> Batch -> Quantity sold
- Payment: Tender transactions (Cash, UPI, Card, Credit, split payments)
"""

import enum
from datetime import datetime, timezone, date
from app.extensions import db


class PaymentMethod(enum.Enum):
    """Payment methods supported at the pharmacy counter."""
    CASH = "cash"
    UPI = "upi"
    CARD = "card"
    CREDIT = "credit"
    OTHER = "other"


class PaymentStatus(enum.Enum):
    """Lifecycle status of a sale's payment."""
    PAID = "paid"
    PARTIAL = "partial"
    UNPAID = "unpaid"
    REFUNDED = "refunded"


class Customer(db.Model):
    """Customer / patient record within a pharmacy store."""
    __tablename__ = "customers"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)

    name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(20), nullable=True, index=True)
    email = db.Column(db.String(200), nullable=True)
    address = db.Column(db.Text, nullable=True)
    doctor_name = db.Column(db.String(200), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.Index("ix_customer_store_phone", "store_id", "phone"),
    )

    store = db.relationship("Store", backref="customers")
    sales = db.relationship("Sale", back_populates="customer")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<Customer {self.id}: {self.name} {self.phone or ''}>"


class Sale(db.Model):
    """A completed or pending POS sale / invoice."""
    __tablename__ = "sales"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True, index=True)

    invoice_number = db.Column(db.String(50), nullable=False)
    sale_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    subtotal = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    discount_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    tax_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.0)

    payment_status = db.Column(db.Enum(PaymentStatus), nullable=False, default=PaymentStatus.PAID)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint("store_id", "invoice_number", name="uq_sale_store_invoice"),
        db.Index("ix_sale_store_date", "store_id", "sale_date"),
    )

    store = db.relationship("Store", backref="sales")
    user = db.relationship("User", backref="sales")
    customer = db.relationship("Customer", back_populates="sales")
    items = db.relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    payments = db.relationship("Payment", back_populates="sale", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<Sale {self.id}: {self.invoice_number} total={self.total_amount}>"


class SaleItem(db.Model):
    """Line item in a sale invoice linking Medicine and Batch to Quantity."""
    __tablename__ = "sale_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False, index=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"), nullable=False, index=True)

    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)  # Selling price / MRP per unit
    discount_percentage = db.Column(db.Numeric(5, 2), nullable=False, default=0.0)
    tax_percentage = db.Column(db.Numeric(5, 2), nullable=False, default=0.0)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)

    sale = db.relationship("Sale", back_populates="items")
    medicine = db.relationship("Medicine", backref="sale_items")
    batch = db.relationship("Batch", backref="sale_items")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<SaleItem {self.id}: med={self.medicine_id} batch={self.batch_id} qty={self.quantity}>"


class Payment(db.Model):
    """Payment transaction recorded against a sale."""
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False, index=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)

    payment_method = db.Column(db.Enum(PaymentMethod), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    transaction_reference = db.Column(db.String(100), nullable=True)
    payment_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    sale = db.relationship("Sale", back_populates="payments")
    store = db.relationship("Store", backref="payments")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def __repr__(self):
        return f"<Payment {self.id}: {self.payment_method.value} amount={self.amount}>"
