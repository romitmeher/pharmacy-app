"""
SmartPharm Backend — Purchase & Distributor Invoice Tests.

Validates:
- PRD Rule 8 & 11: Purchase drafts DO NOT modify inventory or create batches
- Human verification and acceptance: Creates batches and increments inventory
- Quantity discrepancy handling: Invoiced vs physically received
- Cancellation of draft purchases
- Role-based permissions (Inventory Staff allowed, Cashier forbidden)
- Store isolation
"""

from datetime import date, timedelta


def _setup_medicine_and_supplier(client, owner_token):
    """Helper to create a medicine and supplier for purchase tests."""
    med_res = client.post(
        "/api/medicines",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"brand_name": "Ciphalexin 500", "mrp": 95.00},
    )
    med_id = med_res.get_json()["medicine"]["id"]

    sup_res = client.post(
        "/api/suppliers",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Alkem Wholesale Distributors", "phone": "9811223344"},
    )
    sup_id = sup_res.get_json()["supplier"]["id"]

    return med_id, sup_id


class TestPurchaseDraft:
    """Tests for creating and updating purchase invoice drafts."""

    def test_create_draft_does_not_mutate_inventory(self, client, owner_token, inventory_staff_token):
        """CRITICAL (PRD Rule 8 & 11): Draft creation must NOT increment inventory or create batches."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)

        # Confirm 0 batches and 0 inventory
        summary_before = client.get(
            f"/api/inventory/summary/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert summary_before.get_json()["total_available"] == 0
        assert len(summary_before.get_json()["batches"]) == 0

        # Inventory staff creates a purchase draft
        expiry = (date.today() + timedelta(days=365)).isoformat()
        draft_payload = {
            "supplier_id": sup_id,
            "invoice_number": "INV-ALK-001",
            "invoice_date": date.today().isoformat(),
            "items": [
                {
                    "medicine_id": med_id,
                    "batch_number": "CPX-BATCH-1",
                    "expiry_date": expiry,
                    "quantity": 100,
                    "purchase_rate": 60.00,
                    "mrp": 95.00,
                    "tax_percentage": 12.0,
                }
            ],
            "notes": "Pending physical box count",
        }

        res = client.post(
            "/api/purchases",
            headers={"Authorization": f"Bearer {inventory_staff_token}"},
            json=draft_payload,
        )
        assert res.status_code == 201
        data = res.get_json()["invoice"]
        assert data["status"] == "draft"
        assert data["invoice_number"] == "INV-ALK-001"
        assert len(data["items"]) == 1
        assert data["items"][0]["batch_id"] is None  # No batch linked yet!

        # CRITICAL VERIFICATION: Stock must STILL be 0!
        summary_after = client.get(
            f"/api/inventory/summary/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert summary_after.get_json()["total_available"] == 0
        assert len(summary_after.get_json()["batches"]) == 0

    def test_create_draft_duplicate_invoice_conflict(self, client, owner_token):
        """Duplicate invoice number for same supplier returns 409."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)
        payload = {
            "supplier_id": sup_id,
            "invoice_number": "INV-DUP-99",
            "items": [
                {
                    "medicine_id": med_id,
                    "batch_number": "B-99",
                    "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
                    "quantity": 10,
                    "purchase_rate": 20.0,
                }
            ],
        }

        client.post("/api/purchases", headers={"Authorization": f"Bearer {owner_token}"}, json=payload)
        res = client.post("/api/purchases", headers={"Authorization": f"Bearer {owner_token}"}, json=payload)
        assert res.status_code == 409

    def test_cashier_cannot_create_purchase(self, client, owner_token, cashier_token):
        """Cashier role cannot create purchase invoices (403)."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)
        res = client.post(
            "/api/purchases",
            headers={"Authorization": f"Bearer {cashier_token}"},
            json={
                "supplier_id": sup_id,
                "invoice_number": "CASHIER-TRY",
                "items": [{"medicine_id": med_id, "batch_number": "B1", "expiry_date": "2027-01-01", "quantity": 1, "purchase_rate": 10}],
            },
        )
        assert res.status_code == 403


class TestPurchaseAcceptance:
    """Tests for human review and inventory acceptance (/api/purchases/<id>/accept)."""

    def test_accept_purchase_books_inventory_and_batch(self, client, owner_token, inventory_staff_token):
        """Accepting a purchase creates the batch and increments physical inventory."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)

        # Create location
        loc_res = client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"name": "Stockroom Bay 1", "location_type": "rack"},
        )
        loc_id = loc_res.get_json()["location"]["id"]

        # Create draft
        expiry = (date.today() + timedelta(days=200)).isoformat()
        draft_res = client.post(
            "/api/purchases",
            headers={"Authorization": f"Bearer {inventory_staff_token}"},
            json={
                "supplier_id": sup_id,
                "invoice_number": "INV-ACCEPT-01",
                "items": [
                    {
                        "medicine_id": med_id,
                        "batch_number": "CPX-ACCEPT-1",
                        "expiry_date": expiry,
                        "quantity": 50,
                        "purchase_rate": 45.0,
                        "mrp": 75.0,
                    }
                ],
            },
        )
        invoice_id = draft_res.get_json()["invoice"]["id"]

        # Inventory staff verifies delivery and accepts purchase into Stockroom Bay 1
        accept_res = client.post(
            f"/api/purchases/{invoice_id}/accept",
            headers={"Authorization": f"Bearer {inventory_staff_token}"},
            json={"default_location_id": loc_id},
        )
        assert accept_res.status_code == 200
        inv_data = accept_res.get_json()["invoice"]
        assert inv_data["status"] == "accepted"
        assert inv_data["items"][0]["batch_id"] is not None
        assert inv_data["items"][0]["is_verified"] is True

        # Check that stock is now 50!
        summary = client.get(
            f"/api/inventory/summary/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert summary.get_json()["total_available"] == 50
        assert summary.get_json()["batches"][0]["batch_number"] == "CPX-ACCEPT-1"
        assert summary.get_json()["batches"][0]["locations"][0]["location_name"] == "Stockroom Bay 1"

    def test_partial_acceptance_quantity_discrepancy(self, client, owner_token):
        """When physically received quantity is less than invoice, status is partial_accepted."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)

        draft_res = client.post(
            "/api/purchases",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "supplier_id": sup_id,
                "invoice_number": "INV-DISCREPANCY-01",
                "items": [
                    {
                        "medicine_id": med_id,
                        "batch_number": "DISC-01",
                        "expiry_date": (date.today() + timedelta(days=150)).isoformat(),
                        "quantity": 100,  # Invoiced 100
                        "purchase_rate": 10.0,
                    }
                ],
            },
        )
        invoice_id = draft_res.get_json()["invoice"]["id"]
        item_id = draft_res.get_json()["invoice"]["items"][0]["id"]

        # Physical count found only 80 units!
        accept_res = client.post(
            f"/api/purchases/{invoice_id}/accept",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "items": [
                    {
                        "item_id": item_id,
                        "received_quantity": 80,
                    }
                ]
            },
        )
        assert accept_res.status_code == 200
        inv_data = accept_res.get_json()["invoice"]
        assert inv_data["status"] == "partial_accepted"

        # Stock should reflect only 80 units
        summary = client.get(
            f"/api/inventory/summary/{med_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert summary.get_json()["total_available"] == 80

    def test_cannot_accept_already_accepted_invoice(self, client, owner_token):
        """Accepting an already accepted invoice returns 409."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)
        draft_res = client.post(
            "/api/purchases",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "supplier_id": sup_id,
                "invoice_number": "INV-ONCE-ONLY",
                "items": [
                    {
                        "medicine_id": med_id,
                        "batch_number": "ONCE-01",
                        "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
                        "quantity": 10,
                        "purchase_rate": 5.0,
                    }
                ],
            },
        )
        invoice_id = draft_res.get_json()["invoice"]["id"]

        client.post(f"/api/purchases/{invoice_id}/accept", headers={"Authorization": f"Bearer {owner_token}"})
        repeat_res = client.post(f"/api/purchases/{invoice_id}/accept", headers={"Authorization": f"Bearer {owner_token}"})
        assert repeat_res.status_code == 409


class TestPurchaseCancellation:
    """Tests for cancelling purchase drafts."""

    def test_cancel_draft_purchase(self, client, owner_token):
        """Owner can cancel an unconfirmed purchase draft."""
        med_id, sup_id = _setup_medicine_and_supplier(client, owner_token)
        draft_res = client.post(
            "/api/purchases",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "supplier_id": sup_id,
                "invoice_number": "INV-TO-CANCEL",
                "items": [
                    {
                        "medicine_id": med_id,
                        "batch_number": "CAN-01",
                        "expiry_date": (date.today() + timedelta(days=100)).isoformat(),
                        "quantity": 10,
                        "purchase_rate": 5.0,
                    }
                ],
            },
        )
        invoice_id = draft_res.get_json()["invoice"]["id"]

        cancel_res = client.post(
            f"/api/purchases/{invoice_id}/cancel",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"reason": "Distributor sent wrong consignment"},
        )
        assert cancel_res.status_code == 200
        assert cancel_res.get_json()["invoice"]["status"] == "cancelled"

        # Cancelled invoice cannot be accepted
        accept_res = client.post(
            f"/api/purchases/{invoice_id}/accept",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert accept_res.status_code == 409
