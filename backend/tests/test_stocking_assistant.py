from unittest.mock import Mock
import pytest
import requests
from app.models.medicine import Medicine
from app.models.store import Store
from app.vision import stocking


@pytest.fixture(autouse=True)
def local_references(monkeypatch, tmp_path):
    monkeypatch.setenv("SMARTPHARM_STOCKING_DIR", str(tmp_path))
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    c = stocking.connect()
    with c:
        c.execute("INSERT INTO reference VALUES (?,?,?,?,?,?)", (
            "Parawel 650 Tablet", "Paracetamol 650 mg", "Med Manor", "10 tablets", "test", "https://example.com/medicine"))
    c.close()


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_stocking_reads_text_and_finds_reference(client, pharmacist_token):
    read = client.post("/api/vision/stocking/read", headers=headers(pharmacist_token),
                       json={"raw_text": "Parawel 650\nParacetamol Tablets IP\n650 mg\nEXP: 05/2027"})
    assert read.status_code == 200
    assert read.json["extracted"]["strength"] == "650 mg"
    found = client.post("/api/vision/stocking/search", headers=headers(pharmacist_token), json={"query": "Parawel 650"})
    assert found.status_code == 200
    assert found.json["references"][0]["name"] == "Parawel 650 Tablet"
    assert found.json["web"] is None


def test_confirmation_is_required_and_does_not_create_inventory(client, pharmacist_token):
    data = {"query": "Parawel 650", "raw_text": "Para wel 650", "barcode": "0012345678905",
            "medicine": {"brand_name": "Parawel 650", "strength": "650 mg", "dosage_form": "tablet"}}
    assert client.post("/api/vision/stocking/confirm", headers=headers(pharmacist_token), json=data).status_code == 400
    assert Medicine.query.count() == 0
    data["confirmed"] = True
    response = client.post("/api/vision/stocking/confirm", headers=headers(pharmacist_token), json=data)
    assert response.status_code == 200
    assert response.json["learning_saved"]
    assert response.json["medicine"]["barcodes"] == ["0012345678905"]
    from app.models.inventory import Inventory
    from app.models.batch import Batch
    assert Inventory.query.count() == Batch.query.count() == 0
    found = client.post("/api/vision/stocking/search", headers=headers(pharmacist_token), json={"query": "Parawel 650"})
    assert found.json["remembered"]["id"] == response.json["medicine"]["id"]


def test_barcode_conflict_rolls_back_new_medicine(client, pharmacist_token):
    data = {"confirmed": True, "query": "Parawel 650", "barcode": "CODE-123",
            "medicine": {"brand_name": "Parawel 650", "strength": "650 mg"}}
    assert client.post("/api/vision/stocking/confirm", headers=headers(pharmacist_token), json=data).status_code == 200
    data["medicine"]["brand_name"] = "Different medicine"
    assert client.post("/api/vision/stocking/confirm", headers=headers(pharmacist_token), json=data).status_code == 400
    assert Medicine.query.count() == 1


def test_confirmed_correction_is_scoped_to_store(db, sample_store):
    other = Store(name="Other store")
    db.session.add(other)
    med = Medicine(store_id=sample_store.id, brand_name="Corrected name", strength="650 mg")
    db.session.add(med)
    db.session.commit()
    stocking.remember(sample_store.id, 1, med, "noisy read", "text", [])
    assert stocking.search(sample_store.id, "noisy read")["remembered"]["id"] == med.id
    assert stocking.search(other.id, "noisy read")["remembered"] is None
    med.is_active = False
    db.session.commit()
    assert stocking.search(sample_store.id, "noisy read")["remembered"] is None


def test_stocking_permissions(client, cashier_token, inventory_staff_token):
    assert client.post("/api/vision/stocking/search", headers=headers(cashier_token), json={"query": "Parawel"}).status_code == 403
    assert client.post("/api/vision/stocking/confirm", headers=headers(inventory_staff_token), json={"confirmed": True}).status_code == 403


def test_web_results_require_relevance_and_safe_links(monkeypatch):
    response = Mock()
    response.content = b'''<rss><channel>
      <item><title>Unrelated result</title><link>https://example.com/other</link></item>
      <item><title>Parawel 650 Tablet</title><link>https://example.com/medicine</link><description>Paracetamol</description></item>
      <item><title>Parawel 650</title><link>javascript:alert(1)</link></item>
    </channel></rss>'''
    get = Mock(return_value=response)
    monkeypatch.setattr(stocking.requests, "get", get)
    result = stocking.web_search("Parawel 650")
    assert len(result["results"]) == 1
    assert result["results"][0]["url"] == "https://example.com/medicine"
    assert "raw_text" not in str(get.call_args)


def test_web_failure_preserves_local_search(monkeypatch, db, sample_store):
    monkeypatch.setattr(stocking.requests, "get", Mock(side_effect=requests.Timeout))
    result = stocking.search(sample_store.id, "Parawel", include_web=True)
    assert result["references"]
    assert result["web"]["status"] == "unavailable"


def test_tavily_uses_basic_search_and_caches_repeated_queries(monkeypatch):
    stocking._tavily_search.cache_clear()
    monkeypatch.setenv("TAVILY_API_KEY", "test-only-key")
    response = Mock()
    response.json.return_value = {"results": [{"title": "Parawel 650", "url": "https://example.com/medicine",
                                              "content": "Paracetamol 650 mg"}]}
    post = Mock(return_value=response)
    monkeypatch.setattr(stocking.requests, "post", post)
    assert stocking.web_search("Parawel 650")["status"] == "results"
    assert stocking.web_search("Parawel 650")["status"] == "results"
    assert post.call_count == 1
    assert post.call_args.kwargs["json"]["search_depth"] == "basic"
    assert post.call_args.kwargs["json"]["auto_parameters"] is False
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer test-only-key"
    stocking._tavily_search.cache_clear()


def test_stocking_prioritizes_product_lines_over_manufacturer_and_address():
    assert stocking.product_queries("Med Manor\nUnit No. 143\nPara wel-650\nParacetamol Tablets IP\n650 mg")[0] == "Parawel 650"
    assert stocking.product_queries("Paracetamol Tablets IP\np.650\napex")[0].casefold() == "p 650"


def test_dosage_warning_amount_cannot_prefill_conflicting_product_strength(client, pharmacist_token):
    result = client.post("/api/vision/stocking/read", headers=headers(pharmacist_token), json={
        "raw_text": "P-650\nMaximum daily dose 400 mg"})
    assert result.status_code == 200
    assert result.json["extracted"]["brand_name"].casefold() == "p 650"
    assert result.json["extracted"]["strength"] is None


def test_existing_medicine_is_reused_without_overwriting_identity(client, pharmacist_token, db, sample_store):
    med = Medicine(store_id=sample_store.id, brand_name="Parawel 650", strength="650 mg")
    db.session.add(med)
    db.session.commit()
    result = client.post("/api/vision/stocking/confirm", headers=headers(pharmacist_token), json={
        "confirmed": True, "query": "Parawel", "medicine_id": med.id,
        "medicine": {"brand_name": "Web guessed something else", "strength": "150 mg"}})
    assert result.status_code == 200
    assert result.json["medicine"]["strength"] == "650 mg"
    assert Medicine.query.count() == 1


def test_confirm_stock_and_bill_reuses_the_same_medicine(client, owner_token, sample_store):
    from datetime import date, timedelta
    from app.sync.offline_pack import generate_offline_pack
    auth = headers(owner_token)
    response = client.post("/api/vision/stocking/confirm", headers=auth, json={
        "confirmed": True, "query": "Parawel 650", "barcode": "0012345678905",
        "medicine": {"brand_name": "Parawel 650", "strength": "650 mg", "dosage_form": "tablet"}})
    med_id = response.json["medicine"]["id"]
    supplier = client.post("/api/suppliers", headers=auth, json={"name": "Test distributor"}).json["supplier"]["id"]
    purchase = client.post("/api/purchases", headers=auth, json={"supplier_id": supplier,
        "invoice_number": "STOCK-FLOW-1", "invoice_date": date.today().isoformat(), "items": [{
            "medicine_id": med_id, "batch_number": "PACK-1", "expiry_date": (date.today()+timedelta(days=365)).isoformat(),
            "quantity": 3, "purchase_rate": 20, "mrp": 30}]}).json["invoice"]
    assert generate_offline_pack(sample_store.id, in_stock_only=True)["medicines"] == []
    accepted = client.post(f"/api/purchases/{purchase['id']}/accept", headers=auth, json={
        "items": [{"item_id": purchase["items"][0]["id"], "received_quantity": 3}]})
    assert accepted.status_code == 200
    pack = generate_offline_pack(sample_store.id, in_stock_only=True)
    assert pack["medicines"][0]["id"] == med_id
    assert pack["medicines"][0]["barcodes"] == ["0012345678905"]
    assert pack["medicines"][0]["total_stock"] == 3
    matched = client.get("/api/medicines/barcode?code=0012345678905", headers=auth).json["medicine"]
    sale = client.post("/api/sales", headers=auth, json={"items": [{"medicine_id": matched["id"],
        "quantity": 1, "unit_price": 30}], "payments": [{"payment_method": "cash", "amount": 30}]})
    assert sale.status_code == 201
    assert sale.json["sale"]["items"][0]["medicine_id"] == med_id
    assert generate_offline_pack(sample_store.id)["medicines"][0]["total_stock"] == 2
