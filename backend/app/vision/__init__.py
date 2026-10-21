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
import os
import hashlib
import time
from collections import OrderedDict
from threading import Lock
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


_ocr_cache = OrderedDict()
_ocr_cache_lock = Lock()


def _packaging_ocr(image):
    digest = hashlib.sha256(image.tobytes()).digest()
    cache_key = (image.shape, digest)
    with _ocr_cache_lock:
        cached = _ocr_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < 300:
            _ocr_cache.move_to_end(cache_key)
            return cached[1]
        result = default_ocr_engine.run_ocr(image)
        if result.full_text:
            _ocr_cache[cache_key] = (time.monotonic(), result)
            while len(_ocr_cache) > 32:
                _ocr_cache.popitem(last=False)
        return result


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
    photo_model: Optional[Dict[str, Any]] = None
    barcode: Optional[str] = None

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
            "photo_model": self.photo_model,
            "barcode": self.barcode,
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
    # The same upload button accepts product photos and barcode labels. Decode
    # exact identifiers before OCR, so numeric barcode text is never fuzzy-matched.
    from app.services.barcode_service import decode_barcode_pixels, lookup
    from app.utils.errors import ValidationError, NotFoundError
    barcode = None
    try:
        barcode = decode_barcode_pixels(image)
    except ValidationError as error:
        if not error.message.startswith("No readable barcode found"):
            return VisionRecognitionPipelineResult(False, quality, None, None, None, None,
                                                    error_message=error.message)
    if barcode:
        from app.vision.matcher import MatchCandidate
        from app.models.batch import Batch
        from app.models.inventory import Inventory
        from sqlalchemy import func
        from datetime import date
        try:
            med = lookup(store_id, barcode)
            stock = (Inventory.query.with_entities(func.sum(Inventory.quantity_available))
                .join(Batch, Inventory.batch_id == Batch.id)
                .filter(Inventory.store_id == store_id, Batch.store_id == store_id,
                        Batch.medicine_id == med.id, Batch.expiry_date >= date.today()).scalar()) or 0
            candidate = MatchCandidate(med.id, med.brand_name, med.generic_name, med.strength,
                med.dosage_form.value if med.dosage_form else None, med.manufacturer, med.mrp,
                100.0, "HIGH", score_breakdown={"exact_barcode_match": 100.0}, active_stock=int(stock))
            result = MatchResult(candidate, [], False, None, [])
        except (NotFoundError, ValidationError) as error:
            result = MatchResult(None, [], True, error.message, [barcode])
        return VisionRecognitionPipelineResult(True, quality, None, None, None, result, barcode=barcode)
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
    if os.environ.get("SMARTPHARM_PACKAGE_DETECTION", "false").lower() == "true":
        detection = detect_package_roi(image)
    else:
        height, width = image.shape[:2]
        detection = DetectionResult("full_frame", 0.0, [0, 0, width, height], False)

    roi_img = detection.cropped_roi if detection.cropped_roi is not None else image

    # Step 3: Text Detection & OCR
    if ocr_override is not None:
        ocr_res = ocr_override
    else:
        ocr_res = _packaging_ocr(roi_img)
        # If cropped ROI found no text, fallback to entire original image
        if not ocr_res.full_text and detection.cropped_roi is not None:
            logger.info("OCR on cropped ROI found no text; falling back to full image.")
            ocr_res = _packaging_ocr(image)

    # Step 4: Entity Extraction
    extracted = default_entity_extractor.extract(ocr_res)

    # Step 5: Stage 1 Database Fuzzy Matching
    match_result = default_medicine_matcher.match(extracted, store_id=store_id)

    # Photo evidence supports grounded OCR identity; it never identifies a drug
    # by colour alone or promotes an uncertain match.
    if match_result.top_candidate and not match_result.low_confidence:
        try:
            from app.vision.photo_library import reference_similarity
            candidate = match_result.top_candidate
            similarity = reference_similarity(roi_img, candidate.name, candidate.strength)
            if similarity is not None:
                candidate.score_breakdown["photo_reference_similarity"] = round(similarity * 100, 1)
        except Exception as error:
            logger.debug("Optional local photo reference unavailable: %s", type(error).__name__)

    # Step 6: Stage 2 Visual Embedding Similarity Search & Weighted Fusion
    from app.vision.visual_indexer import default_visual_indexer
    visual_matches = default_visual_indexer.search_similar(roi_img, top_k=5)

    if visual_matches and match_result and match_result.top_candidate and not match_result.low_confidence:
        visual_matches = [match for match in visual_matches if match.medicine_id == match_result.top_candidate.medicine_id]

    if visual_matches and match_result and match_result.top_candidate and visual_matches[0].medicine_id == match_result.top_candidate.medicine_id:
        top_vis = visual_matches[0]
        vis_score_pts = top_vis.similarity_score * 100.0

        # Weighted fusion: 65% Stage 1 OCR Matcher + 35% Stage 2 Visual Embedding
        orig_score = match_result.top_candidate.confidence_score
        fused_score = min(100.0, round(0.65 * orig_score + 0.35 * vis_score_pts, 1))

        match_result.top_candidate.score_breakdown["stage2_visual_score"] = round(vis_score_pts * 0.35, 1)
        match_result.top_candidate.confidence_score = fused_score

        if fused_score >= default_medicine_matcher.HIGH_CONFIDENCE_THRESHOLD:
            match_result.top_candidate.confidence_level = "HIGH"
        elif fused_score >= default_medicine_matcher.LOW_CONFIDENCE_THRESHOLD:
            match_result.top_candidate.confidence_level = "MEDIUM"
        else:
            match_result.top_candidate.confidence_level = "LOW"

        # Recheck low_confidence status
        match_result.low_confidence = fused_score < default_medicine_matcher.LOW_CONFIDENCE_THRESHOLD
        match_result.warning_message = (
            default_medicine_matcher.PRD_LOW_CONFIDENCE_WARNING
            if match_result.low_confidence
            else None
        )

    photo_model = None
    if match_result.top_candidate and not match_result.low_confidence:
        from flask import current_app, has_app_context
        if not has_app_context() or not current_app.config.get("TESTING"):
            from app.vision.photo_classifier import photo_model_evidence
            photo_model = photo_model_evidence(roi_img, match_result.top_candidate)

    return VisionRecognitionPipelineResult(
        success=True,
        quality=quality,
        detection=detection,
        ocr=ocr_res,
        extracted_entities=extracted,
        match_result=match_result,
        human_verification_required=True,  # PRD Rule 9: Human verification is mandatory
        photo_model=photo_model,
    )
