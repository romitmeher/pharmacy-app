"""
SmartPharm Backend — Medicine Models.

The Medicine model represents a medicine's permanent identity, independent of
any specific batch or physical inventory unit. This is a core PRD distinction:

    Medicine != Batch != Inventory

Supporting models:
- Ingredient: Active ingredients / composition of a medicine.
- MedicineAlias: Alternative names (brand variants, common names, regional names).
- MedicineVisualFeature: Visual characteristics for future CV-based medicine fingerprinting.
"""

import enum
from app.extensions import db
from datetime import datetime, timezone


class DosageForm(enum.Enum):
    """Common pharmaceutical dosage forms."""

    TABLET = "tablet"
    CAPSULE = "capsule"
    SYRUP = "syrup"
    SUSPENSION = "suspension"
    INJECTION = "injection"
    CREAM = "cream"
    OINTMENT = "ointment"
    GEL = "gel"
    DROPS = "drops"
    INHALER = "inhaler"
    POWDER = "powder"
    SUPPOSITORY = "suppository"
    PATCH = "patch"
    SPRAY = "spray"
    LOTION = "lotion"
    SOLUTION = "solution"
    OTHER = "other"


class Medicine(db.Model):
    __tablename__ = "medicines"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(
        db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True
    )

    # Identity
    brand_name = db.Column(db.String(300), nullable=False)
    generic_name = db.Column(db.String(300), nullable=True)
    manufacturer = db.Column(db.String(300), nullable=True)
    strength = db.Column(db.String(100), nullable=True)  # e.g., "500mg", "10mg/5ml"
    dosage_form = db.Column(db.Enum(DosageForm), nullable=True)
    route = db.Column(db.String(50), nullable=True)  # e.g., "oral", "topical"
    category = db.Column(db.String(100), nullable=True)  # e.g., "antibiotic"
    is_prescription_only = db.Column(db.Boolean, default=False, nullable=False)

    # Pricing (default / display values; actual MRP may vary by batch)
    mrp = db.Column(db.Numeric(10, 2), nullable=True)
    selling_price = db.Column(db.Numeric(10, 2), nullable=True)

    # Tax (Indian GST)
    hsn_code = db.Column(db.String(20), nullable=True)
    gst_percentage = db.Column(db.Numeric(5, 2), nullable=True)

    # Storage
    storage_requirements = db.Column(db.String(200), nullable=True)

    # Status
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

    # Indexes for common search patterns
    __table_args__ = (
        db.Index("ix_medicine_brand_name", "store_id", "brand_name"),
        db.Index("ix_medicine_generic_name", "store_id", "generic_name"),
        db.Index("ix_medicine_manufacturer", "store_id", "manufacturer"),
    )

    # Relationships
    store = db.relationship("Store", back_populates="medicines")
    ingredients = db.relationship(
        "Ingredient", back_populates="medicine", cascade="all, delete-orphan"
    )
    aliases = db.relationship(
        "MedicineAlias", back_populates="medicine", cascade="all, delete-orphan"
    )
    visual_features = db.relationship(
        "MedicineVisualFeature", back_populates="medicine", cascade="all, delete-orphan"
    )
    batches = db.relationship("Batch", back_populates="medicine", lazy="dynamic")

    def __repr__(self):
        return f"<Medicine {self.id}: {self.brand_name} {self.strength or ''}>"


class Ingredient(db.Model):
    """Active ingredients / composition of a medicine."""

    __tablename__ = "ingredients"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    medicine_id = db.Column(
        db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True
    )
    name = db.Column(db.String(300), nullable=False)
    strength = db.Column(db.String(100), nullable=True)
    unit = db.Column(db.String(50), nullable=True)

    # Relationships
    medicine = db.relationship("Medicine", back_populates="ingredients")

    def __repr__(self):
        return f"<Ingredient {self.id}: {self.name}>"


class MedicineAlias(db.Model):
    """Alternative names for a medicine (brand variants, common names, regional names).

    Used during medicine matching — OCR output or user input may match an alias
    rather than the canonical brand_name.
    """

    __tablename__ = "medicine_aliases"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    medicine_id = db.Column(
        db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True
    )
    alias_name = db.Column(db.String(300), nullable=False)
    alias_type = db.Column(
        db.String(50), nullable=True
    )  # e.g., "brand_variant", "common_name", "regional"

    # Relationships
    medicine = db.relationship("Medicine", back_populates="aliases")

    def __repr__(self):
        return f"<MedicineAlias {self.id}: {self.alias_name}>"


class MedicineVisualFeature(db.Model):
    """Visual characteristics of a medicine's packaging for CV-based fingerprinting.

    Populated during Phase 2 (Camera) as the system learns to recognize medicines.
    """

    __tablename__ = "medicine_visual_features"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    medicine_id = db.Column(
        db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True
    )
    feature_type = db.Column(
        db.String(50), nullable=False
    )  # e.g., "color", "shape", "logo", "text_pattern"
    feature_value = db.Column(db.Text, nullable=False)
    description = db.Column(db.String(300), nullable=True)

    # Relationships
    medicine = db.relationship("Medicine", back_populates="visual_features")

    def __repr__(self):
        return f"<MedicineVisualFeature {self.id}: {self.feature_type}>"
