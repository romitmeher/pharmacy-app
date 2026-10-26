"""Demo imports must balance stock/payments, remain scoped, and be safe to rerun."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import importlib.util
from pathlib import Path
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sale import Sale, SaleItem, Payment
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus
from app.models.expense import Expense


def test_demo_history_is_balanced_and_idempotent(db,sample_owner):
    filename=Path(__file__).resolve().parents[1]/'scripts/seed_dashboard_demo.py'
    spec=importlib.util.spec_from_file_location('dashboard_seed',filename)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    now=datetime(2026,10,26,6,tzinfo=timezone.utc)
    for index,name in enumerate(module.NAMES):
        med=Medicine(store_id=sample_owner.store_id,brand_name=name,category='Paired photo demo',mrp=Decimal(50+index*10),gst_percentage=5,is_active=True)
        db.session.add(med);db.session.flush()
        for part,qty in enumerate([20,40]):
            batch=Batch(store_id=sample_owner.store_id,medicine_id=med.id,batch_number=f'DEMO-PAIR-20261025-{index}-{part}',
                expiry_date=now.date()+timedelta(days=180+part*360),mrp=med.mrp,purchase_price=med.mrp*Decimal('.7'),quantity_received=qty)
            db.session.add(batch);db.session.flush()
            db.session.add(Inventory(store_id=sample_owner.store_id,batch_id=batch.id,quantity_available=qty))
    db.session.flush()
    report=module.seed(sample_owner.store_id,sample_owner.id,now)
    assert report['sale_count']==50
    assert Medicine.query.filter_by(store_id=sample_owner.store_id,is_active=True).count()==8
    assert PurchaseInvoice.query.count()==5
    assert PurchaseInvoice.query.filter_by(status=PurchaseInvoiceStatus.DRAFT).count()==3
    assert Expense.query.count()==6
    assert sum(row.quantity_available for row in Inventory.query.all())==480-217+20
    assert all(row.quantity_available>=0 for row in Inventory.query.all())
    for sale in Sale.query.all():
        assert sum(item.total_price for item in sale.items)==sale.total_amount
        assert sum(payment.amount for payment in sale.payments)==sale.total_amount
        assert sale.notes.startswith('DEMO DATA:')
    assert module.seed(sample_owner.store_id,sample_owner.id,now)['already_seeded']
    assert Sale.query.count()==50 and PurchaseInvoice.query.count()==5 and Payment.query.count()==50


def test_one_week_does_not_train_unstable_recursive_forecast(db,sample_store,monkeypatch):
    from app.ml.forecasting import DemandForecastingEngine
    engine=DemandForecastingEngine()
    today=datetime.now(timezone.utc).date()
    values=[0]*39+[8,9,10,7,11,6]
    history=[(today-timedelta(days=45-index),value) for index,value in enumerate(values)]
    monkeypatch.setattr(engine,'get_historical_daily_sales',lambda *args,**kwargs:history)
    med=Medicine(store_id=sample_store.id,brand_name='Sparse history example',is_active=True)
    db.session.add(med);db.session.flush()
    forecast=engine.forecast_demand(med.id,sample_store.id,horizon_days=14)
    assert 'Ridge' not in forecast.model_family
    assert 0 < forecast.average_daily_demand <= max(values)
