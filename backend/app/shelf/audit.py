"""
SmartPharm - Physical Shelf Cycle Count & Variance Engine
Strict compliance with SmartPharm PRD Phase 6 & Rule 22:
- Supports shelf-by-shelf cycle counting to identify inventory shrinkage, misplacements, and surpluses.
- Detects 4 variance states:
  - MATCHED: Physical scan matches recorded database stock.
  - DEFICIT: Physical scan < Expected stock (potential shrinkage / unrecorded dispensing).
  - SURPLUS: Physical scan > Expected stock (unbooked intake / count anomaly).
  - UNEXPECTED_ON_SHELF: Item found physically on this shelf but recorded elsewhere.
- Human review boundary:
  - Auditing is strictly non-destructive by default.
  - Only updates transactional inventory when staff explicitly authorizes reconciliation.
  - All adjustments automatically log user ID, timestamp, and audit trail reason via AuditLog.
"""

from dataclasses import dataclass
import datetime
import enum
import logging
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.location import Location
from app.models.inventory import Inventory
from app.models.batch import Batch
from app.models.medicine import Medicine
from app.services import inventory_service
from app.services.audit_service import log_audit_event

logger = logging.getLogger(__name__)


class CycleCountVarianceState(str, enum.Enum):
    MATCHED = "MATCHED"
    DEFICIT = "DEFICIT"
    SURPLUS = "SURPLUS"
    UNEXPECTED_ON_SHELF = "UNEXPECTED_ON_SHELF"
    MISSING_FROM_SHELF = "MISSING_FROM_SHELF"


@dataclass
class ShelfCycleCountItemReport:
    medicine_id: int
    brand_name: str
    batch_number: str
    expected_units: int
    scanned_units: int
    variance_units: int
    variance_state: CycleCountVarianceState
    unit_cost: float
    financial_impact: float
    is_reconciled: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "batch_number": self.batch_number,
            "expected_units": self.expected_units,
            "scanned_units": self.scanned_units,
            "variance_units": self.variance_units,
            "variance_state": self.variance_state.value,
            "unit_cost": round(self.unit_cost, 2),
            "financial_impact": round(self.financial_impact, 2),
            "is_reconciled": self.is_reconciled,
        }


@dataclass
class ShelfAuditReport:
    location_id: int
    location_name: str
    audit_date: str
    audited_by_user_id: int
    total_items_audited: int
    matched_items_count: int
    discrepancies_count: int
    net_variance_units: int
    net_financial_variance: float
    is_committed: bool
    notes: Optional[str]
    items: List[ShelfCycleCountItemReport]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "location_id": self.location_id,
            "location_name": self.location_name,
            "audit_date": self.audit_date,
            "audited_by_user_id": self.audited_by_user_id,
            "total_items_audited": self.total_items_audited,
            "matched_items_count": self.matched_items_count,
            "discrepancies_count": self.discrepancies_count,
            "net_variance_units": self.net_variance_units,
            "net_financial_variance": round(self.net_financial_variance, 2),
            "is_committed": self.is_committed,
            "notes": self.notes,
            "items": [it.to_dict() for it in self.items],
        }


class ShelfCycleCountEngine:
    """
    Executes shelf-by-shelf cycle counts, compares expected vs physical stock,
    and supports authorized audit-logged reconciliation.
    """

    def conduct_shelf_audit(
        self,
        store_id: int,
        location_id: int,
        scanned_items: List[Dict[str, Any]],
        user_id: int,
        apply_adjustments: bool = False,
        notes: Optional[str] = None,
    ) -> ShelfAuditReport:
        location = Location.query.filter_by(id=location_id, store_id=store_id).first()
        loc_name = location.name if location else f"Location #{location_id}"

        # 1. Fetch expected inventory items currently recorded at this location
        expected_records = (
            db.session.query(Inventory, Batch, Medicine)
            .join(Batch, Inventory.batch_id == Batch.id)
            .join(Medicine, Batch.medicine_id == Medicine.id)
            .filter(
                Inventory.store_id == store_id,
                Inventory.location_id == location_id,
                Inventory.quantity_available > 0,
            )
            .all()
        )

        expected_map = {}
        for inv, b, m in expected_records:
            # Key by normalized batch number and medicine_id
            k = (m.id, b.batch_number.strip().upper())
            expected_map[k] = {
                "inventory": inv,
                "batch": b,
                "medicine": m,
                "expected_qty": inv.quantity_available,
            }

        # 2. Process scanned counts
        scanned_map = {}
        for it in scanned_items:
            med_id = int(it.get("medicine_id", 0))
            b_num = str(it.get("batch_number", "")).strip().upper()
            qty = int(it.get("scanned_quantity", 0))
            k = (med_id, b_num)
            scanned_map[k] = scanned_map.get(k, 0) + qty

        # 3. Compare Expected vs Actual
        item_reports: List[ShelfCycleCountItemReport] = []
        all_keys = set(expected_map.keys()) | set(scanned_map.keys())

        matched_count = 0
        discrepancy_count = 0
        net_variance = 0
        net_financial_variance = 0.0

        for med_id, b_num in sorted(all_keys, key=lambda x: (x[0], x[1])):
            scanned_qty = scanned_map.get((med_id, b_num), 0)

            if (med_id, b_num) in expected_map:
                info = expected_map[(med_id, b_num)]
                expected_qty = info["expected_qty"]
                m = info["medicine"]
                b = info["batch"]
                inv = info["inventory"]
                cost = float(b.purchase_price) if b.purchase_price else (float(m.selling_price or 10.0) * 0.7)

                diff = scanned_qty - expected_qty
                financial_diff = diff * cost
                net_variance += diff
                net_financial_variance += financial_diff

                if diff == 0:
                    state = CycleCountVarianceState.MATCHED
                    matched_count += 1
                elif scanned_qty == 0:
                    state = CycleCountVarianceState.MISSING_FROM_SHELF
                    discrepancy_count += 1
                elif diff < 0:
                    state = CycleCountVarianceState.DEFICIT
                    discrepancy_count += 1
                else:
                    state = CycleCountVarianceState.SURPLUS
                    discrepancy_count += 1

                reconciled = False
                if apply_adjustments and diff != 0:
                    # Update stock with audit trail
                    inventory_service.adjust_stock(
                        store_id=store_id,
                        inventory_id=inv.id,
                        new_quantity=scanned_qty,
                        reason=f"Shelf Cycle Count Audit: {notes or 'Physical shelf variance reconciliation'}",
                        user_id=user_id,
                    )
                    reconciled = True

                item_reports.append(
                    ShelfCycleCountItemReport(
                        medicine_id=m.id,
                        brand_name=m.brand_name,
                        batch_number=b.batch_number,
                        expected_units=expected_qty,
                        scanned_units=scanned_qty,
                        variance_units=diff,
                        variance_state=state,
                        unit_cost=cost,
                        financial_impact=financial_diff,
                        is_reconciled=reconciled,
                    )
                )

            else:
                # Unexpected item found on shelf
                m = Medicine.query.filter_by(id=med_id, store_id=store_id).first()
                b = Batch.query.filter_by(medicine_id=med_id, batch_number=b_num, store_id=store_id).first()
                brand = m.brand_name if m else f"Medicine #{med_id}"
                cost = float(b.purchase_price) if (b and b.purchase_price) else 20.0

                diff = scanned_qty
                financial_diff = diff * cost
                net_variance += diff
                net_financial_variance += financial_diff
                discrepancy_count += 1

                item_reports.append(
                    ShelfCycleCountItemReport(
                        medicine_id=med_id,
                        brand_name=brand,
                        batch_number=b_num,
                        expected_units=0,
                        scanned_units=scanned_qty,
                        variance_units=diff,
                        variance_state=CycleCountVarianceState.UNEXPECTED_ON_SHELF,
                        unit_cost=cost,
                        financial_impact=financial_diff,
                        is_reconciled=False,  # Needs location reassignment
                    )
                )

        today_str = datetime.date.today().isoformat()

        if apply_adjustments:
            log_audit_event(
                store_id=store_id,
                entity_type="shelf",
                entity_id=location_id,
                action="CYCLE_COUNT_RECONCILE",
                reason=f"Shelf audit reconciliation for location {loc_name}. Discrepancies: {discrepancy_count}, Net variance: {net_variance} units",
                old_values={"location_name": loc_name, "discrepancies_count": discrepancy_count},
                new_values={"net_variance_units": net_variance, "net_financial_variance": net_financial_variance},
                user_id=user_id,
            )

        return ShelfAuditReport(
            location_id=location_id,
            location_name=loc_name,
            audit_date=today_str,
            audited_by_user_id=user_id,
            total_items_audited=len(item_reports),
            matched_items_count=matched_count,
            discrepancies_count=discrepancy_count,
            net_variance_units=net_variance,
            net_financial_variance=net_financial_variance,
            is_committed=apply_adjustments,
            notes=notes,
            items=item_reports,
        )


default_shelf_audit_engine = ShelfCycleCountEngine()
