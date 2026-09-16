"""
SmartPharm Backend — Batch & Inventory API Tests.

Validates:
- Storage locations (shelves, racks, fridges)
- Batches with pricing and expiry dates
- Physical inventory allocation and stock adjustments
- Inter-location stock transfers
- FEFO (First Expiring, First Out) batch resolution
- PRD Rule 15 Expiry tracking & classification
"""

from datetime import date, timedelta


class TestLocations:
    """Tests for /api/locations."""

    def test_create_location_success(self, client, owner_token):
        """Owner can create a storage location."""
        response = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "name": "Shelf A-1",
                "location_type": "shelf",
                "description": "Top shelf for common analgesics",
            },
        )
        assert response.status_code == 201
        data = response.get_json()["location"]
        assert data["name"] == "Shelf A-1"
        assert data["location_type"] == "shelf"

    def test_create_location_duplicate_conflict(self, client, owner_token):
        """Duplicate location name returns 409."""
        client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Fridge Main", "location_type": "fridge"},
        )
        response = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Fridge Main", "location_type": "fridge"},
        )
        assert response.status_code == 409

    def test_cashier_cannot_create_location(self, client, cashier_token):
        """Cashier role cannot create storage location (403)."""
        response = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {cashier_token}"},
            json={"name": "Counter 1", "location_type": "counter"},
        )
        assert response.status_code == 403


class TestBatchesAndInventory:
    """Tests for /api/batches and /api/inventory."""

    def test_create_batch_with_initial_stock(self, client, owner_token):
        """Creating a batch initializes physical inventory stock."""
        # First create a medicine
        med_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Azithral 500", "mrp": 120.0},
        )
        med_id = med_res.get_json()["medicine"]["id"]

        # Create a location
        loc_res = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Shelf B-2", "location_type": "shelf"},
        )
        loc_id = loc_res.get_json()["location"]["id"]

        # Create batch
        expiry = (date.today() + timedelta(days=180)).isoformat()
        mfg = (date.today() - timedelta(days=30)).isoformat()

        batch_payload = {
            "medicine_id": med_id,
            "batch_number": "AZ500-01",
            "expiry_date": expiry,
            "manufacturing_date": mfg,
            "purchase_price": 85.00,
            "mrp": 125.00,
            "quantity_received": 50,
            "location_id": loc_id,
        }

        batch_res = client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=batch_payload,
        )
        assert batch_res.status_code == 201
        batch_data = batch_res.get_json()["batch"]
        assert batch_data["batch_number"] == "AZ500-01"
        assert batch_data["total_available"] == 50
        assert len(batch_data["inventory"]) == 1
        assert batch_data["inventory"][0]["quantity_available"] == 50
        assert batch_data["inventory"][0]["location_name"] == "Shelf B-2"

    def test_duplicate_batch_number_conflict(self, client, owner_token):
        """Cannot create duplicate batch_number for same medicine."""
        med_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Calpol 650"},
        )
        med_id = med_res.get_json()["medicine"]["id"]
        expiry = (date.today() + timedelta(days=200)).isoformat()

        payload = {
            "medicine_id": med_id,
            "batch_number": "BATCH-DUP",
            "expiry_date": expiry,
        }

        client.post("/api/batches", headers={"Authorization": f"Bearer {owner_token}"}, json=payload)
        res = client.post("/api/batches", headers={"Authorization": f"Bearer {owner_token}"}, json=payload)
        assert res.status_code == 409

    def test_adjust_stock_with_reason(self, client, owner_token):
        """Adjusting inventory requires a valid reason."""
        med_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Vicks Action 500"},
        )
        med_id = med_res.get_json()["medicine"]["id"]

        batch_res = client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "VK-99",
                "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                "quantity_received": 100,
            },
        )
        inv_id = batch_res.get_json()["batch"]["inventory"][0]["id"]

        # Missing reason returns 400
        fail_res = client.post(
            "/api/inventory/adjust",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"inventory_id": inv_id, "new_quantity": 95, "reason": ""},
        )
        assert fail_res.status_code == 400

        # Valid adjustment succeeds
        adj_res = client.post(
            "/api/inventory/adjust",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "inventory_id": inv_id,
                "new_quantity": 95,
                "reason": "5 damaged strips removed during shelf count",
            },
        )
        assert adj_res.status_code == 200
        assert adj_res.get_json()["inventory"]["quantity_available"] == 95

    def test_transfer_stock_between_locations(self, client, owner_token):
        """Move stock from Shelf 1 to Shelf 2."""
        med_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Insulin Glargine"},
        )
        med_id = med_res.get_json()["medicine"]["id"]

        loc1 = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Receiving Bay", "location_type": "other"},
        ).get_json()["location"]["id"]

        loc2 = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Vaccine Fridge", "location_type": "fridge"},
        ).get_json()["location"]["id"]

        batch_res = client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "INS-001",
                "expiry_date": (date.today() + timedelta(days=120)).isoformat(),
                "quantity_received": 30,
                "location_id": loc1,
            },
        )
        batch_id = batch_res.get_json()["batch"]["id"]

        transfer_res = client.post(
            "/api/inventory/transfer",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "batch_id": batch_id,
                "source_location_id": loc1,
                "target_location_id": loc2,
                "quantity": 10,
            },
        )
        assert transfer_res.status_code == 200
        data = transfer_res.get_json()
        assert data["source"]["quantity_available"] == 20
        assert data["target"]["quantity_available"] == 10
        assert data["target"]["location_name"] == "Vaccine Fridge"

    def test_delete_location_prevented_with_stock(self, client, owner_token):
        """Cannot deactivate a location that currently has stock."""
        loc_id = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Occupied Shelf", "location_type": "shelf"},
        ).get_json()["location"]["id"]

        med_id = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Some Med"},
        ).get_json()["medicine"]["id"]

        client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "OCC-01",
                "expiry_date": (date.today() + timedelta(days=200)).isoformat(),
                "quantity_received": 15,
                "location_id": loc_id,
            },
        )

        del_res = client.delete(
            f"/api/locations/{loc_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert del_res.status_code == 409


class TestFEFOAndExpiryReports:
    """Tests for FEFO sorting and PRD Rule 15 Expiry Management."""

    def test_fefo_batch_ordering(self, client, owner_token):
        """FEFO summary returns batches sorted by earliest expiry date."""
        med_id = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Amoxicillin 500"},
        ).get_json()["medicine"]["id"]

        # Batch 1: Expiring in 60 days
        client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "BATCH-LATER",
                "expiry_date": (date.today() + timedelta(days=60)).isoformat(),
                "quantity_received": 20,
            },
        )
        # Batch 2: Expiring in 10 days
        client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "BATCH-SOONER",
                "expiry_date": (date.today() + timedelta(days=10)).isoformat(),
                "quantity_received": 15,
            },
        )

        summary_res = client.get(
            f"/api/inventory/summary/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert summary_res.status_code == 200
        data = summary_res.get_json()
        assert data["total_available"] == 35
        # Earliest expiry first
        assert data["batches"][0]["batch_number"] == "BATCH-SOONER"
        assert data["batches"][1]["batch_number"] == "BATCH-LATER"

    def test_expiry_report_categories(self, client, owner_token):
        """Expiry report accurately categorizes items per PRD Rule 15."""
        med_id = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Multi-Batch Med"},
        ).get_json()["medicine"]["id"]

        today = date.today()

        # Expired (-5 days)
        client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "EXP-PAST",
                "expiry_date": (today - timedelta(days=5)).isoformat(),
                "quantity_received": 10,
            },
        )
        # Critical (+15 days)
        client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "EXP-CRIT",
                "expiry_date": (today + timedelta(days=15)).isoformat(),
                "quantity_received": 20,
            },
        )
        # Warning (+45 days)
        client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "EXP-WARN",
                "expiry_date": (today + timedelta(days=45)).isoformat(),
                "quantity_received": 30,
            },
        )

        # Full report
        res = client.get(
            "/api/inventory/expiry",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        data = res.get_json()
        summary = data["summary"]
        assert summary["expired"] >= 1
        assert summary["critical"] >= 1
        assert summary["warning"] >= 1

        # Filtered by critical only
        crit_res = client.get(
            "/api/inventory/expiry?status=critical",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert crit_res.status_code == 200
        crit_data = crit_res.get_json()
        assert all(item["status"] == "critical" for item in crit_data["items"])
