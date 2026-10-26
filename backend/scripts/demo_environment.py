"""Start the shared Aiven app; retain an explicit offline fixture factory for tests."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from demo_credentials import get_demo_credentials

DEMO_ROOT = Path(__file__).resolve().parents[2] / "data" / "demo"


def demo_app(root=DEMO_ROOT):
    credentials = get_demo_credentials(root)
    class DemoConfig:
        SECRET_KEY = credentials["secret_key"]
        SQLALCHEMY_DATABASE_URI = "sqlite:///" + str((root / "smartpharm-demo.sqlite3").resolve()).replace("\\", "/")
        SQLALCHEMY_TRACK_MODIFICATIONS = False
        SQLALCHEMY_ENGINE_OPTIONS = {}
        CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
        DEBUG = False
        TESTING = False
        PGVECTOR_URL = ""
        GEMINI_API_KEY = ""
        SMARTPHARM_PHOTO_MODEL = str(root / "paired-20261025" / "model") if (root / "paired-20261025" / "model" / "classifier.pt").is_file() else None
        DEMO_PHOTO_REVIEW = bool(SMARTPHARM_PHOTO_MODEL)
    root.mkdir(parents=True, exist_ok=True)
    return create_app(config_class=DemoConfig)


if __name__ == "__main__":
    # The interactive app now shares Aiven with GCP. demo_app() remains only
    # for isolated regression checks against old disposable fixture copies.
    app = create_app()
    from app.extensions import db
    with app.app_context():
        if db.engine.dialect.name != "mysql" or not app.config.get("PGVECTOR_URL"):
            raise SystemExit("Configure Aiven MySQL and PostgreSQL before starting the app.")
    # Initialize the OCR model while the presenter logs in; do not pre-process
    # demo photos or substitute canned recognition responses.
    from threading import Thread
    from app.vision.ocr_engine import default_ocr_engine
    Thread(target=default_ocr_engine._get_engine, daemon=True, name="demo-ocr-warmup").start()
    app.run(host="127.0.0.1", port=5000, use_reloader=False)
