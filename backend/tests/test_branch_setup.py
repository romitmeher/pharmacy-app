"""Branch provisioning is owner-only, atomic and creates a usable login."""
from unittest.mock import patch
import pytest
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.audit_log import AuditLog
from app.services.auth_service import create_access_token


def branch_payload():
    return {
        "store": {"name": "East Pharmacy", "address": "East Road", "gstin": "27AAAAA0000A1Z5"},
        "manager": {"email": "east.manager@example.com", "username": "east-manager", "full_name": "East Manager", "password": "BranchPass123!"},
    }


def test_owner_creates_branch_and_manager_login(client, db, sample_owner, owner_token):
    response = client.post("/api/multibranch/stores", json=branch_payload(), headers={"Authorization": f"Bearer {owner_token}"})
    assert response.status_code == 201
    data = response.get_json()["data"]
    manager = db.session.get(User, data["manager_user_id"])
    assert manager.role == UserRole.MANAGER
    assert manager.store_id == data["id"] != sample_owner.store_id
    assert manager.check_password("BranchPass123!")
    assert "password" not in response.get_data(as_text=True)
    assert AuditLog.query.filter_by(action="BRANCH_CREATED", entity_id=str(data["id"])).count() == 1
    login = client.post("/api/auth/login", json={"email": "east.manager@example.com", "password": "BranchPass123!"})
    assert login.status_code == 200
    assert login.get_json()["user"]["store_id"] == data["id"]


def test_manager_cannot_provision_branch(client, db, sample_store):
    manager = User(store_id=sample_store.id, email="manager@example.com", username="manager", full_name="Manager", role=UserRole.MANAGER)
    manager.set_password("ManagerPass123!")
    db.session.add(manager)
    db.session.commit()
    token = create_access_token(manager)
    before = Store.query.count()
    response = client.post("/api/multibranch/stores", json=branch_payload(), headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert Store.query.count() == before


@pytest.mark.parametrize("field,value", [("password", "short"), ("password", "x" * 73), ("email", "invalid"), ("full_name", ""), ("username", []), ("email", "owner@testpharmacy.com"), ("username", "owner")])
def test_invalid_manager_does_not_leave_store(client, db, sample_owner, owner_token, field, value):
    payload = branch_payload()
    payload["manager"][field] = value
    before_stores, before_users = Store.query.count(), User.query.count()
    response = client.post("/api/multibranch/stores", json=payload, headers={"Authorization": f"Bearer {owner_token}"})
    assert response.status_code in (400, 409)
    assert Store.query.count() == before_stores
    assert User.query.count() == before_users


def test_failed_manager_write_rolls_back_branch(client, db, sample_owner, owner_token):
    before_stores, before_users = Store.query.count(), User.query.count()
    with patch("app.models.user.User.set_password", side_effect=RuntimeError("hash unavailable")):
        with pytest.raises(RuntimeError):
            client.post("/api/multibranch/stores", json=branch_payload(), headers={"Authorization": f"Bearer {owner_token}"})
    assert Store.query.count() == before_stores
    assert User.query.count() == before_users


def transfer_catalog_fixture(db, sample_owner, mismatched_field=None, mismatched_value=None):
    from datetime import date, timedelta
    from app.models.medicine import Medicine, DosageForm, Ingredient, MedicineAlias
    from app.models.batch import Batch
    from app.models.inventory import Inventory
    from app.multibranch.branch_service import create_stock_transfer, dispatch_stock_transfer, receive_stock_transfer
    destination = Store(name="Receiving Pharmacy")
    db.session.add(destination)
    db.session.flush()
    identity = dict(brand_name="Same Brand", generic_name="Paracetamol", manufacturer="Maker A", strength="500mg", dosage_form=DosageForm.TABLET, route="oral", is_prescription_only=True, storage_requirements="2-8 C", hsn_code="3004", gst_percentage=12)
    source = Medicine(store_id=sample_owner.store_id, **identity)
    source.ingredients = [Ingredient(name="Paracetamol", strength="500", unit="mg")]
    source.aliases = [MedicineAlias(alias_name="Source brand alias", alias_type="common_name")]
    other_identity = {**identity, **({mismatched_field: mismatched_value} if mismatched_field and mismatched_field != "ingredients" else {})}
    existing = Medicine(store_id=destination.id, **other_identity)
    existing.ingredients = [Ingredient(name="Paracetamol", strength="650" if mismatched_field == "ingredients" else "500", unit="mg")]
    existing.aliases = [MedicineAlias(alias_name="Source brand alias", alias_type="common_name")]
    db.session.add_all([source, existing])
    db.session.flush()
    batch = Batch(store_id=sample_owner.store_id, medicine_id=source.id, batch_number="SOURCE-500", expiry_date=date.today() + timedelta(days=300), quantity_received=10)
    db.session.add(batch)
    db.session.flush()
    db.session.add(Inventory(store_id=sample_owner.store_id, batch_id=batch.id, quantity_available=10))
    db.session.commit()
    transfer = create_stock_transfer(sample_owner.store_id, destination.id, sample_owner.id, [{"medicine_id": source.id, "batch_id": batch.id, "quantity": 2}])
    dispatch_stock_transfer(transfer.id, sample_owner.id)
    receive_stock_transfer(transfer.id, sample_owner.id)
    received = Batch.query.filter_by(store_id=destination.id, batch_number=batch.batch_number).one()
    return source, existing, received.medicine


@pytest.mark.parametrize("field,value", [("generic_name", "Ibuprofen"), ("manufacturer", "Maker B"), ("strength", "650mg"), ("dosage_form", None), ("route", "topical"), ("ingredients", None), ("is_prescription_only", False), ("storage_requirements", None)])
def test_transfer_receipt_preserves_distinct_clinical_identity(db, sample_owner, field, value):
    source, existing, received = transfer_catalog_fixture(db, sample_owner, field, value)
    assert received.id != existing.id
    for identity_field in ("brand_name", "generic_name", "manufacturer", "strength", "dosage_form", "route", "is_prescription_only", "storage_requirements", "hsn_code", "gst_percentage"):
        assert getattr(received, identity_field) == getattr(source, identity_field)
    assert [(ingredient.name, ingredient.strength, ingredient.unit) for ingredient in received.ingredients] == [("Paracetamol", "500", "mg")]
    assert [(alias.alias_name, alias.alias_type) for alias in received.aliases] == [("Source brand alias", "common_name")]
    assert sum(inventory.quantity_available for batch in received.batches for inventory in batch.inventory) == 2
    assert existing.batches.count() == 0


def test_transfer_receipt_reuses_identical_composition_without_duplicate_aliases(db, sample_owner):
    source, existing, received = transfer_catalog_fixture(db, sample_owner)
    assert received.id == existing.id
    assert len(received.ingredients) == 1
    assert len(received.aliases) == 1
