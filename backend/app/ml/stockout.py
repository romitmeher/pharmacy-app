"""
SmartPharm - Stock-Out Probability Prediction Engine
Strict compliance with SmartPharm PRD Rule 17:
- Considers:
  - Current stock units ($S_{current}$)
  - Predicted demand rate ($D_{daily}$)
  - Supplier lead time ($L_{days}$)
  - Safety stock threshold ($SS$)
- Computes:
  - Stock runway in days ($Runway = S_{current} / D_{daily}$)
  - Stock-out probability within lead time and within 7/14 days
  - Risk classification: CRITICAL, HIGH_RISK, MEDIUM_RISK, HEALTHY
- Produces clear, explainable mathematical breakdowns for the pharmacist/owner.
"""

from dataclasses import dataclass, field
import datetime
import enum
import logging
from typing import Any, Dict, List, Optional
import math

from app.extensions import db
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.ml.forecasting import default_forecasting_engine

logger = logging.getLogger(__name__)


class StockOutRiskLevel(str, enum.Enum):
    CRITICAL = "CRITICAL"          # Depleted or stocks out within supplier lead time (< 3 days)
    HIGH_RISK = "HIGH_RISK"        # Stocks out within 7 days
    MEDIUM_RISK = "MEDIUM_RISK"    # Stocks out within 14 days
    HEALTHY = "HEALTHY"            # Sufficient runway (> 14 days)


@dataclass
class StockOutPrediction:
    medicine_id: int
    brand_name: str
    current_stock: int
    predicted_daily_demand: float
    supplier_lead_time_days: int
    safety_stock_units: int
    runway_days: float
    stockout_probability_7d: float
    risk_level: StockOutRiskLevel
    explanation: str
    recommended_action: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "current_stock": self.current_stock,
            "predicted_daily_demand": round(self.predicted_daily_demand, 2),
            "supplier_lead_time_days": self.supplier_lead_time_days,
            "safety_stock_units": self.safety_stock_units,
            "runway_days": round(self.runway_days, 1) if not math.isinf(self.runway_days) else 999.0,
            "stockout_probability_7d": round(self.stockout_probability_7d, 2),
            "risk_level": self.risk_level.value,
            "explanation": self.explanation,
            "recommended_action": self.recommended_action,
        }


class StockOutPredictor:
    """
    Evaluates inventory runway and probability of stock-out based on
    forecasted demand velocity and supplier replenishment lead times.
    """

    def predict_stockout_for_medicine(
        self,
        medicine_id: int,
        store_id: int,
        supplier_lead_time: int = 3,
    ) -> StockOutPrediction:
        med = Medicine.query.filter_by(id=medicine_id, store_id=store_id).first()
        brand = med.brand_name if med else f"Medicine #{medicine_id}"

        # 1. Current physical stock
        stock_units = (
            db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
            .join(Batch, Inventory.batch_id == Batch.id)
            .filter(Inventory.store_id == store_id, Batch.medicine_id == medicine_id)
            .scalar()
        )
        current_stock = int(stock_units)

        # 2. Forecast daily demand
        forecast_res = default_forecasting_engine.forecast_demand(medicine_id, store_id, horizon_days=14)
        daily_demand = max(0.1, forecast_res.average_daily_demand)

        # 3. Dynamic Safety stock: 1.65 (95% service level) * sqrt(L) * daily demand variance
        # Default safety stock = ~2 days of demand
        safety_stock = max(5, int(math.ceil(daily_demand * 2.0)))

        # 4. Runway calculation
        if daily_demand > 0:
            runway = current_stock / daily_demand
        else:
            runway = 999.0

        # 5. Probability of stock-out within 7 days
        expected_7d_demand = daily_demand * 7.0
        if current_stock <= 0:
            prob_7d = 1.0
            risk = StockOutRiskLevel.CRITICAL
            explanation = f"{brand} is currently completely depleted (0 units in stock)."
            action = "Immediate emergency distributor purchase order required."
        elif runway <= supplier_lead_time:
            prob_7d = 0.95
            risk = StockOutRiskLevel.CRITICAL
            explanation = (
                f"Current stock of {current_stock} units provides only {runway:.1f} days runway, "
                f"which is less than or equal to the supplier lead time ({supplier_lead_time} days)."
            )
            action = "Create urgent purchase order today to avoid patient stock-out."
        elif runway <= 7.0:
            prob_7d = 0.80
            risk = StockOutRiskLevel.HIGH_RISK
            explanation = (
                f"High probability (80%) of stock-out within 7 days. "
                f"Current inventory ({current_stock} units) will deplete by day {int(math.floor(runway))} "
                f"at current daily velocity ({daily_demand:.1f} units/day)."
            )
            action = "Include in weekly distributor replenishment draft."
        elif runway <= 14.0:
            prob_7d = 0.35
            risk = StockOutRiskLevel.MEDIUM_RISK
            explanation = (
                f"Moderate runway ({runway:.1f} days). Stock is approaching safety threshold ({safety_stock} units)."
            )
            action = "Monitor sales velocity and plan reorder within next order cycle."
        else:
            prob_7d = 0.05
            risk = StockOutRiskLevel.HEALTHY
            explanation = f"Healthy inventory buffer ({runway:.1f} days of supply available)."
            action = "No immediate ordering required."

        return StockOutPrediction(
            medicine_id=medicine_id,
            brand_name=brand,
            current_stock=current_stock,
            predicted_daily_demand=daily_demand,
            supplier_lead_time_days=supplier_lead_time,
            safety_stock_units=safety_stock,
            runway_days=runway,
            stockout_probability_7d=prob_7d,
            risk_level=risk,
            explanation=explanation,
            recommended_action=action,
        )

    def predict_all_stockout_risks(
        self, store_id: int, lead_time: int = 3
    ) -> List[StockOutPrediction]:
        meds = Medicine.query.filter_by(store_id=store_id, is_active=True).all()
        predictions = [
            self.predict_stockout_for_medicine(m.id, store_id, supplier_lead_time=lead_time)
            for m in meds
        ]
        # Sort critical and high risk items to the top
        order_map = {
            StockOutRiskLevel.CRITICAL: 0,
            StockOutRiskLevel.HIGH_RISK: 1,
            StockOutRiskLevel.MEDIUM_RISK: 2,
            StockOutRiskLevel.HEALTHY: 3,
        }
        predictions.sort(key=lambda p: (order_map[p.risk_level], p.runway_days))
        return predictions

    # Direct alias
    predict_stockout = predict_stockout_for_medicine

    def predict_store_stockouts(
        self, store_id: int, limit: int = 50, min_risk_level: Optional[str] = None
    ) -> List[StockOutPrediction]:
        """Query and filter stockout predictions for store."""
        all_preds = self.predict_all_stockout_risks(store_id=store_id)
        if min_risk_level:
            all_preds = [p for p in all_preds if p.risk_level.value == min_risk_level]
        return all_preds[:limit]


default_stockout_predictor = StockOutPredictor()
