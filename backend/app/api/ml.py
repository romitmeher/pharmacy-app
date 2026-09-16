"""
SmartPharm - Machine Learning REST API Endpoints
Strict compliance with SmartPharm PRD Phase 5 (Rules 15, 16, 17, 18):
- GET /api/ml/forecast/<int:medicine_id>: Demand forecasting with MAE/RMSE metrics (Rule 16)
- GET /api/ml/stockout-risks: Stock-out probability & runway predictions (Rule 17)
- GET /api/ml/expiry-predictions: Sell-through probability & financial loss estimation (Rule 15)
- GET /api/ml/reorder-recommendations: Explainable reorder quantities (Rule 18)
- POST /api/ml/create-reorder-po: 1-click draft PO generation with human verification (Rule 18)
"""

import logging
from flask import Blueprint, request, jsonify, g

from app.middleware.auth import login_required, role_required
from app.models.user import UserRole
from app.models.medicine import Medicine
from app.ml import (
    default_forecasting_engine,
    default_stockout_predictor,
    default_expiry_predictor,
    default_reorder_engine,
)

logger = logging.getLogger(__name__)

ml_bp = Blueprint("ml", __name__, url_prefix="/api/ml")


@ml_bp.route("/forecast/<int:medicine_id>", methods=["GET"])
@login_required
def get_demand_forecast(medicine_id: int):
    """
    Demand Forecasting API (PRD Rule 16).
    Evaluates historical sales and outputs projected daily demand, total horizon demand,
    and model evaluation metrics (MAE, RMSE).
    """
    store_id = g.current_user.store_id
    horizon_days = request.args.get("horizon_days", default=30, type=int)

    # Validate medicine
    medicine = Medicine.query.filter_by(id=medicine_id, store_id=store_id, is_active=True).first()
    if not medicine:
        return jsonify({"error": "NotFoundError", "message": f"Medicine #{medicine_id} not found."}), 404

    forecast = default_forecasting_engine.forecast_demand(
        medicine_id=medicine_id,
        store_id=store_id,
        horizon_days=horizon_days,
    )

    return jsonify({
        "status": "success",
        "data": forecast.to_dict(),
    }), 200


@ml_bp.route("/stockout-risks", methods=["GET"])
@login_required
def get_stockout_risks():
    """
    Stock-Out Probability & Runway API (PRD Rule 17).
    Ranks catalog products by urgency and stock-out probability based on current inventory,
    forecasted daily demand, supplier lead time, and safety buffer.
    """
    store_id = g.current_user.store_id
    limit = request.args.get("limit", default=50, type=int)
    min_risk = request.args.get("min_risk", default=None, type=str)

    predictions = default_stockout_predictor.predict_store_stockouts(
        store_id=store_id,
        limit=limit,
        min_risk_level=min_risk,
    )

    # Summary counts
    critical_count = sum(1 for p in predictions if p.risk_level.value == "CRITICAL")
    high_count = sum(1 for p in predictions if p.risk_level.value == "HIGH_RISK")
    medium_count = sum(1 for p in predictions if p.risk_level.value == "MEDIUM_RISK")

    return jsonify({
        "status": "success",
        "data": {
            "predictions": [p.to_dict() for p in predictions],
            "summary": {
                "total_monitored": len(predictions),
                "critical_risks": critical_count,
                "high_risks": high_count,
                "medium_risks": medium_count,
            },
        },
    }), 200


@ml_bp.route("/expiry-predictions", methods=["GET"])
@login_required
def get_expiry_predictions():
    """
    Expiry Risk & Sell-Through Predictor API (PRD Rule 15).
    Evaluates batches approaching expiry against their sales velocity and FEFO queue position
    to estimate unsold quantities and financial loss exposure.
    """
    store_id = g.current_user.store_id
    window_days = request.args.get("window_days", default=180, type=int)
    limit = request.args.get("limit", default=50, type=int)
    min_risk = request.args.get("min_risk", default=None, type=str)

    predictions = default_expiry_predictor.predict_store_expiry_risks(
        store_id=store_id,
        window_days=window_days,
        limit=limit,
        min_risk=min_risk,
    )

    total_exposure = sum(p.estimated_financial_loss for p in predictions)
    high_risk_count = sum(1 for p in predictions if p.risk_category.value in ["HIGH_RISK", "CRITICAL_EXPIRED"])

    return jsonify({
        "status": "success",
        "data": {
            "predictions": [p.to_dict() for p in predictions],
            "summary": {
                "total_batches_analyzed": len(predictions),
                "high_risk_count": high_risk_count,
                "total_financial_loss_exposure": round(total_exposure, 2),
            },
        },
    }), 200


@ml_bp.route("/reorder-recommendations", methods=["GET"])
@login_required
def get_reorder_recommendations():
    """
    Smart Reorder Recommendations API (PRD Rule 18).
    Computes optimal reorder quantities considering lead times, review cycles,
    safety stock, and open draft purchase orders with full mathematical explainability.
    """
    store_id = g.current_user.store_id
    limit = request.args.get("limit", default=50, type=int)
    min_urgency = request.args.get("min_urgency", default=None, type=str)

    recommendations = default_reorder_engine.get_store_reorder_recommendations(
        store_id=store_id,
        limit=limit,
        min_urgency=min_urgency,
        only_actionable=True,
    )

    total_estimated_investment = sum(r.estimated_total_cost for r in recommendations)
    critical_reorders = sum(1 for r in recommendations if r.urgency.value == "CRITICAL")

    return jsonify({
        "status": "success",
        "data": {
            "recommendations": [r.to_dict() for r in recommendations],
            "summary": {
                "actionable_items_count": len(recommendations),
                "critical_reorders_count": critical_reorders,
                "estimated_total_investment": round(total_estimated_investment, 2),
            },
        },
    }), 200


@ml_bp.route("/create-reorder-po", methods=["POST"])
@login_required
@role_required(UserRole.OWNER, UserRole.MANAGER)
def create_reorder_po():
    """
    1-Click Purchase Order Generation from ML Recommendations (PRD Rule 18).
    Creates a DRAFT PurchaseInvoice with PurchaseItems.
    Strict Human-in-the-Loop: Does NOT automatically mutate inventory.
    """
    data = request.get_json(silent=True) or {}
    supplier_id = data.get("supplier_id")
    items = data.get("items", [])
    notes = data.get("notes")

    if not supplier_id:
        return jsonify({"error": "ValidationError", "message": "supplier_id is required."}), 400

    if not items or not isinstance(items, list):
        return jsonify({"error": "ValidationError", "message": "items list is required and cannot be empty."}), 400

    store_id = g.current_user.store_id
    user_id = g.current_user.id

    try:
        draft_po = default_reorder_engine.create_draft_purchase_order(
            store_id=store_id,
            user_id=user_id,
            supplier_id=supplier_id,
            items=items,
            notes=notes,
        )

        return jsonify({
            "status": "success",
            "message": f"Draft Purchase Order #{draft_po.invoice_number} created successfully.",
            "data": {
                "purchase_invoice_id": draft_po.id,
                "invoice_number": draft_po.invoice_number,
                "supplier_id": draft_po.supplier_id,
                "status": draft_po.status.value,
                "total_amount": float(draft_po.total_amount),
                "items_count": len(draft_po.items),
            },
        }), 201
    except Exception as exc:
        logger.exception("Failed to create draft purchase order from ML recommendations")
        return jsonify({"error": "InternalError", "message": str(exc)}), 500
