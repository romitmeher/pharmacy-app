"""
SmartPharm Backend — Prescriptions Models.

Defines the persistent Prescription entities per PRD Rules 7, 21, 22, 23, and 26:
- Prescription: Header record capturing patient, doctor, image/text, and verification status
- PrescriptionItem: Line items linking extracted medicines, dosages, and availability
"""

import enum
from datetime import datetime, timezone
from app.extensions import db


class PrescriptionStatus(enum.Enum):
    """Clinical verification and dispensing status of a doctor's prescription."""
    PENDING_VERIFICATION = "pending_verification"
    VERIFIED = "verified"
    DISPENSED = "dispensed"
    CANCELLED = "cancelled"


class Prescription(db.Model):
    """Prescription document record with restricted access controls."""
    __tablename__ = "prescriptions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=True, index=True)
    verified_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=True)

    prescription_number = db.Column(db.String(50), nullable=False)
    doctor_name = db.Column(db.String(200), nullable=True)
    doctor_reg_number = db.Column(db.String(100), nullable=True)
    patient_name = db.Column(db.String(200), nullable=False)
    patient_age = db.Column(db.Integer, nullable=True)
    patient_gender = db.Column(db.String(20), nullable=True)

    raw_text = db.Column(db.Text, nullable=True)
    image_path = db.Column(db.String(500), nullable=True)
    status = db.Column(
        db.Enum(PrescriptionStatus),
        nullable=False,
        default=PrescriptionStatus.PENDING_VERIFICATION,
        index=True,
    )
    notes = db.Column(db.Text, nullable=True)
    dispensed_at = db.Column(db.DateTime, nullable=True)

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
        db.UniqueConstraint("store_id", "prescription_number", name="uq_rx_store_number"),
        db.Index("ix_prescription_store_status", "store_id", "status"),
    )

    # Relationships
    store = db.relationship("Store", backref="prescriptions")
    customer = db.relationship("Customer", backref="prescriptions")
    verified_by = db.relationship("User", foreign_keys=[verified_by_user_id])
    sale = db.relationship("Sale", foreign_keys=[sale_id])
    items = db.relationship("PrescriptionItem", back_populates="prescription", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "store_id": self.store_id,
            "prescription_number": self.prescription_number,
            "customer_id": self.customer_id,
            "customer_name": self.customer.name if self.customer else None,
            "doctor_name": self.doctor_name,
            "doctor_reg_number": self.doctor_reg_number,
            "patient_name": self.patient_name,
            "patient_age": self.patient_age,
            "patient_gender": self.patient_gender,
            "raw_text": self.raw_text,
            "image_path": self.image_path,
            "status": self.status.value,
            "verified_by_user_id": self.verified_by_user_id,
            "verified_by_name": self.verified_by.full_name if self.verified_by else None,
            "sale_id": self.sale_id,
            "sale_invoice_number": self.sale.invoice_number if self.sale else None,
            "dispensed_at": self.dispensed_at.isoformat() if self.dispensed_at else None,
            "notes": self.notes,
            "items": [item.to_dict() for item in self.items],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Prescription {self.id}: {self.prescription_number} ({self.status.value})>"


class PrescriptionItem(db.Model):
    """Prescribed medicine line item."""
    __tablename__ = "prescription_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    prescription_id = db.Column(db.Integer, db.ForeignKey("prescriptions.id"), nullable=False, index=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=True, index=True)

    extracted_name = db.Column(db.String(200), nullable=False)
    dosage_instructions = db.Column(db.String(200), nullable=True)
    quantity_prescribed = db.Column(db.Integer, nullable=True, default=1)
    is_available = db.Column(db.Boolean, nullable=False, default=True)

    # Relationships
    prescription = db.relationship("Prescription", back_populates="items")
    medicine = db.relationship("Medicine")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "prescription_id": self.prescription_id,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.brand_name if self.medicine else None,
            "extracted_name": self.extracted_name,
            "dosage_instructions": self.dosage_instructions,
            "quantity_prescribed": self.quantity_prescribed,
            "is_available": self.is_available,
        }

    def __repr__(self):
        return f"<PrescriptionItem {self.id}: {self.extracted_name}>"
