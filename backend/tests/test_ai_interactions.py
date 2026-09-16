"""
SmartPharm Backend — AI Interaction Persistence & Feedback Tests.

Strict compliance with PRD Rule 7 and Rule 19:
- Grounded query execution and database persistence
- Detected intent, retrieved context snapshot, and citation storage
- Pharmacist clinical feedback (helpful / unhelpful thumbs and notes)
- Session history querying
"""

from app.extensions import db
from app.models.ai_interaction import AIInteraction


def test_copilot_query_persists_interaction(client, owner_token, app):
    """Test that querying AI Copilot persists the interaction to the database (PRD Rule 7 & 19)."""
    res = client.post(
        "/api/ai/copilot/query",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "query": "What medicines are low in stock?",
            "session_id": "test-session-101",
        },
    )
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert "interaction_id" in data
    assert data["interaction_id"] is not None
    assert data["session_id"] == "test-session-101"
    interaction_id = data["interaction_id"]

    with app.app_context():
        interaction = db.session.get(AIInteraction, interaction_id)
        assert interaction is not None
        assert interaction.user_query == "What medicines are low in stock?"
        assert interaction.detected_intent == "STOCK_LOOKUP"
        assert interaction.response_text is not None
        assert interaction.latency_ms is not None


def test_copilot_feedback_submission(client, owner_token, app):
    """Test recording pharmacist feedback on an AI response card."""
    # 1. Ask a question
    query_res = client.post(
        "/api/ai/copilot/query",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"query": "Which products expire next month?"},
    )
    interaction_id = query_res.get_json()["data"]["interaction_id"]

    # 2. Submit feedback
    feedback_res = client.post(
        f"/api/ai/copilot/feedback/{interaction_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "is_helpful": True,
            "feedback_notes": "Accurate expiration date identification for FEFO prioritization.",
        },
    )
    assert feedback_res.status_code == 200
    fb_data = feedback_res.get_json()["data"]
    assert fb_data["is_helpful"] is True
    assert fb_data["feedback_notes"] == "Accurate expiration date identification for FEFO prioritization."
    assert fb_data["feedback_recorded_at"] is not None

    with app.app_context():
        interaction = db.session.get(AIInteraction, interaction_id)
        assert interaction.is_helpful is True


def test_copilot_history_retrieval(client, owner_token):
    """Test retrieving conversation history for the store."""
    client.post(
        "/api/ai/copilot/query",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "query": "What should I order today?",
            "session_id": "history-session-202",
        },
    )

    # Fetch history
    history_res = client.get(
        "/api/ai/copilot/history?session_id=history-session-202",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert history_res.status_code == 200
    history_data = history_res.get_json()["data"]
    assert history_data["total"] >= 1
    assert any(item["user_query"] == "What should I order today?" for item in history_data["items"])


def test_copilot_feedback_validation(client, owner_token):
    """Test validation errors on missing is_helpful boolean."""
    res = client.post(
        "/api/ai/copilot/feedback/1",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"feedback_notes": "Forgot boolean flag"},
    )
    assert res.status_code == 400
