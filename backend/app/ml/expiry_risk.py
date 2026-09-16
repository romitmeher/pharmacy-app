"""
SmartPharm - Expiry Risk Prediction Engine
Strict compliance with SmartPharm PRD Rule 15:
- Distinguishes passive expiry date tracking from ML Expiry Risk Prediction.
- Predicts whether active inventory is likely to sell before its expiry date.
- Evaluates:
  - Remaining shelf life in days ($T_{days}$)
  - Forecasted daily sales velocity ($D_{daily}$)
  - FEFO queue position (prior batches that will sell first)
  - Projected sell-through quantity before expiry
  - Financial value of inventory at risk of expiring unsold
"""

from dataclasses import dataclass, field
import datetime
import enum
import logging
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.ml.forecasting import default_forecasting_engine

logger = logging.getLogger(__name__)


class ExpiryRiskCategory(str, enum.Enum):
    HIGH_RISK = "HIGH_RISK"          # < 50% sell-through probability (high chance of unsold expiration)
    MODERATE_RISK = "MODERATE_RISK"  # 50% - 85% sell-through probability
    LOW_RISK = "LOW_RISK"            # > 85% sell-through probability (expected to clear before expiry)


@dataclass
class BatchExpiryPrediction:
    batch_id: int
    batch_number: str
    medicine_id: int
    brand_name: str
    expiry_date: str
    days_to_expiry: int
    quantity_in_stock: int
    predicted_daily_demand: float
    projected_units_sold_before_expiry: int
    projected_unsold_units_at_expiry: int
    sell_through_probability_pct: float
    financial_risk_amount: float
    risk_category: ExpiryRiskCategory
    recommendation: str

    @property
    def days_until_expiry(self) -> int:
        return self.days_to_expiry

    @property
    def current_stock(self) -> int:
        return self.quantity_in_stock

    @property
    def units_at_risk(self) -> int:
        return self.projected_unsold_units_at_expiry

    @property
    def estimated_financial_loss(self) -> float:
        return self.financial_risk_amount

    @property
    def explanation(self) -> str:
        return self.recommendation

    def to_dict(self) -> Dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "batch_number": self.batch_number,
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "expiry_date": self.expiry_date,
            "days_to_expiry": self.days_to_expiry,
            "quantity_in_stock": self.quantity_in_stock,
            "predicted_daily_demand": round(self.predicted_daily_demand, 2),
            "projected_units_sold_before_expiry": self.projected_units_sold_before_expiry,
            "projected_unsold_units_at_expiry": self.projected_unsold_units_at_expiry,
            "sell_through_probability_pct": round(self.sell_through_probability_pct, 1),
            "financial_risk_amount": round(self.financial_risk_amount, 2),
            "risk_category": self.risk_category.value,
            "recommendation": self.recommendation,
        }


class ExpiryRiskPredictor:
    """
    Evaluates whether store batches will clear through normal sales velocity
    prior to reaching their physical expiration dates.
    """

    def predict_batch_expiry_risk(
        self, batch_id: int, store_id: int
    ) -> Optional[BatchExpiryPrediction]:
        batch = Batch.query.filter_by(id=batch_id, store_id=store_id).first()
        if not batch:
            return None

        # Current stock for this batch
        inv_units = (
            db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
            .filter(Inventory.store_id == store_id, Inventory.batch_id == batch.id)
            .scalar()
        )
        qty_stock = int(inv_units)
        if qty_stock <= 0:
            return None

        today = datetime.date.today()
        days_to_expiry = (batch.expiry_date - today).days

        # Forecast daily demand for this medicine
        forecast_res = default_forecasting_engine.forecast_demand(
            batch.medicine_id, store_id, horizon_days=30
        )
        daily_demand = max(0.1, forecast_res.average_daily_demand)

        # FEFO Queue calculation: calculate stock in earlier-expiring batches for the same medicine
        prior_stock = (
            db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
            .join(Batch, Inventory.batch_id == Batch.id)
            .filter(
                Inventory.store_id == store_id,
                Batch.medicine_id == batch.medicine_id,
                Batch.expiry_date < batch.expiry_date,
                Inventory.quantity_available > 0,
            )
            .scalar()
        )
        prior_units = int(prior_stock)

        # Days until this batch begins selling under FEFO
        days_delay = prior_units / daily_demand
        effective_selling_days = max(0.0, days_to_expiry - days_delay)

        # Projected sell-through
        projected_sold = min(qty_stock, int(effective_selling_days * daily_demand))
        unsold_units = max(0, qty_stock - projected_sold)
        sell_through_pct = (projected_sold / qty_stock) * 100.0 if qty_stock > 0 else 100.0

        # Financial risk value
        unit_price = float(batch.purchase_price or batch.mrp or batch.medicine.mrp or 0.0)
        risk_value = unsold_units * unit_price

        # Categorize risk
        if days_to_expiry <= 0:
            category = ExpiryRiskCategory.HIGH_RISK
            rec = "BATCH ALREADY EXPIRED. Remove immediately from dispensing shelves to return bay."
        elif sell_through_pct < 50.0:
            category = ExpiryRiskCategory.HIGH_RISK
            rec = f"High probability of expiring with {unsold_units} units unsold. Prioritize dispensing or request distributor return/exchange."
        elif sell_through_pct < 85.0:
            category = ExpiryRiskCategory.MODERATE_RISK
            rec = f"Moderate risk. Projected to sell {projected_sold} of {qty_stock} units. Monitor weekly sales velocity."
        else:
            category = ExpiryRiskCategory.LOW_RISK
            rec = "Healthy velocity. Full batch is projected to sell out well before expiry date."

        return BatchExpiryPrediction(
            batch_id=batch.id,
            batch_number=batch.batch_number,
            medicine_id=batch.medicine_id,
            brand_name=batch.medicine.brand_name,
            expiry_date=batch.expiry_date.isoformat(),
            days_to_expiry=days_to_expiry,
            quantity_in_stock=qty_stock,
            predicted_daily_demand=daily_demand,
            projected_units_sold_before_expiry=projected_sold,
            projected_unsold_units_at_expiry=unsold_units,
            sell_through_probability_pct=sell_through_pct,
            financial_risk_amount=risk_value,
            risk_category=category,
            recommendation=rec,
        )

    def predict_all_expiry_risks(
        self, store_id: int, cutoff_days: int = 180
    ) -> List[BatchExpiryPrediction]:
        """Evaluate all active batches in store expiring within cutoff window."""
        today = datetime.date.today()
        cutoff = today + datetime.timedelta(days=cutoff_days)

        active_batches = (
            Batch.query.join(Inventory)
            .filter(
                Batch.store_id == store_id,
                Batch.expiry_date <= cutoff,
                Inventory.quantity_available > 0,
            )
            .distinct()
            .all()
        )

        predictions = []
        for b in active_batches:
            pred = self.predict_batch_expiry_risk(b.id, store_id)
            if pred:
                predictions.append(pred)

        # Sort: High risk first, then by earliest expiry date
        order = {
            ExpiryRiskCategory.HIGH_RISK: 0,
            ExpiryRiskCategory.MODERATE_RISK: 1,
            ExpiryRiskCategory.LOW_RISK: 2,
        }
        predictions.sort(key=lambda p: (order[p.risk_category], p.days_to_expiry))
        return predictions

    def predict_store_expiry_risks(
        self, store_id: int, window_days: int = 180, limit: int = 50, min_risk: Optional[str] = None
    ) -> List[BatchExpiryPrediction]:
        """Query and filter expiry predictions for store."""
        all_preds = self.predict_all_expiry_risks(store_id=store_id, cutoff_days=window_days)
        if min_risk:
            all_preds = [p for p in all_preds if p.risk_category.value == min_risk]
        return all_preds[:limit]


default_expiry_predictor = ExpiryRiskPredictor()
