"""Permanent medicine identities must not be duplicated by creating or editing."""
import pytest
from app.extensions import db
from app.models.store import Store
from app.services.medicine_service import create_medicine


BASE = {"brand_name": "Example Medicine", "strength": "500 mg", "manufacturer": "Demo Pharma",
        "dosage_form": "tablet", "route": "oral"}


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_rejects_normalized_duplicate(client, owner_token):
    auth=headers(owner_token)
    assert client.post('/api/medicines',headers=auth,json=BASE).status_code==201
    variant=dict(BASE,brand_name="  EXAMPLE   medicine ",strength="500mg",manufacturer="demo  pharma",dosage_form="TABLET")
    response=client.post('/api/medicines',headers=auth,json=variant)
    assert response.status_code==400
    assert 'already exists' in response.json['message']


@pytest.mark.parametrize('field,value', [('strength','250 mg'),('dosage_form','capsule'),('manufacturer','Different Pharma'),('route','topical')])
def test_distinct_identities_remain_allowed(client, owner_token, field, value):
    auth=headers(owner_token)
    assert client.post('/api/medicines',headers=auth,json=BASE).status_code==201
    assert client.post('/api/medicines',headers=auth,json=dict(BASE,**{field:value})).status_code==201


def test_failed_edit_preserves_original_identity(client, owner_token):
    auth=headers(owner_token)
    first=client.post('/api/medicines',headers=auth,json=BASE).json['medicine']
    second=client.post('/api/medicines',headers=auth,json=dict(BASE,strength='250 mg')).json['medicine']
    response=client.patch(f"/api/medicines/{second['id']}",headers=auth,json={'strength':'500mg'})
    assert response.status_code==400
    assert client.get(f"/api/medicines/{second['id']}",headers=auth).json['medicine']['strength']=='250 mg'
    assert client.patch(f"/api/medicines/{first['id']}",headers=auth,json={'mrp':25}).status_code==200


def test_reactivation_cannot_duplicate_active_identity(client, owner_token):
    auth=headers(owner_token)
    first=client.post('/api/medicines',headers=auth,json=BASE).json['medicine']
    assert client.delete(f"/api/medicines/{first['id']}",headers=auth).status_code==200
    assert client.post('/api/medicines',headers=auth,json=BASE).status_code==201
    assert client.patch(f"/api/medicines/{first['id']}",headers=auth,json={'is_active':True}).status_code==400


def test_identity_check_is_store_scoped(client, owner_token):
    auth=headers(owner_token)
    assert client.post('/api/medicines',headers=auth,json=BASE).status_code==201
    other=Store(name='Other Test Store')
    db.session.add(other);db.session.commit()
    assert create_medicine(other.id,BASE).store_id==other.id
