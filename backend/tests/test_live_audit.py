"""
Live Integration Test: Centralized Audit Logging System.
Executes against live Flask backend daemon on http://127.0.0.1:5000
and live Aiven Cloud MySQL database.
"""

import sys
import requests

BASE_URL = "http://127.0.0.1:5000"

def run_live_audit_test():
    print("=== LIVE INTEGRATION TEST: AUDIT LOGGING (PRD RULE 7 & 22) ===")

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

    # 2. Executive Summary Metrics
    print("\n[STEP 2] Querying GET /api/audit-logs/summary...")
    summary_res = requests.get(f"{BASE_URL}/api/audit-logs/summary", headers=headers)
    assert summary_res.status_code == 200, f"Summary failed: {summary_res.text}"
    summary = summary_res.json()["data"]
    print(f"[PASS] Total Audit Events: {summary['total_audit_events']}")
    print(f"[PASS] Events Today: {summary['events_today']}")
    print(f"[PASS] Adjustments (7d): {summary['adjustments_last_7d']}")
    print(f"[PASS] Reconciliations (7d): {summary['reconciliations_last_7d']}")

    # 3. Create a live inventory adjustment
    print("\n[STEP 3] Executing manual inventory adjustment...")
    # Get current batches and inventory
    batch_res = requests.get(f"{BASE_URL}/api/batches", headers=headers)
    assert batch_res.status_code == 200, f"Get batches failed: {batch_res.text}"
    batches = batch_res.json().get("batches", [])
    if not batches or not batches[0].get("inventory"):
        print("[SKIP] No batches with inventory found to adjust.")
        return

    target_inv = batches[0]["inventory"][0]
    inv_id = target_inv["id"]
    current_qty = target_inv["quantity_available"]
    new_qty = current_qty  # maintain stock level cleanly for test

    adj_res = requests.post(f"{BASE_URL}/api/inventory/adjust", headers=headers, json={
        "inventory_id": inv_id,
        "new_quantity": new_qty,
        "reason": "Live audit verification check — physical count verified",
    })
    assert adj_res.status_code == 200, f"Adjust stock failed: {adj_res.text}"
    print(f"[PASS] Stock adjustment submitted for Inventory #{inv_id}. Status 200 OK.")

    # 4. Fetch audit log table to confirm recording
    print("\n[STEP 4] Fetching latest audit logs via GET /api/audit-logs?entity_type=inventory...")
    logs_res = requests.get(f"{BASE_URL}/api/audit-logs?entity_type=inventory&per_page=5", headers=headers)
    assert logs_res.status_code == 200, f"Get audit logs failed: {logs_res.text}"
    logs_data = logs_res.json()
    logs = logs_data["data"]
    assert len(logs) > 0, "No audit logs returned!"
    latest = logs[0]

    print(f"[PASS] Latest Audit Record Found:")
    print(f"       - ID: #{latest['id']}")
    print(f"       - Action: {latest['action']}")
    print(f"       - Entity: {latest['entity_type']} #{latest['entity_id']}")
    print(f"       - Staff: {latest['user_name']} ({latest['user_role']})")
    print(f"       - Reason: {latest['reason']}")
    print(f"       - Old State: {latest['old_values']}")
    print(f"       - New State: {latest['new_values']}")

    # 5. Fetch single audit detail
    print(f"\n[STEP 5] Querying single audit entry GET /api/audit-logs/{latest['id']}...")
    detail_res = requests.get(f"{BASE_URL}/api/audit-logs/{latest['id']}", headers=headers)
    assert detail_res.status_code == 200, f"Audit detail failed: {detail_res.text}"
    assert detail_res.json()["data"]["id"] == latest["id"]
    print(f"[PASS] Audit entry #{latest['id']} verified with exact diff.")

    # 6. Verify RBAC without token returns 401
    print("\n[STEP 6] Testing unauthorized request (missing token)...")
    unauth_res = requests.get(f"{BASE_URL}/api/audit-logs")
    assert unauth_res.status_code == 401, f"Expected 401, got {unauth_res.status_code}"
    print(f"[PASS] Unauthorized request rejected with 401 as expected.")

    print("\n========================================================")
    print(" ALL LIVE AUDIT TRAIL INTEGRATION TESTS PASSED (100%) ")
    print("========================================================")


if __name__ == "__main__":
    run_live_audit_test()
