"""
SmartPharm - Multi-Branch Operations Test Suite.
Strict compliance with SmartPharm PRD Phase 6 & Rule 25:
- Network store discovery and cross-store inventory comparison
- Inter-store stock transfer lifecycle (Draft -> In Transit -> Received)
- Atomic transactional inventory boundaries at source and destination
- Consolidated executive analytics (Sales, Gross Profit, Bill Volume)
- Supplier purchase rate benchmarks across branches
"""

import datetime
from decimal import Decimal
import pytest

from app.models.store import Store
from app.models.user import User, UserRole
from app.models.location import Location, LocationType
from app.models.medicine import Medicine, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sale import Sale, SaleItem, Payment, PaymentMethod, PaymentStatus
from app.models.stock_transfer import StockTransfer, StockTransferItem, TransferStatus
from app.multibranch.branch_service import (
    get_network_stores,
    get_cross_store_stock,
    get_network_performance_summary,
    compare_supplier_prices,
    create_stock_transfer,
    dispatch_stock_transfer,
    receive_stock_transfer,
)


@pytest.fixture
def multibranch_seed_data(db, sample_store, sample_owner):
    """Seed Store A (flagship) and Store B (branch) with medicines, batches, and sales."""
    today = datetime.date.today()

    # Store B (Second Branch)
    store_b = Store(
        name="SmartPharm Suburban Branch",
        address="456 Branch Road, Mumbai Suburban",
        phone="9876543211",
        gstin="27AAAAA0000A1Z6",
        drug_license_number="MH-MUM-123457",
        is_active=True,
    )
    db.session.add(store_b)
    db.session.flush()

    # User in Store B
    user_b = User(
        store_id=store_b.id,
        email="manager.branch@smartpharm.com",
        username="branch_manager",
        full_name="Branch Manager",
        role=UserRole.MANAGER,
    )
    user_b.set_password("password123")
    db.session.add(user_b)
    db.session.flush()

    # Medicine in Store A: Crocin 650 (10 units in stock)
    med_a = Medicine(
        store_id=sample_store.id,
        brand_name="Crocin 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        mrp=30.00,
        selling_price=28.00,
        is_active=True,
    )
    db.session.add(med_a)
    db.session.flush()

    batch_a = Batch(
        store_id=sample_store.id,
        medicine_id=med_a.id,
        batch_number="CROC-A1",
        expiry_date=today + datetime.timedelta(days=300),
        purchase_price=18.00,
        mrp=30.00,
        quantity_received=50,
    )
    db.session.add(batch_a)
    db.session.flush()

    inv_a = Inventory(
        store_id=sample_store.id,
        batch_id=batch_a.id,
        quantity_available=10,
    )
    db.session.add(inv_a)

    # Medicine in Store B: Crocin 650 (35 units in stock, purchased at different rate 21.00)
    med_b = Medicine(
        store_id=store_b.id,
        brand_name="Crocin 650",
        generic_name="Paracetamol",
        strength="650mg",
        dosage_form=DosageForm.TABLET,
        mrp=30.00,
        selling_price=28.00,
        is_active=True,
    )
    db.session.add(med_b)
    db.session.flush()

    batch_b = Batch(
        store_id=store_b.id,
        medicine_id=med_b.id,
        batch_number="CROC-B2",
        expiry_date=today + datetime.timedelta(days=400),
        purchase_price=21.00,  # Price variance vs Store A (18.00 vs 21.00)
        mrp=30.00,
        quantity_received=100,
    )
    db.session.add(batch_b)
    db.session.flush()

    inv_b = Inventory(
        store_id=store_b.id,
        batch_id=batch_b.id,
        quantity_available=35,
    )
    db.session.add(inv_b)

    # Add a sale in Store A
    sale_a = Sale(
        store_id=sample_store.id,
        user_id=sample_owner.id,
        invoice_number="INV-2026-0001",
        subtotal=Decimal("56.00"),
        total_amount=Decimal("56.00"),
        payment_status=PaymentStatus.PAID,
    )
    db.session.add(sale_a)
    db.session.flush()

    sale_item_a = SaleItem(
        sale_id=sale_a.id,
        medicine_id=med_a.id,
        batch_id=batch_a.id,
        quantity=2,
        unit_price=Decimal("28.00"),
        total_price=Decimal("56.00"),
    )
    db.session.add(sale_item_a)

    db.session.commit()

    return {
        "store_a": sample_store,
        "store_b": store_b,
        "user_b": user_b,
        "med_a": med_a,
        "med_b": med_b,
        "batch_a": batch_a,
        "batch_b": batch_b,
        "inv_a": inv_a,
        "inv_b": inv_b,
    }


def test_get_network_stores(multibranch_seed_data):
    """Test listing all branches in the chain."""
    stores = get_network_stores()
    assert len(stores) >= 2
    store_names = [s["name"] for s in stores]
    assert "SmartPharm Suburban Branch" in store_names


def test_cross_store_stock_comparison(multibranch_seed_data):
    """Test cross-store stock lookup for walk-in patient fulfillment (PRD Rule 25)."""
    med_a = multibranch_seed_data["med_a"]
    store_a = multibranch_seed_data["store_a"]

    stock_data = get_cross_store_stock(medicine_id=med_a.id, requesting_store_id=store_a.id)

    assert stock_data["brand_name"] == "Crocin 650"
    assert stock_data["total_network_stock"] == 45  # 10 in Store A + 35 in Store B
    assert stock_data["stores_with_stock_count"] == 2

    # Check that Store B shows 35 units
    store_b_entry = next(s for s in stock_data["stores"] if s["store_id"] == multibranch_seed_data["store_b"].id)
    assert store_b_entry["total_stock"] == 35
    assert len(store_b_entry["batches"]) == 1
    assert store_b_entry["batches"][0]["batch_number"] == "CROC-B2"


def test_inter_store_transfer_lifecycle(db, sample_owner, multibranch_seed_data):
    """
    Test complete inter-store transfer lifecycle:
    Draft (0 mutation) -> Dispatch (source decremented) -> Receipt (destination booked).
    """
    store_a = multibranch_seed_data["store_a"]
    store_b = multibranch_seed_data["store_b"]
    med_b = multibranch_seed_data["med_b"]
    batch_b = multibranch_seed_data["batch_b"]
    inv_a = multibranch_seed_data["inv_a"]
    inv_b = multibranch_seed_data["inv_b"]

    assert inv_a.quantity_available == 10
    assert inv_b.quantity_available == 35

    # 1. Step 1: Create Transfer Draft from Store B to Store A for 15 units
    transfer = create_stock_transfer(
        source_store_id=store_b.id,
        destination_store_id=store_a.id,
        user_id=sample_owner.id,
        items_data=[
            {"medicine_id": med_b.id, "batch_id": batch_b.id, "quantity": 15}
        ],
        notes="Transfer to fulfill flagship stockout",
    )
    assert transfer.status == TransferStatus.DRAFT
    # Inventory MUST NOT mutate in DRAFT status (PRD Rule 8 & 22)
    db.session.refresh(inv_b)
    db.session.refresh(inv_a)
    assert inv_b.quantity_available == 35
    assert inv_a.quantity_available == 10

    # 2. Step 2: Dispatch Transfer from Store B
    dispatched = dispatch_stock_transfer(transfer_id=transfer.id, user_id=sample_owner.id)
    assert dispatched.status == TransferStatus.IN_TRANSIT
    assert dispatched.dispatched_at is not None

    db.session.refresh(inv_b)
    assert inv_b.quantity_available == 20  # 35 - 15 = 20

    # 3. Step 3: Receive Transfer at Store A
    received = receive_stock_transfer(transfer_id=transfer.id, user_id=sample_owner.id)
    assert received.status == TransferStatus.RECEIVED
    assert received.received_at is not None

    # Check destination stock: either existing inventory incremented or new batch inventory booked
    dest_batches = Batch.query.filter_by(store_id=store_a.id, batch_number="CROC-B2").all()
    assert len(dest_batches) == 1
    dest_batch = dest_batches[0]
    total_dest_batch_stock = sum(inv.quantity_available for inv in dest_batch.inventory)
    assert total_dest_batch_stock == 15


def test_supplier_price_comparison(multibranch_seed_data):
    """Test identifying supplier purchase rate discrepancies across network stores (PRD Rule 25)."""
    discrepancies = compare_supplier_prices()
    assert len(discrepancies) >= 1
    crocin_disc = next(d for d in discrepancies if d["medicine_brand"] == "Crocin 650")

    assert crocin_disc["min_purchase_rate"] == 18.00  # Store A
    assert crocin_disc["max_purchase_rate"] == 21.00  # Store B
    assert crocin_disc["potential_savings_per_unit"] == 3.00
    assert crocin_disc["variance_percentage"] > 16.0


def test_network_performance_analytics(multibranch_seed_data):
    """Test consolidated network performance comparison."""
    summary = get_network_performance_summary()
    assert summary["total_branches"] >= 2
    assert summary["network_total_sales"] >= 56.00
    assert summary["network_total_bills"] >= 1


def test_multibranch_api_endpoints(client, owner_token, multibranch_seed_data):
    """Test REST API endpoints for multi-branch operations."""
    headers = {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
    med_a = multibranch_seed_data["med_a"]
    store_a = multibranch_seed_data["store_a"]
    store_b = multibranch_seed_data["store_b"]
    batch_b = multibranch_seed_data["batch_b"]
    med_b = multibranch_seed_data["med_b"]

    # 1. GET /api/multibranch/stores
    res_stores = client.get("/api/multibranch/stores", headers=headers)
    assert res_stores.status_code == 200
    stores = res_stores.get_json()["data"]
    assert len(stores) >= 2

    # 2. GET /api/multibranch/stock-comparison/<id>
    res_stock = client.get(f"/api/multibranch/stock-comparison/{med_a.id}", headers=headers)
    assert res_stock.status_code == 200
    assert res_stock.get_json()["data"]["total_network_stock"] >= 45

    # 3. GET /api/multibranch/analytics
    res_analytics = client.get("/api/multibranch/analytics", headers=headers)
    assert res_analytics.status_code == 200
    assert "branch_performance" in res_analytics.get_json()["data"]

    # 4. GET /api/multibranch/supplier-price-comparison
    res_price = client.get("/api/multibranch/supplier-price-comparison", headers=headers)
    assert res_price.status_code == 200
    assert len(res_price.get_json()["data"]) >= 1

    # 5. POST /api/multibranch/transfers
    transfer_payload = {
        "source_store_id": store_b.id,
        "destination_store_id": store_a.id,
        "items": [{"medicine_id": med_b.id, "batch_id": batch_b.id, "quantity": 5}],
        "notes": "API test transfer",
    }
    res_trf = client.post("/api/multibranch/transfers", headers=headers, json=transfer_payload)
    assert res_trf.status_code == 201
    trf_id = res_trf.get_json()["data"]["id"]

    # 6. POST /api/multibranch/transfers/<id>/dispatch
    res_disp = client.post(f"/api/multibranch/transfers/{trf_id}/dispatch", headers=headers)
    assert res_disp.status_code == 200
    assert res_disp.get_json()["data"]["status"] == "in_transit"

    # 7. POST /api/multibranch/transfers/<id>/receive
    res_recv = client.post(f"/api/multibranch/transfers/{trf_id}/receive", headers=headers, json={})
    assert res_recv.status_code == 200
    assert res_recv.get_json()["data"]["status"] == "received"
