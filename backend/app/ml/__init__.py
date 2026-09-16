"""
SmartPharm Machine Learning Subsystem.
Strict compliance with SmartPharm PRD Phase 5 (Rules 15, 16, 17, 18):
- Demand Forecasting (Adaptive Exponential Smoothing + Ridge Regressor with MAE/RMSE)
- Stock-out Probability Predictor (Runway calculation, risk classifications, explainability)
- Expiry Risk Prediction (Passive date vs sell-through probability & financial loss estimation)
- Smart Reorder Engine (Lead time, Review horizon, Safety stock, Pipeline PO deduction)
"""

from app.ml.forecasting import (
    DemandForecastingEngine,
    DemandForecastResult,
    default_forecasting_engine,
)
from app.ml.stockout import (
    StockOutPredictor,
    StockOutPrediction,
    StockOutRiskLevel,
    default_stockout_predictor,
)
from app.ml.expiry_risk import (
    ExpiryRiskPredictor,
    BatchExpiryPrediction,
    ExpiryRiskCategory,
    default_expiry_predictor,
)
from app.ml.reorder import (
    SmartReorderEngine,
    ReorderRecommendation,
    ReorderUrgency,
    default_reorder_engine,
)

__all__ = [
    "DemandForecastingEngine",
    "DemandForecastResult",
    "default_forecasting_engine",
    "StockOutPredictor",
    "StockOutPrediction",
    "StockOutRiskLevel",
    "default_stockout_predictor",
    "ExpiryRiskPredictor",
    "BatchExpiryPrediction",
    "ExpiryRiskCategory",
    "default_expiry_predictor",
    "SmartReorderEngine",
    "ReorderRecommendation",
    "ReorderUrgency",
    "default_reorder_engine",
]
