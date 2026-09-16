"""
SmartPharm Backend — AI Interaction & Copilot History Domain Service.

Strict compliance with PRD Rule 7 and Rule 19:
- Grounded query persistence with database snapshot
- Session conversation tracking
- Pharmacist clinical feedback submission
- Pipeline latency recording
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from app.extensions import db
from app.models.ai_interaction import AIInteraction
from app.utils.errors import ValidationError, NotFoundError


def log_ai_interaction(
    store_id: int,
    user_query: str,
    detected_intent: str,
    response_text: str,
    user_id: Optional[int] = None,
    session_id: Optional[str] = None,
    retrieved_context: Optional[Dict[str, Any]] = None,
    citations: Optional[List[Dict[str, Any]]] = None,
    latency_ms: Optional[float] = None,
) -> AIInteraction:
    """Persist a natural language Copilot exchange for auditability and quality monitoring."""
    if not user_query or not user_query.strip():
        raise ValidationError("user_query is required.")

    interaction = AIInteraction(
        store_id=store_id,
        user_id=user_id,
        session_id=session_id.strip() if session_id else None,
        user_query=user_query.strip(),
        detected_intent=detected_intent,
        response_text=response_text,
        retrieved_context=retrieved_context,
        citations=citations,
        latency_ms=latency_ms,
    )
    db.session.add(interaction)
    db.session.commit()
    return interaction


def record_feedback(
    interaction_id: int,
    store_id: int,
    is_helpful: bool,
    feedback_notes: Optional[str] = None,
) -> AIInteraction:
    """Record pharmacist clinical feedback (helpful / unhelpful) on an AI response."""
    interaction = AIInteraction.query.filter_by(id=interaction_id, store_id=store_id).first()
    if not interaction:
        raise NotFoundError(f"AI Interaction #{interaction_id} not found in this store.")

    interaction.is_helpful = bool(is_helpful)
    if feedback_notes:
        interaction.feedback_notes = feedback_notes.strip()
    interaction.feedback_recorded_at = datetime.now(timezone.utc)

    db.session.commit()
    return interaction


def get_interaction_history(
    store_id: int,
    session_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
) -> Tuple[List[AIInteraction], int]:
    """Retrieve paginated AI interaction logs for auditability and session review."""
    query = AIInteraction.query.filter(AIInteraction.store_id == store_id)

    if session_id:
        query = query.filter(AIInteraction.session_id == session_id.strip())

    total = query.count()
    items = (
        query.order_by(AIInteraction.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return items, total
