"""
SmartPharm Backend — Supplier Service.

Business logic for managing pharmaceutical distributors and suppliers.
"""

from app.extensions import db
from app.models.supplier import Supplier
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def create_supplier(store_id: int, data: dict) -> Supplier:
    """Create a new supplier/distributor for a store."""
    if not data:
        raise ValidationError("Request data cannot be empty.")

    name = data.get("name", "").strip()
    if not name:
        raise ValidationError("Supplier name is required.")

    # Unique check within store
    existing = Supplier.query.filter_by(store_id=store_id, name=name).first()
    if existing:
        raise ConflictError(f"Supplier '{name}' already exists in this store.")

    supplier = Supplier(
        store_id=store_id,
        name=name,
        contact_person=data.get("contact_person", "").strip() or None,
        phone=data.get("phone", "").strip() or None,
        email=data.get("email", "").strip() or None,
        address=data.get("address", "").strip() or None,
        gstin=data.get("gstin", "").strip() or None,
        drug_license_number=data.get("drug_license_number", "").strip() or None,
        is_active=True,
    )
    db.session.add(supplier)
    db.session.commit()
    return supplier


def get_supplier(store_id: int, supplier_id: int, include_inactive: bool = False) -> Supplier:
    """Retrieve a supplier by ID within a store."""
    query = Supplier.query.filter_by(id=supplier_id, store_id=store_id)
    if not include_inactive:
        query = query.filter_by(is_active=True)

    supplier = query.first()
    if not supplier:
        raise NotFoundError(f"Supplier with ID {supplier_id} not found.")
    return supplier


def list_suppliers(store_id: int, is_active: bool = True, search: str = None) -> list:
    """List suppliers for a store, with optional search and active filtering."""
    query = Supplier.query.filter_by(store_id=store_id)
    if is_active is not None:
        query = query.filter_by(is_active=is_active)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Supplier.name.ilike(term))
            | (Supplier.contact_person.ilike(term))
            | (Supplier.phone.ilike(term))
        )

    return query.order_by(Supplier.name.asc()).all()


def update_supplier(store_id: int, supplier_id: int, data: dict) -> Supplier:
    """Update supplier fields."""
    supplier = get_supplier(store_id, supplier_id, include_inactive=True)

    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            raise ValidationError("Supplier name cannot be empty.")
        if new_name != supplier.name:
            existing = Supplier.query.filter_by(store_id=store_id, name=new_name).first()
            if existing:
                raise ConflictError(f"Supplier '{new_name}' already exists.")
            supplier.name = new_name

    if "contact_person" in data:
        supplier.contact_person = data["contact_person"].strip() or None

    if "phone" in data:
        supplier.phone = data["phone"].strip() or None

    if "email" in data:
        supplier.email = data["email"].strip() or None

    if "address" in data:
        supplier.address = data["address"].strip() or None

    if "gstin" in data:
        supplier.gstin = data["gstin"].strip() or None

    if "drug_license_number" in data:
        supplier.drug_license_number = data["drug_license_number"].strip() or None

    if "is_active" in data:
        supplier.is_active = bool(data["is_active"])

    db.session.commit()
    return supplier


def delete_supplier(store_id: int, supplier_id: int) -> None:
    """Soft-delete a supplier."""
    supplier = get_supplier(store_id, supplier_id)
    supplier.is_active = False
    db.session.commit()


def serialize_supplier(supplier: Supplier) -> dict:
    """Serialize Supplier model to dictionary."""
    return {
        "id": supplier.id,
        "store_id": supplier.store_id,
        "name": supplier.name,
        "contact_person": supplier.contact_person,
        "phone": supplier.phone,
        "email": supplier.email,
        "address": supplier.address,
        "gstin": supplier.gstin,
        "drug_license_number": supplier.drug_license_number,
        "is_active": supplier.is_active,
        "created_at": supplier.created_at.isoformat() if supplier.created_at else None,
        "updated_at": supplier.updated_at.isoformat() if supplier.updated_at else None,
    }
