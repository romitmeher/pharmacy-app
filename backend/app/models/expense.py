"""
SmartPharm Backend — Expenses Model.

Defines the persistent operating Expense entity per PRD Rules 7, 22, 29, and 30:
- Tracks pharmacy overheads: Rent, Utilities/Cold Chain, Salaries, Licensing, Logistics
- Links store, recording user, payment method, vendor, and receipts
- Mandatory for deriving Net Operating Profit on the Owner Dashboard
"""

import enum
from datetime import datetime, timezone, date
from decimal import Decimal
from app.extensions import db


class ExpenseCategory(enum.Enum):
    """Categorization of physical Indian pharmacy operating expenditures."""
    RENT = "rent"
    UTILITIES_POWER = "utilities_power"
    COLD_CHAIN_MAINTENANCE = "cold_chain_maintenance"
    STAFF_SALARY = "staff_salary"
    LICENSING_REGULATORY = "licensing_regulatory"
    LOGISTICS_PACKAGING = "logistics_packaging"
    MARKETING_PROMOTION = "marketing_promotion"
    MISCELLANEOUS = "miscellaneous"


class ExpensePaymentMethod(enum.Enum):
    """Tender method used for paying operating expenditure."""
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CHEQUE = "cheque"
    CREDIT = "credit"


class Expense(db.Model):
    """Operating expense record within a pharmacy store."""
    __tablename__ = "expenses"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    expense_number = db.Column(db.String(50), nullable=False)
    category = db.Column(db.Enum(ExpenseCategory), nullable=False, index=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_method = db.Column(
        db.Enum(ExpensePaymentMethod),
        nullable=False,
        default=ExpensePaymentMethod.BANK_TRANSFER,
    )
    expense_date = db.Column(db.Date, nullable=False, default=date.today, index=True)

    vendor_recipient = db.Column(db.String(200), nullable=True)
    receipt_reference = db.Column(db.String(100), nullable=True)
    receipt_image_path = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint("store_id", "expense_number", name="uq_expense_store_number"),
        db.Index("ix_expense_store_date", "store_id", "expense_date"),
        db.Index("ix_expense_store_category", "store_id", "category"),
    )

    # Relationships
    store = db.relationship("Store", backref="expenses")
    user = db.relationship("User", foreign_keys=[user_id])

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "store_id": self.store_id,
            "expense_number": self.expense_number,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "category": self.category.value,
            "amount": float(self.amount),
            "payment_method": self.payment_method.value,
            "expense_date": self.expense_date.isoformat() if self.expense_date else None,
            "vendor_recipient": self.vendor_recipient,
            "receipt_reference": self.receipt_reference,
            "receipt_image_path": self.receipt_image_path,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Expense {self.id}: {self.expense_number} ({self.category.value}: {self.amount})>"
