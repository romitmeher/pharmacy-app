"""
Live Integration Test: Sales Returns & Refunds System.
Executes against live Flask backend daemon on http://127.0.0.1:5000
and live Aiven Cloud MySQL database.
"""

import sys
import requests

BASE_URL = "http://127.0.0.1:5000"

def run_live_returns_test():
    print("=== LIVE INTEGRATION TEST: SALES RETURNS & REFUNDS (PRD RULE 7, 8, 14, 22) ===")

    # 1. Login as Owner
    print("[STEP 1] Authenticating as Owner (admin@smartpharm.com)...")
    auth_res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@smartpharm.com",
        "password": "AdminPassword123!",
    })
    if auth_res.status_code != 200:
        print(f"[FAIL] Login failed: {auth_res.status_code} {auth_res.text}")
        sys.exit(1)

    auth_data = auth_res.json()
    token = auth_data.get("token") or auth_data.get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    print(f"[PASS] Logged in successfully. Role: {auth_data['user']['role']}")

    # 2. Get available sales or create one
    print("\n[STEP 2] Fetching or creating a test sale invoice...")
    sales_res = requests.get(f"{BASE_URL}/api/sales", headers=headers)
    assert sales_res.status_code == 200, f"Get sales failed: {sales_res.text}"
    sales = sales_res.json().get("sales", [])

    if not sales:
        print("[INFO] No existing sales found. Creating a live test sale...")
        # Get active batch with stock
        batches_res = requests.get(f"{BASE_URL}/api/batches?has_stock=true", headers=headers)
        batches = batches_res.json().get("batches", [])
        if not batches:
            print("[SKIP] No batches with stock found.")
            return
        test_batch = batches[0]
        med_id = test_batch["medicine_id"]
        b_id = test_batch["id"]

        create_sale_res = requests.post(f"{BASE_URL}/api/sales", headers=headers, json={
            "items": [
                {
                    "medicine_id": med_id,
                    "batch_id": b_id,
                    "quantity": 2,
                    "unit_price": 50.0,
                }
            ],
            "payments": [{"payment_method": "cash", "amount": 100.0}],
            "notes": "Live test sale for return testing",
        })
        assert create_sale_res.status_code == 201, f"Create sale failed: {create_sale_res.text}"
        target_sale = create_sale_res.json()["sale"]
    else:
        target_sale = sales[0]

    sale_id = target_sale["id"]
    print(f"[PASS] Target Sale selected: ID #{sale_id} (Invoice #{target_sale['invoice_number']})")

    # 3. Query eligible return items
    print(f"\n[STEP 3] Querying eligible return items for Sale #{sale_id}...")
    elig_res = requests.get(f"{BASE_URL}/api/returns/eligible-items/{sale_id}", headers=headers)
    assert elig_res.status_code == 200, f"Eligible items query failed: {elig_res.text}"
    elig_data = elig_res.json()["data"]
    print(f"[PASS] Invoice #{elig_data['invoice_number']} Total: INR {elig_data['total_amount']} | Remaining Units: {elig_data['total_remaining_units']}")

    eligible_item = next((i for i in elig_data["items"] if i["quantity_eligible_for_return"] > 0), None)
    if not eligible_item:
        print("[SKIP] No items with remaining eligible return units in this sale.")
        return

    # 4. Process customer return of 1 unit
    print(f"\n[STEP 4] Processing return of 1 unit of '{eligible_item['medicine_name']}'...")
    return_res = requests.post(f"{BASE_URL}/api/returns", headers=headers, json={
        "sale_id": sale_id,
        "reason": "Live integration verification: customer returned unopened strip",
        "refund_method": "cash",
        "items": [
            {
                "sale_item_id": eligible_item["sale_item_id"],
                "quantity_returned": 1,
                "restock_condition": "restocked_to_inventory",
            }
        ],
    })
    assert return_res.status_code == 201, f"Process return failed: {return_res.text}"
    ret_data = return_res.json()["data"]
    print(f"[PASS] Return Created Successfully:")
    print(f"       - Return Number: {ret_data['return_number']}")
    print(f"       - Refund Amount: INR {ret_data['total_refund_amount']}")
    print(f"       - Method: {ret_data['refund_method']}")
    print(f"       - Items: {len(ret_data['items'])} line item(s)")

    # 5. Check Audit Log for SALE_RETURN event
    print(f"\n[STEP 5] Checking Audit Log for automatic SALE_RETURN recording...")
    audit_res = requests.get(f"{BASE_URL}/api/audit-logs?action=SALE_RETURN&per_page=5", headers=headers)
    assert audit_res.status_code == 200, f"Get audit logs failed: {audit_res.text}"
    audit_logs = audit_res.json().get("data", [])
    assert any(log["action"] == "SALE_RETURN" and str(log["entity_id"]) == str(sale_id) for log in audit_logs), "Audit log for SALE_RETURN not found!"
    print(f"[PASS] Verified immutable audit log entry generated for Sale #{sale_id} return.")

    # 6. Query Returns History
    print(f"\n[STEP 6] Fetching returns history GET /api/returns...")
    hist_res = requests.get(f"{BASE_URL}/api/returns", headers=headers)
    assert hist_res.status_code == 200, f"Get returns failed: {hist_res.text}"
    history_items = hist_res.json().get("data", [])
    assert any(r["id"] == ret_data["id"] for r in history_items), "Return not in history list!"
    print(f"[PASS] Return #{ret_data['return_number']} verified in store returns ledger.")

    print("\n========================================================")
    print(" ALL LIVE RETURNS & REFUNDS INTEGRATION TESTS PASSED (100%) ")
    print("========================================================")


if __name__ == "__main__":
    run_live_returns_test()
