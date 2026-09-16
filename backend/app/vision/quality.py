"""
SmartPharm Backend — Image Quality Assessment Module.

Per PRD Rule 10, real-world packaging images suffer from blur, glare, and poor lighting.
This module evaluates capture quality BEFORE running heavy OCR/inference to provide
immediate feedback to the pharmacist rather than returning noisy or hallucinatory results.
"""

from dataclasses import dataclass, field
from typing import Union, Tuple, Dict, Any, List
import cv2
import numpy as np


@dataclass
class ImageQualityAssessment:
    """Structured assessment of packaging image capture quality."""
    is_acceptable: bool
    blur_score: float
    is_blurry: bool
    brightness_score: float
    is_dark: bool
    glare_ratio: float
    is_glare: bool
    resolution: Dict[str, int]
    issues: List[str] = field(default_factory=list)

    @property
    def is_underexposed(self) -> bool:
        return self.is_dark

    @property
    def has_glare(self) -> bool:
        return self.is_glare

    @property
    def feedback(self) -> List[str]:
        return self.issues

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_acceptable": self.is_acceptable,
            "blur_score": round(self.blur_score, 2),
            "is_blurry": self.is_blurry,
            "brightness_score": round(self.brightness_score, 2),
            "is_dark": self.is_dark,
            "is_underexposed": self.is_dark,
            "glare_ratio": round(self.glare_ratio, 4),
            "is_glare": self.is_glare,
            "has_glare": self.is_glare,
            "resolution": self.resolution,
            "issues": self.issues,
            "feedback": self.issues,
        }

    def __getitem__(self, key: str) -> Any:
        return self.to_dict()[key]


def decode_image_bytes(image_data: Union[bytes, np.ndarray]) -> np.ndarray:
    """Safely decode raw image bytes to OpenCV BGR numpy array."""
    if isinstance(image_data, np.ndarray):
        return image_data
    nparr = np.frombuffer(image_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode image data into valid image array.")
    return image


def assess_image_quality(
    image_input: Union[bytes, np.ndarray],
    blur_threshold: float = 100.0,
    min_brightness: float = 45.0,
    max_glare_ratio: float = 0.15,
) -> ImageQualityAssessment:
    """Assess whether a captured frame is of sufficient quality for medicine recognition.

    Evaluates:
    - Laplacian variance for focus / motion blur
    - Mean luminance for dark / under-exposed capture
    - Saturated highlight ratio for foil specular glare
    - Dimension checks
    """
    image = decode_image_bytes(image_input)
    h, w = image.shape[:2]

    issues = []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 1. Blur Detection (Laplacian Variance)
    # Higher variance indicates sharp edges; low variance indicates blur.
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    blur_score = float(laplacian.var())
    is_blurry = blur_score < blur_threshold
    if is_blurry:
        issues.append("Image is blurry. Please hold packaging steady.")

    # 2. Illumination / Brightness
    brightness_score = float(np.mean(gray))
    is_dark = brightness_score < min_brightness
    if is_dark:
        issues.append("Image is too dark. Please position packaging under better lighting.")

    # 3. Specular Glare (common on metallic / blister foil)
    glare_pixels = np.sum(gray >= 250)
    total_pixels = h * w
    glare_ratio = float(glare_pixels / total_pixels) if total_pixels > 0 else 0.0
    is_glare = glare_ratio > max_glare_ratio
    if is_glare:
        issues.append("Significant glare detected on packaging foil. Adjust angle to minimize reflection.")

    # 4. Minimum Resolution
    is_too_small = h < 200 or w < 200
    if is_too_small:
        issues.append("Image resolution is too low. Bring packaging closer to camera.")

    is_acceptable = not (is_blurry or is_dark or is_glare or is_too_small)

    return ImageQualityAssessment(
        is_acceptable=is_acceptable,
        blur_score=blur_score,
        is_blurry=is_blurry,
        brightness_score=brightness_score,
        is_dark=is_dark,
        glare_ratio=glare_ratio,
        is_glare=is_glare,
        resolution={"width": w, "height": h},
        issues=issues,
    )
