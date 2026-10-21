"""
SmartPharm - Vision & OCR API Endpoints
Implements camera-first medicine recognition and human-in-the-loop verification.

Routes:
- POST /api/vision/recognize: Full OCR + detection + medicine DB matching pipeline.
- POST /api/vision/quality-check: Fast pre-check for camera focus, glare, and lighting.
- POST /api/vision/verify: Pharmacist verification and approval of extracted medicine data.
"""

import base64
import logging
from typing import Tuple, Optional
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.vision import recognize_medicine_image, decode_image_bytes
from app.vision.quality import assess_image_quality

logger = logging.getLogger(__name__)

vision_bp = Blueprint("vision", __name__, url_prefix="/api/vision")


@vision_bp.route("/stocking/read", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.INVENTORY_STAFF)
def read_stocking_pack():
    from app.vision import _packaging_ocr
    from app.vision.extractor import default_entity_extractor
    from app.utils.errors import ValidationError
    data = request.get_json(silent=True) or {}
    raw = data.get("raw_text", "")
    if not isinstance(raw, str) or len(raw) > 12000:
        raise ValidationError("Packaging text must be at most 12000 characters.")
    quality = None
    if not raw.strip():
        image_bytes, error = _extract_image_bytes_from_request()
        if error or not image_bytes or len(image_bytes) > 12 * 1024 * 1024:
            raise ValidationError(error or "Image exceeds the 12 MB limit.")
        try:
            image = decode_image_bytes(image_bytes)
        except Exception:
            raise ValidationError("Invalid image file.")
        quality = assess_image_quality(image)
        if not quality.is_acceptable:
            return jsonify({"message": " ".join(quality.feedback), "quality": quality.to_dict()}), 422
        ocr = _packaging_ocr(image)
        raw = ocr.full_text
        extracted = default_entity_extractor.extract(ocr)
    else:
        extracted = default_entity_extractor.extract(raw)
    from app.vision.stocking import product_queries
    suggestions = product_queries(raw)
    if suggestions:
        extracted.brand_candidates = list(dict.fromkeys([*suggestions, *extracted.brand_candidates]))[:8]
        extracted.brand_name = suggestions[0]
        # Warning/dosage text can contain a different amount from the product
        # name. Leave conflicting strength empty for explicit pack review.
        import re
        if extracted.strength_inferred or (extracted.strength and re.findall(r"\d+", extracted.strength) != re.findall(r"\d+", suggestions[0])):
            extracted.strength = None
    return jsonify({"raw_text": raw, "extracted": extracted.to_dict(),
                    "quality": quality.to_dict() if quality else None}), 200


@vision_bp.route("/stocking/search", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.INVENTORY_STAFF)
def search_stocking_pack():
    from app.vision.stocking import search
    from app.utils.errors import ValidationError
    data = request.get_json(silent=True) or {}
    query, raw = data.get("query", ""), data.get("raw_text", "")
    if not isinstance(query, str) or not 3 <= len(query.strip()) <= 120:
        raise ValidationError("Enter a medicine name/strength between 3 and 120 characters.")
    if not isinstance(raw, str) or len(raw) > 12000:
        raise ValidationError("Packaging text is too long.")
    return jsonify(search(g.current_store_id, query.strip(), raw, data.get("include_web") is True)), 200


@vision_bp.route("/stocking/confirm", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST)
def confirm_stocking_pack():
    from app.extensions import db
    from app.services import medicine_service, barcode_service
    from app.vision.stocking import remember
    from app.utils.errors import ValidationError
    from app.models.store import Store
    from sqlalchemy import select
    data = request.get_json(silent=True) or {}
    if data.get("confirmed") is not True:
        raise ValidationError("Confirm the medicine, strength and pack against the physical product.")
    query, raw, sources = data.get("query", ""), data.get("raw_text", ""), data.get("source_urls", [])
    if not isinstance(query, str) or not 3 <= len(query.strip()) <= 120 or not isinstance(raw, str) or len(raw) > 12000:
        raise ValidationError("Invalid medicine query or packaging text.")
    if not isinstance(sources, list):
        raise ValidationError("Source URLs must be a list.")
    try:
        db.session.execute(select(Store.id).where(Store.id == g.current_store_id).with_for_update()).scalar_one()
        if data.get("medicine_id"):
            med = medicine_service.get_medicine(g.current_store_id, data["medicine_id"])
        else:
            identity = data.get("medicine") or {}
            if not isinstance(identity, dict):
                raise ValidationError("Enter the confirmed medicine details.")
            allowed = {k: identity[k] for k in ["brand_name", "generic_name", "strength", "manufacturer", "dosage_form"] if k in identity}
            if any(not isinstance(v, str) for v in allowed.values()):
                raise ValidationError("Medicine identity fields must contain text.")
            for field, value in allowed.items():
                maximum = 100 if field == "strength" else 50 if field == "dosage_form" else 300
                if len(value) > maximum:
                    raise ValidationError(f"{field} must be at most {maximum} characters.")
            if not allowed.get("strength", "").strip():
                raise ValidationError("Confirm the medicine strength before saving.")
            if not allowed.get("brand_name", "").strip():
                raise ValidationError("Confirm the medicine name before saving.")
            existing = Medicine.query.filter_by(store_id=g.current_store_id, is_active=True,
                brand_name=allowed["brand_name"].strip(), strength=allowed["strength"].strip()).all()
            existing = [m for m in existing if (m.manufacturer or "").casefold() == allowed.get("manufacturer", "").strip().casefold()
                        and (m.dosage_form.value if m.dosage_form else "") == allowed.get("dosage_form", "")]
            if len(existing) > 1:
                raise ValidationError("Multiple catalog records match. Select the correct existing medicine.")
            med = existing[0] if existing else medicine_service.create_medicine(g.current_store_id, allowed, commit=False)
        if data.get("barcode"):
            barcode_service.link(g.current_store_id, med.id, data["barcode"], commit=False)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    learned = True
    try:
        remember(g.current_store_id, g.current_user.id, med, query.strip(), raw, sources)
    except Exception:
        learned = False
        logger.exception("Medicine saved, but stocking correction memory could not be updated")
    return jsonify({"medicine": medicine_service.serialize_medicine(med), "learning_saved": learned,
                    "message": "Verified identity saved. Add batch, expiry and received quantity in the purchase draft."}), 200


def _extract_image_bytes_from_request() -> Tuple[Optional[bytes], Optional[str]]:
    """Helper to extract image bytes from multipart upload or base64 JSON payload."""
    # 1. Check for file in multipart form-data
    if "image" in request.files:
        file = request.files["image"]
        if file.filename:
            return file.read(), None

    # 2. Check for base64 in JSON payload
    data = request.get_json(silent=True)
    if data and "image_base64" in data:
        raw_b64 = data["image_base64"]
        if "," in raw_b64:
            # Strip data:image/jpeg;base64,... header
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            return base64.b64decode(raw_b64), None
        except Exception as e:
            return None, f"Invalid base64 encoding: {e}"

    if data and "image" in data and isinstance(data["image"], str):
        raw_b64 = data["image"]
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            return base64.b64decode(raw_b64), None
        except Exception as e:
            return None, f"Invalid base64 encoding: {e}"

    return None, "No image provided. Send a multipart 'image' file or 'image_base64' in JSON."


@vision_bp.route("/quality-check", methods=["POST"])
@login_required
def quality_check():
    """
    Fast pre-recognition check to give real-time camera feedback in UI
    (e.g., 'Too blurry', 'Severe foil glare', 'Move closer').
    """
    image_bytes, err = _extract_image_bytes_from_request()
    if err or not image_bytes:
        return jsonify({"status": "error", "message": err or "No image provided"}), 400

    try:
        image = decode_image_bytes(image_bytes)
        assessment = assess_image_quality(image)
        return jsonify({
            "status": "success",
            "data": assessment.to_dict(),
        }), 200
    except Exception as e:
        logger.error(f"Error in quality-check: {e}")
        return jsonify({"status": "error", "message": f"Failed to analyze image: {str(e)}"}), 500


@vision_bp.route("/recognize", methods=["POST"])
@login_required
def recognize_medicine():
    """
    Execute full medicine packaging recognition pipeline.
    Identifies medicine, strength, batch number, expiry date, and matches against DB.
    Enforces PRD Rule 9: Low confidence returns clear guidance rather than guesses.
    """
    image_bytes, err = _extract_image_bytes_from_request()
    if err or not image_bytes:
        return jsonify({"status": "error", "message": err or "No image provided"}), 400

    # Store ID from current authenticated user or query param
    current_user = getattr(g, "current_user", None)
    store_id = None
    if current_user and getattr(current_user, "store_id", None):
        store_id = current_user.store_id
    elif request.args.get("store_id"):
        try:
            store_id = int(request.args.get("store_id"))
        except ValueError:
            pass

    pipeline_result = recognize_medicine_image(image_bytes, store_id=store_id)

    if not pipeline_result.success:
        return jsonify({
            "status": "error",
            "message": pipeline_result.error_message,
            "quality": pipeline_result.quality.to_dict() if pipeline_result.quality else None,
        }), 422

    return jsonify({
        "status": "success",
        "data": pipeline_result.to_dict(),
    }), 200


@vision_bp.route("/verify", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER, UserRole.PHARMACIST)
def verify_recognition():
    """
    Pharmacist Human-in-the-loop verification step.
    Confirms or adjusts medicine candidate, batch, expiry, and quantity
    before pushing into POS cart or Purchase draft.
    """
    data = request.get_json(silent=True) or {}
    medicine_id = data.get("medicine_id")
    if not medicine_id:
        return jsonify({"status": "error", "message": "medicine_id is required for verification."}), 400

    from app.extensions import db
    med = Medicine.query.filter_by(id=medicine_id, store_id=g.current_store_id, is_active=True).first()

    if not med:
        return jsonify({"status": "error", "message": f"Medicine with id {medicine_id} not found."}), 404

    batch_number = (data.get("batch_number") or "").strip()
    expiry_date = data.get("expiry_date")
    quantity = data.get("quantity", 1)
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
        return jsonify({"message": "Quantity must be a positive whole number."}), 400
    if expiry_date:
        from datetime import date
        try:
            date.fromisoformat(expiry_date)
        except (ValueError, TypeError):
            return jsonify({"message": "Expiry must be a valid ISO date."}), 400

    # Check if batch exists
    batch = None
    if batch_number:
        batch = Batch.query.filter(
            Batch.medicine_id == med.id,
            Batch.store_id == g.current_store_id,
            Batch.batch_number.ilike(batch_number),
        ).first()
    if batch and expiry_date and expiry_date != batch.expiry_date.isoformat():
        return jsonify({"message": "Expiry does not match this saved batch."}), 400

    current_user = getattr(g, "current_user", None)
    dosage_val = med.dosage_form.value if hasattr(med.dosage_form, "value") else str(med.dosage_form or "")
    verified_item = {
        "medicine_id": med.id,
        "medicine_name": med.brand_name,
        "generic_name": med.generic_name,
        "strength": med.strength,
        "dosage_form": dosage_val,
        "mrp": float(med.mrp) if med.mrp else None,
        "batch_number": batch_number,
        "batch_id": batch.id if batch else None,
        "expiry_date": expiry_date or (batch.expiry_date.isoformat() if batch and batch.expiry_date else None),
        "is_existing_batch": batch is not None,
        "verified_quantity": quantity,
        "verified_by_user_id": current_user.id if current_user else None,
    }


    return jsonify({
        "status": "success",
        "message": "Medicine verified successfully by pharmacist.",
        "data": verified_item,
    }), 200


@vision_bp.route("/seed-abdm-dataset", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def seed_abdm_dataset():
    """
    Admin endpoint to trigger dataset ingestion from data/ directory
    (ABDM Drug Registry v3 + Indian Medicine Datasets).
    """
    import os
    from app.vision.dataset_loader import load_dataset_directory_into_db

    current_user = getattr(g, "current_user", None)
    store_id = current_user.store_id if current_user and getattr(current_user, "store_id", None) else 1

    data_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data")
    )

    try:
        results = load_dataset_directory_into_db(data_dir, store_id=store_id)
        return jsonify({
            "status": "success",
            "message": f"ABDM & Indian Medicine dataset loaded successfully for store #{store_id}.",
            "data": results,
        }), 200
    except Exception as e:
        logger.error(f"Error seeding dataset: {e}")
        return jsonify({"status": "error", "message": f"Dataset ingestion failed: {str(e)}"}), 500


@vision_bp.route("/handwriting-datasets", methods=["GET"])
@login_required
def list_handwriting_datasets():
    """List available doctor prescription handwriting datasets on local disk."""
    from app.vision.handwriting_evaluator import default_handwriting_evaluator
    datasets = default_handwriting_evaluator.discover_datasets()
    return jsonify({
        "status": "success",
        "data": datasets,
    }), 200


@vision_bp.route("/evaluate-handwriting", methods=["POST"])
@login_required
def evaluate_handwriting():
    """
    Run OCR benchmark evaluation over doctor handwritten prescription dataset.
    Calculates Character Error Rate (CER), string similarity, and database catalog resolution rate.
    """
    data = request.get_json(silent=True) or {}
    dataset_name = data.get("dataset_name", "RxHandBD_BDHandwritten_Merged")
    max_samples = data.get("max_samples", 50)
    split = data.get("split", "train")

    from app.vision.handwriting_evaluator import default_handwriting_evaluator
    eval_results = default_handwriting_evaluator.evaluate_dataset_samples(
        dataset_name=dataset_name,
        max_samples=max_samples,
        split=split,
        store_id=g.current_store_id,
    )

    return jsonify({
        "status": "success",
        "data": eval_results,
    }), 200


@vision_bp.route("/index-prescription-images", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def index_prescription_images():
    """
    Trigger vector indexing of doctor handwritten prescription training images
    into Aiven PostgreSQL pgvector cloud store (medicine_image_vector_embeddings).
    """
    data = request.get_json(silent=True) or {}
    max_images = data.get("max_images", 5000)
    batch_size = data.get("batch_size", 200)

    from app.vision.image_vector_indexer import default_image_vector_indexer
    result = default_image_vector_indexer.index_all_prescription_images(
        max_images=max_images,
        batch_size=batch_size,
    )
    return jsonify(result), 200


@vision_bp.route("/search-image-vector", methods=["POST"])
@login_required
def search_image_vector():
    """
    Query input image (upload or base64) against prescription training image visual vectors
    stored in Aiven PostgreSQL pgvector. Returns top-k visual similarity matches.
    """
    image_bytes, err = _extract_image_bytes_from_request()
    if err or not image_bytes:
        return jsonify({"status": "error", "message": err or "No image provided"}), 400

    top_k = request.args.get("top_k", 5, type=int)

    from app.vision.image_vector_indexer import default_image_vector_indexer
    matches = default_image_vector_indexer.search_similar_images(image_bytes, top_k=top_k)

    return jsonify({
        "status": "success",
        "top_k": top_k,
        "matches": matches,
    }), 200


@vision_bp.route("/ocr-actual-medicines", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def ocr_actual_medicines():
    """
    Trigger PaddleOCR text recognition and entity extraction over actual medicine packaging images
    (data/Medicine_data/). Pushes OCR tokens and embeddings to Aiven PostgreSQL pgvector.
    """
    data = request.get_json(silent=True) or {}
    max_images = data.get("max_images", 500)

    from app.vision.medicine_ocr_trainer import default_medicine_ocr_indexer
    result = default_medicine_ocr_indexer.process_actual_medicine_ocr(max_images=max_images, store_id=g.current_store_id)
    return jsonify(result), 200




