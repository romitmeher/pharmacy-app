"""Installation-specific local demo credentials; never include this file's output in a scan pack."""
import json
import os
from pathlib import Path
import secrets

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = PROJECT_ROOT / "data" / "demo"


def credential_path(root=DEFAULT_ROOT):
    root = Path(root).resolve()
    return (PROJECT_ROOT / "backend" / "instance" / "demo-credentials.json"
            if root == DEFAULT_ROOT.resolve() else root / ".demo-credentials.json")


def new_credentials():
    return {"password": secrets.token_urlsafe(24), "secret_key": secrets.token_urlsafe(48)}


def save_credentials(credentials, root=DEFAULT_ROOT):
    path = credential_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + secrets.token_hex(6) + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(credentials, stream)
    os.replace(temporary, path)


def get_demo_credentials(root=DEFAULT_ROOT):
    path = credential_path(root)
    if not path.exists():
        save_credentials(new_credentials(), root)
    credentials = json.loads(path.read_text(encoding="utf-8"))
    if not all(isinstance(credentials.get(key), str) and len(credentials[key]) >= 24
               for key in ("password", "secret_key")):
        raise RuntimeError("Invalid local demo credential file. Restore it or run rotate_demo_credentials.py.")
    return credentials
