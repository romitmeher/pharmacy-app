"""
SmartPharm - Distributor Invoice Catalog Matcher
Matches parsed distributor invoice lines to store Medicine catalog and Supplier registry.

Strict compliance with SmartPharm PRD:
- Rule 11: Creates purchase draft, strictly does NOT mutate inventory.
- Flags uncataloged medicines as is_new_medicine for pharmacist review.
- Multi-store isolation enforced via store_id.
"""

from dataclasses import dataclass, field
import difflib
import logging
import re
from typing import Any, Dict, List, Optional
from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from app.models.medicine import Medicine, MedicineAlias
from app.models.supplier import Supplier
from app.distributor.invoice_parser import ParsedInvoice, ParsedInvoiceItem

logger = logging.getLogger(__name__)


@dataclass
class MatchedInvoiceItem:
    """An invoice line item linked to the store's database catalog."""
    line_number: int
    raw_item_name: str
    medicine_id: Optional[int]
    matched_medicine_name: Optional[str]
    is_new_medicine: bool
    match_confidence: float
    packing: Optional[str]
    batch_number: str
    expiry_date: Optional[str]
    quantity: int
    free_quantity: int
    purchase_rate: float
    mrp: float
    discount_percentage: float
    gst_percentage: float
    total_amount: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "line_number": self.line_number,
            "raw_item_name": self.raw_item_name,
            "medicine_id": self.medicine_id,
            "matched_medicine_name": self.matched_medicine_name,
            "is_new_medicine": self.is_new_medicine,
            "match_confidence": round(self.match_confidence, 2),
            "packing": self.packing,
            "batch_number": self.batch_number,
            "expiry_date": self.expiry_date,
            "quantity": self.quantity,
            "free_quantity": self.free_quantity,
            "purchase_rate": self.purchase_rate,
            "mrp": self.mrp,
            "discount_percentage": self.discount_percentage,
            "gst_percentage": self.gst_percentage,
            "total_amount": self.total_amount,
        }


@dataclass
class MatchedInvoiceDraft:
    """Pre-draft verification payload for the pharmacist review interface."""
    store_id: int
    distributor_name: str
    supplier_id: Optional[int]
    is_new_supplier: bool
    invoice_number: str
    invoice_date: str
    subtotal: float
    discount_amount: float
    tax_amount: float
    total_amount: float
    items: List[MatchedInvoiceItem] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "store_id": self.store_id,
            "distributor_name": self.distributor_name,
            "supplier_id": self.supplier_id,
            "is_new_supplier": self.is_new_supplier,
            "invoice_number": self.invoice_number,
            "invoice_date": self.invoice_date,
            "subtotal": round(self.subtotal, 2),
            "discount_amount": round(self.discount_amount, 2),
            "tax_amount": round(self.tax_amount, 2),
            "total_amount": round(self.total_amount, 2),
            "items_count": len(self.items),
            "items": [item.to_dict() for item in self.items],
        }


def _string_similarity(s1: str, s2: str) -> float:
    if not s1 or not s2:
        return 0.0
    return difflib.SequenceMatcher(None, s1.strip().lower(), s2.strip().lower()).ratio()


class InvoiceCatalogMatcher:
    """Cross-references ParsedInvoice against Store Medicines and Suppliers."""

    MATCH_THRESHOLD = 0.65

    def match(self, parsed: ParsedInvoice, store_id: int) -> MatchedInvoiceDraft:
        # 1. Supplier Matching
        supplier = None
        if parsed.distributor_gstin:
            supplier = Supplier.query.filter_by(store_id=store_id, gstin=parsed.distributor_gstin).first()

        if not supplier and parsed.distributor_name:
            # Fuzzy match supplier name
            suppliers = Supplier.query.filter_by(store_id=store_id, is_active=True).all()
            best_sim = 0.0
            best_sup = None
            for s in suppliers:
                sim = _string_similarity(parsed.distributor_name, s.name)
                if sim > best_sim and sim >= self.MATCH_THRESHOLD:
                    best_sim = sim
                    best_sup = s
            supplier = best_sup

        # 2. Line Items Matching
        matched_items: List[MatchedInvoiceItem] = []

        subtotal = 0.0
        tax_amount = 0.0

        for item in parsed.items:
            best_med = None
            best_conf = 0.0

            # Bound fuzzy matching to plausible names. Never load the entire
            # catalog or issue one lazy alias query per medicine.
            ignored = {"tablet", "tablets", "tab", "tabs", "capsule", "capsules", "cap", "caps",
                       "syrup", "injection", "powder", "cream", "ointment", "coated"}
            tokens = list(dict.fromkeys(t for t in re.findall(r"[a-z0-9]{3,}", item.cleaned_medicine_name.lower())
                                        if t not in ignored and not t.isdigit()))[:4]
            candidates = []
            if tokens:
                conditions = []
                for token in tokens:
                    conditions.extend([Medicine.brand_name.ilike(f"%{token}%"),
                        Medicine.aliases.any(or_(MedicineAlias.alias_type.is_(None), MedicineAlias.alias_type != "barcode") & MedicineAlias.alias_name.ilike(f"%{token}%"))])
                candidates = (Medicine.query.filter_by(store_id=store_id, is_active=True)
                    .filter(or_(*conditions)).options(selectinload(Medicine.aliases))
                    .order_by(Medicine.id).limit(100).all())
            # Direct and alias matching
            for med in candidates:
                sim = _string_similarity(item.cleaned_medicine_name, med.brand_name)
                # Check aliases if present
                alias_sims = [_string_similarity(item.cleaned_medicine_name, a.alias_name) for a in med.aliases if a.alias_type != "barcode"] or [0.0]
                top_sim = max(sim, max(alias_sims, default=0.0))

                if top_sim > best_conf:
                    best_conf = top_sim
                    best_med = med

            is_new = best_med is None or best_conf < self.MATCH_THRESHOLD
            med_id = best_med.id if not is_new and best_med else None
            med_name = best_med.brand_name if not is_new and best_med else None

            rate = item.purchase_rate or 0.0
            qty = item.quantity
            line_tot = item.total_amount if item.total_amount is not None else round(rate * qty, 2)
            gst_pct = item.gst_percentage if item.gst_percentage is not None else 0.0
            line_tax = round(line_tot * (gst_pct / 100.0), 2)

            subtotal += line_tot
            tax_amount += line_tax

            matched_items.append(
                MatchedInvoiceItem(
                    line_number=item.line_number,
                    raw_item_name=item.raw_item_name,
                    medicine_id=med_id,
                    matched_medicine_name=med_name,
                    is_new_medicine=is_new,
                    match_confidence=best_conf,
                    packing=item.packing,
                    batch_number=item.batch_number or "BATCH-UNKNOWN",
                    expiry_date=item.expiry_date.isoformat() if item.expiry_date else None,
                    quantity=qty,
                    free_quantity=item.free_quantity,
                    purchase_rate=rate,
                    mrp=item.mrp,
                    discount_percentage=item.discount_percentage,
                    gst_percentage=gst_pct,
                    total_amount=line_tot,
                )
            )

        total = subtotal + tax_amount

        return MatchedInvoiceDraft(
            store_id=store_id,
            distributor_name=parsed.distributor_name or "Unknown Distributor",
            supplier_id=supplier.id if supplier else None,
            is_new_supplier=supplier is None,
            invoice_number=parsed.invoice_number or "DRAFT-INV",
            invoice_date=parsed.invoice_date.isoformat() if parsed.invoice_date else "",
            subtotal=subtotal,
            discount_amount=0.0,
            tax_amount=tax_amount,
            total_amount=parsed.total_amount if parsed.total_amount else total,
            items=matched_items,
        )


default_catalog_matcher = InvoiceCatalogMatcher()
