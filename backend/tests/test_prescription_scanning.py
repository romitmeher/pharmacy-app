"""Local prescription drafts must not become inferred dispensing instructions."""
import io
import numpy as np
from app.ai.prescription_parser import default_prescription_scanner
from app.vision.ocr_engine import OCRResult, default_ocr_engine
from app.models.medicine import Medicine


def test_clinic_vitals_and_diagnosis_are_not_medicines(db, sample_store):
    result = default_prescription_scanner.parse_prescription_text(
        'SAI RAM CLINIC\nDr. Example\nName: Test\nAge: 19\nBP 120/70\nHR 116\nSpO2 98\nRx H/o cold, fever\nFor Medicine: Free delivery',sample_store.id)
    assert result.total_detected == 0
    assert not result.is_fully_dispensable


def test_od_inside_brand_does_not_truncate_it_and_no_quantity_is_inferred(db,sample_store):
    med=Medicine(store_id=sample_store.id,brand_name='Amlodipine',strength='5mg',is_active=True)
    db.session.add(med);db.session.commit()
    result=default_prescription_scanner.parse_prescription_text('Tab Amlodipine 5mg OD 7 days',sample_store.id)
    assert result.items[0].matched_medicine_id == med.id
    assert result.items[0].quantity_to_dispense is None
    assert result.items[0].confidence is None


def test_ambiguous_catalog_match_is_not_first_row(db,sample_store):
    db.session.add_all([Medicine(store_id=sample_store.id,brand_name='Example',strength=strength,is_active=True) for strength in ['5mg','10mg']]);db.session.commit()
    result=default_prescription_scanner.parse_prescription_text('Tab Example OD',sample_store.id)
    assert result.total_detected==1 and result.items[0].matched_medicine_id is None


def test_image_remains_unlinked_review_draft(monkeypatch,db,sample_store):
    reading=OCRResult('Tab Example 5mg BD 5 days',['Tab Example 5mg BD 5 days'],[],.95)
    monkeypatch.setattr(default_ocr_engine,'run_ocr',lambda image: reading)
    result=default_prescription_scanner.scan_prescription_image(np.full((80,80,3),255,np.uint8),sample_store.id)
    assert result.total_detected==1
    assert result.items[0].matched_medicine_id is None
    assert result.items[0].quantity_to_dispense is None
    assert result.warnings and result.engine=='local_ocr'
    assert result.to_dict()['requires_verification']


def test_malformed_image_and_nontext_request_rejected(client,owner_token):
    headers={'Authorization':f'Bearer {owner_token}'}
    response=client.post('/api/ai/prescription/scan',headers=headers,json={'image_base64':'not valid base64!'})
    assert response.status_code==400
    response=client.post('/api/ai/prescription/scan',headers=headers,json={'text':['not','text']})
    assert response.status_code==400
    response=client.post('/api/ai/prescription/scan',headers=headers,data={'prescription':(io.BytesIO(b'not an image'),'test.png')})
    assert response.status_code==400


def test_handwriting_rows_preserve_uncertainty_and_no_inferred_quantity(monkeypatch,db,sample_store):
    from app.ai import prescription_vision
    monkeypatch.setattr(prescription_vision,'read_handwriting',lambda image: {
        'raw_text':'Patient private header\nT. Unclear 1-0-1 (5)', 'warnings':[],
        'items':[{'raw_text':'T. Unclear 1-0-1 (5)','name':None,'strength':None,
                  'dosage_instructions':'1-0-1','duration':None,'quantity':None,'uncertain':True}]})
    result=default_prescription_scanner.scan_prescription_image(np.zeros((20,20,3),np.uint8),sample_store.id,use_handwriting=True)
    assert result.total_detected==1 and result.engine=='handwriting_ai'
    assert result.items[0].quantity_to_dispense is None
    assert result.items[0].matched_medicine_id is None
    assert result.warnings and not result.is_fully_dispensable
    assert 'Patient private header' not in result.raw_ocr_text


def test_handwriting_service_failure_does_not_silently_run_printed_ocr(monkeypatch,db,sample_store):
    from app.ai import prescription_vision
    def unavailable(image):
        raise RuntimeError('provider unavailable')
    monkeypatch.setattr(prescription_vision,'read_handwriting',unavailable)
    monkeypatch.setattr(default_ocr_engine,'run_ocr',lambda image: (_ for _ in ()).throw(AssertionError('unexpected fallback')))
    result=default_prescription_scanner.scan_prescription_image(np.zeros((20,20,3),np.uint8),sample_store.id,use_handwriting=True)
    assert result.engine=='handwriting_unavailable' and result.items==[] and result.warnings


def test_handwriting_schema_rejects_negative_quantities():
    import pytest
    from pydantic import ValidationError
    from app.ai.prescription_vision import WrittenPrescription
    with pytest.raises(ValidationError):
        WrittenPrescription.model_validate({'items':[{'raw_text':'test','quantity':-1}]})
