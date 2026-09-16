"""
SmartPharm - Physical Delivery Verification Engine
Implements PRD Rule 12: Comparison AI comparing Expected Items (from Distributor Invoice)
against Actual Items (scanned via camera at physical stock receiving).

Detects:
- Correct items (MATCHED)
- Quantity mismatch (short shipments or over-deliveries)
- Missing items (invoiced but absent from carton)
- Extra items (in carton but not on invoice)
- Batch number mismatch
- Expiry date mismatch
- Packaging MRP discrepancy
"""

from dataclasses import dataclass, field
import datetime
import enum
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class DiscrepancyType(str, enum.Enum):
    MATCHED = "MATCHED"
    QUANTITY_MISMATCH = "QUANTITY_MISMATCH"
    MISSING_ITEM = "MISSING_ITEM"
    EXTRA_ITEM = "EXTRA_ITEM"
    BATCH_MISMATCH = "BATCH_MISMATCH"
    EXPIRY_MISMATCH = "EXPIRY_MISMATCH"
    PRICING_DISCREPANCY = "PRICING_DISCREPANCY"


@dataclass
class ExpectedItem:
    """An item expected based on the distributor invoice."""
    item_id: Optional[int]
    medicine_name: str
    batch_number: str
    expiry_date: Optional[str]
    expected_quantity: int
    purchase_rate: float
    mrp: float


@dataclass
class ActualScannedItem:
    """An item physically received and scanned via packaging vision camera."""
    medicine_name: str
    batch_number: str
    expiry_date: Optional[str]
    actual_quantity: int
    mrp: Optional[float] = None
    medicine_id: Optional[int] = None


@dataclass
class DeliveryLineDiscrepancy:
    """Itemized comparison between expected and actual delivery."""
    medicine_name: str
    status: DiscrepancyType
    expected_quantity: int
    actual_quantity: int
    quantity_difference: int  # actual - expected
    expected_batch: str
    actual_batch: str
    expected_expiry: Optional[str]
    actual_expiry: Optional[str]
    expected_mrp: float
    actual_mrp: Optional[float]
    financial_difference: float
    notes: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_name": self.medicine_name,
            "status": self.status.value,
            "expected_quantity": self.expected_quantity,
            "actual_quantity": self.actual_quantity,
            "quantity_difference": self.quantity_difference,
            "expected_batch": self.expected_batch,
            "actual_batch": self.actual_batch,
            "expected_expiry": self.expected_expiry,
            "actual_expiry": self.actual_expiry,
            "expected_mrp": self.expected_mrp,
            "actual_mrp": self.actual_mrp,
            "financial_difference": round(self.financial_difference, 2),
            "notes": self.notes,
        }


@dataclass
class DeliveryDiscrepancyReport:
    """Comprehensive delivery verification audit report."""
    total_expected_items: int
    total_actual_items: int
    matched_items_count: int
    discrepancy_count: int
    total_expected_units: int
    total_actual_units: int
    total_financial_discrepancy: float
    has_discrepancies: bool
    status: str  # "MATCHED", "PARTIAL_ACCEPTED", "DISCREPANCIES_DETECTED"
    lines: List[DeliveryLineDiscrepancy] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_expected_items": self.total_expected_items,
            "total_actual_items": self.total_actual_items,
            "matched_items_count": self.matched_items_count,
            "discrepancy_count": self.discrepancy_count,
            "total_expected_units": self.total_expected_units,
            "total_actual_units": self.total_actual_units,
            "total_financial_discrepancy": round(self.total_financial_discrepancy, 2),
            "has_discrepancies": self.has_discrepancies,
            "status": self.status,
            "lines": [line.to_dict() for line in self.lines],
        }


class DeliveryVerifier:
    """
    Evaluates Expected items vs. Actual physical camera scans
    and generates an actionable discrepancy audit report.
    """

    def verify(
        self,
        expected_items: List[ExpectedItem],
        actual_items: List[ActualScannedItem],
    ) -> DeliveryDiscrepancyReport:
        lines: List[DeliveryLineDiscrepancy] = []

        # Index actual scans by normalized name
        actual_pool = {item.medicine_name.strip().lower(): item for item in actual_items}
        matched_actual_names = set()

        total_financial_diff = 0.0
        discrepancy_count = 0
        matched_count = 0

        # Check each expected item from the invoice
        for exp in expected_items:
            exp_key = exp.medicine_name.strip().lower()
            actual = actual_pool.get(exp_key)

            if actual is None:
                # 1. MISSING ITEM
                fin_diff = -(exp.expected_quantity * exp.purchase_rate)
                total_financial_diff += fin_diff
                discrepancy_count += 1
                lines.append(
                    DeliveryLineDiscrepancy(
                        medicine_name=exp.medicine_name,
                        status=DiscrepancyType.MISSING_ITEM,
                        expected_quantity=exp.expected_quantity,
                        actual_quantity=0,
                        quantity_difference=-exp.expected_quantity,
                        expected_batch=exp.batch_number,
                        actual_batch="NONE",
                        expected_expiry=exp.expiry_date,
                        actual_expiry=None,
                        expected_mrp=exp.mrp,
                        actual_mrp=None,
                        financial_difference=fin_diff,
                        notes="Item invoiced but entirely missing from physical delivery carton.",
                    )
                )
                continue

            matched_actual_names.add(exp_key)

            # Check individual attribute matches
            qty_diff = actual.actual_quantity - exp.expected_quantity
            batch_mismatch = (
                exp.batch_number
                and actual.batch_number
                and exp.batch_number.upper().strip() != actual.batch_number.upper().strip()
            )
            expiry_mismatch = (
                exp.expiry_date
                and actual.expiry_date
                and exp.expiry_date != actual.expiry_date
            )
            mrp_diff = (
                actual.mrp is not None
                and exp.mrp is not None
                and abs(actual.mrp - exp.mrp) > 0.50
            )

            # Determine primary discrepancy type
            status = DiscrepancyType.MATCHED
            notes = "Physical delivery matches invoice parameters."

            if qty_diff != 0:
                status = DiscrepancyType.QUANTITY_MISMATCH
                if qty_diff < 0:
                    notes = f"Short shipment: expected {exp.expected_quantity}, received {actual.actual_quantity}."
                else:
                    notes = f"Over delivery: expected {exp.expected_quantity}, received {actual.actual_quantity}."
            elif batch_mismatch:
                status = DiscrepancyType.BATCH_MISMATCH
                notes = f"Batch mismatch: invoice states {exp.batch_number}, received packaging shows {actual.batch_number}."
            elif expiry_mismatch:
                status = DiscrepancyType.EXPIRY_MISMATCH
                notes = f"Expiry mismatch: invoice states {exp.expiry_date}, received packaging shows {actual.expiry_date}."
            elif mrp_diff:
                status = DiscrepancyType.PRICING_DISCREPANCY
                notes = f"MRP printed on packaging (₹{actual.mrp}) differs from invoice (₹{exp.mrp})."

            fin_diff = qty_diff * exp.purchase_rate
            total_financial_diff += fin_diff

            if status != DiscrepancyType.MATCHED:
                discrepancy_count += 1
            else:
                matched_count += 1

            lines.append(
                DeliveryLineDiscrepancy(
                    medicine_name=exp.medicine_name,
                    status=status,
                    expected_quantity=exp.expected_quantity,
                    actual_quantity=actual.actual_quantity,
                    quantity_difference=qty_diff,
                    expected_batch=exp.batch_number,
                    actual_batch=actual.batch_number,
                    expected_expiry=exp.expiry_date,
                    actual_expiry=actual.expiry_date,
                    expected_mrp=exp.mrp,
                    actual_mrp=actual.mrp,
                    financial_difference=fin_diff,
                    notes=notes,
                )
            )

        # Check for EXTRA items in carton not on invoice
        for act in actual_items:
            act_key = act.medicine_name.strip().lower()
            if act_key not in matched_actual_names:
                discrepancy_count += 1
                lines.append(
                    DeliveryLineDiscrepancy(
                        medicine_name=act.medicine_name,
                        status=DiscrepancyType.EXTRA_ITEM,
                        expected_quantity=0,
                        actual_quantity=act.actual_quantity,
                        quantity_difference=act.actual_quantity,
                        expected_batch="NONE",
                        actual_batch=act.batch_number,
                        expected_expiry=None,
                        actual_expiry=act.expiry_date,
                        expected_mrp=0.0,
                        actual_mrp=act.mrp,
                        financial_difference=0.0,
                        notes="Medicine received in delivery carton but not listed on distributor invoice.",
                    )
                )

        has_discrepancies = discrepancy_count > 0
        overall_status = "MATCHED" if not has_discrepancies else "DISCREPANCIES_DETECTED"

        return DeliveryDiscrepancyReport(
            total_expected_items=len(expected_items),
            total_actual_items=len(actual_items),
            matched_items_count=matched_count,
            discrepancy_count=discrepancy_count,
            total_expected_units=sum(e.expected_quantity for e in expected_items),
            total_actual_units=sum(a.actual_quantity for a in actual_items),
            total_financial_discrepancy=total_financial_diff,
            has_discrepancies=has_discrepancies,
            status=overall_status,
            lines=lines,
        )


default_delivery_verifier = DeliveryVerifier()
