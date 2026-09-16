"""
SmartPharm AI & RAG Subsystem
Implements:
- PRD Rule 19: Grounded RAG Copilot grounded strictly in MySQL data.
- PRD Rule 20: Alternative medicine decision support for pharmacist review.
- PRD Rule 21: Doctor prescription scanning & live availability matching.
"""

from app.ai.rag_engine import default_rag_engine, CopilotIntent, CopilotResponse, GroundedFact
from app.ai.alternatives import (
    default_alternative_matcher,
    AlternativeCandidate,
    AlternativeMedicineResponse,
    MANDATORY_SAFETY_DISCLAIMER,
)
from app.ai.prescription_parser import (
    default_prescription_scanner,
    PrescriptionExtractionResult,
    PrescribedMedicineItem,
)

__all__ = [
    "default_rag_engine",
    "CopilotIntent",
    "CopilotResponse",
    "GroundedFact",
    "default_alternative_matcher",
    "AlternativeCandidate",
    "AlternativeMedicineResponse",
    "MANDATORY_SAFETY_DISCLAIMER",
    "default_prescription_scanner",
    "PrescriptionExtractionResult",
    "PrescribedMedicineItem",
]
