"""
SmartPharm Live Multi-Branch Operations Test against running Flask daemon and Aiven MySQL.
"""

import requests

BASE_URL = "http://127.0.0.1:5000"

def run_live_test():
    print("=== SMARTPHARM LIVE MULTI-BRANCH OPERATIONS VERIFICATION ===")

    # 1. Health check
    res = requests.get(f"{BASE_URL}/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("[1/6] Flask API is healthy.")

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
    print("[2/6] Authenticated successfully as Owner/Admin.")

    # 3. List Network Stores
    stores_res = requests.get(f"{BASE_URL}/api/multibranch/stores", headers=headers)
    assert stores_res.status_code == 200, f"Failed stores: {stores_res.text}"
    stores = stores_res.json()["data"]
    print(f"[3/6] Retrieved {len(stores)} active branch(es) in store network.")

    # 4. Query Cross-Store Stock for Medicine #1 (Crocin 650)
    stock_res = requests.get(f"{BASE_URL}/api/multibranch/stock-comparison/1", headers=headers)
    assert stock_res.status_code == 200, f"Failed cross-store stock: {stock_res.text}"
    stock_data = stock_res.json()["data"]
    print(f"[4/6] Queried cross-store stock for '{stock_data['brand_name']}': Total Network Stock={stock_data['total_network_stock']} units across {stock_data['stores_with_stock_count']} store(s).")

    # 5. Network Analytics (Executive Owner View)
    analytics_res = requests.get(f"{BASE_URL}/api/multibranch/analytics", headers=headers)
    assert analytics_res.status_code == 200, f"Failed analytics: {analytics_res.text}"
    analytics_data = analytics_res.json()["data"]
    print(f"[5/6] Network Analytics: Total Sales=INR {analytics_data['network_total_sales']}, Total Bills={analytics_data['network_total_bills']}, Branches={analytics_data['total_branches']}")

    # 6. Supplier Price Comparison Benchmarks
    price_res = requests.get(f"{BASE_URL}/api/multibranch/supplier-price-comparison", headers=headers)
    assert price_res.status_code == 200, f"Failed supplier prices: {price_res.text}"
    price_data = price_res.json()["data"]
    print(f"[6/6] Supplier Price Benchmark: Evaluated cross-branch distributor pricing across catalog.")
    print("=== LIVE MULTI-BRANCH VERIFICATION COMPLETE: ALL PASS ===")

if __name__ == "__main__":
    run_live_test()
