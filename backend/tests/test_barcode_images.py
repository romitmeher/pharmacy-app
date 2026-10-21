import base64
from unittest.mock import Mock, patch
import cv2
import numpy as np


def payload():
    _, encoded = cv2.imencode('.png', np.full((300, 500, 3), 255, dtype=np.uint8))
    return {"image_base64": base64.b64encode(encoded).decode()}


def test_barcode_image_decodes_without_ocr(client, cashier_token):
    detector = Mock()
    detector.detectAndDecodeWithType.return_value = (True, ("2000000000015",), ("EAN_13",), None)
    with patch('cv2.barcode_BarcodeDetector', return_value=detector):
        response = client.post('/api/medicines/barcode-image', json=payload(),
                               headers={"Authorization": f"Bearer {cashier_token}"})
    assert response.status_code == 200
    assert response.json['barcode'] == '2000000000015'


def test_barcode_image_requires_login_and_valid_image(client, cashier_token):
    assert client.post('/api/medicines/barcode-image', json=payload()).status_code == 401
    response = client.post('/api/medicines/barcode-image', json={"image_base64": "not an image"},
                           headers={"Authorization": f"Bearer {cashier_token}"})
    assert response.status_code == 400
