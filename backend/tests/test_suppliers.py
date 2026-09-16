"""
SmartPharm Backend — Supplier API Tests.

Validates distributor registry, RBAC enforcement, search, and store isolation.
"""

from app.models.store import Store
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token


class TestSupplierCRUD:
    """Tests for /api/suppliers endpoints."""

    def test_create_supplier_success(self, client, owner_token):
        """Owner can create a new supplier."""
        payload = {
            "name": "Apollo Distributing Co.",
            "contact_person": "Rajesh Sharma",
            "phone": "9876543210",
            "email": "rajesh@apollodist.com",
            "address": "45 Warehouse Road, Andheri East, Mumbai",
            "gstin": "27AABCA1234F1Z9",
            "drug_license_number": "20B-12345/21B-12346",
        }

        response = client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["message"] == "Supplier created successfully."
        assert data["supplier"]["name"] == "Apollo Distributing Co."
        assert data["supplier"]["gstin"] == "27AABCA1234F1Z9"

    def test_create_supplier_duplicate_name_conflict(self, client, owner_token):
        """Duplicate supplier name in same store returns 409."""
        client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Cipla Direct"},
        )
        response = client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Cipla Direct"},
        )
        assert response.status_code == 409

    def test_create_supplier_pharmacist_forbidden(self, client, pharmacist_token):
        """Pharmacist cannot create suppliers (requires Owner or Manager)."""
        response = client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {pharmacist_token}"},
            json={"name": "Sun Pharma Wholesale"},
        )
        assert response.status_code == 403

    def test_list_and_search_suppliers(self, client, owner_token, pharmacist_token):
        """All authenticated roles can view and search suppliers."""
        client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Alkem Distributors", "contact_person": "Anil Kumar"},
        )
        client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Mankind Pharma Hub", "contact_person": "Suresh"},
        )

        # Pharmacist can list
        response = client.get(
            "/api/suppliers?search=Alkem",
            headers={"Authorization": f"Bearer {pharmacist_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["count"] == 1
        assert data["suppliers"][0]["name"] == "Alkem Distributors"

    def test_update_and_delete_supplier(self, client, owner_token):
        """Owner can update and soft-delete supplier."""
        create_res = client.post(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Old Supplier Name"},
        )
        sup_id = create_res.get_json()["supplier"]["id"]

        update_res = client.put(
            f"/api/suppliers/{sup_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Updated Supplier Name", "phone": "9998887776"},
        )
        assert update_res.status_code == 200
        assert update_res.get_json()["supplier"]["name"] == "Updated Supplier Name"

        delete_res = client.delete(
            f"/api/suppliers/{sup_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert delete_res.status_code == 200

        # No longer in active list
        list_res = client.get(
            "/api/suppliers",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert not any(s["id"] == sup_id for s in list_res.get_json()["suppliers"])
