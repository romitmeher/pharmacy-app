"""
SmartPharm - Master AI/ML Model & Vector Database Training Pipeline
Strict compliance with SmartPharm PRD Rules 4, 5, 10, 16, 17, 18, 19, & 21:
- Trains ML Demand Forecasting Models (Ridge / XGBoost / Exponential Smoothing).
- Trains ML Stockout & Expiry Risk Classifiers.
- Indexes Catalog Semantic Vectors into Aiven Cloud PostgreSQL pgvector.
- Indexes Prescription Training Image Visual Feature Vectors into Aiven Cloud PostgreSQL pgvector.
"""

import os
import sys
import json
import logging
import datetime
from typing import Any, Dict

# Ensure backend path is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from app.extensions import db
from app.models.store import Store
from app.models.medicine import Medicine
from app.models.inventory import Inventory
from app.ai.vector_store import default_vector_store
from app.vision.image_vector_indexer import default_image_vector_indexer
from app.vision.medicine_ocr_trainer import default_medicine_ocr_indexer
from app.ml.forecasting import default_forecasting_engine
from app.ml.stockout import default_stockout_predictor
from app.ml.expiry_risk import default_expiry_predictor
from app.ml.reorder import default_reorder_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_all")


def train_all_models(store_id: int = 1) -> Dict[str, Any]:
    """
    Executes full training pipeline across vector database embeddings,
    computer vision training images, actual medicine packaging OCR, ML demand forecasting, and inventory risk models.
    """
    summary = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "store_id": store_id,
        "results": {},
    }

    app = create_app()
    with app.app_context():
        # 1. Train & Index Catalog Text Vector Embeddings (pgvector)
        logger.info("=== STEP 1/5: Indexing Catalog Text Vector Embeddings into Aiven PostgreSQL pgvector ===")
        try:
            indexed_catalog = default_vector_store.index_store_catalog(store_id=store_id)
            summary["results"]["catalog_vector_indexing"] = {
                "status": "success",
                "indexed_count": indexed_catalog,
                "vector_dim": 384,
            }
            logger.info(f"Catalog Vector Indexing Complete: {indexed_catalog} medicines indexed into pgvector.")
        except Exception as e:
            logger.error(f"Catalog Vector Indexing Failed: {e}")
            summary["results"]["catalog_vector_indexing"] = {"status": "error", "error": str(e)}

        # 2. Train & Index Prescription & Actual Medicine Packaging Visual Feature Vectors + PaddleOCR Text Extraction (pgvector)
        logger.info("=== STEP 2/5: Indexing Prescription & Actual Medicine Packaging Images + Running PaddleOCR ===")
        try:
            img_result = default_image_vector_indexer.index_all_images(max_images=50000)
            ocr_result = default_medicine_ocr_indexer.process_actual_medicine_ocr(max_images=50000, store_id=store_id)
            summary["results"]["image_vector_indexing"] = img_result
            summary["results"]["actual_medicine_packaging_ocr"] = ocr_result
            logger.info(f"Image Vector & OCR Complete: {img_result.get('total_indexed', 0)} visual vectors and {ocr_result.get('total_processed', 0)} actual packaging OCR images processed.")
        except Exception as e:
            logger.error(f"Image Vector & OCR Failed: {e}")
            summary["results"]["image_vector_indexing"] = {"status": "error", "error": str(e)}




        # 3. Train & Evaluate ML Demand Forecasting Engine
        logger.info("=== STEP 3/5: Training ML Demand Forecasting Models ===")
        try:
            meds = Medicine.query.filter_by(store_id=store_id, is_active=True).limit(20).all()
            forecast_summary = []
            for m in meds:
                fc = default_forecasting_engine.forecast_demand(
                    medicine_id=m.id, store_id=store_id, horizon_days=14
                )
                forecast_summary.append({
                    "medicine_id": m.id,
                    "brand_name": m.brand_name,
                    "model_family": fc.model_family,
                    "total_14d_forecast": fc.total_forecasted_demand,
                    "mae": fc.evaluation_mae,
                })
            summary["results"]["demand_forecasting"] = {
                "status": "success",
                "evaluated_medicines_count": len(forecast_summary),
                "samples": forecast_summary[:5],
            }
            logger.info(f"ML Demand Forecasting Training Complete for {len(forecast_summary)} medicines.")
        except Exception as e:
            logger.error(f"ML Demand Forecasting Training Failed: {e}")
            summary["results"]["demand_forecasting"] = {"status": "error", "error": str(e)}

        # 4. Train & Evaluate ML Stockout & Expiry Risk Engines
        logger.info("=== STEP 4/5: Evaluating Stockout Risk & Expiry Risk Predictors ===")
        try:
            stockout_results = default_stockout_predictor.predict_store_stockouts(store_id=store_id)
            expiry_results = default_expiry_predictor.predict_store_expiry_risks(store_id=store_id)
            summary["results"]["stockout_and_expiry_risks"] = {
                "status": "success",
                "stockout_predictions_count": len(stockout_results),
                "expiry_predictions_count": len(expiry_results),
            }
            logger.info("Stockout & Expiry Risk Evaluation Complete.")
        except Exception as e:
            logger.error(f"Stockout & Expiry Risk Training Failed: {e}")
            summary["results"]["stockout_and_expiry_risks"] = {"status": "error", "error": str(e)}

        # 5. Smart Reorder Engine Optimization
        logger.info("=== STEP 5/5: Running Smart Reorder Recommendation Engine ===")
        try:
            reorder_plan = default_reorder_engine.get_store_reorder_recommendations(store_id=store_id)
            summary["results"]["smart_reorder"] = {
                "status": "success",
                "total_items_needing_reorder": len(reorder_plan),
                "reorder_items_sample": [item.to_dict() for item in reorder_plan[:3]],
            }
            logger.info(f"Smart Reorder Optimization Complete: {len(reorder_plan)} reorder items recommended.")
        except Exception as e:
            logger.error(f"Smart Reorder Engine Failed: {e}")
            summary["results"]["smart_reorder"] = {"status": "error", "error": str(e)}

    return summary



if __name__ == "__main__":
    logger.info("Starting Master SmartPharm AI/ML/Vector Training Pipeline...")
    res = train_all_models(store_id=1)
    print("\n" + "=" * 60)
    print("MASTER TRAINING PIPELINE SUMMARY RESULT:")
    print("=" * 60)
    print(json.dumps(res, indent=2))
