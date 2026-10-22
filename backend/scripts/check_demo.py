"""Exercise all real demo barcode images and checkout in a disposable DB copy."""
import base64
import json
import sqlite3
import tempfile
import time
from pathlib import Path
from demo_environment import demo_app, DEMO_ROOT
from demo_credentials import get_demo_credentials


def main():
    rows = json.loads((DEMO_ROOT / "stock.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="smartpharm-demo-check-") as folder:
        root = Path(folder)
        original = sqlite3.connect(DEMO_ROOT / "smartpharm-demo.sqlite3")
        copy = sqlite3.connect(root / "smartpharm-demo.sqlite3")
        original.backup(copy); copy.close(); original.close()
        app = demo_app(root)
        client = app.test_client()
        login = client.post("/api/auth/login", json={"email": "owner@demo.test", "password": get_demo_credentials()["password"]})
        assert login.status_code == 200, login.json
        auth = {"Authorization": "Bearer " + login.json["token"]}
        checked = []
        for row in rows:
            started = time.monotonic()
            image = base64.b64encode((DEMO_ROOT / row["barcode_image"]).read_bytes()).decode()
            response = client.post("/api/medicines/barcode-image", json={"image_base64": image}, headers=auth)
            assert response.status_code == 200, response.json
            assert response.json["barcode"] == row["barcode"]
            lookup = client.get("/api/medicines/barcode", query_string={"code": response.json["barcode"]}, headers=auth)
            assert lookup.status_code == 200 and lookup.json["medicine"]["id"] == row["medicine_id"]
            checked.append({"medicine": row["name"], "barcode": row["barcode"], "passed": True,
                            "seconds": round(time.monotonic()-started, 3)})
        # Checkout modifies only the temporary database clone.
        row = rows[0]
        sale = client.post("/api/sales", headers=auth, json={"items": [{"medicine_id": row["medicine_id"],
            "quantity": 1, "unit_price": row["demo_mrp"]}], "payments": [{"payment_method": "cash", "amount": row["demo_mrp"]}]})
        assert sale.status_code == 201, sale.json
        report = {"login_passed": True, "real_barcode_images": checked, "checkout_passed": True,
                  "checkout_invoice": sale.json["sale"]["invoice_number"], "original_database_unchanged": True}
        (DEMO_ROOT / "demo-check.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({"barcode_images_passed": len(checked), "checkout_passed": True,
                          "mean_scan_lookup_seconds": round(sum(r["seconds"] for r in checked)/len(checked), 3)}))
        with app.app_context():
            from app.extensions import db
            db.session.remove(); db.engine.dispose()


if __name__ == "__main__":
    main()
