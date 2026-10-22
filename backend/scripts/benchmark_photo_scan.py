"""Regression benchmark on demo photos; not an independent clinical accuracy test."""
import argparse
import base64
import json
import time
from demo_environment import demo_app, DEMO_ROOT
from demo_credentials import get_demo_credentials


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="photo-baseline.json")
    args = parser.parse_args()
    app = demo_app()
    client = app.test_client()
    login = client.post("/api/auth/login", json={"email": "owner@demo.test", "password": get_demo_credentials()["password"]})
    auth = {"Authorization": "Bearer " + login.json["token"]}
    report = []
    for row in json.loads((DEMO_ROOT / "stock.json").read_text(encoding="utf-8")):
        payload = base64.b64encode((DEMO_ROOT / row["photo"]).read_bytes()).decode()
        start = time.monotonic()
        response = client.post("/api/vision/recognize", json={"image_base64": payload}, headers=auth)
        data = (response.json or {}).get("data", {})
        candidate = (data.get("match_result") or {}).get("top_candidate")
        result = {"expected": row["name"], "expected_id": row["medicine_id"], "http": response.status_code,
            "seconds": round(time.monotonic()-start, 2), "candidate": candidate,
            "correct": bool(candidate and candidate["medicine_id"] == row["medicine_id"]),
            "wrong_match": bool(candidate and candidate["medicine_id"] != row["medicine_id"]),
            "ocr": (data.get("ocr") or {}).get("full_text", ""),
            "entities": data.get("extracted_entities"), "error": (response.json or {}).get("message")}
        report.append(result)
        (DEMO_ROOT / args.output).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({k:result[k] for k in ["expected", "http", "seconds", "correct", "wrong_match", "error"]}), flush=True)
    print(json.dumps({"photos": len(report), "correct": sum(r["correct"] for r in report),
                      "wrong_matches": sum(r["wrong_match"] for r in report)}), flush=True)


if __name__ == "__main__":
    main()
