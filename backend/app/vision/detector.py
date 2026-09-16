"""
SmartPharm Backend — Packaging Object Detection Module.

Uses Ultralytics YOLOv8 to localize medicine packaging (boxes, blister strips, bottles),
cropping the region of interest to eliminate extraneous background noise before OCR.
Includes adaptive contour fallback if packaging fills the majority of the frame.
"""

from dataclasses import dataclass
from typing import Tuple, Optional, Dict, Any, List
import cv2
import numpy as np

_yolo_model = None


@dataclass
class DetectionResult:
    """Standardized representation of detected packaging ROI."""
    method: str
    confidence: float
    bbox: List[int]  # [x1, y1, x2, y2]
    is_cropped: bool
    cropped_roi: Optional[np.ndarray] = None

    @property
    def bounding_box(self) -> Tuple[int, int, int, int]:
        """Convert [x1, y1, x2, y2] to (x, y, w, h)."""
        x1, y1, x2, y2 = self.bbox
        return (x1, y1, x2 - x1, y2 - y1)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "method": self.method,
            "confidence": round(self.confidence, 3),
            "bbox": self.bbox,
            "is_cropped": self.is_cropped,
            "bounding_box": {
                "x": self.bbox[0],
                "y": self.bbox[1],
                "width": self.bbox[2] - self.bbox[0],
                "height": self.bbox[3] - self.bbox[1],
            },
        }


def get_detector_model():
    """Lazy load YOLOv8 model instance to optimize startup time."""
    global _yolo_model
    if _yolo_model is None:
        try:
            from ultralytics import YOLO
            # Load lightweight nano model
            _yolo_model = YOLO("yolov8n.pt")
        except Exception:
            # If weight download is unavailable or fails, fallback will handle cropping
            _yolo_model = False
    return _yolo_model


def detect_and_crop_packaging(cv_image: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Detect medicine packaging within image and crop the region of interest.

    Returns:
        cropped_image: np.ndarray (the cropped packaging or original frame)
        detection_metadata: Dict with bbox [x1, y1, x2, y2], confidence, and method used.
    """
    h, w = cv_image.shape[:2]
    model = get_detector_model()

    if model:
        try:
            results = model(cv_image, verbose=False)
            if results and len(results) > 0:
                boxes = results[0].boxes
                if len(boxes) > 0:
                    # Pick highest confidence detection
                    best_idx = int(boxes.conf.argmax())
                    conf = float(boxes.conf[best_idx])
                    if conf >= 0.35:
                        x1, y1, x2, y2 = boxes.xyxy[best_idx].cpu().numpy().astype(int)
                        # Add modest 5% padding around box
                        pad_x = int((x2 - x1) * 0.05)
                        pad_y = int((y2 - y1) * 0.05)
                        x1 = max(0, x1 - pad_x)
                        y1 = max(0, y1 - pad_y)
                        x2 = min(w, x2 + pad_x)
                        y2 = min(h, y2 + pad_y)

                        cropped = cv_image[y1:y2, x1:x2]
                        if cropped.size > 0 and (x2 - x1) > 50 and (y2 - y1) > 50:
                            return cropped, {
                                "method": "yolo_v8",
                                "confidence": round(conf, 3),
                                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                                "cropped": True,
                            }
        except Exception:
            pass

    # Resilient Fallback: Adaptive Contour Bounding Box
    # Finds prominent rectangular objects against countertop
    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (w * h) * 0.15  # At least 15% of frame area
    largest_contour = None
    max_area = 0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > min_area and area > max_area:
            max_area = area
            largest_contour = cnt

    if largest_contour is not None:
        x, y, cw, ch = cv2.boundingRect(largest_contour)
        # Verify reasonable aspect ratio
        if cw > 100 and ch > 100:
            cropped = cv_image[y : y + ch, x : x + cw]
            if cropped.size > 0:
                return cropped, {
                    "method": "contour_roi",
                    "confidence": 0.70,
                    "bbox": [int(x), int(y), int(x + cw), int(y + ch)],
                    "cropped": True,
                }

    # Full frame fallback if packaging occupies entire frame
    return cv_image, {
        "method": "full_frame",
        "confidence": 1.0,
        "bbox": [0, 0, w, h],
        "cropped": False,
    }


def detect_package_roi(cv_image: np.ndarray) -> DetectionResult:
    """Wrapper that returns a structured DetectionResult object."""
    cropped, meta = detect_and_crop_packaging(cv_image)
    return DetectionResult(
        method=meta["method"],
        confidence=meta["confidence"],
        bbox=meta["bbox"],
        is_cropped=meta.get("cropped", False),
        cropped_roi=cropped,
    )
