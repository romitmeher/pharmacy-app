import csv
import io
from urllib.error import HTTPError
from unittest.mock import patch

import numpy as np
from PIL import Image

from app.vision.photo_library import connect_library, fetch_photo, prepare, reference_similarity, status


def test_prepare_preserves_labels_and_deduplicates_urls(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    with (source / "India Medicines and Drug Info Dataset.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Medicine Name", "Image URL"])
        writer.writeheader()
        writer.writerows([
            {"Medicine Name": "Dolo 650 Tablet", "Image URL": "https://onemg.gumlet.io/a_ignore,w_380/test.jpg"},
            {"Medicine Name": "Dolo 650", "Image URL": "https://onemg.gumlet.io/a_ignore,w_380/test.jpg"},
            {"Medicine Name": "Unsafe URL", "Image URL": "http://127.0.0.1/private"},
        ])
    result = prepare(tmp_path / "library", source)
    assert result["total_urls"] == 1
    with connect_library(tmp_path / "library") as connection:
        assert connection.execute("SELECT count(*) FROM labels").fetchone()[0] == 2


def test_download_validates_and_indexes_labelled_photo(tmp_path):
    image = Image.new("RGB", (120, 90), (10, 120, 30))
    payload = io.BytesIO()
    image.save(payload, format="PNG")
    response = io.BytesIO(payload.getvalue())
    response.url = "https://onemg.gumlet.io/test.png"
    with patch("app.vision.photo_library.urlopen", return_value=response):
        result = fetch_photo((1, response.url), tmp_path)
    assert result[0] == "indexed"
    assert np.frombuffer(result[5], dtype=np.float32).shape == (512,)
    assert (tmp_path / result[1]).is_file()
    with connect_library(tmp_path) as connection:
        connection.execute("INSERT INTO photos(id,url,state,vector,sha256) VALUES (1,?,'indexed',?,?)",
                           (response.url, result[5], result[2]))
        connection.execute("INSERT INTO labels VALUES (1, 'Dolo 650 Tablet', 'dolo650', 'test')")
    query = np.asarray(image)[:, :, ::-1].copy()
    assert reference_similarity(query, "Dolo 650", root=tmp_path) > 0.99
    assert reference_similarity(query, "Unknown", root=tmp_path) is None
    assert status(tmp_path)["indexed"] == 1
    with connect_library(tmp_path) as connection:
        connection.execute("INSERT INTO labels VALUES (1, 'Different medicine', 'differentmedicine', 'test')")
    assert reference_similarity(query, "Dolo 650", root=tmp_path) is None


def test_rate_limit_is_reported_without_bypass(tmp_path):
    with patch("app.vision.photo_library.urlopen", side_effect=HTTPError("https://onemg.gumlet.io/test", 429, "Rate limited", {}, None)) as request:
        result = fetch_photo((1, "https://onemg.gumlet.io/test"), tmp_path)
    assert result[0] == "blocked"
    assert request.call_count == 1
    assert not list(tmp_path.rglob("*.jpg"))
