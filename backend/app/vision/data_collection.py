"""
SmartPharm - Reference Image Data Collection & Metadata Pipeline
Manages ingestion, synthetic generation, and manual review indexing for reference packaging images.
"""

from dataclasses import dataclass, field
import datetime
import os
import logging
from typing import Any, Dict, List, Optional
import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ReferenceImageSample:
    sample_id: str
    medicine_id: int
    brand_name: str
    image_path: Optional[str]
    image_bytes: Optional[bytes] = None
    lighting_condition: str = "standard"  # standard, low_light, glare, angled
    is_verified: bool = True
    created_at: str = field(default_factory=lambda: datetime.datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sample_id": self.sample_id,
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "image_path": self.image_path,
            "lighting_condition": self.lighting_condition,
            "is_verified": self.is_verified,
            "created_at": self.created_at,
        }


class ReferenceDataCollectionPipeline:
    """Pipeline for managing and validating reference medicine packaging image datasets."""

    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = storage_dir or os.path.join(
            os.path.dirname(__file__), "..", "..", "data", "reference_images"
        )
        os.makedirs(self.storage_dir, exist_ok=True)
        self.samples: List[ReferenceImageSample] = []

    def create_synthetic_reference_image(
        self, brand_name: str, generic_name: str, manufacturer: str
    ) -> np.ndarray:
        """
        Generates a standardized reference packaging graphic image for matching testing.
        """
        # Create a 400x400 white canvas
        img = np.ones((400, 400, 3), dtype=np.uint8) * 245

        # Red accent bar (typical Indian medicine box design)
        cv2.rectangle(img, (20, 20), (35, 380), (40, 40, 220), -1)

        # Title text
        cv2.putText(img, brand_name.upper(), (50, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (15, 15, 15), 2)
        cv2.putText(img, "TABLETS / CAPSULES", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (80, 80, 80), 1)

        # Composition text
        cv2.putText(img, "Composition:", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (40, 40, 40), 1)
        # Word wrap composition if long
        words = generic_name.split()
        line1 = " ".join(words[:4])
        line2 = " ".join(words[4:]) if len(words) > 4 else ""

        cv2.putText(img, line1, (50, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (20, 20, 20), 1)
        if line2:
            cv2.putText(img, line2, (50, 195), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (20, 20, 20), 1)

        # Manufacturer logo area
        cv2.rectangle(img, (50, 310), (350, 360), (225, 225, 225), -1)
        cv2.putText(img, f"Mfg: {manufacturer}", (60, 340), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (40, 40, 40), 1)

        return img

    def ingest_sample(
        self,
        medicine_id: int,
        brand_name: str,
        image_arr: np.ndarray,
        sample_id: str,
        lighting: str = "standard",
    ) -> ReferenceImageSample:
        """Saves image array to disk and records metadata sample."""
        filename = f"med_{medicine_id}_{sample_id}.png"
        filepath = os.path.join(self.storage_dir, filename)
        cv2.imwrite(filepath, image_arr)

        sample = ReferenceImageSample(
            sample_id=sample_id,
            medicine_id=medicine_id,
            brand_name=brand_name,
            image_path=filepath,
            lighting_condition=lighting,
            is_verified=True,
        )
        self.samples.append(sample)
        return sample


default_reference_pipeline = ReferenceDataCollectionPipeline()
