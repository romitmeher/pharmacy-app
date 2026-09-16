"""
SmartPharm - Machine Learning Subsystem Test Suite
Strict compliance with SmartPharm PRD Phase 5 (Rules 15, 16, 17, 18):
- Demand Forecasting (PRD Rule 16) with MAE/RMSE metrics
- Stock-out Probability & Runway Prediction (PRD Rule 17)
- Expiry Risk & Sell-Through Estimation (PRD Rule 15)
- Smart Reorder Quantities with explainable formulas (PRD Rule 18)
- 1-Click PO Draft Generation (Human-in-the-loop, zero uncontrolled inventory mutation)
- REST API Endpoints:
  - GET /api/ml/forecast/<int:medicine_id>
  - GET /api/ml/stockout-risks
  - GET /api/ml/expiry-predictions
  - GET /api/ml/reorder-recommendations
  - POST /api/ml/create-reorder-po
"""

import datetime
from decimal import Decimal
import pytest

from app.models.medicine import Medicine, DosageForm
from app.models.location import Location, LocationType
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod, PaymentStatus
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus, PurchaseItem
from app.models.supplier import Supplier
from app.ml import (
    default_forecasting_engine,
    default_stockout_predictor,
    default_expiry_predictor,
    default_reorder_engine,
    StockOutRiskLevel,
    ExpiryRiskCategory,
    ReorderUrgency,
)


@pytest.fixture
def ml_seed_data(db, sample_store):
    """Seed comprehensive inventory, batches, sales history, and supplier for ML evaluation."""
    # 1. Supplier
    sup = Supplier(
        store_id=sample_store.id,
        name="Apollo Pharma Distributors",
        contact_person="Ramesh Gupta",
        phone="9876543210",
        email="apollo.dist@example.com",
        is_active=True,
    )
    db.session.add(sup)

    # 2. Location
    loc = Location(
        store_id=sample_store.id,
        name="Shelf ML-1",
        location_type=LocationType.SHELF,
        is_active=True,
    )
    db.session.add(loc)
    db.session.flush()

    today = datetime.date.today()

    # 3. High-demand Fast Mover: Dolo 650 (Has historical sales, low current stock -> Stockout & Reorder candidate)
    med_dolo = Medicine(
        store_id=sample_store.id,
        brand_name="Dolo 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="Micro Labs",
        mrp=30.00,
        selling_price=28.00,
        is_active=True,
    )
    db.session.add(med_dolo)

    # 4. Critical Stockout Medicine: Azithral 500 (Completely 0 stock)
    med_azi = Medicine(
        store_id=sample_store.id,
        brand_name="Azithral 500",
        generic_name="Azithromycin",
        strength="500mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="Alembic",
        mrp=120.00,
        selling_price=110.00,
        is_active=True,
    )
    db.session.add(med_azi)

    # 5. Expiry Risk Candidate: Augmentin 625 (High stock, expires in 20 days, slow sales)
    med_aug = Medicine(
        store_id=sample_store.id,
        brand_name="Augmentin 625",
        generic_name="Amoxicillin and Clavulanic Acid",
        strength="625mg",
        dosage_form=DosageForm.TABLET,
        manufacturer="GSK",
        mrp=200.00,
        selling_price=180.00,
        is_active=True,
    )
    db.session.add(med_aug)
    db.session.flush()

    # 6. Batches and Inventory
    # Dolo: 10 units in stock, expires in 300 days
    b_dolo = Batch(
        store_id=sample_store.id,
        medicine_id=med_dolo.id,
        batch_number="DL-2026-01",
        expiry_date=today + datetime.timedelta(days=300),
        purchase_price=18.00,
        mrp=30.00,
        quantity_received=100,
    )
    db.session.add(b_dolo)
    db.session.flush()
    inv_dolo = Inventory(
        store_id=sample_store.id,
        batch_id=b_dolo.id,
        location_id=loc.id,
        quantity_available=10,
    )
    db.session.add(inv_dolo)

    # Augmentin: 50 units in stock, expires in 15 days (High expiry risk)
    b_aug = Batch(
        store_id=sample_store.id,
        medicine_id=med_aug.id,
        batch_number="AUG-EXP-NEAR",
        expiry_date=today + datetime.timedelta(days=15),
        purchase_price=140.00,
        mrp=200.00,
        quantity_received=50,
    )
    db.session.add(b_aug)
    db.session.flush()
    inv_aug = Inventory(
        store_id=sample_store.id,
        batch_id=b_aug.id,
        location_id=loc.id,
        quantity_available=50,
    )
    db.session.add(inv_aug)

    # 7. Seed historical sales for Dolo 650 over past 10 days to establish velocity (~5 units/day)
    for d in range(1, 11):
        sale_date = today - datetime.timedelta(days=d)
        sale = Sale(
            store_id=sample_store.id,
            user_id=1,
            invoice_number=f"INV-ML-{d:03d}",
            sale_date=datetime.datetime.combine(sale_date, datetime.time(12, 0)),
            subtotal=140.00,
            discount_amount=0.0,
            tax_amount=0.0,
            total_amount=140.00,
            payment_status=PaymentStatus.PAID,
        )
        db.session.add(sale)
        db.session.flush()

        s_item = SaleItem(
            sale_id=sale.id,
            medicine_id=med_dolo.id,
            batch_id=b_dolo.id,
            quantity=5,  # 5 units every day
            unit_price=28.00,
            total_price=140.00,
        )
        db.session.add(s_item)

    # Seed 1 slow sale for Augmentin (only 1 unit sold 5 days ago)
    sale_slow = Sale(
        store_id=sample_store.id,
        user_id=1,
        invoice_number="INV-ML-SLOW",
        sale_date=datetime.datetime.combine(today - datetime.timedelta(days=5), datetime.time(14, 0)),
        subtotal=180.00,
        discount_amount=0.0,
        tax_amount=0.0,
        total_amount=180.00,
        payment_status=PaymentStatus.PAID,
    )
    db.session.add(sale_slow)
    db.session.flush()
    db.session.add(
        SaleItem(
            sale_id=sale_slow.id,
            medicine_id=med_aug.id,
            batch_id=b_aug.id,
            quantity=1,
            unit_price=180.00,
            total_price=180.00,
        )
    )

    db.session.commit()

    return {
        "supplier": sup,
        "location": loc,
        "med_dolo": med_dolo,
        "med_azi": med_azi,
        "med_aug": med_aug,
        "batch_dolo": b_dolo,
        "batch_aug": b_aug,
    }


def test_demand_forecasting_engine(db, sample_store, ml_seed_data):
    """Test time-series demand forecasting with Adaptive and Autoregressive models (PRD Rule 16)."""
    dolo = ml_seed_data["med_dolo"]

    res = default_forecasting_engine.forecast_demand(
        medicine_id=dolo.id,
        store_id=sample_store.id,
        horizon_days=14,
    )

    assert res.medicine_id == dolo.id
    assert res.horizon_days == 14
    assert len(res.daily_forecasts) == 14
    # Velocity was 5 units/day for 10 days
    assert res.average_daily_demand > 2.0
    assert res.total_forecasted_demand > 25.0
    assert res.evaluation_mae >= 0.0
    assert res.evaluation_rmse >= 0.0
    assert res.historical_sales_days_count >= 10
    assert res.is_sufficient_data is True


def test_stockout_prediction_engine(db, sample_store, ml_seed_data):
    """Test stock-out probability, runway, and risk classification (PRD Rule 17)."""
    # 1. Test Dolo 650: 10 units in stock, velocity ~5/day -> runway ~2 days -> CRITICAL or HIGH_RISK
    dolo = ml_seed_data["med_dolo"]
    pred_dolo = default_stockout_predictor.predict_stockout(
        medicine_id=dolo.id,
        store_id=sample_store.id,
        supplier_lead_time=3,
    )
    assert pred_dolo.current_stock == 10
    assert pred_dolo.runway_days < 5.0
    assert pred_dolo.risk_level in [StockOutRiskLevel.CRITICAL, StockOutRiskLevel.HIGH_RISK]
    assert pred_dolo.stockout_probability_7d >= 0.8
    assert "runway" in pred_dolo.explanation.lower() or "stock" in pred_dolo.explanation.lower()

    # 2. Test Azithral 500: 0 units in stock -> CRITICAL risk, 1.0 probability
    azi = ml_seed_data["med_azi"]
    pred_azi = default_stockout_predictor.predict_stockout(
        medicine_id=azi.id,
        store_id=sample_store.id,
    )
    assert pred_azi.current_stock == 0
    assert pred_azi.risk_level == StockOutRiskLevel.CRITICAL
    assert pred_azi.stockout_probability_7d == 1.0
    assert "depleted" in pred_azi.explanation.lower() or "0 units" in pred_azi.explanation.lower()


def test_expiry_risk_prediction_engine(db, sample_store, ml_seed_data):
    """Test sell-through probability and financial loss estimation (PRD Rule 15)."""
    # Augmentin: 50 units, expires in 15 days, sales velocity is low (0.2/day)
    # Expected sales before expiry: ~3 units -> ~47 units at risk of expiring unsold!
    b_aug = ml_seed_data["batch_aug"]

    pred_aug = default_expiry_predictor.predict_batch_expiry_risk(
        batch_id=b_aug.id,
        store_id=sample_store.id,
    )

    assert pred_aug is not None
    assert pred_aug.batch_number == "AUG-EXP-NEAR"
    assert pred_aug.days_until_expiry <= 15
    assert pred_aug.current_stock == 50
    assert pred_aug.units_at_risk > 30
    assert pred_aug.risk_category in [ExpiryRiskCategory.HIGH_RISK, ExpiryRiskCategory.MODERATE_RISK]
    # Financial loss = units_at_risk * 140.0
    assert pred_aug.estimated_financial_loss > 4000.0
    assert "unsold" in pred_aug.explanation


def test_smart_reorder_engine_and_draft_po(db, sample_store, ml_seed_data, sample_owner):
    """Test explainable reorder formulas and 1-click draft PO generation (PRD Rule 18)."""
    dolo = ml_seed_data["med_dolo"]
    sup = ml_seed_data["supplier"]

    # 1. Compute reorder recommendation
    rec = default_reorder_engine.compute_reorder_recommendation(
        store_id=sample_store.id,
        medicine=dolo,
        review_period_days=14,
        lead_time_days=3,
    )

    assert rec is not None
    assert rec.current_stock == 10
    assert rec.forecasted_daily_demand > 2.0
    assert rec.recommended_order_quantity > 0
    # Net deficit = (daily_demand * (3 + 14)) + safety_stock - 10 - 0
    assert rec.target_stock_level > rec.current_stock
    assert rec.estimated_total_cost > 0.0
    assert "Forecasted velocity" in rec.explanation

    # 2. Test 1-click Draft PO Creation
    items_to_order = [
        {
            "medicine_id": dolo.id,
            "quantity": rec.recommended_order_quantity,
            "purchase_rate": 18.00,
        }
    ]

    draft_po = default_reorder_engine.create_draft_purchase_order(
        store_id=sample_store.id,
        user_id=sample_owner.id,
        supplier_id=sup.id,
        items=items_to_order,
        notes="Automated test reorder draft",
    )

    assert draft_po.id is not None
    assert draft_po.status == PurchaseInvoiceStatus.DRAFT
    assert draft_po.store_id == sample_store.id
    assert draft_po.supplier_id == sup.id
    assert len(draft_po.items) == 1
    assert draft_po.items[0].quantity == rec.recommended_order_quantity
    assert draft_po.items[0].received_quantity == 0  # Zero inventory mutation until received!

    # 3. Verify pipeline stock deduction: Re-evaluating reorder should now reflect the open PO!
    rec_after_po = default_reorder_engine.compute_reorder_recommendation(
        store_id=sample_store.id,
        medicine=dolo,
        review_period_days=14,
        lead_time_days=3,
    )
    assert rec_after_po.open_po_quantity == rec.recommended_order_quantity
    assert rec_after_po.net_deficit < rec.net_deficit


def test_api_ml_endpoints(client, owner_token, ml_seed_data, sample_store):
    """Test all Phase 5 REST API endpoints."""
    dolo = ml_seed_data["med_dolo"]
    sup = ml_seed_data["supplier"]
    auth_headers = {"Authorization": f"Bearer {owner_token}"}

    # 1. GET /api/ml/forecast/<id>
    r_forecast = client.get(f"/api/ml/forecast/{dolo.id}?horizon_days=14", headers=auth_headers)
    assert r_forecast.status_code == 200
    res_f = r_forecast.get_json()
    assert res_f["status"] == "success"
    assert res_f["data"]["medicine_id"] == dolo.id
    assert len(res_f["data"]["daily_forecasts"]) == 14
    assert "mae" in res_f["data"]["evaluation_metrics"]

    # 2. GET /api/ml/stockout-risks
    r_stockout = client.get("/api/ml/stockout-risks", headers=auth_headers)
    assert r_stockout.status_code == 200
    res_so = r_stockout.get_json()
    assert res_so["status"] == "success"
    assert len(res_so["data"]["predictions"]) >= 2
    assert res_so["data"]["summary"]["total_monitored"] >= 2

    # 3. GET /api/ml/expiry-predictions
    r_expiry = client.get("/api/ml/expiry-predictions?window_days=60", headers=auth_headers)
    assert r_expiry.status_code == 200
    res_exp = r_expiry.get_json()
    assert res_exp["status"] == "success"
    assert len(res_exp["data"]["predictions"]) >= 1
    assert res_exp["data"]["summary"]["total_financial_loss_exposure"] > 0.0

    # 4. GET /api/ml/reorder-recommendations
    r_reorder = client.get("/api/ml/reorder-recommendations", headers=auth_headers)
    assert r_reorder.status_code == 200
    res_re = r_reorder.get_json()
    assert res_re["status"] == "success"
    assert len(res_re["data"]["recommendations"]) >= 1
    assert res_re["data"]["summary"]["actionable_items_count"] >= 1

    # 5. POST /api/ml/create-reorder-po
    po_payload = {
        "supplier_id": sup.id,
        "items": [
            {
                "medicine_id": dolo.id,
                "quantity": 50,
                "purchase_rate": 18.00,
            }
        ],
        "notes": "API test reorder draft order",
    }
    r_create_po = client.post("/api/ml/create-reorder-po", json=po_payload, headers=auth_headers)
    assert r_create_po.status_code == 201
    res_po = r_create_po.get_json()
    assert res_po["status"] == "success"
    assert res_po["data"]["status"] == "draft"
    assert res_po["data"]["items_count"] == 1
    assert res_po["data"]["total_amount"] == 900.00
