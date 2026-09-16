"""
Tests for authentication — login, JWT, middleware, RBAC, and initial setup.
"""

import json
from app.models.user import User, UserRole
from app.models.store import Store


class TestLogin:
    """Tests for POST /api/auth/login."""

    def test_login_success(self, client, sample_owner):
        """Valid credentials should return a JWT token and user data."""
        response = client.post(
            "/api/auth/login",
            json={"email": "owner@testpharmacy.com", "password": "testpassword123"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "token" in data
        assert data["user"]["email"] == "owner@testpharmacy.com"
        assert data["user"]["role"] == "owner"

    def test_login_wrong_password(self, client, sample_owner):
        """Wrong password should return 401."""
        response = client.post(
            "/api/auth/login",
            json={"email": "owner@testpharmacy.com", "password": "wrongpassword"},
        )
        assert response.status_code == 401
        data = response.get_json()
        assert "Invalid email or password" in data["message"]

    def test_login_nonexistent_user(self, client, db):
        """Non-existent email should return 401."""
        response = client.post(
            "/api/auth/login",
            json={"email": "nobody@test.com", "password": "password"},
        )
        assert response.status_code == 401

    def test_login_missing_fields(self, client, db):
        """Missing email or password should return 400."""
        response = client.post(
            "/api/auth/login",
            json={"email": ""},
        )
        assert response.status_code == 400

    def test_login_no_json_body(self, client, db):
        """Non-JSON request body should return 400."""
        response = client.post("/api/auth/login", data="not json")
        assert response.status_code == 400

    def test_login_inactive_user(self, client, db, sample_store):
        """Inactive users should not be able to log in."""
        user = User(
            store_id=sample_store.id,
            email="inactive@test.com",
            username="inactive",
            full_name="Inactive User",
            role=UserRole.CASHIER,
            is_active=False,
        )
        user.set_password("password123")
        db.session.add(user)
        db.session.commit()

        response = client.post(
            "/api/auth/login",
            json={"email": "inactive@test.com", "password": "password123"},
        )
        assert response.status_code == 401

    def test_login_updates_last_login(self, client, db, sample_owner):
        """Successful login should update last_login_at."""
        assert sample_owner.last_login_at is None

        client.post(
            "/api/auth/login",
            json={"email": "owner@testpharmacy.com", "password": "testpassword123"},
        )

        db.session.refresh(sample_owner)
        assert sample_owner.last_login_at is not None


class TestGetCurrentUser:
    """Tests for GET /api/auth/me."""

    def test_get_me_authenticated(self, client, sample_owner):
        """Authenticated request should return user profile."""
        # Login first
        login_resp = client.post(
            "/api/auth/login",
            json={"email": "owner@testpharmacy.com", "password": "testpassword123"},
        )
        token = login_resp.get_json()["token"]

        # Get profile
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["user"]["email"] == "owner@testpharmacy.com"

    def test_get_me_no_token(self, client, db):
        """Request without token should return 401."""
        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_get_me_invalid_token(self, client, db):
        """Request with invalid token should return 401."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert response.status_code == 401

    def test_get_me_malformed_header(self, client, db):
        """Malformed Authorization header should return 401."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "NotBearer sometoken"},
        )
        assert response.status_code == 401


class TestInitialSetup:
    """Tests for POST /api/auth/setup."""

    def test_setup_creates_store_and_owner(self, client, db):
        """First-time setup should create a store and owner user."""
        response = client.post(
            "/api/auth/setup",
            json={
                "store": {
                    "name": "MedPlus Pharmacy",
                    "phone": "9876543210",
                    "address": "123 Main St, Mumbai",
                    "gstin": "27AAAAA0000A1Z5",
                },
                "owner": {
                    "email": "owner@medplus.com",
                    "username": "owner",
                    "password": "securepass123",
                    "full_name": "Rajesh Sharma",
                },
            },
        )
        assert response.status_code == 201
        data = response.get_json()
        assert "token" in data
        assert data["store"]["name"] == "MedPlus Pharmacy"
        assert data["user"]["role"] == "owner"

        # Verify in database
        store = Store.query.first()
        assert store is not None
        assert store.name == "MedPlus Pharmacy"

        user = User.query.first()
        assert user is not None
        assert user.role == UserRole.OWNER
        assert user.store_id == store.id

    def test_setup_blocked_after_first(self, client, db, sample_store):
        """Setup should fail if a store already exists."""
        response = client.post(
            "/api/auth/setup",
            json={
                "store": {"name": "Another Store"},
                "owner": {
                    "email": "a@b.com",
                    "username": "u",
                    "password": "12345678",
                    "full_name": "Test",
                },
            },
        )
        assert response.status_code == 409
        assert "already been completed" in response.get_json()["message"]

    def test_setup_missing_store(self, client, db):
        """Setup without store data should return 400."""
        response = client.post(
            "/api/auth/setup",
            json={
                "owner": {
                    "email": "a@b.com",
                    "username": "u",
                    "password": "12345678",
                    "full_name": "Test",
                },
            },
        )
        assert response.status_code == 400

    def test_setup_short_password(self, client, db):
        """Setup with short password should return 400."""
        response = client.post(
            "/api/auth/setup",
            json={
                "store": {"name": "Test Store"},
                "owner": {
                    "email": "a@b.com",
                    "username": "u",
                    "password": "short",
                    "full_name": "Test",
                },
            },
        )
        assert response.status_code == 400
        assert "8 characters" in response.get_json()["message"]


class TestRoleBasedAccess:
    """Tests for role-based access control via middleware."""

    def _get_token(self, client, email, password):
        """Helper to get a JWT token."""
        resp = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        return resp.get_json()["token"]

    def test_different_roles_can_login(self, client, db, sample_store):
        """All PRD-defined roles should be able to authenticate."""
        for role in UserRole:
            user = User(
                store_id=sample_store.id,
                email=f"{role.value}@test.com",
                username=f"user_{role.value}",
                full_name=f"Test {role.value}",
                role=role,
            )
            user.set_password("password123")
            db.session.add(user)

        db.session.commit()

        for role in UserRole:
            resp = client.post(
                "/api/auth/login",
                json={
                    "email": f"{role.value}@test.com",
                    "password": "password123",
                },
            )
            assert resp.status_code == 200
            assert resp.get_json()["user"]["role"] == role.value
