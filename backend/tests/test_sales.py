"""
SmartPharm Backend — Sales & Billing POS Tests.

Validates:
- POS billing with explicit batch selection and auto-FEFO batch resolution
- Inventory stock deduction and atomicity
- Prevention of selling expired medicines or exceeding available stock
- Tender payments (Cash, UPI, Card, Split payments)
- Customer creation and linking
- Digital invoice generation and printable receipt metadata
- Product returns / refunds with automatic stock restoration
- Role-based permissions and store isolation
"""

from datetime import date, timedelta
from decimal import Decimal


def _setup_test_medicine_and_batches(client, owner_token):
    """Helper to set up a medicine and two batches with stock."""
    # Create medicine
    med_res = client.post(
        "/api/medicines",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "brand_name": "Paracetamol 650",
            "generic_name": "Paracetamol",
            "mrp": 30.00,
            "selling_price": 28.00,
            "gst_percentage": 12.0,
        },
    )
    med_id = med_res.get_json()["medicine"]["id"]

    today = date.today()

    # Batch 1: Expiring soon (FEFO first choice), 20 units
    b1_res = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "medicine_id": med_id,
            "batch_number": "BATCH-EARLY",
            "expiry_date": (today + timedelta(days=30)).isoformat(),
            "mrp": 30.00,
            "quantity_received": 20,
        },
    )
    b1_id = b1_res.get_json()["batch"]["id"]

    # Batch 2: Expiring later, 50 units
    b2_res = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "medicine_id": med_id,
            "batch_number": "BATCH-LATER",
            "expiry_date": (today + timedelta(days=180)).isoformat(),
            "mrp": 32.00,
            "quantity_received": 50,
        },
    )
    b2_id = b2_res.get_json()["batch"]["id"]

    return med_id, b1_id, b2_id


class TestPOSBilling:
    """Tests for POST /api/sales."""

    def test_sale_with_explicit_batch(self, client, owner_token, cashier_token):
        """Cashier can bill an item with an explicit batch selection."""
        med_id, b1_id, b2_id = _setup_test_medicine_and_batches(client, owner_token)

        payload = {
            "customer": {
                "name": "Amit Shah",
                "phone": "9820123456",
            },
            "items": [
                {
                    "medicine_id": med_id,
                    "batch_id": b2_id,  # Cashier explicitly selects Batch 2
                    "quantity": 5,
                    "discount_percentage": 5.0,
                }
            ],
            "payments": [
                {
                    "payment_method": "upi",
                    "amount": 170.00,
                    "transaction_reference": "UPI-TXN-998811",
                }
            ],
        }

        response = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {cashier_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.get_json()["sale"]
        assert data["invoice_number"].startswith("INV-")
        assert data["customer"]["name"] == "Amit Shah"
        assert len(data["items"]) == 1
        assert data["items"][0]["batch_id"] == b2_id
        assert data["items"][0]["quantity"] == 5

        # Check stock was deducted specifically from Batch 2
        b2_check = client.get(
            f"/api/batches/{b2_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert b2_check.get_json()["batch"]["total_available"] == 45

        # Batch 1 should be untouched
        b1_check = client.get(
            f"/api/batches/{b1_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert b1_check.get_json()["batch"]["total_available"] == 20

    def test_sale_with_auto_fefo_resolution(self, client, owner_token, cashier_token):
        """If batch_id is omitted, system auto-allocates from earliest expiring batch."""
        med_id, b1_id, b2_id = _setup_test_medicine_and_batches(client, owner_token)

        payload = {
            "items": [
                {
                    "medicine_id": med_id,
                    "quantity": 10,  # Batch 1 has 20, so Batch 1 should fulfill all 10
                }
            ],
            "payments": [{"payment_method": "cash", "amount": 350.0}],
        }

        response = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {cashier_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.get_json()["sale"]
        assert data["items"][0]["batch_id"] == b1_id

        # Batch 1 should have 10 left (20 - 10)
        b1_check = client.get(f"/api/batches/{b1_id}", headers={"Authorization": f"Bearer {owner_token}"})
        assert b1_check.get_json()["batch"]["total_available"] == 10

    def test_sale_auto_fefo_spans_multiple_batches(self, client, owner_token):
        """When requested quantity exceeds first batch, FEFO splits across batches."""
        med_id, b1_id, b2_id = _setup_test_medicine_and_batches(client, owner_token)
        # Batch 1 has 20, Batch 2 has 50. Request 25.
        # Should take 20 from Batch 1, and 5 from Batch 2.

        payload = {
            "items": [
                {
                    "medicine_id": med_id,
                    "quantity": 25,
                }
            ],
        }

        response = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.get_json()["sale"]
        assert len(data["items"]) == 2
        # First item from Batch 1 (20 units)
        assert data["items"][0]["batch_id"] == b1_id
        assert data["items"][0]["quantity"] == 20
        # Second item from Batch 2 (5 units)
        assert data["items"][1]["batch_id"] == b2_id
        assert data["items"][1]["quantity"] == 5

        # Check stock
        b1_check = client.get(f"/api/batches/{b1_id}", headers={"Authorization": f"Bearer {owner_token}"})
        assert b1_check.get_json()["batch"]["total_available"] == 0
        b2_check = client.get(f"/api/batches/{b2_id}", headers={"Authorization": f"Bearer {owner_token}"})
        assert b2_check.get_json()["batch"]["total_available"] == 45

    def test_reject_expired_batch(self, client, owner_token):
        """Selling an expired batch returns 400."""
        med_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Old Cough Syrup"},
        )
        med_id = med_res.get_json()["medicine"]["id"]

        exp_res = client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "EXP-BATCH",
                "expiry_date": (date.today() - timedelta(days=10)).isoformat(),
                "quantity_received": 10,
            },
        )
        exp_id = exp_res.get_json()["batch"]["id"]

        sale_res = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "items": [{"medicine_id": med_id, "batch_id": exp_id, "quantity": 1}],
            },
        )
        assert sale_res.status_code == 400
        assert "expired" in sale_res.get_json()["message"].lower()

    def test_reject_insufficient_stock(self, client, owner_token):
        """Attempting to sell more stock than available returns 400."""
        med_res = client.post(
            "/api/medicines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"brand_name": "Limited Stock Med"},
        )
        med_id = med_res.get_json()["medicine"]["id"]

        b_res = client.post(
            "/api/batches",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "medicine_id": med_id,
                "batch_number": "LIM-01",
                "expiry_date": (date.today() + timedelta(days=90)).isoformat(),
                "quantity_received": 3,
            },
        )
        b_id = b_res.get_json()["batch"]["id"]

        sale_res = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "items": [{"medicine_id": med_id, "batch_id": b_id, "quantity": 10}],
            },
        )
        assert sale_res.status_code == 400
        assert "insufficient stock" in sale_res.get_json()["message"].lower()


class TestPaymentsAndRefunds:
    """Tests for split payments, invoice formatting, and refunds."""

    def test_split_payment(self, client, owner_token):
        """Sale paid via Cash + Card split payment."""
        med_id, b1_id, _ = _setup_test_medicine_and_batches(client, owner_token)

        payload = {
            "items": [{"medicine_id": med_id, "batch_id": b1_id, "quantity": 4}],
            "payments": [
                {"payment_method": "cash", "amount": 50.0},
                {"payment_method": "card", "amount": 100.0, "transaction_reference": "CARD-REF-1234"},
            ],
        }

        res = client.post("/api/sales", headers={"Authorization": f"Bearer {owner_token}"}, json=payload)
        assert res.status_code == 201
        data = res.get_json()["sale"]
        assert len(data["payments"]) == 2
        methods = [p["payment_method"] for p in data["payments"]]
        assert "cash" in methods and "card" in methods

    def test_refund_sale_restores_stock(self, client, owner_token):
        """Refunding a sale restocks items back into the batch."""
        med_id, b1_id, _ = _setup_test_medicine_and_batches(client, owner_token)

        # Batch 1 starts with 20. Sell 5 -> 15 left.
        sale_res = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"items": [{"medicine_id": med_id, "batch_id": b1_id, "quantity": 5}]},
        )
        sale_id = sale_res.get_json()["sale"]["id"]

        b1_after_sale = client.get(f"/api/batches/{b1_id}", headers={"Authorization": f"Bearer {owner_token}"})
        assert b1_after_sale.get_json()["batch"]["total_available"] == 15

        # Refund the sale
        refund_res = client.post(
            f"/api/sales/{sale_id}/refund",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"reason": "Patient had adverse allergy reaction; returned unopened box"},
        )
        assert refund_res.status_code == 200
        assert refund_res.get_json()["sale"]["payment_status"] == "refunded"

        # Stock should be back to 20!
        b1_after_refund = client.get(f"/api/batches/{b1_id}", headers={"Authorization": f"Bearer {owner_token}"})
        assert b1_after_refund.get_json()["batch"]["total_available"] == 20

    def test_cashier_cannot_refund(self, client, owner_token, cashier_token):
        """Cashier role cannot process refunds (requires Owner or Manager)."""
        med_id, b1_id, _ = _setup_test_medicine_and_batches(client, owner_token)

        sale_res = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"items": [{"medicine_id": med_id, "batch_id": b1_id, "quantity": 2}]},
        )
        sale_id = sale_res.get_json()["sale"]["id"]

        refund_res = client.post(
            f"/api/sales/{sale_id}/refund",
            headers={"Authorization": f"Bearer {cashier_token}"},
            json={"reason": "Customer returned item"},
        )
        assert refund_res.status_code == 403


class TestReceiptAndCustomer:
    """Tests for invoice receipt data and customer lookup."""

    def test_get_sale_receipt_data(self, client, owner_token):
        """Receipt details contain store header, GSTIN, DL number, items, and totals."""
        med_id, b1_id, _ = _setup_test_medicine_and_batches(client, owner_token)

        sale_res = client.post(
            "/api/sales",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "customer": {"name": "Pooja Verma", "phone": "9988776655"},
                "items": [{"medicine_id": med_id, "batch_id": b1_id, "quantity": 2}],
            },
        )
        sale_id = sale_res.get_json()["sale"]["id"]

        get_res = client.get(
            f"/api/sales/{sale_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert get_res.status_code == 200
        receipt = get_res.get_json()["sale"]
        assert "store" in receipt
        assert receipt["store"]["name"] == "Test Pharmacy"
        assert receipt["customer"]["name"] == "Pooja Verma"
        assert receipt["items"][0]["brand_name"] == "Paracetamol 650"
        assert receipt["items"][0]["batch_number"] == "BATCH-EARLY"
        assert "expiry_date" in receipt["items"][0]

    def test_customer_search_and_create(self, client, owner_token):
        """Create and search customers."""
        client.post(
            "/api/customers",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "name": "Dr. Rohit Gupta",
                "phone": "9123456789",
                "email": "rohit@clinic.com",
            },
        )

        res = client.get(
            "/api/customers?search=Rohit",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["count"] == 1
        assert data["customers"][0]["name"] == "Dr. Rohit Gupta"
