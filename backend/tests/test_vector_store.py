"""
Unit & Integration Tests for Vector Database & RAG Semantic Embedding Index.
"""

import pytest
import numpy as np
from app.models.medicine import Medicine, DosageForm
from app.ai.vector_store import MedicineVectorIndex, default_vector_store
from app.ai.rag_engine import default_rag_engine, CopilotIntent


def test_compute_text_embedding():
    """Verify 384-D embedding vector calculation and L2 unit normalization."""
    indexer = MedicineVectorIndex()
    vec = indexer.compute_text_embedding("Glimepiride 1mg and Metformin 500mg Tablets")

    assert isinstance(vec, np.ndarray)
    assert vec.shape == (384,)
    # L2 norm of non-zero vector should be 1.0 (or 0.0 for empty text)
    norm = np.linalg.norm(vec)
    assert abs(norm - 1.0) < 1e-4

    # Empty text produces zero vector
    empty_vec = indexer.compute_text_embedding("")
    assert np.linalg.norm(empty_vec) == 0.0


def test_index_medicine_and_search():
    """Verify document indexing and Cosine Similarity search ranking."""
    indexer = MedicineVectorIndex()
    indexer.index_medicine(
        medicine_id=101,
        store_id=9999,
        brand_name="Glitch-M1",
        generic_name="Glimepiride + Metformin",
        category="Anti-Diabetic",
        strength="1mg/500mg",
        manufacturer="Mecoson Labs",
    )
    indexer.index_medicine(
        medicine_id=102,
        store_id=9999,
        brand_name="Pan-D",
        generic_name="Pantoprazole + Domperidone",
        category="Gastrointestinal",
        strength="40mg/30mg",
        manufacturer="Alkem Laboratories",
    )

    # Search for diabetes term
    results = indexer.search_semantic_knowledge("Glimepiride Metformin diabetes", store_id=9999, top_k=2)
    assert len(results) > 0
    assert results[0].brand_name == "Glitch-M1"
    assert results[0].similarity_score > 0.30



def test_store_catalog_indexing(db, sample_store):
    """Verify indexing medicines from database catalog."""
    med = Medicine(
        store_id=sample_store.id,
        brand_name="Telma 40",
        generic_name="Telmisartan",
        strength="40mg",
        dosage_form=DosageForm.TABLET,
        category="Cardiovascular",
        is_active=True,
    )
    db.session.add(med)
    db.session.commit()

    indexer = MedicineVectorIndex()
    count = indexer.index_store_catalog(store_id=sample_store.id)
    assert count >= 1

    results = indexer.search_semantic_knowledge("Telmisartan 40mg", store_id=sample_store.id, top_k=5)
    assert len(results) > 0
    assert any("Telmisartan" in r.generic_name or "Telma" in r.brand_name or "Telmisartan" in r.brand_name for r in results)


def test_rag_copilot_vector_semantic_search(db, sample_store):
    """Verify RAG engine vector search integration for clinical queries."""
    med = Medicine(
        store_id=sample_store.id,
        brand_name="Augmentin 625 Duo",
        generic_name="Amoxicillin + Clavulanate",
        strength="500mg/125mg",
        dosage_form=DosageForm.TABLET,
        category="Antibiotic",
        is_active=True,
    )
    db.session.add(med)
    db.session.commit()

    # Index store catalog
    default_vector_store.index_store_catalog(store_id=sample_store.id)

    # Query general clinical category term
    resp = default_rag_engine.answer_query("Tell me about antibiotic medicines", store_id=sample_store.id)
    assert resp.answer is not None
    assert len(resp.answer) > 0

