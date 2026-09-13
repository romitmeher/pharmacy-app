"""
Tests for the Flask application factory.
"""


def test_app_creates_successfully(app):
    """The app factory should create a Flask app without errors."""
    assert app is not None


def test_app_is_in_testing_mode(app):
    """The test app should have TESTING=True."""
    assert app.config["TESTING"] is True


def test_health_check_endpoint(client):
    """The /api/health endpoint should return a healthy status."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "healthy"
    assert data["service"] == "smartpharm-backend"


def test_404_returns_json(client):
    """Non-existent routes should return a JSON 404 response."""
    response = client.get("/api/nonexistent")
    assert response.status_code == 404
    data = response.get_json()
    assert "error" in data
    assert data["error"] == "NotFound"
