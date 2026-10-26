"""
SmartPharm - AI & RAG Copilot REST API Endpoints
Routes:
- POST /api/ai/copilot/query: Grounded RAG queries (PRD Rule 19)
- GET /api/ai/alternatives/<int:medicine_id>: Decision support alternatives (PRD Rule 20)
- POST /api/ai/prescription/scan: Prescription OCR & availability checking (PRD Rule 21)
"""

import base64
import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.ai import (
    default_rag_engine,
    default_alternative_matcher,
    default_prescription_scanner,
)

logger = logging.getLogger(__name__)

ai_bp = Blueprint("ai", __name__, url_prefix="/api/ai")


import time
from app.services.ai_interaction_service import (
    log_ai_interaction,
    record_feedback,
    get_interaction_history,
)

@ai_bp.route("/copilot/query", methods=["POST"])
@login_required
def copilot_query():
    """
    Grounded RAG Pharmacy Copilot Query (PRD Rule 19).
    Answers questions strictly grounded in the store's MySQL database.
    Persists interaction for auditability and quality evaluation (PRD Rule 7 & 19).
    """
    data = request.get_json(silent=True) or {}
    query_text = (data.get("query") or "").strip()

    if not query_text:
        return jsonify({"error": "ValidationError", "message": "query is required."}), 400

    store_id = g.current_user.store_id
    session_id = data.get("session_id")

    t0 = time.perf_counter()
    response = default_rag_engine.answer_query(query_text, store_id=store_id)
    latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)

    resp_dict = response.to_dict()

    user_id = g.current_user.id if hasattr(g, "current_user") and g.current_user else None
    interaction = log_ai_interaction(
        store_id=store_id,
        user_id=user_id,
        session_id=session_id,
        user_query=query_text,
        detected_intent=resp_dict.get("intent"),
        response_text=resp_dict.get("answer"),
        retrieved_context=resp_dict.get("retrieved_context"),
        citations=resp_dict.get("citations"),
        latency_ms=latency_ms,
    )
    resp_dict["interaction_id"] = interaction.id
    resp_dict["session_id"] = interaction.session_id

    return jsonify({
        "status": "success",
        "data": resp_dict,
    }), 200


@ai_bp.route("/copilot/feedback/<int:interaction_id>", methods=["POST"])
@login_required
def submit_feedback(interaction_id: int):
    """Record pharmacist clinical feedback (helpful / unhelpful) for an AI Copilot response."""
    data = request.get_json(silent=True) or {}
    is_helpful = data.get("is_helpful")
    if is_helpful is None:
        return jsonify({"error": "ValidationError", "message": "is_helpful boolean is required."}), 400

    store_id = g.current_user.store_id
    feedback_notes = data.get("feedback_notes")

    interaction = record_feedback(
        interaction_id=interaction_id,
        store_id=store_id,
        is_helpful=bool(is_helpful),
        feedback_notes=feedback_notes,
    )

    return jsonify({
        "status": "success",
        "message": "Feedback recorded successfully.",
        "data": interaction.to_dict(),
    }), 200


@ai_bp.route("/copilot/history", methods=["GET"])
@login_required
def get_copilot_history():
    """Retrieve historical AI Copilot interactions for the active store."""
    store_id = g.current_user.store_id
    session_id = request.args.get("session_id")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 25, type=int), 100)

    items, total = get_interaction_history(
        store_id=store_id,
        session_id=session_id,
        page=page,
        per_page=per_page,
    )

    return jsonify({
        "status": "success",
        "data": {
            "items": [item.to_dict() for item in items],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if total > 0 else 0,
        }
    }), 200


@ai_bp.route("/alternatives/<int:medicine_id>", methods=["GET"])
@login_required
def get_alternative_medicines(medicine_id: int):
    """
    Decision support for alternative medicines (PRD Rule 20).
    Returns bio-equivalent candidates with stock and price comparisons for pharmacist review.
    """
    store_id = g.current_user.store_id
    result = default_alternative_matcher.find_alternatives(medicine_id, store_id=store_id)

    if not result:
        return jsonify({"error": "NotFoundError", "message": "Medicine not found in store catalog."}), 404

    return jsonify({
        "status": "success",
        "data": result.to_dict(),
    }), 200


@ai_bp.route("/prescription/scan", methods=["POST"])
@login_required
def scan_prescription():
    """
    Doctor Prescription Scanner & Availability Verification (PRD Rule 21).
    Extracts prescribed drugs, matches against catalog, and evaluates stock availability.
    """
    store_id = g.current_user.store_id
    text_content = None
    limit = 12 * 1024 * 1024
    if request.content_length and request.content_length > limit + 65536:
        return jsonify({"message": "Use a prescription image smaller than 12 MB."}), 413

    if request.is_json:
        data = request.get_json(silent=True) or {}
        text_content = data.get("text")
        if text_content is not None and (not isinstance(text_content, str) or len(text_content) > 20000):
            return jsonify({"message": "Prescription text must be at most 20000 characters."}), 400
        image_b64 = data.get("image_base64")
        if image_b64:
            if not isinstance(image_b64, str) or len(image_b64) > limit * 4 // 3 + 100:
                return jsonify({"message": "Invalid prescription image or image larger than 12 MB."}), 400
            try:
                if "," in image_b64:
                    image_b64 = image_b64.split(",", 1)[1]
                img_bytes = base64.b64decode(image_b64, validate=True)
                from app.vision import decode_image_bytes
                img = decode_image_bytes(img_bytes)
            except Exception:
                return jsonify({"error": "ProcessingError", "message": "Failed to decode prescription image."}), 400
            mode = data.get("recognition_mode", "printed")
            if mode not in ("printed", "handwriting"):
                return jsonify({"message": "Choose printed or handwriting recognition."}), 400
            result = default_prescription_scanner.scan_prescription_image(img, store_id, use_handwriting=mode == "handwriting")
            if result.engine == "handwriting_unavailable":
                return jsonify({"message": result.warnings[0], "data": result.to_dict()}), 503
            return jsonify({"status": "review_required", "data": result.to_dict()}), 200

    if not text_content and "prescription" in request.files:
        file = request.files["prescription"]
        file_bytes = file.read(limit + 1)
        if len(file_bytes) > limit:
            return jsonify({"message": "Use a prescription image smaller than 12 MB."}), 413
        try:
            from app.vision import decode_image_bytes
            img = decode_image_bytes(file_bytes)
        except Exception:
            return jsonify({"error": "ValidationError", "message": "Invalid prescription image format."}), 400
        mode = request.form.get("recognition_mode", "printed")
        if mode not in ("printed", "handwriting"):
            return jsonify({"message": "Choose printed or handwriting recognition."}), 400
        result = default_prescription_scanner.scan_prescription_image(img, store_id, use_handwriting=mode == "handwriting")
        if result.engine == "handwriting_unavailable":
            return jsonify({"message": result.warnings[0], "data": result.to_dict()}), 503
        return jsonify({"status": "review_required", "data": result.to_dict()}), 200

    if text_content:
        result = default_prescription_scanner.parse_prescription_text(text_content, store_id)
        return jsonify({"status": "success", "data": result.to_dict()}), 200

    return jsonify({"error": "ValidationError", "message": "Provide prescription image or text."}), 400
