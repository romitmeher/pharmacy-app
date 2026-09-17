"""
SmartPharm Vision Pipeline
End-to-end computer vision and OCR pipeline for physical pharmacy operations.

Workflow:
Camera / Upload -> Image Quality Assessment -> Object ROI Detection ->
PaddleOCR Text Recognition -> Entity Extraction -> Medicine & Batch DB Matching ->
Explainable Confidence & Human Verification Candidate Payload.
"""

from dataclasses import dataclass
import io
import logging
from typing import Any, Dict, Optional, Union
import cv2
import numpy as np
from PIL import Image

from app.vision.quality import ImageQualityAssessment, assess_image_quality
from app.vision.detector import DetectionResult, detect_package_roi
from app.vision.ocr_engine import OCRResult, default_ocr_engine
from app.vision.extractor import ExtractedEntities, default_entity_extractor
from app.vision.matcher import MatchResult, default_medicine_matcher

logger = logging.getLogger(__name__)


@dataclass
class VisionRecognitionPipelineResult:
    """Consolidated result from the full SmartPharm computer vision pipeline."""
    success: bool
    quality: ImageQualityAssessment
    detection: Optional[DetectionResult]
    ocr: Optional[OCRResult]
    extracted_entities: Optional[ExtractedEntities]
    match_result: Optional[MatchResult]
    human_verification_required: bool = True
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "quality": self.quality.to_dict(),
            "detection": self.detection.to_dict() if self.detection else None,
            "ocr": self.ocr.to_dict() if self.ocr else None,
            "extracted_entities": self.extracted_entities.to_dict() if self.extracted_entities else None,
            "match_result": self.match_result.to_dict() if self.match_result else None,
            "human_verification_required": self.human_verification_required,
            "error_message": self.error_message,
        }


def decode_image_bytes(image_input: Union[bytes, bytearray, np.ndarray, Image.Image]) -> np.ndarray:
    """
    Safely decode raw image bytes, PIL Image, or ndarray into a BGR numpy array.
    """
    if isinstance(image_input, np.ndarray):
        return image_input

    if isinstance(image_input, Image.Image):
        rgb_arr = np.array(image_input)
        if len(rgb_arr.shape) == 2:
            return cv2.cvtColor(rgb_arr, cv2.COLOR_GRAY2BGR)
        return cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)

    if isinstance(image_input, (bytes, bytearray)):
        # Decode using OpenCV
        np_arr = np.frombuffer(image_input, np.uint8)
        decoded = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if decoded is None:
            # Fallback to PIL
            pil_img = Image.open(io.BytesIO(image_input)).convert("RGB")
            return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        return decoded

    raise ValueError(f"Unsupported image input type: {type(image_input)}")


def recognize_medicine_image(
    image_input: Union[bytes, bytearray, np.ndarray, Image.Image],
    store_id: Optional[int] = None,
    ocr_override: Optional[OCRResult] = None,
) -> VisionRecognitionPipelineResult:
    """
    Execute the full end-to-end SmartPharm vision pipeline.

    1. Image Quality Assessment
    2. Package Detection & ROI Cropping
    3. PaddleOCR Text Detection & Recognition
    4. Regex / NLP Entity Extraction
    5. Database Matching with Confidence & PRD Rule 9 Warnings
    """
    try:
        image = decode_image_bytes(image_input)
    except Exception as decode_err:
        return VisionRecognitionPipelineResult(
            success=False,
            quality=ImageQualityAssessment(
                is_acceptable=False,
                blur_score=0.0,
                is_blurry=True,
                brightness_score=0.0,
                is_dark=True,
                glare_ratio=0.0,
                is_glare=False,
                resolution={"width": 0, "height": 0},
                issues=["Invalid or corrupted image format."],
            ),
            detection=None,
            ocr=None,
            extracted_entities=None,
            match_result=None,
            error_message=f"Failed to decode image: {decode_err}",
        )

    # Step 1: Quality assessment
    quality = assess_image_quality(image)
    if not quality.is_acceptable:
        logger.info(f"Image rejected due to poor quality: {quality.feedback}")
        return VisionRecognitionPipelineResult(
            success=False,
            quality=quality,
            detection=None,
            ocr=None,
            extracted_entities=None,
            match_result=None,
            error_message="Image quality is too low for reliable recognition. " + " ".join(quality.feedback),
        )

    # Step 2: Package / Blister Detection
    detection = detect_package_roi(image)
    roi_img = detection.cropped_roi if detection.cropped_roi is not None else image

    # Step 3: Text Detection & OCR
    if ocr_override is not None:
        ocr_res = ocr_override
    else:
        ocr_res = default_ocr_engine.run_ocr(roi_img)
        # If cropped ROI found no text, fallback to entire original image
        if not ocr_res.full_text and detection.cropped_roi is not None:
            logger.info("OCR on cropped ROI found no text; falling back to full image.")
            ocr_res = default_ocr_engine.run_ocr(image)

    # Step 4: Entity Extraction
    extracted = default_entity_extractor.extract(ocr_res)

    # Step 5: Database Matching
    match_result = default_medicine_matcher.match(extracted, store_id=store_id)

    return VisionRecognitionPipelineResult(
        success=True,
        quality=quality,
        detection=detection,
        ocr=ocr_res,
        extracted_entities=extracted,
        match_result=match_result,
        human_verification_required=True,  # PRD Rule 9: Human verification is mandatory
    )
