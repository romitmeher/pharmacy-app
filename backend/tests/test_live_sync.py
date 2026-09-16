"""
SmartPharm Live Synchronization Test against running Flask daemon and Aiven MySQL.
"""

import requests
import datetime
import uuid

BASE_URL = "http://127.0.0.1:5000"

def run_live_test():
    print("=== SMARTPHARM LIVE OFFLINE SYNC VERIFICATION ===")

    # 1. Health check
    res = requests.get(f"{BASE_URL}/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("[1/5] Flask API is healthy.")

    # 2. Login as admin
    login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@smartpharm.com",
        "password": "AdminPassword123!"
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    print("[2/5] Authenticated successfully as Owner/Admin.")

    # 3. Fetch Offline Catalog Pack
    pack_res = requests.get(f"{BASE_URL}/api/sync/offline-pack", headers=headers)
    assert pack_res.status_code == 200, f"Failed to get offline pack: {pack_res.text}"
    pack_data = pack_res.json()["data"]
    print(f"[3/5] Downloaded offline pack: {pack_data['total_medicines']} medicines, {pack_data['total_active_batches']} active batches, version hash={pack_data['version_hash']}")

    # Ensure we have a medicine with stock
    in_stock_med = None
    target_batch = None
    for med in pack_data["medicines"]:
        if med["batches"]:
            in_stock_med = med
            target_batch = med["batches"][0]
            break

    if not in_stock_med:
        print("[SKIP 4/5] No medicines with active stock in store to perform live test sale.")
        return

    print(f"      Selected '{in_stock_med['brand_name']}' (Batch {target_batch['batch_number']}, stock={target_batch['quantity_available']})")

    # 4. Generate and replay offline transaction
    client_tx_id = f"OFFLINE-TEST-{uuid.uuid4().hex[:8].upper()}"
    offline_item = {
        "client_tx_id": client_tx_id,
        "client_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sale_data": {
            "items": [
                {
                    "medicine_id": in_stock_med["id"],
                    "batch_id": target_batch["id"],
                    "quantity": 1,
                    "discount_percentage": 0.0
                }
            ],
            "payments": [
                {
                    "payment_method": "cash",
                    "amount": target_batch["mrp"] or 30.0
                }
            ],
            "notes": "Live test offline transaction"
        }
    }

    replay_res = requests.post(f"{BASE_URL}/api/sync/replay", headers=headers, json=offline_item)
    assert replay_res.status_code == 200, f"Replay failed: {replay_res.text}"
    replay_data = replay_res.json()["data"]
    print(f"[4/5] Replayed offline transaction: status={replay_data['status']}, sale_id={replay_data.get('applied_sale_id')}")

    # Test Idempotency (replay same tx)
    replay2_res = requests.post(f"{BASE_URL}/api/sync/replay", headers=headers, json=offline_item)
    assert replay2_res.status_code == 200
    replay2_data = replay2_res.json()["data"]
    assert replay2_data["status"] == "already_synced", f"Expected already_synced, got {replay2_data}"
    print(f"      Idempotency confirmed: repeated submission returned status='already_synced'.")

    # 5. Get Sync Status Summary
    status_res = requests.get(f"{BASE_URL}/api/sync/status", headers=headers)
    assert status_res.status_code == 200, f"Failed to get sync status: {status_res.text}"
    status_data = status_res.json()["data"]
    print(f"[5/5] Sync Status: total_synced={status_data['total_synced']}, conflicts={status_data['total_conflicts']}, last_synced_at={status_data['last_synced_at']}")
    print("=== LIVE OFFLINE SYNC VERIFICATION COMPLETE: ALL PASS ===")

if __name__ == "__main__":
    run_live_test()
