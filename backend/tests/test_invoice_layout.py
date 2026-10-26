"""Invoice regression tests use invented OCR cells, not private bill photographs."""
import numpy as np
from app.vision.ocr_engine import OCRResult, OCRWordBox, OCREngine
from app.distributor.invoice_layout import parse_layout
from app.distributor.invoice_parser import default_invoice_parser
from app.models.purchase import PurchaseInvoice
from app.models.supplier import Supplier


def word(text, x, y):
    return OCRWordBox(text, .9, [[x-15,y-5],[x+15,y-5],[x+15,y+5],[x-15,y+5]])


def fixture_ocr(missing_amount=False):
    words = [word(t,x,20) for t,x in [("PRODUCT DESCRIPTION",200),("M.R.P.",600),("RATE",680),("AMOUNT",760)]]
    for y,name,batch,expiry,amount in [(50,"ALPHA TABLET","AB123","05/31","20.00"),(80,"BETA CAPSULE","CD456","06/30","30.00")]:
        words.extend(word(t,x,y) for t,x in [(name,200),(batch,420),(expiry,500),("40.00",600),("10.00",680)])
        if not (missing_amount and y==80):
            words.append(word(amount,760,y))
    words.extend([word("TO PAY",650,150),word("55.00",760,150)])
    text="\n".join(w.text for w in words)
    return OCRResult(text,text.splitlines(),words,.9)


def test_coordinate_columns_keep_batches_prices_and_rows_aligned():
    parsed=parse_layout(fixture_ocr(),default_invoice_parser)
    assert parsed.total_amount==55
    assert [i.batch_number for i in parsed.items]==["AB123","CD456"]
    assert [i.raw_item_name for i in parsed.items]==["ALPHA TABLET","BETA CAPSULE"]
    assert [i.quantity for i in parsed.items]==[0,0]
    assert parsed.items[0].expiry_date.isoformat()=="2031-05-31"
    assert parsed.items[1].total_amount==30


def test_missing_currency_cell_rejects_misaligned_table():
    parsed=parse_layout(fixture_ocr(True),default_invoice_parser)
    assert len(parsed.items)==2
    assert all(i.purchase_rate is None and i.expiry_date is None and i.quantity==0 for i in parsed.items)
    assert parsed.total_amount==55


def test_paddle_numpy_polygons_are_preserved(monkeypatch):
    class Engine:
        def predict(self,image):
            return [{"rec_texts":["ALPHA"],"rec_scores":[.9],
                     "rec_polys":[np.array([[1,2],[20,2],[20,10],[1,10]])]}]
    engine=OCREngine()
    monkeypatch.setattr(engine,"_get_engine",lambda:Engine())
    result=engine.run_ocr(np.ones((800,800,3),dtype=np.uint8))
    assert result.word_boxes[0].box==[[1,2],[20,2],[20,10],[1,10]]


def test_empty_scan_creates_no_draft_or_supplier(client,owner_token,db):
    response=client.post('/api/distributor/scan-invoice',json={"raw_text":"Unreadable blank bill"},headers={"Authorization":f"Bearer {owner_token}"})
    assert response.status_code==422
    assert PurchaseInvoice.query.count()==0
    assert Supplier.query.count()==0


def test_photo_scan_returns_review_preview_without_database_writes(client,owner_token,db,monkeypatch):
    import io
    import cv2
    parsed=parse_layout(fixture_ocr(),default_invoice_parser)
    monkeypatch.setattr(default_invoice_parser,"parse_image",lambda image:parsed)
    _,encoded=cv2.imencode('.png',np.zeros((100,100,3),dtype=np.uint8))
    response=client.post('/api/distributor/scan-invoice',data={'invoice':(io.BytesIO(encoded.tobytes()),'bill.png')},headers={'Authorization':f'Bearer {owner_token}'})
    assert response.status_code==200
    assert response.json['status']=='review_required'
    assert response.json['data']['purchase_invoice_id'] is None
    assert response.json['data']['items_count']==2
    assert PurchaseInvoice.query.count()==0
    assert Supplier.query.count()==0
