import pytest
from app.models.medicine import Medicine
from app.models.store import Store
from app.services.barcode_service import link, lookup
from app.services.medicine_service import update_medicine, create_medicine
from app.sync.offline_pack import generate_offline_pack
from app.utils.errors import ValidationError, NotFoundError


@pytest.fixture
def medicine(db, sample_store):
    med = Medicine(store_id=sample_store.id, brand_name="Barcode medicine", strength="650 mg")
    db.session.add(med)
    db.session.commit()
    return med


def test_link_lookup_and_offline_pack_preserve_leading_zeros(medicine):
    link(medicine.store_id, medicine.id, "0012345678905")
    assert lookup(medicine.store_id, "0012345678905").id == medicine.id
    pack = generate_offline_pack(medicine.store_id)
    assert pack["medicines"][0]["barcodes"] == ["0012345678905"]
    version = pack["version_hash"]
    link(medicine.store_id, medicine.id, "0012345678905", remove=True)
    assert generate_offline_pack(medicine.store_id)["version_hash"] != version
    with pytest.raises(NotFoundError):
        lookup(medicine.store_id, "0012345678905")


def test_duplicate_barcode_is_rejected_but_repeated_link_is_idempotent(medicine, db):
    other = Medicine(store_id=medicine.store_id, brand_name="Other strength", strength="500 mg")
    db.session.add(other)
    db.session.commit()
    link(medicine.store_id, medicine.id, "CODE-123")
    link(medicine.store_id, medicine.id, "CODE-123")
    assert len(medicine.aliases) == 1
    with pytest.raises(ValidationError):
        link(other.store_id, other.id, "CODE-123")


def test_barcode_is_store_scoped(medicine, db):
    other_store = Store(name="Other store")
    db.session.add(other_store)
    db.session.flush()
    other = Medicine(store_id=other_store.id, brand_name="Other medicine")
    db.session.add(other)
    db.session.commit()
    link(medicine.store_id, medicine.id, "CODE-123")
    with pytest.raises(NotFoundError):
        lookup(other_store.id, "CODE-123")
    link(other_store.id, other.id, "CODE-123")
    assert lookup(other_store.id, "CODE-123").id == other.id


def test_alias_updates_preserve_barcodes_and_cannot_bypass_mapping_validation(medicine):
    link(medicine.store_id, medicine.id, "CODE-123")
    update_medicine(medicine.store_id, medicine.id, {"aliases": [{"alias_name": "Other name"}]})
    assert lookup(medicine.store_id, "CODE-123").id == medicine.id
    with pytest.raises(ValidationError):
        create_medicine(medicine.store_id, {"brand_name": "Bad", "aliases": [
            {"alias_name": "CODE-123", "alias_type": "barcode"}]})


@pytest.mark.parametrize("code", [12345678, "", "12", "bad code", "a" * 65, "abc\x00def"])
def test_invalid_barcodes_are_rejected(medicine, code):
    with pytest.raises(ValidationError):
        link(medicine.store_id, medicine.id, code)


def test_barcode_api_and_permissions(client, pharmacist_token, cashier_token, medicine):
    headers = {"Authorization": f"Bearer {pharmacist_token}"}
    url = f"/api/medicines/{medicine.id}/barcodes"
    response = client.post(url, json={"barcode": "0012345678905"}, headers=headers)
    assert response.status_code == 200
    assert response.get_json()["medicine"]["barcodes"] == ["0012345678905"]
    assert client.get("/api/medicines/barcode?code=0012345678905", headers=headers).status_code == 200
    assert client.post(url, json={"barcode": "ANOTHER"}, headers={
        "Authorization": f"Bearer {cashier_token}"}).status_code == 403
    assert client.delete(url, json={"barcode": "0012345678905"}, headers=headers).status_code == 200


def test_inactive_medicine_cannot_be_dispensed_by_barcode(medicine, db):
    link(medicine.store_id, medicine.id, "CODE-123")
    medicine.is_active = False
    db.session.commit()
    with pytest.raises(NotFoundError):
        lookup(medicine.store_id, "CODE-123")
