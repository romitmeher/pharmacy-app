"""
SmartPharm - Computer Vision OCR Engine
Wraps PaddleOCR (or fallback pipeline) to detect and extract text tokens,
bounding boxes, and per-token confidence scores from pharmacy packaging.

Strict compliance with SmartPharm PRD:
- Never fabricate confidence scores.
- Extract bounding coordinates for explainable UI overlays.
- Provide lazy-initialized engine instance with CPU fallback.
"""

from dataclasses import dataclass, field
import os
import logging
from typing import Any, List, Optional, Tuple
import numpy as np
import cv2
from threading import Lock

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

logger = logging.getLogger(__name__)



@dataclass
class OCRWordBox:
    """Individual recognized text token with spatial coordinates and confidence."""
    text: str
    confidence: float  # Range: 0.0 to 1.0
    box: List[List[float]] = field(default_factory=list)  # 4 points: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]


@dataclass
class OCRResult:
    """Consolidated OCR extraction output for a packaging image/ROI."""
    full_text: str
    lines: List[str]
    word_boxes: List[OCRWordBox]
    avg_confidence: float

    def to_dict(self) -> dict:
        return {
            "full_text": self.full_text,
            "lines": self.lines,
            "word_boxes": [
                {
                    "text": wb.text,
                    "confidence": round(wb.confidence, 4),
                    "box": wb.box,
                }
                for wb in self.word_boxes
            ],
            "avg_confidence": round(self.avg_confidence, 4),
        }


class OCREngine:
    """
    PaddleOCR wrapper engineered for high-accuracy pharmaceutical label reading.
    Supports angle classification (0/90/180/270 degrees) common on medicine blister strips.
    """

    def __init__(self, use_angle_cls: bool = False, lang: str = "en"):
        self.use_angle_cls = use_angle_cls
        self.lang = lang
        self._ocr_instance: Optional[Any] = None
        self._initialization_lock = Lock()
        self._prediction_lock = Lock()

    def _get_engine(self) -> Any:
        with self._initialization_lock:
            return self._initialize_engine()

    def _initialize_engine(self) -> Any:
        """Lazy loader for PaddleOCR to avoid heavy import overhead at app startup."""
        if self._ocr_instance is None:
            try:
                from paddleocr import PaddleOCR
                # Initialize PaddleOCR CPU-safe by default
                try:
                    self._ocr_instance = PaddleOCR(
                        use_doc_orientation_classify=False,
                        use_doc_unwarping=False,
                        use_textline_orientation=self.use_angle_cls,
                        enable_mkldnn=os.environ.get("OCR_ENABLE_MKLDNN", "false").lower() == "true",
                        cpu_threads=4,
                        text_detection_model_name=os.environ.get("OCR_DETECTION_MODEL", "PP-OCRv5_mobile_det"),
                        text_recognition_model_name=os.environ.get("OCR_RECOGNITION_MODEL", "en_PP-OCRv5_mobile_rec"),
                        lang=self.lang,
                    )
                except TypeError:
                    self._ocr_instance = PaddleOCR(lang=self.lang, use_angle_cls=self.use_angle_cls, use_gpu=False)


                logger.info("PaddleOCR engine initialized successfully.")
            except Exception as e:
                logger.warning(f"PaddleOCR failed to initialize: {e}. OCR will operate in fallback mode.")
                self._ocr_instance = False  # Sentinel for unavailable
        return self._ocr_instance

    def run_ocr(self, image: np.ndarray) -> OCRResult:
        """
        Execute text detection and recognition on an input BGR or RGB image.

        Args:
            image: np.ndarray (H, W, 3) or (H, W)

        Returns:
            OCRResult with full text, lines, bounding boxes, and mean confidence.
        """
        if image is None or image.size == 0:
            return OCRResult(full_text="", lines=[], word_boxes=[], avg_confidence=0.0)

        engine = self._get_engine()
        if not engine:
            logger.warning("PaddleOCR engine not active; returning empty result.")
            return OCRResult(full_text="", lines=[], word_boxes=[], avg_confidence=0.0)

        original_height, original_width = image.shape[:2]
        largest_side = max(image.shape[:2])
        if largest_side > 1600:
            image = cv2.resize(image, None, fx=1600 / largest_side, fy=1600 / largest_side)
        elif largest_side < 800:
            # Small product images contain readable lettering below the detector's
            # preferred scale. Upscale for detection; quality checks still use the original.
            scale = min(3.0, 900 / largest_side)
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        scale_x = original_width / image.shape[1]
        scale_y = original_height / image.shape[0]
        raw_results = None
        try:
            with self._prediction_lock:
                if hasattr(engine, "predict"):
                    raw_results = list(engine.predict(image))
                else:
                    raw_results = engine.ocr(image)
        except Exception as prediction_error:
            logger.warning("PaddleOCR prediction failed: %s", prediction_error)
            try:
                raw_results = engine.ocr(image)
            except Exception as err:
                logger.debug(f"PaddleOCR execution failed: {err}")


        # Fallback to pytesseract if PaddleOCR failed or produced nothing
        if not raw_results:
            try:
                import pytesseract
                data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
                word_boxes = []
                lines = []
                confidences = []
                n_boxes = len(data.get("text", []))
                for i in range(n_boxes):
                    txt = data["text"][i].strip()
                    conf = float(data["conf"][i])
                    if txt and conf > 20:
                        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
                        norm_conf = conf / 100.0
                        wb = OCRWordBox(
                            text=txt,
                            confidence=norm_conf,
                            box=[[px * scale_x, py * scale_y] for px, py in
                                 [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]],
                        )
                        word_boxes.append(wb)
                        lines.append(txt)
                        confidences.append(norm_conf)
                if lines:
                    return OCRResult(
                        full_text="\n".join(lines),
                        lines=lines,
                        word_boxes=word_boxes,
                        avg_confidence=sum(confidences) / len(confidences) if confidences else 0.0,
                    )
            except Exception as t_err:
                logger.debug(f"Pytesseract fallback unavailable: {t_err}")

        if not raw_results or raw_results[0] is None:
            return OCRResult(full_text="", lines=[], word_boxes=[], avg_confidence=0.0)

        word_boxes: List[OCRWordBox] = []
        lines: List[str] = []
        confidences: List[float] = []

        # Parse PaddleOCR results (handles lists, tuples, and PaddleX OCRResult objects)
        for page in raw_results:
            if page is None:
                continue

            # Check if page is a dict or PaddleX result with dt_polys / rec_text
            if hasattr(page, "get") or hasattr(page, "keys"):
                texts = page.get("rec_texts") or page.get("text") or []
                scores = page.get("rec_scores") or page.get("score") or []
                boxes = page.get("rec_polys")
                if boxes is None:
                    boxes = page.get("dt_polys")
                if boxes is None:
                    boxes = page.get("boxes", [])
                if hasattr(boxes, "tolist"):
                    boxes = boxes.tolist()
                for t, s, b in zip(texts, scores, boxes):
                    if hasattr(b, "tolist"):
                        b = b.tolist()
                    c_txt = str(t).strip()
                    if c_txt:
                        word_boxes.append(OCRWordBox(text=c_txt, confidence=float(s), box=b if isinstance(b, list) else []))
                        lines.append(c_txt)
                        confidences.append(float(s))
                continue

            # Standard list of lines: [ [box, (text, conf)], ... ]
            if isinstance(page, list):
                for line_info in page:
                    try:
                        box = line_info[0]
                        text, conf = line_info[1]
                        clean_text = str(text).strip()
                        if clean_text:
                            wb = OCRWordBox(text=clean_text, confidence=float(conf), box=box)
                            word_boxes.append(wb)
                            lines.append(clean_text)
                            confidences.append(float(conf))
                    except (IndexError, ValueError, TypeError) as line_err:
                        logger.debug(f"Skipping line item: {line_err}")
                        continue

        for word in word_boxes:
            word.box = [[x * scale_x, y * scale_y] for x, y in word.box]
        full_text = "\n".join(lines)
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0


        return OCRResult(
            full_text=full_text,
            lines=lines,
            word_boxes=word_boxes,
            avg_confidence=avg_conf,
        )


# Global singleton instance for app reuse
default_ocr_engine = OCREngine()
