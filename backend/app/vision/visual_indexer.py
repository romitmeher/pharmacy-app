"""
SmartPharm - Stage 2 Visual Embedding & Feature Similarity Indexer
Extracts normalized visual feature embeddings (HSV color distributions, spatial keypoint descriptors,
contour aspect ratios) and performs fast cosine similarity search across reference packaging images.
"""

from dataclasses import dataclass, field
import logging
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class VisualEmbeddingRecord:
    medicine_id: int
    brand_name: str
    sample_id: str
    embedding: np.ndarray  # 512-dimensional L2-normalized vector

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "sample_id": self.sample_id,
            "vector_dim": int(self.embedding.shape[0]),
        }


@dataclass
class VisualSearchResult:
    medicine_id: int
    brand_name: str
    sample_id: str
    similarity_score: float  # Range: 0.0 to 1.0


class VisualFeatureIndexer:
    """
    Stage 2 Visual Search Engine: Extracts feature representations
    and computes cosine similarity against indexed reference packaging images.
    """

    EMBEDDING_DIM = 512

    def __init__(self):
        self.index: List[VisualEmbeddingRecord] = []
        self._orb = cv2.ORB_create(nfeatures=250)

    def extract_visual_embedding(self, image_bgr: np.ndarray) -> np.ndarray:
        """
        Extracts a normalized 512-D visual embedding vector for a packaging image.

        Vector composition:
        - HSV Color Histogram (256-D): 16 Hue x 8 Saturation x 2 Value
        - Gray Gradients / Texture Histogram (128-D)
        - Spatial Contour & Edge Density Profile (128-D)
        """
        if image_bgr is None or image_bgr.size == 0:
            return np.zeros(self.EMBEDDING_DIM, dtype=np.float32)

        # Rescale image to standard dimensions for feature invariance
        h, w = image_bgr.shape[:2]
        target_size = (300, 300)
        resized = cv2.resize(image_bgr, target_size, interpolation=cv2.INTER_AREA)

        # 1. HSV Color Histogram (256-D)
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        hist_hsv = cv2.calcHist([hsv], [0, 1, 2], None, [16, 8, 2], [0, 180, 0, 256, 0, 256])
        hsv_vec = hist_hsv.flatten()
        if np.sum(hsv_vec) > 0:
            hsv_vec = hsv_vec / np.sum(hsv_vec)

        # 2. Texture & Gradient Profile (128-D)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        mag, _ = cv2.cartToPolar(gx, gy, angleInDegrees=True)
        hist_grad, _ = np.histogram(mag, bins=128, range=(0, 256))
        grad_vec = hist_grad.astype(np.float32)
        if np.sum(grad_vec) > 0:
            grad_vec = grad_vec / np.sum(grad_vec)

        # 3. Spatial Contour & Edge Bins (128-D)
        edges = cv2.Canny(gray, 50, 150)
        hist_edges, _ = np.histogram(edges, bins=128, range=(0, 256))
        edge_vec = hist_edges.astype(np.float32)
        if np.sum(edge_vec) > 0:
            edge_vec = edge_vec / np.sum(edge_vec)

        # Concatenate features -> 512 dimensions
        concat_vec = np.concatenate([hsv_vec, grad_vec, edge_vec]).astype(np.float32)

        # Zero-pad or crop to exactly 512 dimensions
        if concat_vec.shape[0] < self.EMBEDDING_DIM:
            pad_size = self.EMBEDDING_DIM - concat_vec.shape[0]
            concat_vec = np.pad(concat_vec, (0, pad_size), mode="constant")
        elif concat_vec.shape[0] > self.EMBEDDING_DIM:
            concat_vec = concat_vec[: self.EMBEDDING_DIM]

        # L2 Normalize
        norm = np.linalg.norm(concat_vec)
        if norm > 1e-6:
            concat_vec = concat_vec / norm

        return concat_vec

    def add_reference_image(
        self, medicine_id: int, brand_name: str, sample_id: str, image_bgr: np.ndarray
    ):
        """Extracts embedding and indexes reference sample."""
        emb = self.extract_visual_embedding(image_bgr)
        rec = VisualEmbeddingRecord(
            medicine_id=medicine_id,
            brand_name=brand_name,
            sample_id=sample_id,
            embedding=emb,
        )
        self.index.append(rec)

    def search_similar(
        self, query_image_bgr: np.ndarray, top_k: int = 5
    ) -> List[VisualSearchResult]:
        """
        Finds top-K visually similar reference samples using Cosine Similarity.
        """
        if not self.index:
            return []

        query_emb = self.extract_visual_embedding(query_image_bgr)
        results: List[VisualSearchResult] = []

        for rec in self.index:
            # Cosine similarity between two unit-normalized vectors is dot product
            sim = float(np.dot(query_emb, rec.embedding))
            # Clamp to [0, 1] range
            sim_clamped = max(0.0, min(1.0, sim))
            results.append(
                VisualSearchResult(
                    medicine_id=rec.medicine_id,
                    brand_name=rec.brand_name,
                    sample_id=rec.sample_id,
                    similarity_score=sim_clamped,
                )
            )

        # Sort descending by similarity score
        results.sort(key=lambda r: r.similarity_score, reverse=True)
        return results[:top_k]


default_visual_indexer = VisualFeatureIndexer()
