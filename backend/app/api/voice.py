"""
SmartPharm - Voice-Assisted Pharmacy Operations REST API Endpoints.
Strict compliance with SmartPharm PRD Phase 6 & Rule 9:
- POST /api/voice/process-command: Parse voice transcript, match catalog, return action card
- GET /api/voice/sample-commands: Suggested speech commands for counter staff
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required
from app.voice.intent_parser import execute_voice_command

logger = logging.getLogger(__name__)

voice_bp = Blueprint("voice", __name__, url_prefix="/api/voice")


@voice_bp.route("/process-command", methods=["POST"])
@login_required
def process_voice_command():
    """
    Voice Command Interpretation Endpoint (PRD Phase 6).
    Accepts speech-to-text transcript and grounds query against store catalog.
    """
    store_id = g.current_user.store_id
    payload = request.get_json() or {}
    transcript = payload.get("transcript", "")

    if not transcript or not transcript.strip():
        return jsonify({
            "error": "ValidationError",
            "message": "Spoken transcript is required.",
        }), 400

    result = execute_voice_command(store_id=store_id, transcript=transcript)
    return jsonify({
        "status": "success",
        "data": result,
    }), 200


@voice_bp.route("/sample-commands", methods=["GET"])
@login_required
def get_sample_commands():
    """
    Returns curated sample voice commands for staff training.
    """
    sample_commands = [
        {
            "category": "Shelf Location",
            "phrase": "Where is Crocin 650?",
            "intent": "LOCATE_SHELF",
            "description": "Locate physical shelf, rack coordinates, and FEFO picking priority.",
        },
        {
            "category": "Stock & Availability",
            "phrase": "Check stock of Dolo 650",
            "intent": "CHECK_STOCK",
            "description": "View total active units across batches and expiry runway.",
        },
        {
            "category": "Bio-Equivalent Substitutes",
            "phrase": "Substitute for Augmentin 625",
            "intent": "FIND_ALTERNATIVE",
            "description": "Discover bio-equivalent candidates with clinical review boundary.",
        },
        {
            "category": "Fast Counter Billing",
            "phrase": "Add 2 strips of Crocin 650 to bill",
            "intent": "ADD_TO_BILL",
            "description": "Draft a POS bill line item with automatic price calculation.",
        },
    ]

    return jsonify({
        "status": "success",
        "data": sample_commands,
    }), 200
