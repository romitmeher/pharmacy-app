"""
SmartPharm - Actual Medicine Packaging OCR Training & Extraction Pipeline
Strict compliance with SmartPharm PRD Rules 2, 9, 10, & 21:
- Runs PaddleOCR engine over actual medicine packaging images in data/Medicine_data/.
- Extracts visible text tokens, lines, brand names, generic compositions, strengths, batch numbers, and expiry dates.
- Matches extracted packaging OCR text against MySQL Medicine catalog.
- Pushes visual feature embeddings AND extracted OCR text tokens to Aiven Cloud PostgreSQL pgvector.
"""

import os
import sys
import json
import logging
import datetime
from typing import Any, Dict, List, Optional
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.vision.data_paths import DATA_ROOT

from app.vision.ocr_engine import default_ocr_engine
from app.vision.extractor import default_entity_extractor
from app.vision.matcher import default_medicine_matcher
from app.vision.image_vector_indexer import compute_image_visual_embedding, default_image_vector_indexer
from app.ai.vector_store import default_vector_store

logger = logging.getLogger(__name__)


class MedicinePackagingOCRIndexer:
    """
    Executes PaddleOCR label reading, entity extraction, catalog matching,
    and PostgreSQL pgvector indexing for actual medicine packaging images.
    """

    MEDICINE_DATA_DIR = str(DATA_ROOT / 'Medicine_data')

    def _ensure_pg_columns(self, conn):
        """Ensure medicine_image_vector_embeddings table has ocr_text and extracted_entities_json columns."""
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS medicine_image_vector_embeddings (
                    id SERIAL PRIMARY KEY,
                    image_filename VARCHAR(255) NOT NULL,
                    dataset_name VARCHAR(150),
                    label VARCHAR(255),
                    image_path TEXT,
                    embedding vector(384),
                    ocr_text TEXT,
                    extracted_entities_json JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (image_filename, dataset_name)
                );
            """)
            # Add columns if missing in existing table
            cur.execute("""
                ALTER TABLE medicine_image_vector_embeddings 
                ADD COLUMN IF NOT EXISTS ocr_text TEXT,
                ADD COLUMN IF NOT EXISTS extracted_entities_json JSONB;
            """)

    def process_actual_medicine_ocr(
        self, max_images: int = 500, batch_size: int = 50, store_id: int = 1
    ) -> Dict[str, Any]:
        """
        Scans data/Medicine_data/, runs PaddleOCR extraction, extracts entities,
        matches against MySQL catalog, and stores OCR text + 384-D visual embeddings in pgvector.
        """
        if not os.path.exists(self.MEDICINE_DATA_DIR):
            return {"status": "error", "message": f"Directory not found: {self.MEDICINE_DATA_DIR}"}

        conn = default_vector_store._get_pg_connection()
        if not conn:
            return {"status": "error", "message": "Aiven PostgreSQL pgvector connection unavailable."}

        self._ensure_pg_columns(conn)

        image_files = []
        for root, dirs, files in os.walk(self.MEDICINE_DATA_DIR):
            for f in files:
                if f.lower().endswith((".jpg", ".jpeg", ".png")):
                    image_files.append(os.path.join(root, f))
                    if len(image_files) >= max_images:
                        break
            if len(image_files) >= max_images:
                break

        logger.info(f"Processing OCR & Visual Vectors for {len(image_files)} actual medicine packaging images...")

        results = []
        processed_count = 0

        for ipath in image_files:
            fname = os.path.basename(ipath)
            dataset_name = "Actual_Medicine_Packaging_OCR"

            try:
                # 1. Read Image
                img = cv2.imread(ipath) if (cv2 and os.path.exists(ipath)) else None
                if img is None:
                    continue

                # 2. Compute 384-D Visual Feature Vector
                emb = compute_image_visual_embedding(img)

                # 3. Run PaddleOCR Engine
                ocr_res = default_ocr_engine.run_ocr(img)

                # 4. Extract Entities (Brand, Strength, Batch, Expiry, MRP)
                entities = default_entity_extractor.extract(ocr_res)
                entity_dict = entities.to_dict()

                # 5. Catalog Matching
                match_res = default_medicine_matcher.match(entities, store_id=store_id)
                match_dict = match_res.to_dict()

                candidate = match_res.top_candidate
                label_name = candidate.name if candidate else entities.brand_name or fname.split(".")[0]

                # 6. Push to Aiven PostgreSQL pgvector
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO medicine_image_vector_embeddings
                        (image_filename, dataset_name, label, image_path, embedding, ocr_text, extracted_entities_json)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (image_filename, dataset_name) DO UPDATE SET
                            label = EXCLUDED.label,
                            image_path = EXCLUDED.image_path,
                            embedding = EXCLUDED.embedding,
                            ocr_text = EXCLUDED.ocr_text,
                            extracted_entities_json = EXCLUDED.extracted_entities_json;
                        """,
                        (
                            fname,
                            dataset_name,
                            label_name,
                            ipath,
                            emb.tolist(),
                            ocr_res.full_text,
                            json.dumps({
                                "entities": entity_dict,
                                "match": match_dict,
                                "avg_ocr_confidence": round(ocr_res.avg_confidence, 4),
                            }),
                        )
                    )

                processed_count += 1
                results.append({
                    "filename": fname,
                    "label": label_name,
                    "ocr_confidence": round(ocr_res.avg_confidence, 3),
                    "ocr_text_length": len(ocr_res.full_text),
                    "matched_medicine": candidate.name if candidate else None,
                    "confidence_score": round(candidate.confidence_score, 3) if candidate else 0.0,
                })

                if processed_count % batch_size == 0:
                    logger.info(f"Actual Medicine OCR Training: Processed {processed_count}/{len(image_files)} images...")

            except Exception as e:
                logger.warning(f"Error processing OCR for image {fname}: {e}")

        conn.close()
        logger.info(f"Actual Medicine OCR Training Complete! Processed {processed_count} packaging images.")

        return {
            "status": "success",
            "total_processed": processed_count,
            "sample_results": results[:10],
        }


default_medicine_ocr_indexer = MedicinePackagingOCRIndexer()


if __name__ == "__main__":
    logger.info("Starting Actual Medicine Packaging OCR Training Pipeline...")
    res = default_medicine_ocr_indexer.process_actual_medicine_ocr(max_images=100)
    print("\nACTUAL MEDICINE PACKAGING OCR RESULT:")
    print(json.dumps(res, indent=2))
