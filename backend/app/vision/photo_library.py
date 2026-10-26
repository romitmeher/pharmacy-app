"""Resumable, labelled photo collection and a local reference-feature index.

This indexes images; it does not train PaddleOCR or a medicine classifier.
No business database or external AI service is accessed by this module.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import cv2
import numpy as np
from PIL import Image

from app.vision.data_paths import DATA_ROOT

ALLOWED_HOSTS = {"onemg.gumlet.io", "www.netmeds.com"}
MAX_IMAGE_BYTES = 12 * 1024 * 1024


def normalize_label(value):
    value = re.sub(r"\b(?:tablets?|capsules?|injections?|syrups?|strips?|of)\b", " ", value, flags=re.I)
    value = re.sub(r"\b\d+\s*['’]s\b", " ", value, flags=re.I)
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def connect_library(root=None):
    root = Path(root or DATA_ROOT / "medicine_photos").resolve()
    root.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(root / "library.sqlite3", timeout=30)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE,
            state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            path TEXT, sha256 TEXT, width INTEGER, height INTEGER,
            vector BLOB, error TEXT, updated REAL
        );
        CREATE INDEX IF NOT EXISTS photo_state ON photos(state, id);
        CREATE INDEX IF NOT EXISTS photo_hash ON photos(sha256);
        CREATE TABLE IF NOT EXISTS labels (
            photo_id INTEGER NOT NULL REFERENCES photos(id),
            name TEXT NOT NULL, normalized TEXT NOT NULL, source TEXT NOT NULL,
            UNIQUE(photo_id, name, source)
        );
        CREATE INDEX IF NOT EXISTS label_name ON labels(normalized);
    """)
    return connection


def prepare(root=None, data_dir=None):
    connection = connect_library(root)
    rows = 0
    sources = [("India Medicines and Drug Info Dataset.csv", "Medicine Name", "Image URL"),
               ("medicines.csv", "med_name", "img_urls")]
    for filename, name_field, image_field in sources:
        source = Path(data_dir or DATA_ROOT) / filename
        if not source.exists():
            continue
        with source.open(encoding="utf-8-sig", errors="replace", newline="") as handle:
            for row in csv.DictReader(handle):
                name = (row.get(name_field) or "").strip()
                if not name:
                    continue
                for url in re.findall(r"https?://[^\s\"'\]]+", row.get(image_field) or ""):
                    url = url.rstrip(",")
                    parsed = urlparse(url)
                    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
                        continue
                    connection.execute("INSERT OR IGNORE INTO photos(url) VALUES (?)", (url,))
                    photo_id = connection.execute("SELECT id FROM photos WHERE url=?", (url,)).fetchone()[0]
                    connection.execute("INSERT OR IGNORE INTO labels VALUES (?,?,?,?)",
                                       (photo_id, name, normalize_label(name), filename))
                    rows += 1
                if rows and rows % 5000 == 0:
                    connection.commit()
        connection.commit()
    connection.close()
    return status(root)


def status(root=None):
    connection = connect_library(root)
    result = dict(connection.execute("SELECT state, count(*) FROM photos GROUP BY state"))
    result["total_urls"] = connection.execute("SELECT count(*) FROM photos").fetchone()[0]
    result["labelled_medicines"] = connection.execute("SELECT count(DISTINCT normalized) FROM labels").fetchone()[0]
    result["unique_downloaded_images"] = connection.execute("SELECT count(DISTINCT sha256) FROM photos WHERE state='indexed'").fetchone()[0]
    connection.close()
    return result


def fetch_photo(row, root):
    photo_id, url = row
    try:
        request = Request(url, headers={"User-Agent": "SmartPharmPhotoLibrary/1.0", "Accept": "image/*"})
        with urlopen(request, timeout=25) as response:
            if urlparse(response.url).hostname not in ALLOWED_HOSTS:
                raise ValueError("Redirect outside photo source")
            raw = response.read(MAX_IMAGE_BYTES + 1)
        if len(raw) > MAX_IMAGE_BYTES:
            raise ValueError("Image exceeds 12 MB limit")
        with Image.open(io.BytesIO(raw)) as image:
            if image.width < 80 or image.height < 80 or image.width * image.height > 40_000_000:
                raise ValueError("Image dimensions unsuitable for packaging reference")
            image.load()
            rgb = image.convert("RGB")
            rgb.thumbnail((1600, 1600))
            width, height = rgb.size
            buffer = io.BytesIO()
            rgb.save(buffer, format="JPEG", quality=92)
            encoded = buffer.getvalue()
        digest = hashlib.sha256(encoded).hexdigest()
        relative = Path("images") / digest[:2] / (digest + ".jpg")
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            temporary = destination.with_name(destination.name + f".{photo_id}.part")
            temporary.write_bytes(encoded)
            temporary.replace(destination)
        # Same features as the application's visual reference matcher.
        from app.vision.visual_indexer import default_visual_indexer
        bgr = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
        vector = default_visual_indexer.extract_visual_embedding(bgr).astype("float32").tobytes()
        return ("indexed", str(relative), digest, width, height, vector, None, time.time(), photo_id)
    except HTTPError as error:
        # Stop on rate limiting/access denial; do not bypass source restrictions.
        return ("blocked" if error.code in (401, 403, 429) else "failed",
                None, None, None, None, None, f"HTTP {error.code}", time.time(), photo_id)
    except Exception as error:
        return ("failed", None, None, None, None, None, str(error)[:200], time.time(), photo_id)


def download(root=None, workers=12, limit=0, min_free_gb=10):
    root = Path(root or DATA_ROOT / "medicine_photos").resolve()
    connection = connect_library(root)
    processed = 0
    workers = max(1, min(workers, 32))
    # Parallel image jobs already use the CPU; avoid nested OpenCV thread pools.
    cv2.setNumThreads(1)
    next_progress = 100
    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            while not limit or processed < limit:
                if shutil.disk_usage(root).free < min_free_gb * 1024 ** 3:
                    print(json.dumps({"stopped": "Free disk space reserve reached"}), flush=True)
                    break
                count = min(workers * 4, limit - processed) if limit else workers * 4
                rows = connection.execute("SELECT id,url FROM photos WHERE state='pending' ORDER BY CASE WHEN url LIKE 'https://onemg.gumlet.io/%' THEN 0 ELSE 1 END, id LIMIT ?", (count,)).fetchall()
                if not rows:
                    break
                futures = [executor.submit(fetch_photo, row, root) for row in rows]
                for future in as_completed(futures):
                    result = future.result()
                    connection.execute("""UPDATE photos SET state=?,path=?,sha256=?,width=?,height=?,vector=?,error=?,updated=?,
                                          attempts=attempts+1 WHERE id=?""", result)
                    processed += 1
                connection.commit()
                if processed >= next_progress or limit and processed >= limit:
                    print(json.dumps({"processed_this_run": processed, **status(root)}), flush=True)
                    next_progress = (processed // 100 + 1) * 100
                if any(value[0] == "blocked" for value in connection.execute(
                        "SELECT state FROM photos WHERE id IN (%s)" % ",".join("?" for _ in rows),
                        [row[0] for row in rows])):
                    print(json.dumps({"stopped": "Photo source denied or rate-limited requests; no bypass attempted"}), flush=True)
                    break
    finally:
        connection.close()
    return status(root)


def reference_similarity(image, name, strength="", root=None):
    from flask import has_app_context, current_app
    if has_app_context() and not current_app.testing:
        return None  # Offline SQLite training indexes are not operational databases.
    root = Path(root or DATA_ROOT / "medicine_photos").resolve()
    if not (root / "library.sqlite3").exists():
        return None
    keys = [normalize_label(name), normalize_label(f"{name} {strength or ''}")]
    # Read-only access: recognition never downloads files or creates the library.
    with sqlite3.connect((root / "library.sqlite3").as_uri() + "?mode=ro", uri=True, timeout=1) as connection:
        rows = connection.execute("""SELECT DISTINCT p.vector FROM photos p JOIN labels l ON l.photo_id=p.id
                                   WHERE p.state='indexed' AND l.normalized IN (?,?)
                                   AND NOT EXISTS (
                                     SELECT 1 FROM labels other JOIN photos duplicate ON duplicate.id=other.photo_id
                                     WHERE duplicate.sha256=p.sha256 AND other.normalized<>l.normalized
                                   ) LIMIT 24""", keys).fetchall()
    if not rows:
        return None
    from app.vision.visual_indexer import default_visual_indexer
    query = default_visual_indexer.extract_visual_embedding(image)
    vectors = [np.frombuffer(row[0], dtype=np.float32) for row in rows]
    return max((float(np.clip(np.dot(query, vector), 0, 1)) for vector in vectors if len(vector) == len(query)), default=None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "download", "status"])
    parser.add_argument("--root", type=Path)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--limit", type=int, default=0, help="0 processes every remaining URL")
    args = parser.parse_args()
    if args.command == "prepare":
        result = prepare(args.root)
    elif args.command == "download":
        result = download(args.root, args.workers, args.limit)
    else:
        result = status(args.root)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
