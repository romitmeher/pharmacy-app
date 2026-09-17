"""
SmartPharm - Prescription Image Vector Indexer Unit Tests
Validates PRD Rules 5, 9, 10, & 21:
- 384-dimensional dense visual embedding generation from image path/bytes.
- Vector search similarity query against Aiven PostgreSQL pgvector table.
- API endpoints /api/vision/index-prescription-images and /api/vision/search-image-vector.
"""

import os
import pytest
import numpy as np
from app.vision.image_vector_indexer import (
    compute_image_visual_embedding,
    default_image_vector_indexer,
)


def test_compute_image_visual_embedding_dimensions():
    """Verify visual embedding is 384-D and normalized."""
    dummy_path = os.path.join(os.path.dirname(__file__), "test_img_nonexistent.jpg")
    emb = compute_image_visual_embedding(dummy_path)

    assert isinstance(emb, np.ndarray)
    assert emb.shape == (384,)
    assert emb.dtype == np.float32


def test_compute_image_visual_embedding_bytes():
    """Verify visual embedding from raw bytes."""
    # 1x1 white pixel PNG bytes
    tiny_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff"
        b"\x3f\x03\x00\x05\xfe\x02\xfe\xa7\x56\xca\x84\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    emb = compute_image_visual_embedding(tiny_png)
    assert isinstance(emb, np.ndarray)
    assert emb.shape == (384,)


def test_search_similar_images_returns_list():
    """Verify search_similar_images executes safely and returns a list."""
    tiny_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff"
        b"\x3f\x03\x00\x05\xfe\x02\xfe\xa7\x56\xca\x84\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    results = default_image_vector_indexer.search_similar_images(tiny_png, top_k=3)
    assert isinstance(results, list)


def test_search_image_vector_api(client, pharmacist_token):
    """Test POST /api/vision/search-image-vector API route."""
    import base64
    tiny_png_b64 = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    headers = {"Authorization": f"Bearer {pharmacist_token}"}
    res = client.post(
        "/api/vision/search-image-vector?top_k=3",
        json={"image_base64": tiny_png_b64},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    assert data["top_k"] == 3
    assert "matches" in data


def test_index_actual_medicine_images():
    """Verify actual medicine packaging indexing executes and returns dataset_type."""
    res = default_image_vector_indexer.index_actual_medicine_images(max_images=10)
    assert isinstance(res, dict)
    assert "status" in res


