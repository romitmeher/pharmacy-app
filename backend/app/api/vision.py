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
    med = db.session.get(Medicine, medicine_id)

    if not med:
        return jsonify({"status": "error", "message": f"Medicine with id {medicine_id} not found."}), 404

    batch_number = (data.get("batch_number") or "").strip()
    expiry_date = data.get("expiry_date")
    quantity = data.get("quantity", 1)

    # Check if batch exists
    batch = None
    if batch_number:
        batch = Batch.query.filter(
            Batch.medicine_id == med.id,
            Batch.batch_number.ilike(batch_number),
        ).first()

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




