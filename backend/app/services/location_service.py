"""
SmartPharm Backend — Location Service.

Business logic for managing physical storage locations within a pharmacy:
shelves, racks, drawers, fridges, counters.
"""

from app.extensions import db
from app.models.location import Location, LocationType
from app.models.inventory import Inventory
from app.utils.errors import ValidationError, NotFoundError, ConflictError


def _parse_location_type(value) -> LocationType:
    """Safely parse location type string into LocationType enum."""
    if not value:
        raise ValidationError("location_type is required.")
    if isinstance(value, LocationType):
        return value
    val_str = str(value).strip().lower()
    for lt in LocationType:
        if lt.value == val_str:
            return lt
    valid_types = [lt.value for lt in LocationType]
    raise ValidationError(
        f"Invalid location_type '{value}'. Valid options: {', '.join(valid_types)}"
    )


def create_location(store_id: int, data: dict) -> Location:
    """Create a new physical storage location for a store."""
    if not data:
        raise ValidationError("Request data cannot be empty.")

    name = data.get("name", "").strip()
    if not name:
        raise ValidationError("Location name is required.")

    # Check for name conflict in the same store
    existing = Location.query.filter_by(store_id=store_id, name=name).first()
    if existing:
        raise ConflictError(f"A location named '{name}' already exists in this store.")

    loc_type = _parse_location_type(data.get("location_type"))

    location = Location(
        store_id=store_id,
        name=name,
        description=data.get("description", "").strip() or None,
        location_type=loc_type,
        is_active=True,
    )
    db.session.add(location)
    db.session.commit()
    return location


def get_location(store_id: int, location_id: int, include_inactive: bool = False) -> Location:
    """Retrieve a single location by ID within a store."""
    query = Location.query.filter_by(id=location_id, store_id=store_id)
    if not include_inactive:
        query = query.filter_by(is_active=True)

    loc = query.first()
    if not loc:
        raise NotFoundError(f"Location with ID {location_id} not found.")
    return loc


def list_locations(store_id: int, is_active: bool = True) -> list:
    """List storage locations for a store."""
    query = Location.query.filter_by(store_id=store_id)
    if is_active is not None:
        query = query.filter_by(is_active=is_active)
    return query.order_by(Location.name.asc()).all()


def update_location(store_id: int, location_id: int, data: dict) -> Location:
    """Update location attributes."""
    loc = get_location(store_id, location_id, include_inactive=True)

    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            raise ValidationError("Location name cannot be empty.")
        if new_name != loc.name:
            existing = Location.query.filter_by(store_id=store_id, name=new_name).first()
            if existing:
                raise ConflictError(f"A location named '{new_name}' already exists.")
            loc.name = new_name

    if "description" in data:
        loc.description = data["description"].strip() or None

    if "location_type" in data:
        loc.location_type = _parse_location_type(data["location_type"])

    if "is_active" in data:
        loc.is_active = bool(data["is_active"])

    db.session.commit()
    return loc


def delete_location(store_id: int, location_id: int) -> None:
    """Soft-delete a location after checking if active stock is assigned to it."""
    loc = get_location(store_id, location_id)

    # Check if any inventory with stock is currently at this location
    active_stock_count = (
        Inventory.query.filter_by(store_id=store_id, location_id=location_id)
        .filter(Inventory.quantity_available > 0)
        .count()
    )
    if active_stock_count > 0:
        raise ConflictError(
            f"Cannot deactivate location '{loc.name}' because it currently contains active stock. "
            "Move stock to another location first."
        )

    loc.is_active = False
    db.session.commit()


def serialize_location(location: Location, include_inventory: bool = False) -> dict:
    """Serialize Location model to dictionary."""
    data = {
        "id": location.id,
        "store_id": location.store_id,
        "name": location.name,
        "description": location.description,
        "location_type": location.location_type.value if location.location_type else None,
        "is_active": location.is_active,
        "created_at": location.created_at.isoformat() if location.created_at else None,
        "updated_at": location.updated_at.isoformat() if location.updated_at else None,
    }

    if include_inventory:
        inventory_items = (
            Inventory.query.filter_by(location_id=location.id)
            .filter(Inventory.quantity_available > 0)
            .all()
        )
        data["inventory_items"] = [
            {
                "inventory_id": inv.id,
                "batch_id": inv.batch_id,
                "batch_number": inv.batch.batch_number if inv.batch else None,
                "medicine_id": inv.batch.medicine_id if inv.batch else None,
                "medicine_name": inv.batch.medicine.brand_name if inv.batch and inv.batch.medicine else None,
                "expiry_date": inv.batch.expiry_date.isoformat() if inv.batch and inv.batch.expiry_date else None,
                "quantity_available": inv.quantity_available,
                "quantity_reserved": inv.quantity_reserved,
            }
            for inv in inventory_items
        ]
        data["total_stock_count"] = sum(inv.quantity_available for inv in inventory_items)

    return data
