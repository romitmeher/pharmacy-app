from types import SimpleNamespace
import cv2
import numpy as np
import pytest
from app.vision.ocr_engine import OCRResult, OCRWordBox
from app.vision.packaging_orientation import read_packaging_orientations, restore_orientation
from app.vision.extractor import default_entity_extractor, ExtractedEntities
from app.vision.matcher import default_medicine_matcher
from app.models.medicine import Medicine


def result(text):
    return OCRResult(text,[text],[OCRWordBox(text,.9,[[1,2],[5,2],[5,6],[1,6]])],.9)


def test_upright_match_does_not_run_extra_ocr():
    calls=[]
    def read(image):calls.append(image.shape);return result('Brand')
    match=SimpleNamespace(top_candidate=SimpleNamespace(score_breakdown={'brand_score':40},confidence_score=70),low_confidence=False)
    answer=read_packaging_orientations(np.zeros((80,120,3),np.uint8),read,lambda x:x,lambda x:match)
    assert len(calls)==1 and answer[3]==0


def test_rejected_read_retries_sideways_text_and_stops():
    calls=[]
    def read(image):
        calls.append(image.shape)
        return result('Brand' if image.shape[0]==120 else 'garbled')
    def match(ocr):
        top=SimpleNamespace(score_breakdown={'brand_score':40},confidence_score=70) if ocr.full_text=='Brand' else None
        return SimpleNamespace(top_candidate=top,low_confidence=top is None)
    answer=read_packaging_orientations(np.zeros((80,120,3),np.uint8),read,lambda x:x,match)
    assert len(calls)==2 and answer[3]==270
    assert answer[0].word_boxes[0].box[0]==[117,1]


def test_all_unknown_orientations_remain_rejected():
    no_match=SimpleNamespace(top_candidate=None,low_confidence=True)
    answer=read_packaging_orientations(np.zeros((80,120,3),np.uint8),lambda x:result('noise'),lambda x:x,lambda x:no_match)
    assert answer[2].top_candidate is None and answer[2].low_confidence


def test_composition_preserves_both_printed_doses():
    entities=default_entity_extractor.extract('Amlokind-AT\nEach uncoated tablet contains\nAmlodipine 5mg\nLicence M00/5093G\nAtenolol 50 mg\nMaximum daily dose 100 mg')
    assert entities.strength=='5 mg + 50 mg'


@pytest.mark.parametrize('strength,accepted',[('50 mg + 5 mg',True),('5 mg + 25 mg',False),('50 mg',False),('5 mcg + 50 mg',False)])
def test_combination_matching_preserves_identity_guards(db,sample_store,strength,accepted):
    db.session.add(Medicine(store_id=sample_store.id,brand_name='Amlokind-AT',strength='5 mg + 50 mg',is_active=True));db.session.flush()
    answer=default_medicine_matcher.match(ExtractedEntities(brand_name='Amlokind-AT',strength=strength,confidence=.95),store_id=sample_store.id)
    assert (answer.top_candidate is not None)==accepted


def test_split_catalog_brand_is_retrieved_with_adjacent_ocr_noise(db,sample_store):
    db.session.add(Medicine(store_id=sample_store.id,brand_name='Amlokind-AT',strength='5 mg + 50 mg',is_active=True));db.session.flush()
    answer=default_medicine_matcher.match(ExtractedEntities(brand_name='AmlokindAT 312',strength='5 mg + 50 mg',confidence=.9),store_id=sample_store.id)
    assert answer.top_candidate is not None and answer.top_candidate.name=='Amlokind-AT'
    assert not answer.low_confidence
