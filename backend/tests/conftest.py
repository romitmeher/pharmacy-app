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
    SECRET_KEY = "test-secret-key"
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
