"""
SmartPharm Backend — Pytest Fixtures.

Provides reusable test fixtures for the Flask app, database, and common entities.
Uses an in-memory SQLite database for tests to avoid requiring a MySQL server
in the test environment. This is acceptable because our models use standard
SQLAlchemy constructs — MySQL-specific behavior should be tested in integration tests.
"""

import pytest
from app import create_app
from app.extensions import db as _db
from app.models.store import Store
from app.models.user import User, UserRole


class TestConfig:
    """Test configuration using SQLite in-memory database."""

    TESTING = True
    SECRET_KEY = "test-secret-key-at-least-32-bytes-long-for-hmac-sha256"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGINS = ["http://localhost:3000"]


@pytest.fixture(scope="session")
def app():
    """Create the Flask application for the test session."""
    application = create_app(config_class=TestConfig)
    yield application


@pytest.fixture(scope="function")
def db(app):
    """Provide a clean database for each test function.

    Creates all tables before each test and drops them after.
    This ensures test isolation — no test data leaks between tests.
    """
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.rollback()
        _db.drop_all()


@pytest.fixture(scope="function")
def client(app, db):
    """Provide a Flask test client with a clean database."""
    with app.test_client() as test_client:
        with app.app_context():
            yield test_client


@pytest.fixture(scope="function")
def sample_store(db):
    """Create a sample store for tests that need one."""
    store = Store(
        name="Test Pharmacy",
        address="123 Test Street, Mumbai",
        phone="9876543210",
        gstin="27AAAAA0000A1Z5",
        drug_license_number="MH-MUM-123456",
    )
    db.session.add(store)
    db.session.commit()
    return store


@pytest.fixture(scope="function")
def sample_owner(db, sample_store):
    """Create a sample owner user for tests that need one."""
    user = User(
        store_id=sample_store.id,
        email="owner@testpharmacy.com",
        username="owner",
        full_name="Test Owner",
        role=UserRole.OWNER,
    )
    user.set_password("testpassword123")
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture(scope="function")
def owner_token(sample_owner):
    """Generate a JWT token for the sample owner."""
    from app.services.auth_service import create_access_token
    return create_access_token(sample_owner)


@pytest.fixture(scope="function")
def sample_pharmacist(db, sample_store):
    """Create a sample pharmacist user."""
    user = User(
        store_id=sample_store.id,
        email="pharmacist@testpharmacy.com",
        username="pharmacist",
        full_name="Test Pharmacist",
        role=UserRole.PHARMACIST,
    )
    user.set_password("testpassword123")
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture(scope="function")
def pharmacist_token(sample_pharmacist):
    """Generate a JWT token for the sample pharmacist."""
    from app.services.auth_service import create_access_token
    return create_access_token(sample_pharmacist)


@pytest.fixture(scope="function")
def sample_cashier(db, sample_store):
    """Create a sample cashier user."""
    user = User(
        store_id=sample_store.id,
        email="cashier@testpharmacy.com",
        username="cashier",
        full_name="Test Cashier",
        role=UserRole.CASHIER,
    )
    user.set_password("testpassword123")
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture(scope="function")
def cashier_token(sample_cashier):
    """Generate a JWT token for the sample cashier."""
    from app.services.auth_service import create_access_token
    return create_access_token(sample_cashier)


@pytest.fixture(scope="function")
def sample_inventory_staff(db, sample_store):
    """Create a sample inventory staff user."""
    user = User(
        store_id=sample_store.id,
        email="inventory@testpharmacy.com",
        username="inventory_staff",
        full_name="Inventory Clerk",
        role=UserRole.INVENTORY_STAFF,
    )
    user.set_password("testpassword123")
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture(scope="function")
def inventory_staff_token(sample_inventory_staff):
    """Generate a JWT token for the inventory staff."""
    from app.services.auth_service import create_access_token
    return create_access_token(sample_inventory_staff)


@pytest.fixture(autouse=True)
def isolate_optional_cloud_services(monkeypatch):
    """Unit tests never use optional cloud services from the developer's .env."""
    monkeypatch.setenv("PGVECTOR_URL", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("TAVILY_API_KEY", "")


@pytest.fixture(autouse=True)
def isolate_model_downloads(monkeypatch):
    """Exercise deterministic fallbacks; unit tests never download OCR/detection models."""
    from app.vision.ocr_engine import OCREngine
    from app.vision import detector
    monkeypatch.setattr(OCREngine, "_get_engine", lambda self: None)
    monkeypatch.setattr(detector, "get_detector_model", lambda: False)
