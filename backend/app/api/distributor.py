"""
SmartPharm - Distributor Intelligence API Endpoints
Implements distributor invoice scanning, catalog matching, purchase draft generation,
physical delivery verification (PRD Rule 12), and confirmed inventory booking.

Routes:
- POST /api/distributor/scan-invoice: Parse invoice -> Catalog matching -> Create Purchase Draft.
- POST /api/distributor/verify-delivery: Expected vs Actual camera scans -> Discrepancy report.
- POST /api/distributor/confirm-delivery: Human confirmation -> Book batches & commit inventory.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional
from flask import Blueprint, request, jsonify, g

from app.extensions import db
from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus, PurchaseItem
from app.models.supplier import Supplier
from app.models.medicine import Medicine
from app.services import purchase_service
from app.distributor import (
    default_invoice_parser,
    default_catalog_matcher,
    default_delivery_verifier,
    ExpectedItem,
    ActualScannedItem,
)

logger = logging.getLogger(__name__)

distributor_bp = Blueprint("distributor", __name__, url_prefix="/api/distributor")


@distributor_bp.route("/scan-invoice", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.INVENTORY_STAFF)
def scan_distributor_invoice():
    """
    Upload and parse distributor invoice.
    Matches lines to catalog and generates a PURCHASE DRAFT.
    Enforces PRD Rule 8 & 11: Inventory is strictly NOT mutated at this stage.
    """
    store_id = g.current_user.store_id
    raw_text = None

    # Check for text in JSON or multipart upload
    if request.is_json:
        data = request.get_json(silent=True) or {}
        raw_text = data.get("raw_text")

    if not raw_text and "invoice" in request.files:
        file = request.files["invoice"]
        filename = (file.filename or "").lower()
        file_bytes = file.read()

        if filename.endswith(".pdf"):
            parsed = default_invoice_parser.parse_pdf(file_bytes)
        else:
            # Decode image and run text extraction
            import cv2
            import numpy as np
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            from app.vision.ocr_engine import default_ocr_engine
            ocr_res = default_ocr_engine.run_ocr(img)
            parsed = default_invoice_parser.parse_text(ocr_res.full_text)
    elif raw_text:
        parsed = default_invoice_parser.parse_text(raw_text)
    else:
        return jsonify({"error": "ValidationError", "message": "Provide an invoice file or raw_text."}), 400

    # Cross-reference catalog and suppliers
    matched_draft = default_catalog_matcher.match(parsed, store_id=store_id)

    # Resolve or create supplier
    supplier_id = matched_draft.supplier_id
    if not supplier_id:
        # Create unverified supplier record so draft can reference it
        new_sup = Supplier(
            store_id=store_id,
            name=matched_draft.distributor_name,
            gstin=parsed.distributor_gstin,
            is_active=True,
        )
        db.session.add(new_sup)
        db.session.flush()
        supplier_id = new_sup.id

    # Create Purchase Draft in DB
    inv_date = None
    try:
        if matched_draft.invoice_date:
            inv_date = datetime.date.fromisoformat(matched_draft.invoice_date)
    except Exception:
        inv_date = datetime.date.today()

    purchase_invoice = PurchaseInvoice(
        store_id=store_id,
        supplier_id=supplier_id,
        user_id=g.current_user.id,
        invoice_number=matched_draft.invoice_number,
        invoice_date=inv_date or datetime.date.today(),
        status=PurchaseInvoiceStatus.DRAFT,
        subtotal=matched_draft.subtotal,
        discount_amount=matched_draft.discount_amount,
        tax_amount=matched_draft.tax_amount,
        total_amount=matched_draft.total_amount,
    )
    db.session.add(purchase_invoice)
    db.session.flush()

    # Create Purchase Line Items
    for item in matched_draft.items:
        exp_date = None
        try:
            if item.expiry_date:
                exp_date = datetime.date.fromisoformat(item.expiry_date)
        except Exception:
            pass

        p_item = PurchaseItem(
            purchase_invoice_id=purchase_invoice.id,
            medicine_id=item.medicine_id,
            raw_medicine_name=item.raw_item_name,
            batch_number=item.batch_number,
            expiry_date=exp_date or (datetime.date.today() + datetime.timedelta(days=365)),
            quantity=item.quantity,
            received_quantity=item.quantity,  # default expected
            purchase_rate=item.purchase_rate,
            mrp=item.mrp,
            tax_percentage=item.gst_percentage,
            total_amount=item.total_amount,
        )
        db.session.add(p_item)

    db.session.commit()

    return jsonify({
        "status": "success",
        "message": "Purchase invoice draft created successfully. Inventory not mutated.",
        "data": {
            "purchase_invoice_id": purchase_invoice.id,
            "status": purchase_invoice.status.value,
            "invoice_number": purchase_invoice.invoice_number,
            "supplier_id": supplier_id,
            "distributor_name": matched_draft.distributor_name,
            "total_amount": float(purchase_invoice.total_amount),
            "items_count": len(matched_draft.items),
            "matched_draft": matched_draft.to_dict(),
        },
    }), 201


@distributor_bp.route("/verify-delivery", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.INVENTORY_STAFF, UserRole.PHARMACIST)
def verify_delivery():
    """
    Physical Delivery Verification (PRD Rule 12).
    Compares Expected Items (from PurchaseInvoice) against Actual Items (scanned via camera).
    Returns discrepancy audit report without committing inventory.
    """
    data = request.get_json(silent=True) or {}
    purchase_invoice_id = data.get("purchase_invoice_id")
    if not purchase_invoice_id:
        return jsonify({"error": "ValidationError", "message": "purchase_invoice_id is required."}), 400

    invoice = db.session.get(PurchaseInvoice, purchase_invoice_id)
    if not invoice or invoice.store_id != g.current_user.store_id:
        return jsonify({"error": "NotFoundError", "message": "Purchase invoice not found."}), 404

    # Build Expected Items from invoice line items
    expected_items: List[ExpectedItem] = []
    for item in invoice.items:
        med_name = item.raw_medicine_name
        if item.medicine:
            med_name = item.medicine.brand_name

        expected_items.append(
            ExpectedItem(
                item_id=item.id,
                medicine_name=med_name,
                batch_number=item.batch_number,
                expiry_date=item.expiry_date.isoformat() if item.expiry_date else None,
                expected_quantity=item.quantity,
                purchase_rate=float(item.purchase_rate or 0.0),
                mrp=float(item.mrp or 0.0),
            )
        )

    # Build Actual Scanned Items from request body
    actual_scans_raw = data.get("actual_scans", [])
    actual_items: List[ActualScannedItem] = []
    for scan in actual_scans_raw:
        actual_items.append(
            ActualScannedItem(
                medicine_name=scan.get("medicine_name", "").strip(),
                batch_number=scan.get("batch_number", "").strip(),
                expiry_date=scan.get("expiry_date"),
                actual_quantity=int(scan.get("actual_quantity", 1)),
                mrp=float(scan["mrp"]) if scan.get("mrp") else None,
                medicine_id=scan.get("medicine_id"),
            )
        )

    # Run verification engine
    report = default_delivery_verifier.verify(expected_items, actual_items)

    return jsonify({
        "status": "success",
        "purchase_invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "report": report.to_dict(),
    }), 200


@distributor_bp.route("/confirm-delivery", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.INVENTORY_STAFF)
def confirm_delivery():
    """
    Human verification boundary for distributor delivery.
    Confirms verified line items, creates Batch records, and books stock into Inventory.
    """
    data = request.get_json(silent=True) or {}
    purchase_invoice_id = data.get("purchase_invoice_id")
    if not purchase_invoice_id:
        return jsonify({"error": "ValidationError", "message": "purchase_invoice_id is required."}), 400

    invoice = db.session.get(PurchaseInvoice, purchase_invoice_id)
    if not invoice or invoice.store_id != g.current_user.store_id:
        return jsonify({"error": "NotFoundError", "message": "Purchase invoice not found."}), 404

    location_id = data.get("location_id")
    received_items = data.get("received_items")

    # Delegate to domain service for transactional batch booking and inventory update
    accept_data = {
        "default_location_id": location_id,
        "items": received_items or [],
    }
    updated_invoice = purchase_service.accept_purchase_invoice(
        store_id=g.current_user.store_id,
        invoice_id=invoice.id,
        user_id=g.current_user.id,
        accept_data=accept_data,
    )

    return jsonify({
        "status": "success",
        "message": "Delivery verified and booked to inventory successfully.",
        "data": purchase_service.serialize_purchase_invoice(updated_invoice, detailed=True),
    }), 200
