"""
Integration tests for SmartPharm Multi-Modal Vision Recognition Pipeline (Stage 1 + Stage 2).
"""

import os
import pytest
import numpy as np
import cv2

from app.vision.reference_db import seed_reference_medicine_database, INDIAN_REFERENCE_MEDICINES
from app.vision.matcher import default_medicine_matcher, ExtractedEntities
from app.vision.data_collection import default_reference_pipeline
from app.vision.visual_indexer import default_visual_indexer, VisualFeatureIndexer
from app.vision import recognize_medicine_image


def test_reference_database_seeding(db, app):
    """Test seeding reference Indian medicines and aliases into store database."""
    with app.app_context():
        res = seed_reference_medicine_database(store_id=1)
        assert res["added"] > 0 or res["updated"] > 0


def test_stage1_text_fuzzy_matching(db, app):
    """Test Stage 1 token-sort fuzzy matching for packaging text variations."""
    with app.app_context():
        seed_reference_medicine_database(store_id=1)

        # Test case 1: GLITCH M1 OCR text variation
        entities1 = ExtractedEntities(
            brand_name="GLITCH M1 TABLETS",
            generic_name="Glimepiride Metformin",
            strength="1mg/500mg",
            manufacturer="MECOSON",
            batch_number="B123",
            confidence=0.92,
        )
        match_res1 = default_medicine_matcher.match(entities1, store_id=1)
        assert match_res1.top_candidate is not None
        assert "Glitch" in match_res1.top_candidate.name
        assert match_res1.top_candidate.confidence_score >= 50.0
        assert not match_res1.low_confidence

        # Test case 2: PAN-D Capsule
        entities2 = ExtractedEntities(
            brand_name="PAN D",
            generic_name="Pantoprazole Domperidone",
            strength="40mg/30mg",
            confidence=0.88,
        )
        match_res2 = default_medicine_matcher.match(entities2, store_id=1)
        assert match_res2.top_candidate is not None
        assert "Pan-D" in match_res2.top_candidate.name


def test_stage2_visual_indexer_similarity():
    """Test Stage 2 512-D visual feature vector extraction and cosine similarity."""
    indexer = VisualFeatureIndexer()

    # Generate synthetic image for Glitch-M1
    img_glitch = default_reference_pipeline.create_synthetic_reference_image(
        brand_name="Glitch-M1",
        generic_name="Glimepiride 1mg + Metformin 500mg",
        manufacturer="Mecoson Labs",
    )
    indexer.add_reference_image(
        medicine_id=1, brand_name="Glitch-M1", sample_id="ref_1", image_bgr=img_glitch
    )

    # Search with identical image -> similarity should be ~1.0
    results = indexer.search_similar(img_glitch, top_k=3)
    assert len(results) > 0
    assert results[0].brand_name == "Glitch-M1"
    assert results[0].similarity_score >= 0.95

    # Search with plain black image -> lower similarity than exact match
    black_img = np.zeros((400, 400, 3), dtype=np.uint8)
    black_results = indexer.search_similar(black_img, top_k=3)
    assert len(black_results) > 0
    assert black_results[0].similarity_score < results[0].similarity_score - 0.15


def test_end_to_end_multimodal_recognition_pipeline(db, app):
    """Test full multi-modal pipeline execution on synthetic image."""
    with app.app_context():
        seed_reference_medicine_database(store_id=1)

        img = default_reference_pipeline.create_synthetic_reference_image(
            brand_name="Dolo 650",
            generic_name="Paracetamol 650mg",
            manufacturer="Micro Labs Limited",
        )

        res = recognize_medicine_image(img, store_id=1)
        assert res.success is True
        assert res.quality.is_acceptable is True
        assert res.match_result is not None


def test_prd_rule9_low_confidence_fallback(db, app):
    """Verify severe image quality issues or unrecognized brands enforce low_confidence warning."""
    with app.app_context():
        # Severely blurry image
        blurry_img = np.ones((100, 100, 3), dtype=np.uint8) * 128
        res = recognize_medicine_image(blurry_img, store_id=1)

        # Quality check should reject or produce low confidence
        assert res.human_verification_required is True
        if res.success:
            assert res.match_result.low_confidence is True
            assert res.match_result.warning_message is not None
        else:
            assert "quality" in res.error_message.lower() or "too low" in res.error_message.lower()
