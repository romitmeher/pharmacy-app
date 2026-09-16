"""
SmartPharm Live Voice Workflow Test against running Flask daemon and Aiven MySQL.
"""

import requests

BASE_URL = "http://127.0.0.1:5000"

def run_live_test():
    print("=== SMARTPHARM LIVE VOICE ASSISTANT VERIFICATION ===")

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

    # 3. Fetch Sample Commands
    samples_res = requests.get(f"{BASE_URL}/api/voice/sample-commands", headers=headers)
    assert samples_res.status_code == 200, f"Failed sample commands: {samples_res.text}"
    samples = samples_res.json()["data"]
    print(f"[3/5] Retrieved {len(samples)} curated sample voice commands.")

    # 4. Test Spoken Shelf Location Query
    loc_res = requests.post(f"{BASE_URL}/api/voice/process-command", headers=headers, json={
        "transcript": "Where is Crocin six fifty stored?"
    })
    assert loc_res.status_code == 200, f"Failed voice shelf query: {loc_res.text}"
    loc_data = loc_res.json()["data"]
    assert loc_data["intent"] == "LOCATE_SHELF"
    assert loc_data["action_card"]["brand_name"] == "Crocin 650"
    print(f"[4/5] Tested 'Where is Crocin six fifty?': Intent={loc_data['intent']}, Summary='{loc_data['action_card']['summary']}'")

    # 5. Test Spoken POS Billing Query
    bill_res = requests.post(f"{BASE_URL}/api/voice/process-command", headers=headers, json={
        "transcript": "Add 2 strips of Crocin to bill"
    })
    assert bill_res.status_code == 200, f"Failed voice billing query: {bill_res.text}"
    bill_data = bill_res.json()["data"]
    assert bill_data["intent"] == "ADD_TO_BILL"
    assert bill_data["action_card"]["requested_quantity"] == 2
    print(f"[5/5] Tested 'Add 2 strips of Crocin to bill': Intent={bill_data['intent']}, Qty={bill_data['action_card']['requested_quantity']}, Total=INR {bill_data['action_card']['total_amount']}")
    print("=== LIVE VOICE ASSISTANT VERIFICATION COMPLETE: ALL PASS ===")

if __name__ == "__main__":
    run_live_test()
