"""
SmartPharm - Shelf & Location Planogram Engine
Strict compliance with SmartPharm PRD Phase 6:
- Models physical Indian pharmacy storage architecture:
  - Zones: AMBIENT, COLD_CHAIN_FRIDGE, SECURE_DRAWER
  - Hierarchical coordinates: Aisle -> Rack -> Shelf Level (Tier) -> Bin / Slot
- Aggregates physical inventory into a structured 2D planogram map.
- Fast Dispense Locator:
  - Generates visual picking coordinates (e.g., "Aisle A, Rack 1, Level 3, Bin 2")
  - Supplies directional guidance for counter pharmacists to minimize dispensing turnaround time.
"""

from dataclasses import dataclass, field
import datetime
import enum
import logging
import math
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.location import Location, LocationType
from app.models.inventory import Inventory
from app.models.batch import Batch
from app.models.medicine import Medicine

logger = logging.getLogger(__name__)


class StorageClimateZone(str, enum.Enum):
    AMBIENT = "AMBIENT"                    # Standard room-temperature shelving (15°C - 25°C)
    COLD_CHAIN_FRIDGE = "COLD_CHAIN_FRIDGE"# Refrigerated storage (2°C - 8°C for insulin, vaccines, biologics)
    SECURE_DRAWER = "SECURE_DRAWER"        # Locked storage for Schedule H1 / X narcotics
    COUNTER_DISPENSE = "COUNTER_DISPENSE"  # Fast-mover drawer directly beneath checkout counter


@dataclass
class ShelfStoredItem:
    inventory_id: int
    batch_id: int
    medicine_id: int
    brand_name: str
    strength: Optional[str]
    dosage_form: Optional[str]
    batch_number: str
    expiry_date: str
    quantity_available: int
    days_to_expiry: int
    is_expired: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "inventory_id": self.inventory_id,
            "batch_id": self.batch_id,
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "strength": self.strength,
            "dosage_form": self.dosage_form,
            "batch_number": self.batch_number,
            "expiry_date": self.expiry_date,
            "quantity_available": self.quantity_available,
            "days_to_expiry": self.days_to_expiry,
            "is_expired": self.is_expired,
        }


@dataclass
class ShelfLocationDetail:
    location_id: int
    name: str
    description: Optional[str]
    location_type: str
    climate_zone: StorageClimateZone
    aisle: str
    rack_number: str
    shelf_level: int
    bin_code: str
    coordinate_code: str  # e.g., "AISLE-A-R1-L3-B1"
    capacity_units: int
    current_occupied_units: int
    utilization_pct: float
    items: List[ShelfStoredItem] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "location_id": self.location_id,
            "name": self.name,
            "description": self.description,
            "location_type": self.location_type,
            "climate_zone": self.climate_zone.value,
            "aisle": self.aisle,
            "rack_number": self.rack_number,
            "shelf_level": self.shelf_level,
            "bin_code": self.bin_code,
            "coordinate_code": self.coordinate_code,
            "capacity_units": self.capacity_units,
            "current_occupied_units": self.current_occupied_units,
            "utilization_pct": round(self.utilization_pct, 1),
            "items_count": len(self.items),
            "items": [item.to_dict() for item in self.items],
        }


@dataclass
class DispensePickLocation:
    medicine_id: int
    brand_name: str
    strength: Optional[str]
    location_id: int
    location_name: str
    location_type: str
    climate_zone: StorageClimateZone
    coordinate_code: str
    directional_guide: str
    batch_number: str
    expiry_date: str
    quantity_available: int
    is_fefo_priority: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "strength": self.strength,
            "location_id": self.location_id,
            "location_name": self.location_name,
            "location_type": self.location_type,
            "climate_zone": self.climate_zone.value,
            "coordinate_code": self.coordinate_code,
            "directional_guide": self.directional_guide,
            "batch_number": self.batch_number,
            "expiry_date": self.expiry_date,
            "quantity_available": self.quantity_available,
            "is_fefo_priority": self.is_fefo_priority,
        }


class ShelfPlanogramEngine:
    """
    Constructs visual planogram maps and calculates 2D picking coordinates
    for physical Indian pharmacies.
    """

    def resolve_climate_zone(self, location_type: LocationType, name: str) -> StorageClimateZone:
        """Deterministically determine storage climate from location characteristics."""
        if location_type == LocationType.FRIDGE or "fridge" in name.lower() or "cold" in name.lower():
            return StorageClimateZone.COLD_CHAIN_FRIDGE
        elif location_type == LocationType.DRAWER or "narcotic" in name.lower() or "secure" in name.lower():
            return StorageClimateZone.SECURE_DRAWER
        elif location_type == LocationType.COUNTER or "counter" in name.lower() or "fast" in name.lower():
            return StorageClimateZone.COUNTER_DISPENSE
        return StorageClimateZone.AMBIENT

    def derive_physical_coordinates(self, location_id: int, name: str, loc_type: LocationType) -> Dict[str, Any]:
        """
        Derives structured physical coordinates (Aisle, Rack, Shelf Level, Bin) from location data.
        Enables seamless planogram visualization without requiring manual coordinate entry.
        """
        # Parse conventional patterns like 'Shelf A-1', 'Rack 2-Level 3', 'Fridge-Top'
        name_clean = name.upper()
        aisle = "A"
        rack = "1"
        level = 1
        bin_idx = "1"

        if "FRIDGE" in name_clean:
            aisle = "Cold-Chain"
            rack = "FR-1"
            level = 2 if "TOP" in name_clean else (1 if "BOTTOM" in name_clean else 2)
            bin_idx = f"B{location_id}"
        elif "DRAWER" in name_clean or loc_type == LocationType.DRAWER:
            aisle = "Counter"
            rack = "DW-1"
            level = 1
            bin_idx = f"D{location_id}"
        elif "COUNTER" in name_clean or loc_type == LocationType.COUNTER:
            aisle = "Checkout"
            rack = "CNT-1"
            level = 1
            bin_idx = "C1"
        else:
            # Default shelf/rack layout parsing: e.g. "Shelf A-1" -> Aisle A, Rack 1, Level 1
            parts = name_clean.replace("SHELF", "").replace("RACK", "").strip().split("-")
            if len(parts) >= 2:
                aisle = parts[0].strip() or "A"
                rack = parts[1].strip() or "1"
            elif len(parts) == 1 and parts[0]:
                aisle = parts[0][:1]
                rack = parts[0][1:] or "1"
            level = (location_id % 4) + 1  # 4 tiers per rack (Level 1 ground to Level 4 top)
            bin_idx = f"Slot-{location_id}"

        coord_code = f"{aisle}-{rack}-L{level}-{bin_idx}"
        return {
            "aisle": aisle,
            "rack_number": rack,
            "shelf_level": level,
            "bin_code": bin_idx,
            "coordinate_code": coord_code,
        }

    def get_store_planogram(self, store_id: int) -> Dict[str, Any]:
        """
        Builds full physical storage planogram for the pharmacy store.
        """
        locations = (
            Location.query.filter_by(store_id=store_id, is_active=True)
            .order_by(Location.location_type.asc(), Location.name.asc())
            .all()
        )

        now_date = datetime.date.today()
        shelves_list: List[ShelfLocationDetail] = []
        total_store_capacity = 0
        total_store_occupied = 0

        for loc in locations:
            coords = self.derive_physical_coordinates(loc.id, loc.name, loc.location_type)
            climate = self.resolve_climate_zone(loc.location_type, loc.name)
            nominal_capacity = 100 if loc.location_type != LocationType.FRIDGE else 60

            # Query all inventory items at this physical location
            inv_records = (
                db.session.query(Inventory, Batch, Medicine)
                .join(Batch, Inventory.batch_id == Batch.id)
                .join(Medicine, Batch.medicine_id == Medicine.id)
                .filter(Inventory.location_id == loc.id, Inventory.quantity_available > 0)
                .order_by(Batch.expiry_date.asc())
                .all()
            )

            stored_items: List[ShelfStoredItem] = []
            occupied_units = 0

            for inv, b, m in inv_records:
                days_left = (b.expiry_date - now_date).days
                stored_items.append(
                    ShelfStoredItem(
                        inventory_id=inv.id,
                        batch_id=b.id,
                        medicine_id=m.id,
                        brand_name=m.brand_name,
                        strength=m.strength,
                        dosage_form=m.dosage_form.value if m.dosage_form else None,
                        batch_number=b.batch_number,
                        expiry_date=b.expiry_date.isoformat(),
                        quantity_available=inv.quantity_available,
                        days_to_expiry=days_left,
                        is_expired=days_left <= 0,
                    )
                )
                occupied_units += inv.quantity_available

            utilization = (occupied_units / nominal_capacity) * 100 if nominal_capacity > 0 else 0.0

            shelf_detail = ShelfLocationDetail(
                location_id=loc.id,
                name=loc.name,
                description=loc.description,
                location_type=loc.location_type.value,
                climate_zone=climate,
                aisle=coords["aisle"],
                rack_number=coords["rack_number"],
                shelf_level=coords["shelf_level"],
                bin_code=coords["bin_code"],
                coordinate_code=coords["coordinate_code"],
                capacity_units=nominal_capacity,
                current_occupied_units=occupied_units,
                utilization_pct=utilization,
                items=stored_items,
            )
            shelves_list.append(shelf_detail)
            total_store_capacity += nominal_capacity
            total_store_occupied += occupied_units

        store_utilization = (total_store_occupied / total_store_capacity * 100) if total_store_capacity > 0 else 0.0

        return {
            "store_id": store_id,
            "summary": {
                "total_locations": len(shelves_list),
                "total_capacity_units": total_store_capacity,
                "total_occupied_units": total_store_occupied,
                "store_utilization_pct": round(store_utilization, 1),
            },
            "shelves": [s.to_dict() for s in shelves_list],
        }

    def locate_medicine_for_dispensing(
        self, store_id: int, medicine_id: int
    ) -> List[DispensePickLocation]:
        """
        Fast Dispense Locator: returns exact physical coordinates and FEFO priority
        for picking a medicine during point-of-sale checkout.
        """
        now_date = datetime.date.today()
        inv_records = (
            db.session.query(Inventory, Batch, Medicine, Location)
            .join(Batch, Inventory.batch_id == Batch.id)
            .join(Medicine, Batch.medicine_id == Medicine.id)
            .join(Location, Inventory.location_id == Location.id)
            .filter(
                Medicine.id == medicine_id,
                Inventory.store_id == store_id,
                Inventory.quantity_available > 0,
                Batch.expiry_date >= now_date,
            )
            .order_by(Batch.expiry_date.asc())
            .all()
        )

        pick_locations: List[DispensePickLocation] = []
        for idx, (inv, b, m, loc) in enumerate(inv_records):
            coords = self.derive_physical_coordinates(loc.id, loc.name, loc.location_type)
            climate = self.resolve_climate_zone(loc.location_type, loc.name)

            # Generate natural English directional instruction
            if climate == StorageClimateZone.COLD_CHAIN_FRIDGE:
                directions = f"Open Refrigerator: Level {coords['shelf_level']} (Cold-Chain Section)"
            elif climate == StorageClimateZone.SECURE_DRAWER:
                directions = f"Check Secure Lock Drawer: {loc.name} (Key required)"
            else:
                directions = (
                    f"Aisle {coords['aisle']} -> Rack {coords['rack_number']} -> "
                    f"Shelf Tier {coords['shelf_level']} ({'Eye Level' if coords['shelf_level'] == 3 else 'Tier ' + str(coords['shelf_level'])})"
                )

            pick_locations.append(
                DispensePickLocation(
                    medicine_id=m.id,
                    brand_name=m.brand_name,
                    strength=m.strength,
                    location_id=loc.id,
                    location_name=loc.name,
                    location_type=loc.location_type.value,
                    climate_zone=climate,
                    coordinate_code=coords["coordinate_code"],
                    directional_guide=directions,
                    batch_number=b.batch_number,
                    expiry_date=b.expiry_date.isoformat(),
                    quantity_available=inv.quantity_available,
                    is_fefo_priority=(idx == 0),  # First in FEFO order is priority
                )
            )

        return pick_locations


default_planogram_engine = ShelfPlanogramEngine()
