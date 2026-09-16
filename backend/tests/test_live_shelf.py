"""
SmartPharm - Live Integration Test for Phase 6 Shelf & Location Intelligence
Verifies:
1. Owner Authentication
2. GET /api/shelf/layout (Planogram and capacity)
3. GET /api/shelf/locate/1 (Fast Dispense Locator for Crocin 650)
4. GET /api/shelf/compliance-alerts (Storage & cold-chain auditor)
5. POST /api/shelf/audit-count (Shelf cycle count verification)
"""

import sys
import requests

BASE_URL = "http://127.0.0.1:5000/api"


def main():
    print("\n=======================================================")
    print("  SmartPharm Phase 6 Shelf Intelligence Live Verification")
    print("=======================================================\n")

    # 1. Login
    login_payload = {
        "email": "admin@smartpharm.com",
        "password": "AdminPassword123!",
    }
    r = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    if r.status_code != 200:
        print(f"[FAIL] Login failed: {r.status_code} - {r.text}")
        sys.exit(1)

    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print(f"[PASS] Authenticated successfully as Store Owner")

    # 2. Planogram Layout
    print("\n--- 1. Testing GET /api/shelf/layout ---")
    r_lay = requests.get(f"{BASE_URL}/shelf/layout", headers=headers)
    assert r_lay.status_code == 200, f"Layout failed: {r_lay.text}"
    lay_data = r_lay.json()["data"]
    print(f"[PASS] Planogram retrieved: {lay_data['summary']['total_locations']} physical storage locations")
    print(f"       Total Capacity: {lay_data['summary']['total_capacity_units']} units | Occupied: {lay_data['summary']['total_occupied_units']} units")
    print(f"       Store Utilization: {lay_data['summary']['store_utilization_pct']}%")
    if lay_data["shelves"]:
        s0 = lay_data["shelves"][0]
        print(f"       Sample Location: '{s0['name']}' | Type: {s0['location_type']} | Zone: {s0['climate_zone']}")
        print(f"       Coordinate Code: {s0['coordinate_code']} | Items Count: {s0['items_count']}")

    # 3. Fast Dispense Locator
    print("\n--- 2. Testing GET /api/shelf/locate/1 (Crocin 650) ---")
    r_loc = requests.get(f"{BASE_URL}/shelf/locate/1", headers=headers)
    assert r_loc.status_code == 200, f"Locate failed: {r_loc.text}"
    loc_data = r_loc.json()["data"]
    print(f"[PASS] Located medicine: '{loc_data['brand_name']}' across {loc_data['total_available_locations']} shelf locations")
    if loc_data["pick_locations"]:
        p0 = loc_data["pick_locations"][0]
        print(f"       Primary FEFO Pick: Batch {p0['batch_number']} on '{p0['location_name']}'")
        print(f"       Directional Guide: {p0['directional_guide']}")
        print(f"       Available Qty: {p0['quantity_available']} units | FEFO Priority: {p0['is_fefo_priority']}")

    # 4. Storage Compliance Alerts
    print("\n--- 3. Testing GET /api/shelf/compliance-alerts ---")
    r_alt = requests.get(f"{BASE_URL}/shelf/compliance-alerts", headers=headers)
    assert r_alt.status_code == 200, f"Compliance alerts failed: {r_alt.text}"
    alt_data = r_alt.json()["data"]
    print(f"[PASS] Compliance audit completed: {alt_data['summary']['total_alerts']} alerts detected")
    print(f"       Critical Violations: {alt_data['summary']['critical_violations']} | Warnings: {alt_data['summary']['warnings']}")
    if alt_data["alerts"]:
        a0 = alt_data["alerts"][0]
        print(f"       Alert [{a0['severity']}]: {a0['issue_title']} on '{a0['location_name']}'")
        print(f"       Required Action: {a0['action_required']}")

    # 5. Shelf Cycle Count Audit
    print("\n--- 4. Testing POST /api/shelf/audit-count ---")
    if lay_data["shelves"]:
        target_loc_id = lay_data["shelves"][0]["location_id"]
        audit_payload = {
            "location_id": target_loc_id,
            "scanned_items": [
                {
                    "medicine_id": 1,
                    "batch_number": "LIVE-B20260913-01",
                    "scanned_quantity": 50,
                }
            ],
            "apply_adjustments": False,
            "notes": "Live integration cycle count test (preview mode)",
        }
        r_aud = requests.post(f"{BASE_URL}/shelf/audit-count", json=audit_payload, headers=headers)
        assert r_aud.status_code == 200, f"Audit count failed: {r_aud.text}"
        aud_res = r_aud.json()["data"]
        print(f"[PASS] Shelf Cycle Count completed for '{aud_res['location_name']}'")
        print(f"       Total Items: {aud_res['total_items_audited']} | Matched: {aud_res['matched_items_count']} | Discrepancies: {aud_res['discrepancies_count']}")
        print(f"       Net Variance: {aud_res['net_variance_units']} units | Financial Impact: Rs. {aud_res['net_financial_variance']}")
        print(f"       Status: Non-destructive preview (is_committed: {aud_res['is_committed']})")

    print("\n=======================================================")
    print("  ALL PHASE 6 SHELF INTELLIGENCE INTEGRATION TESTS PASSED!")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
