"""Store-scoped staff lifecycle, privilege boundaries, login and deactivation."""
from unittest.mock import patch
import pytest
from app.models.user import User, UserRole
from app.models.store import Store
from app.models.audit_log import AuditLog
from app.services.auth_service import create_access_token


def payload(role="cashier"):
    return {"full_name": "New Staff", "email": "new.staff@example.com", "username": "newstaff", "password": "StaffPass123!", "role": role}


def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def manager(db, sample_store):
    user = User(store_id=sample_store.id, full_name="Manager", email="manager@example.com", username="manager", role=UserRole.MANAGER)
    user.set_password("ManagerPass123!")
    db.session.add(user)
    db.session.commit()
    return user


@pytest.mark.parametrize("role", ["manager", "pharmacist", "cashier", "inventory_staff"])
def test_owner_creates_usable_staff_login(client, db, owner_token, sample_owner, role):
    response = client.post("/api/auth/users", json=payload(role), headers=headers(owner_token))
    assert response.status_code == 201
    result = response.get_json()["user"]
    assert result["store_id"] == sample_owner.store_id
    assert result["role"] == role
    assert "password" not in response.get_data(as_text=True)
    assert AuditLog.query.filter_by(action="STAFF_CREATED", entity_id=str(result["id"])).count() == 1
    login = client.post("/api/auth/login", json={"email": payload()["email"], "password": payload()["password"]})
    assert login.status_code == 200
    assert login.get_json()["user"]["id"] == result["id"]


@pytest.mark.parametrize("role", ["pharmacist", "cashier", "inventory_staff"])
def test_manager_creates_only_operational_staff(client, manager, role):
    assert client.post("/api/auth/users", json=payload(role), headers=headers(create_access_token(manager))).status_code == 201


@pytest.mark.parametrize("role", ["manager", "owner"])
def test_manager_cannot_create_privileged_staff(client, db, manager, role):
    before = User.query.count()
    response = client.post("/api/auth/users", json=payload(role), headers=headers(create_access_token(manager)))
    assert response.status_code == 403
    assert User.query.count() == before


def test_cashier_cannot_list_or_create_staff(client, cashier_token):
    assert client.get("/api/auth/users", headers=headers(cashier_token)).status_code == 403
    assert client.post("/api/auth/users", json=payload(), headers=headers(cashier_token)).status_code == 403


def test_staff_list_and_updates_are_store_scoped(client, db, sample_owner, owner_token):
    foreign_store = Store(name="Other branch")
    db.session.add(foreign_store)
    db.session.flush()
    outsider = User(store_id=foreign_store.id, full_name="Other staff", email="other@example.com", username="other", role=UserRole.CASHIER)
    outsider.set_password("OtherPass123!")
    db.session.add(outsider)
    db.session.commit()
    listed = client.get("/api/auth/users", headers=headers(owner_token))
    assert listed.status_code == 200
    assert [user["id"] for user in listed.get_json()["users"]] == [sample_owner.id]
    assert client.patch(f"/api/auth/users/{outsider.id}", json={"is_active": False}, headers=headers(owner_token)).status_code == 404
    assert outsider.is_active


def test_deactivation_revokes_existing_online_access_and_retains_audit(client, db, sample_cashier, owner_token):
    old_token = create_access_token(sample_cashier)
    response = client.patch(f"/api/auth/users/{sample_cashier.id}", json={"is_active": False}, headers=headers(owner_token))
    assert response.status_code == 200
    assert db.session.get(User, sample_cashier.id) is not None
    assert client.get("/api/auth/me", headers=headers(old_token)).status_code == 401
    assert AuditLog.query.filter_by(action="STAFF_UPDATED", entity_id=str(sample_cashier.id)).count() == 1
    assert client.patch(f"/api/auth/users/{sample_cashier.id}", json={"is_active": True}, headers=headers(owner_token)).status_code == 200


def test_owner_and_self_protection(client, db, sample_owner, owner_token, manager):
    assert client.patch(f"/api/auth/users/{sample_owner.id}", json={"is_active": False}, headers=headers(owner_token)).status_code == 403
    assert client.patch(f"/api/auth/users/{manager.id}", json={"is_active": False}, headers=headers(create_access_token(manager))).status_code == 403
    assert sample_owner.is_active and manager.is_active


def test_manager_cannot_promote_staff_or_change_other_manager(client, db, sample_cashier, manager):
    manager_token = create_access_token(manager)
    assert client.patch(f"/api/auth/users/{sample_cashier.id}", json={"role": "manager"}, headers=headers(manager_token)).status_code == 403
    another = User(store_id=manager.store_id, full_name="Manager 2", email="manager2@example.com", username="manager2", role=UserRole.MANAGER)
    another.set_password("ManagerPass123!")
    db.session.add(another)
    db.session.commit()
    assert client.patch(f"/api/auth/users/{another.id}", json={"is_active": False}, headers=headers(manager_token)).status_code == 403


@pytest.mark.parametrize("field,value", [("email", "invalid"), ("email", "OWNER@testpharmacy.com"), ("username", "owner"), ("full_name", ""), ("password", "short"), ("password", "x" * 73), ("role", "invalid"), ("is_active", "false"), ("store_id", 100)])
def test_invalid_staff_input_is_atomic(client, db, sample_owner, owner_token, field, value):
    data = payload()
    data[field] = value
    before = User.query.count()
    assert client.post("/api/auth/users", json=data, headers=headers(owner_token)).status_code in (400, 403, 409)
    assert User.query.count() == before
    assert AuditLog.query.filter_by(action="STAFF_CREATED").count() == 0


def test_staff_updates_profile_role_and_password_without_recording_secret(client, db, sample_cashier, owner_token):
    new_password = "ChangedStaffPass123!"
    response = client.patch(f"/api/auth/users/{sample_cashier.id}", json={"full_name": "Updated Cashier", "role": "pharmacist", "password": new_password}, headers=headers(owner_token))
    assert response.status_code == 200
    assert sample_cashier.full_name == "Updated Cashier"
    assert sample_cashier.role == UserRole.PHARMACIST
    assert sample_cashier.check_password(new_password)
    audit = AuditLog.query.filter_by(action="STAFF_UPDATED").one()
    assert new_password not in str(audit.new_values)
    assert new_password not in response.get_data(as_text=True)


def test_hash_failure_does_not_leave_staff_account(client, db, sample_owner, owner_token):
    before = User.query.count()
    with patch("app.models.user.User.set_password", side_effect=RuntimeError("hash unavailable")):
        with pytest.raises(RuntimeError):
            client.post("/api/auth/users", json=payload(), headers=headers(owner_token))
    assert User.query.count() == before
    assert AuditLog.query.filter_by(action="STAFF_CREATED").count() == 0
