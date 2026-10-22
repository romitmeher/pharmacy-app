"""Rotate only the isolated local demo accounts and demo signing key."""
import json

from demo_credentials import credential_path, new_credentials, save_credentials
from demo_environment import DEMO_ROOT, demo_app
from app.extensions import db
from app.models.user import User


def main():
    if not (DEMO_ROOT / "smartpharm-demo.sqlite3").exists():
        raise SystemExit("No local demo database found.")
    app = demo_app()
    credentials = new_credentials()
    with app.app_context():
        users = User.query.filter(User.email.like("%@demo.test")).all()
        if not users:
            raise SystemExit("No demo accounts found; no changes made.")
        for user in users:
            user.set_password(credentials["password"])
        db.session.commit()
        save_credentials(credentials)
        db.session.remove()
        db.engine.dispose()
    manifest_path = DEMO_ROOT / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest.pop("password", None)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Rotated {len(users)} local demo accounts. Restart the demo backend and sign in again.")
    print(f"Read the new password locally at: {credential_path()}")


if __name__ == "__main__":
    main()
