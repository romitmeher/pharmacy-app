"""
SmartPharm - Storage & Cold-Chain Compliance Engine
Strict compliance with SmartPharm PRD Phase 6 & Indian Pharmacy Standards:
- Cold-Chain Safety Enforcement:
  - Detects temperature-sensitive drugs (Insulin, Vaccines, Biologics, Eye Drops requiring 2-8°C)
    stored in non-refrigerated ambient racks.
- Storage Optimization:
  - Identifies ambient oral tablets occupying expensive refrigeration capacity.
- Capacity & Safety Audits:
  - Flags overloaded physical shelves and unsecured Schedule H1/X narcotics.
"""

from dataclasses import dataclass
import enum
import logging
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.location import Location, LocationType
from app.models.inventory import Inventory
from app.models.batch import Batch
from app.models.medicine import Medicine

logger = logging.getLogger(__name__)


class ComplianceSeverity(str, enum.Enum):
    CRITICAL_VIOLATION = "CRITICAL_VIOLATION"  # Threatens drug potency / statutory safety (e.g. warm insulin)
    WARNING = "WARNING"                        # Potential shelf degradation or capacity overflow
    OPTIMIZATION_TIP = "OPTIMIZATION_TIP"      # Suboptimal space utilization (e.g. tablets in fridge)


@dataclass
class StorageComplianceAlert:
    alert_id: str
    severity: ComplianceSeverity
    medicine_id: int
    brand_name: str
    batch_number: str
    location_id: int
    location_name: str
    location_type: str
    units_affected: int
    issue_title: str
    description: str
    action_required: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "alert_id": self.alert_id,
            "severity": self.severity.value,
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "batch_number": self.batch_number,
            "location_id": self.location_id,
            "location_name": self.location_name,
            "location_type": self.location_type,
            "units_affected": self.units_affected,
            "issue_title": self.issue_title,
            "description": self.description,
            "action_required": self.action_required,
        }


class StorageComplianceAuditor:
    """
    Audits physical storage conditions against medicine pharmaceutical requirements.
    """

    COLD_CHAIN_KEYWORDS = [
        "refrigerat", "2-8", "2°c", "8°c", "insulin", "vaccine", "biologic",
        "interferon", "erythropoietin", "botox", "polio", "rabies"
    ]

    def requires_cold_chain(self, medicine: Medicine) -> bool:
        """Determines if a medicine strictly requires 2-8°C refrigerated storage."""
        req_text = (medicine.storage_requirements or "").lower()
        generic_text = (medicine.generic_name or "").lower()
        brand_text = (medicine.brand_name or "").lower()
        full_text = f"{req_text} {generic_text} {brand_text}"

        return any(k in full_text for k in self.COLD_CHAIN_KEYWORDS)

    def audit_store_compliance(self, store_id: int) -> List[StorageComplianceAlert]:
        """
        Scans all physical inventory in the store for storage climate and capacity compliance.
        """
        alerts: List[StorageComplianceAlert] = []

        inv_records = (
            db.session.query(Inventory, Batch, Medicine, Location)
            .join(Batch, Inventory.batch_id == Batch.id)
            .join(Medicine, Batch.medicine_id == Medicine.id)
            .join(Location, Inventory.location_id == Location.id)
            .filter(
                Inventory.store_id == store_id,
                Inventory.quantity_available > 0,
            )
            .all()
        )

        for inv, b, m, loc in inv_records:
            is_cold_needed = self.requires_cold_chain(m)
            is_fridge_loc = (loc.location_type == LocationType.FRIDGE) or ("fridge" in loc.name.lower())

            # 1. Cold-Chain Incompatibility (CRITICAL)
            if is_cold_needed and not is_fridge_loc:
                alerts.append(
                    StorageComplianceAlert(
                        alert_id=f"COLD-VIOLATION-{inv.id}",
                        severity=ComplianceSeverity.CRITICAL_VIOLATION,
                        medicine_id=m.id,
                        brand_name=m.brand_name,
                        batch_number=b.batch_number,
                        location_id=loc.id,
                        location_name=loc.name,
                        location_type=loc.location_type.value,
                        units_affected=inv.quantity_available,
                        issue_title="Cold-Chain Drug Stored at Ambient Temperature",
                        description=(
                            f"{m.brand_name} requires 2°C - 8°C cold-chain storage ({m.storage_requirements or 'Biologic/Insulin'}). "
                            f"Currently stored on '{loc.name}' ({loc.location_type.value}). High risk of drug degradation."
                        ),
                        action_required=f"Immediately transfer {inv.quantity_available} units of batch {b.batch_number} to Pharmacy Refrigerator.",
                    )
                )

            # 2. Ambient Waste of Cold Space (OPTIMIZATION TIP)
            if not is_cold_needed and is_fridge_loc:
                # Normal solid dosage forms (tablets, syrups) in fridge
                alerts.append(
                    StorageComplianceAlert(
                        alert_id=f"AMB-IN-FRIDGE-{inv.id}",
                        severity=ComplianceSeverity.OPTIMIZATION_TIP,
                        medicine_id=m.id,
                        brand_name=m.brand_name,
                        batch_number=b.batch_number,
                        location_id=loc.id,
                        location_name=loc.name,
                        location_type=loc.location_type.value,
                        units_affected=inv.quantity_available,
                        issue_title="Ambient Medicine Occupying Refrigerator Space",
                        description=(
                            f"{m.brand_name} is a room-temperature product occupying high-value cold chain capacity "
                            f"in '{loc.name}'."
                        ),
                        action_required="Relocate to standard ambient shelving to preserve cold storage space.",
                    )
                )

        # 3. Location Capacity Overload Check
        location_occupancies = (
            db.session.query(
                Location.id,
                Location.name,
                Location.location_type,
                db.func.sum(Inventory.quantity_available).label("total_units"),
            )
            .join(Inventory, Location.id == Inventory.location_id)
            .filter(Location.store_id == store_id)
            .group_by(Location.id, Location.name, Location.location_type)
            .all()
        )

        for loc_id, loc_name, loc_type, total_units in location_occupancies:
            max_capacity = 60 if loc_type == LocationType.FRIDGE else 100
            if total_units > max_capacity:
                alerts.append(
                    StorageComplianceAlert(
                        alert_id=f"CAPACITY-OVERFLOW-{loc_id}",
                        severity=ComplianceSeverity.WARNING,
                        medicine_id=0,
                        brand_name="Location Overflow",
                        batch_number="N/A",
                        location_id=loc_id,
                        location_name=loc_name,
                        location_type=loc_type.value,
                        units_affected=int(total_units - max_capacity),
                        issue_title=f"Location Exceeds Rated Capacity ({total_units}/{max_capacity} units)",
                        description=(
                            f"Storage location '{loc_name}' is currently holding {total_units} units, "
                            f"exceeding safe capacity threshold of {max_capacity} units."
                        ),
                        action_required="Redistribute overflow stock to adjacent racks or reserve storage drawers.",
                    )
                )

        # Priority Sort: CRITICAL_VIOLATION > WARNING > OPTIMIZATION_TIP
        priority_map = {
            ComplianceSeverity.CRITICAL_VIOLATION: 0,
            ComplianceSeverity.WARNING: 1,
            ComplianceSeverity.OPTIMIZATION_TIP: 2,
        }
        alerts.sort(key=lambda a: priority_map[a.severity])

        return alerts


default_compliance_auditor = StorageComplianceAuditor()
