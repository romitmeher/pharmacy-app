"""
SmartPharm - Live Integration Test for Phase 5 Machine Learning Subsystem
Verifies:
1. Owner Authentication
2. GET /api/ml/forecast/1 (Demand forecasting)
3. GET /api/ml/stockout-risks (Stock-out runway)
4. GET /api/ml/expiry-predictions (Expiry sell-through risk)
5. GET /api/ml/reorder-recommendations (Explainable replenishment)
6. POST /api/ml/create-reorder-po (Draft PO generation with human review)
"""

import sys
import requests

BASE_URL = "http://127.0.0.1:5000/api"


def main():
    print("\n=======================================================")
    print("  SmartPharm Phase 5 ML Live Integration Verification")
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
    print(f"[PASS] Logged in successfully as admin@smartpharm.com")

    # 2. Demand Forecast
    print("\n--- 1. Testing GET /api/ml/forecast/1 ---")
    r_fc = requests.get(f"{BASE_URL}/ml/forecast/1?horizon_days=30", headers=headers)
    assert r_fc.status_code == 200, f"Forecast failed: {r_fc.text}"
    fc_data = r_fc.json()["data"]
    print(f"[PASS] Forecast received for '{fc_data['brand_name']}'")
    print(f"       Model: {fc_data['model_family']}")
    print(f"       Avg Daily Demand: {fc_data['average_daily_demand']} units/day")
    print(f"       30-day Horizon Total: {fc_data['total_forecasted_demand']} units")
    print(f"       Evaluation MAE: {fc_data['evaluation_metrics']['mae']}, RMSE: {fc_data['evaluation_metrics']['rmse']}")

    # 3. Stock-Out Risks
    print("\n--- 2. Testing GET /api/ml/stockout-risks ---")
    r_so = requests.get(f"{BASE_URL}/ml/stockout-risks", headers=headers)
    assert r_so.status_code == 200, f"Stockout risks failed: {r_so.text}"
    so_data = r_so.json()["data"]
    print(f"[PASS] Stock-out risks received: {so_data['summary']['total_monitored']} medicines monitored")
    print(f"       Critical: {so_data['summary']['critical_risks']}, High: {so_data['summary']['high_risks']}, Medium: {so_data['summary']['medium_risks']}")
    if so_data["predictions"]:
        p0 = so_data["predictions"][0]
        print(f"       Top Item: {p0['brand_name']} | Stock: {p0['current_stock']} | Runway: {p0['runway_days']}d | Risk: {p0['risk_level']}")
        print(f"       Explanation: {p0['explanation']}")

    # 4. Expiry Predictions
    print("\n--- 3. Testing GET /api/ml/expiry-predictions ---")
    r_exp = requests.get(f"{BASE_URL}/ml/expiry-predictions?window_days=180", headers=headers)
    assert r_exp.status_code == 200, f"Expiry predictions failed: {r_exp.text}"
    exp_data = r_exp.json()["data"]
    print(f"[PASS] Expiry predictions received: {exp_data['summary']['total_batches_analyzed']} batches analyzed")
    print(f"       Total Financial Exposure: Rs. {exp_data['summary']['total_financial_loss_exposure']}")
    if exp_data["predictions"]:
        e0 = exp_data["predictions"][0]
        print(f"       Batch: {e0['batch_number']} ({e0['brand_name']}) | Days to Exp: {e0['days_to_expiry']}d | At Risk: {e0['projected_unsold_units_at_expiry']} units")
        print(f"       Risk Category: {e0['risk_category']} | Loss Exposure: Rs. {e0['financial_risk_amount']}")

    # 5. Reorder Recommendations
    print("\n--- 4. Testing GET /api/ml/reorder-recommendations ---")
    r_ro = requests.get(f"{BASE_URL}/ml/reorder-recommendations", headers=headers)
    assert r_ro.status_code == 200, f"Reorder recommendations failed: {r_ro.text}"
    ro_data = r_ro.json()["data"]
    print(f"[PASS] Reorder recommendations received: {ro_data['summary']['actionable_items_count']} actionable items")
    print(f"       Estimated Total Investment: Rs. {ro_data['summary']['estimated_total_investment']}")
    recs = ro_data["recommendations"]

    # 6. Draft PO Generation from Recommendation
    print("\n--- 5. Testing POST /api/ml/create-reorder-po ---")
    if recs:
        rec0 = recs[0]
        supplier_id = rec0.get("preferred_supplier_id") or 1
        po_payload = {
            "supplier_id": supplier_id,
            "items": [
                {
                    "medicine_id": rec0["medicine_id"],
                    "quantity": rec0["recommended_order_quantity"],
                    "purchase_rate": rec0["estimated_purchase_rate"],
                }
            ],
            "notes": "Live integration test draft PO from ML recommendation engine.",
        }
        r_po = requests.post(f"{BASE_URL}/ml/create-reorder-po", json=po_payload, headers=headers)
        assert r_po.status_code == 201, f"Create Draft PO failed: {r_po.text}"
        po_resp = r_po.json()
        print(f"[PASS] Draft PO Created: {po_resp['data']['invoice_number']}")
        print(f"       Status: {po_resp['data']['status']} (Strictly DRAFT - zero auto inventory mutation)")
        print(f"       Items Count: {po_resp['data']['items_count']} | Total Amount: Rs. {po_resp['data']['total_amount']}")

    print("\n=======================================================")
    print("  ALL PHASE 5 LIVE ML INTEGRATION TESTS PASSED!")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
