"""
SmartPharm Backend — Prescriptions Domain Service.

Strict adherence to PRD Rules 7, 9, 21, 22, 23, and 26:
- Prescription record persistence linking customer, doctor, and line items
- Pharmacist clinical sign-off and verification workflow
- Dispensing link to active Sale invoice
- Full audit tracking (PRESCRIPTION_UPLOAD, PRESCRIPTION_VERIFY, PRESCRIPTION_ACCESS, PRESCRIPTION_DISPENSE)
- Patient/Doctor lookup and filtering
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from app.extensions import db
from app.models.prescription import Prescription, PrescriptionItem, PrescriptionStatus
from app.models.sale import Sale, Customer
from app.models.medicine import Medicine
from app.services.audit_service import log_audit_event
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _generate_rx_number(store_id: int) -> str:
    """Generate sequential prescription identifier: RX-YYYYMM-XXXX."""
    now = datetime.now(timezone.utc)
    prefix = f"RX-{now.strftime('%Y%m')}-"
    last_rx = (
        Prescription.query.filter(
            Prescription.store_id == store_id,
            Prescription.prescription_number.like(f"{prefix}%"),
        )
        .order_by(Prescription.id.desc())
        .first()
    )

    if last_rx and last_rx.prescription_number:
        try:
            seq = int(last_rx.prescription_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


def create_prescription(
    store_id: int,
    user_id: int,
    data: Dict[str, Any],
    ip_address: Optional[str] = None,
) -> Prescription:
    """
    Persist a new prescription document with clinical line items.
    Initial state: PENDING_VERIFICATION.
    """
    patient_name = data.get("patient_name", "").strip()
    if not patient_name:
        raise ValidationError("Patient name is required.")

    # Check or link customer
    customer_id = data.get("customer_id")
    if not customer_id and data.get("customer_phone"):
        phone = data.get("customer_phone").strip()
        existing_cust = Customer.query.filter_by(store_id=store_id, phone=phone).first()
        if existing_cust:
            customer_id = existing_cust.id
        else:
            new_cust = Customer(
                store_id=store_id,
                name=patient_name,
                phone=phone,
                doctor_name=data.get("doctor_name"),
            )
            db.session.add(new_cust)
            db.session.flush()
            customer_id = new_cust.id

    rx_number = data.get("prescription_number") or _generate_rx_number(store_id)

    # Check for duplicate rx_number in store
    existing_rx = Prescription.query.filter_by(store_id=store_id, prescription_number=rx_number).first()
    if existing_rx:
        rx_number = _generate_rx_number(store_id)

    prescription = Prescription(
        store_id=store_id,
        prescription_number=rx_number,
        customer_id=customer_id,
        doctor_name=data.get("doctor_name", "").strip() or None,
        doctor_reg_number=data.get("doctor_reg_number", "").strip() or None,
        patient_name=patient_name,
        patient_age=data.get("patient_age"),
        patient_gender=data.get("patient_gender"),
        raw_text=data.get("raw_text"),
        image_path=data.get("image_path"),
        status=PrescriptionStatus.PENDING_VERIFICATION,
        notes=data.get("notes"),
    )
    db.session.add(prescription)
    db.session.flush()

    # Process line items
    raw_items = data.get("items", [])
    for item_data in raw_items:
        extracted_name = item_data.get("extracted_name", "").strip()
        if not extracted_name:
            continue

        medicine_id = item_data.get("medicine_id")
        # Validate medicine exists if specified
        if medicine_id:
            med = db.session.get(Medicine, medicine_id)
            if not med:
                medicine_id = None

        item = PrescriptionItem(
            prescription_id=prescription.id,
            medicine_id=medicine_id,
            extracted_name=extracted_name,
            dosage_instructions=item_data.get("dosage_instructions"),
            quantity_prescribed=item_data.get("quantity_prescribed", 1),
            is_available=bool(item_data.get("is_available", True)),
        )
        db.session.add(item)

    db.session.flush()

    # Audit log entry for creation
    log_audit_event(
        store_id=store_id,
        entity_type="prescription",
        entity_id=str(prescription.id),
        action="PRESCRIPTION_UPLOAD",
        reason=f"Uploaded prescription {prescription.prescription_number} for patient {prescription.patient_name}",
        old_values=None,
        new_values=prescription.to_dict(),
        user_id=user_id,
        ip_address=ip_address,
    )

    db.session.commit()
    return prescription


def verify_prescription(
    store_id: int,
    prescription_id: int,
    user_id: int,
    verification_data: Dict[str, Any],
    ip_address: Optional[str] = None,
) -> Prescription:
    """
    Pharmacist clinical sign-off (PRD Rule 9 & 21).
    Validates items, updates matched medicine IDs or instructions, and advances status to VERIFIED.
    """
    prescription = Prescription.query.filter_by(id=prescription_id, store_id=store_id).first()
    if not prescription:
        raise NotFoundError(f"Prescription #{prescription_id} not found in this store.")

    if prescription.status == PrescriptionStatus.DISPENSED:
        raise ConflictError("Cannot modify a prescription that has already been dispensed.")

    old_values = prescription.to_dict()

    # Update doctor / patient info if amended
    if "doctor_name" in verification_data:
        prescription.doctor_name = verification_data["doctor_name"]
    if "doctor_reg_number" in verification_data:
        prescription.doctor_reg_number = verification_data["doctor_reg_number"]
    if "patient_name" in verification_data:
        prescription.patient_name = verification_data["patient_name"]
    if "notes" in verification_data:
        prescription.notes = verification_data["notes"]

    # Update items if provided
    updated_items = verification_data.get("items")
    if updated_items is not None:
        # Replace items with pharmacist-verified items
        PrescriptionItem.query.filter_by(prescription_id=prescription.id).delete()
        db.session.flush()

        for item_data in updated_items:
            extracted_name = item_data.get("extracted_name", "").strip()
            if not extracted_name:
                continue

            medicine_id = item_data.get("medicine_id")
            if medicine_id:
                med = db.session.get(Medicine, medicine_id)
                if not med:
                    medicine_id = None

            item = PrescriptionItem(
                prescription_id=prescription.id,
                medicine_id=medicine_id,
                extracted_name=extracted_name,
                dosage_instructions=item_data.get("dosage_instructions"),
                quantity_prescribed=item_data.get("quantity_prescribed", 1),
                is_available=bool(item_data.get("is_available", True)),
            )
            db.session.add(item)
        db.session.flush()

    prescription.status = PrescriptionStatus.VERIFIED
    prescription.verified_by_user_id = user_id

    db.session.flush()
    new_values = prescription.to_dict()

    # Audit log verification
    log_audit_event(
        store_id=store_id,
        entity_type="prescription",
        entity_id=str(prescription.id),
        action="PRESCRIPTION_VERIFY",
        reason=f"Pharmacist clinical sign-off for prescription {prescription.prescription_number}",
        old_values=old_values,
        new_values=new_values,
        user_id=user_id,
        ip_address=ip_address,
    )

    db.session.commit()
    return prescription


def get_prescriptions(
    store_id: int,
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
) -> Tuple[List[Prescription], int]:
    """List and filter prescriptions for a store."""
    query = Prescription.query.filter(Prescription.store_id == store_id)

    if status:
        try:
            status_enum = PrescriptionStatus(status.lower())
            query = query.filter(Prescription.status == status_enum)
        except ValueError:
            pass

    if customer_id:
        query = query.filter(Prescription.customer_id == customer_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            db.or_(
                Prescription.prescription_number.ilike(term),
                Prescription.patient_name.ilike(term),
                Prescription.doctor_name.ilike(term),
            )
        )

    total = query.count()
    items = (
        query.order_by(Prescription.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return items, total


def get_prescription_detail(
    store_id: int,
    prescription_id: int,
    user_id: int,
    ip_address: Optional[str] = None,
) -> Prescription:
    """
    Retrieve prescription document and emit regulatory audit log (PRD Rule 22 & 23).
    """
    prescription = Prescription.query.filter_by(id=prescription_id, store_id=store_id).first()
    if not prescription:
        raise NotFoundError(f"Prescription #{prescription_id} not found in this store.")

    # Record access audit event per HIPAA / Pharmacy compliance
    log_audit_event(
        store_id=store_id,
        entity_type="prescription",
        entity_id=str(prescription.id),
        action="PRESCRIPTION_ACCESS",
        reason=f"Prescription {prescription.prescription_number} details viewed by user {user_id}",
        old_values=None,
        new_values={"prescription_number": prescription.prescription_number, "patient_name": prescription.patient_name},
        user_id=user_id,
        ip_address=ip_address,
    )
    db.session.commit()

    return prescription


def link_prescription_to_sale(
    store_id: int,
    prescription_id: int,
    sale_id: int,
    user_id: int,
    ip_address: Optional[str] = None,
) -> Prescription:
    """
    Link a verified prescription to a completed Sale invoice and mark as DISPENSED.
    """
    prescription = Prescription.query.filter_by(id=prescription_id, store_id=store_id).first()
    if not prescription:
        raise NotFoundError(f"Prescription #{prescription_id} not found in this store.")

    sale = Sale.query.filter_by(id=sale_id, store_id=store_id).first()
    if not sale:
        raise NotFoundError(f"Sale invoice #{sale_id} not found in this store.")

    old_status = prescription.status.value
    prescription.sale_id = sale.id
    prescription.status = PrescriptionStatus.DISPENSED
    prescription.dispensed_at = datetime.now(timezone.utc)

    db.session.flush()

    log_audit_event(
        store_id=store_id,
        entity_type="prescription",
        entity_id=str(prescription.id),
        action="PRESCRIPTION_DISPENSE",
        reason=f"Prescription {prescription.prescription_number} dispensed against Sale Invoice #{sale.invoice_number}",
        old_values={"status": old_status},
        new_values={"status": prescription.status.value, "sale_id": sale.id, "invoice_number": sale.invoice_number},
        user_id=user_id,
        ip_address=ip_address,
    )
    db.session.commit()

    return prescription
