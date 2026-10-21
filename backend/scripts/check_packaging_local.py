"""Run the real scan API against an image using an isolated in-memory catalog."""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["PGVECTOR_URL"] = ""
os.environ["GEMINI_API_KEY"] = ""

from PIL import Image
from app import create_app
from app.extensions import db
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.medicine import Medicine, DosageForm
from app.services.auth_service import create_access_token


class LocalConfig:
    TESTING = True
    SECRET_KEY = "local-packaging-test-secret-key-at-least-32-characters"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGINS = []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--crop", type=int, nargs=4)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="Para wel 650")
    parser.add_argument("--strength", default="650 mg")
    args = parser.parse_args()
    with Image.open(args.image) as source:
        image = source.convert("RGB")
        if args.crop:
            image = image.crop(tuple(args.crop))
        payload = io.BytesIO()
        image.save(payload, format="PNG")
    app = create_app(config_class=LocalConfig)
    with app.app_context():
        db.create_all()
        store = Store(name="Isolated scan test")
        db.session.add(store)
        db.session.flush()
        user = User(store_id=store.id, email="local@test.invalid", username="local-scan",
                    full_name="Local scan test", role=UserRole.PHARMACIST, password_hash="unused")
        db.session.add(user)
        for name, generic, strength, form in [
            (args.name, "Paracetamol", args.strength, DosageForm.TABLET),
            ("Paracetamol", "Paracetamol", "650 mg", DosageForm.TABLET),
            ("Arteether Injection 150 mg", "Arteether", "150 mg", DosageForm.INJECTION),
        ]:
            db.session.add(Medicine(store_id=store.id, brand_name=name, generic_name=generic,
                                    strength=strength, dosage_form=form, mrp=30, selling_price=30))
        db.session.commit()
        token = create_access_token(user)
        # Exercise the real optional classifier path too, with no live database.
        app.config["TESTING"] = False
        results = []
        with app.test_client() as client:
            for run in range(2):
                started = time.monotonic()
                response = client.post("/api/vision/recognize", json={
                    "image_base64": base64.b64encode(payload.getvalue()).decode("ascii")},
                    headers={"Authorization": f"Bearer {token}"})
                result = {"run": run + 1, "seconds": round(time.monotonic()-started, 2),
                          "http_status": response.status_code, "response": response.get_json()}
                results.append(result)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(results, indent=2), encoding="utf-8")
                print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
