"""Cloud CPU acceleration is explicit; Windows-safe defaults are preserved."""
import sys
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from app.vision.ocr_engine import OCREngine


@pytest.mark.parametrize('value,expected', [(None,False),('true',True)])
def test_ocr_acceleration_is_opt_in(monkeypatch,value,expected):
    if value is None:
        monkeypatch.delenv('OCR_ENABLE_MKLDNN',raising=False)
    else:
        monkeypatch.setenv('OCR_ENABLE_MKLDNN',value)
    factory=Mock(return_value=object())
    monkeypatch.setitem(sys.modules,'paddleocr',SimpleNamespace(PaddleOCR=factory))
    assert OCREngine()._initialize_engine()
    assert factory.call_args.kwargs['enable_mkldnn'] is expected
