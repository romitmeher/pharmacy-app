"""
SmartPharm Backend — AI Interaction Model.

Defines the persistent AI_Interactions entity per PRD Rule 7 and Rule 19:
- Auditable persistence for natural language copilot questions
- Preserves detected intent, response text, and snapshot of retrieved database context
- Captures pharmacist clinical feedback (helpful / unhelpful thumbs and notes)
- Tracks pipeline latency for observability
"""

from datetime import datetime, timezone
from app.extensions import db


class AIInteraction(db.Model):
    """Auditable log of natural language AI Copilot interactions and feedback."""
    __tablename__ = "ai_interactions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)

    session_id = db.Column(db.String(100), nullable=True, index=True)
    user_query = db.Column(db.Text, nullable=False)
    detected_intent = db.Column(db.String(100), nullable=True, index=True)
    response_text = db.Column(db.Text, nullable=False)

    # Grounding & Audit Context (PRD Rule 19)
    retrieved_context = db.Column(db.JSON, nullable=True)
    citations = db.Column(db.JSON, nullable=True)
    latency_ms = db.Column(db.Float, nullable=True)

    # Pharmacist Feedback & Quality Monitoring
    is_helpful = db.Column(db.Boolean, nullable=True)
    feedback_notes = db.Column(db.Text, nullable=True)
    feedback_recorded_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        db.Index("ix_ai_store_session", "store_id", "session_id"),
        db.Index("ix_ai_store_created", "store_id", "created_at"),
    )

    # Relationships
    store = db.relationship("Store", backref="ai_interactions")
    user = db.relationship("User", foreign_keys=[user_id])

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "store_id": self.store_id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "session_id": self.session_id,
            "user_query": self.user_query,
            "detected_intent": self.detected_intent,
            "response_text": self.response_text,
            "retrieved_context": self.retrieved_context,
            "citations": self.citations,
            "latency_ms": self.latency_ms,
            "is_helpful": self.is_helpful,
            "feedback_notes": self.feedback_notes,
            "feedback_recorded_at": self.feedback_recorded_at.isoformat() if self.feedback_recorded_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<AIInteraction {self.id}: {self.detected_intent} ({self.created_at})>"
