"""
SmartPharm Backend — Medicine API & Service Tests.

Validates medicine management, nested ingredients/aliases, search,
multi-store scoping, role-based access control, and soft deletion.
"""

import json
from app.models.store import Store
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token


class TestMedicineCreation:
    """Tests for POST /api/medicines."""

    def test_create_medicine_success(self, client, owner_token):
        """Owner can create a medicine with ingredients and aliases."""
        payload = {
            "brand_name": "Augmentin 625 Duo",
            "generic_name": "Amoxicillin and Potassium Clavulanate",
            "manufacturer": "GlaxoSmithKline",
            "strength": "625mg",
            "dosage_form": "tablet",
            "route": "oral",
            "category": "Antibiotic",
            "is_prescription_only": True,
            "mrp": 204.50,
            "selling_price": 190.00,
            "hsn_code": "3004",
            "gst_percentage": 12.0,
            "storage_requirements": "Store below 25°C in a dry place",
            "ingredients": [
                {"name": "Amoxicillin", "strength": "500", "unit": "mg"},
                {"name": "Clavulanic Acid", "strength": "125", "unit": "mg"},
            ],
            "aliases": [
                {"alias_name": "Augmentin 625", "alias_type": "brand_variant"},
                {"alias_name": "Amoxyclav 625", "alias_type": "common_name"},
            ],
        }

        response = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["message"] == "Medicine created successfully."
        med = data["medicine"]
        assert med["brand_name"] == "Augmentin 625 Duo"
        assert med["dosage_form"] == "tablet"
        assert med["mrp"] == 204.50
        assert med["is_prescription_only"] is True
        assert len(med["ingredients"]) == 2
        assert len(med["aliases"]) == 2

    def test_create_medicine_pharmacist_allowed(self, client, pharmacist_token):
        """Pharmacist can create a medicine."""
        response = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {pharmacist_token}"},
            json={"brand_name": "Paracetamol 500mg", "dosage_form": "tablet"},
        )
        assert response.status_code == 201

    def test_create_medicine_cashier_forbidden(self, client, cashier_token):
        """Cashier role cannot create a medicine (403)."""
        response = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {cashier_token}"},
            json={"brand_name": "Paracetamol 500mg"},
        )
        assert response.status_code == 403

    def test_create_medicine_unauthenticated(self, client):
        """Missing auth header returns 401."""
        response = client.post(
            "/api/medicines",
            json={"brand_name": "Paracetamol 500mg"},
        )
        assert response.status_code == 401

    def test_create_medicine_missing_brand_name(self, client, owner_token):
        """Missing brand_name should return 400 validation error."""
        response = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"generic_name": "Paracetamol"},
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "brand_name is required" in data["message"]

    def test_create_medicine_invalid_dosage_form(self, client, owner_token):
        """Invalid dosage form enum string returns 400."""
        response = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Test Med", "dosage_form": "candy"},
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "Invalid dosage_form" in data["message"]

    def test_create_medicine_negative_price(self, client, owner_token):
        """Negative price values return 400."""
        response = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Test Med", "mrp": -10.0},
        )
        assert response.status_code == 400


class TestMedicineRetrievalAndSearch:
    """Tests for GET /api/medicines, /api/medicines/<id>, /api/medicines/search."""

    def test_list_medicines_pagination(self, client, owner_token):
        """Medicines list returns pagination metadata."""
        # Create 3 medicines
        for i in range(1, 4):
            client.post(
                "/api/medicines",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"brand_name": f"Med {i}"},
            )

        response = client.get(
            "/api/medicines?page=1&per_page=2",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["items"]) == 2
        assert data["total"] == 3
        assert data["pages"] == 2
        assert data["page"] == 1

    def test_search_by_brand_name(self, client, owner_token):
        """Search query matches brand name."""
        client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Dolo 650", "generic_name": "Paracetamol"},
        )
        client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Azithral 500", "generic_name": "Azithromycin"},
        )

        response = client.get(
            "/api/medicines?search=Dolo",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["items"]) == 1
        assert data["items"][0]["brand_name"] == "Dolo 650"

    def test_search_by_alias(self, client, owner_token):
        """Search query matches an alias name."""
        client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "brand_name": "Calpol 500",
                "generic_name": "Paracetamol",
                "aliases": [{"alias_name": "Crocin Alternate"}],
            },
        )

        response = client.get(
            "/api/medicines?search=Crocin",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["items"]) == 1
        assert data["items"][0]["brand_name"] == "Calpol 500"

    def test_filter_by_category_and_rx(self, client, owner_token):
        """Filtering by category and prescription-only status."""
        client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Med A", "category": "Cardiac", "is_prescription_only": True},
        )
        client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Med B", "category": "Vitamin", "is_prescription_only": False},
        )

        response = client.get(
            "/api/medicines?category=Cardiac&is_prescription_only=true",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["items"]) == 1
        assert data["items"][0]["brand_name"] == "Med A"

    def test_get_single_medicine(self, client, owner_token):
        """Get medicine by ID returns full details."""
        create_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Telma 40", "generic_name": "Telmisartan", "strength": "40mg"},
        )
        med_id = create_res.get_json()["medicine"]["id"]

        response = client.get(
            f"/api/medicines/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["medicine"]["brand_name"] == "Telma 40"
        assert data["medicine"]["strength"] == "40mg"

    def test_get_nonexistent_medicine(self, client, owner_token):
        """Non-existent ID returns 404."""
        response = client.get(
            "/api/medicines/99999",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 404

    def test_ocr_search_ranking(self, client, owner_token):
        """OCR search returns ranked candidates based on match type."""
        client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "brand_name": "Augmentin",
                "generic_name": "Amoxicillin Clavulanate",
                "aliases": [{"alias_name": "Augmentin Duo"}],
            },
        )

        response = client.get(
            "/api/medicines/search?q=augmentin",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["count"] >= 1
        top_match = data["results"][0]
        assert top_match["medicine"]["brand_name"] == "Augmentin"
        assert top_match["score"] >= 100


class TestMedicineUpdateAndDeactivation:
    """Tests for PUT /api/medicines/<id> and DELETE /api/medicines/<id>."""

    def test_update_medicine(self, client, owner_token):
        """Owner can update medicine fields and aliases."""
        create_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Old Name", "mrp": 50.0},
        )
        med_id = create_res.get_json()["medicine"]["id"]

        update_res = client.put(
            f"/api/medicines/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "New Name", "mrp": 60.0},
        )
        assert update_res.status_code == 200
        data = update_res.get_json()["medicine"]
        assert data["brand_name"] == "New Name"
        assert data["mrp"] == 60.0

    def test_delete_medicine_soft_delete(self, client, owner_token):
        """Deleting a medicine deactivates it without hard deleting."""
        create_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "To Deactivate"},
        )
        med_id = create_res.get_json()["medicine"]["id"]

        delete_res = client.delete(
            f"/api/medicines/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert delete_res.status_code == 200

        # Verify it no longer appears in default active list
        list_res = client.get(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert not any(m["id"] == med_id for m in list_res.get_json()["items"])

    def test_pharmacist_cannot_delete(self, client, owner_token, pharmacist_token):
        """Pharmacist cannot delete medicines (requires Owner or Manager)."""
        create_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Protected Med"},
        )
        med_id = create_res.get_json()["medicine"]["id"]

        delete_res = client.delete(
            f"/api/medicines/{med_id}",
            headers={"Authorization": f"Bearer {pharmacist_token}"},
        )
        assert delete_res.status_code == 403


class TestMultiStoreIsolation:
    """Ensure multi-store tenancy: Store B cannot see or modify Store A medicines."""

    def test_store_isolation(self, client, db, owner_token, sample_store):
        """Medicine created in Store 1 is not accessible to Store 2."""
        # Create medicine in Store 1
        create_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Store 1 Exclusive Medicine"},
        )
        med_id = create_res.get_json()["medicine"]["id"]

        # Create Store 2 and an Owner in Store 2
        store_2 = Store(name="Other Pharmacy")
        db.session.add(store_2)
        db.session.commit()

        user_2 = User(
            store_id=store_2.id,
            email="owner2@otherpharmacy.com",
            username="owner2",
            full_name="Owner 2",
            role=UserRole.OWNER,
        )
        user_2.set_password("password123")
        db.session.add(user_2)
        db.session.commit()

        store2_token = create_access_token(user_2)

        # Store 2 listing should be empty
        list_res = client.get(
            "/api/medicines",
            headers={"Authorization": f"Bearer {store2_token}"},
        )
        assert list_res.status_code == 200
        assert len(list_res.get_json()["items"]) == 0

        # Store 2 accessing Store 1's medicine returns 404
        get_res = client.get(
            f"/api/medicines/{med_id}",
            headers={"Authorization": f"Bearer {store2_token}"},
        )
        assert get_res.status_code == 404
