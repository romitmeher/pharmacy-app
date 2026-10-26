"""
SmartPharm Backend — Medicine Service.

Business logic for medicines, active ingredients, aliases, and visual features.
Maintains the core PRD boundary: Medicine represents permanent identity,
independent from batches and physical inventory.
"""

from decimal import Decimal
from sqlalchemy import or_, func, select

from app.extensions import db
from app.models.medicine import (
    Medicine,
    Ingredient,
    MedicineAlias,
    MedicineVisualFeature,
    DosageForm,
)
from app.utils.errors import ValidationError, NotFoundError
from app.models.store import Store


def _identity_key(brand, strength, manufacturer, dosage_form, route):
    def text(value):
        return " ".join((value or "").split()).casefold()
    form = dosage_form.value if isinstance(dosage_form, DosageForm) else dosage_form
    return (text(brand), "".join(text(strength).split()), text(manufacturer), text(form), text(route))


def _reject_duplicate(store_id, brand, strength, manufacturer, dosage_form, route, exclude_id=None):
    # Serialize API identity changes per store on databases with row locks.
    db.session.execute(select(Store.id).where(Store.id == store_id).with_for_update()).scalar_one()
    key = _identity_key(brand, strength, manufacturer, dosage_form, route)
    candidates = Medicine.query.filter_by(store_id=store_id, is_active=True)
    if exclude_id is not None:
        candidates = candidates.filter(Medicine.id != exclude_id)
    for other in candidates:
        if _identity_key(other.brand_name, other.strength, other.manufacturer, other.dosage_form, other.route) == key:
            raise ValidationError(f"This medicine already exists (ID {other.id}). Edit the existing medicine or add a new batch instead.")


def _parse_dosage_form(value):
    """Safely parse a string into DosageForm enum."""
    if value is None or value == "":
        return None
    if isinstance(value, DosageForm):
        return value
    val_str = str(value).strip().lower()
    for form in DosageForm:
        if form.value == val_str:
            return form
    valid_forms = [f.value for f in DosageForm]
    raise ValidationError(
        f"Invalid dosage_form '{value}'. Valid options: {', '.join(valid_forms)}"
    )


def _parse_decimal(value, field_name, min_val=0):
    """Safely parse a decimal/float field."""
    if value is None or value == "":
        return None
    try:
        val = Decimal(str(value))
        if val < min_val:
            raise ValidationError(f"{field_name} must be >= {min_val}.")
        return val
    except (ValueError, ArithmeticError):
        raise ValidationError(f"Invalid numeric value for {field_name}.")


def create_medicine(store_id: int, data: dict, commit=True) -> Medicine:
    """Create a new medicine with optional nested ingredients, aliases, and visual features.

    Args:
        store_id: The ID of the store creating the medicine.
        data: Dict containing medicine attributes.

    Returns:
        The newly created Medicine instance.
    """
    if not data:
        raise ValidationError("Request data cannot be empty.")
    if any((a.get("alias_type") or "").strip().lower() == "barcode" for a in (data.get("aliases") or [])):
        raise ValidationError("Link barcodes using the medicine barcode endpoint.")

    brand_name = data.get("brand_name", "").strip()
    if not brand_name:
        raise ValidationError("brand_name is required.")

    dosage_form = _parse_dosage_form(data.get("dosage_form"))
    _reject_duplicate(store_id, brand_name, data.get("strength"), data.get("manufacturer"), dosage_form, data.get("route"))
    mrp = _parse_decimal(data.get("mrp"), "mrp")
    selling_price = _parse_decimal(data.get("selling_price"), "selling_price")
    gst_percentage = _parse_decimal(data.get("gst_percentage"), "gst_percentage")

    medicine = Medicine(
        store_id=store_id,
        brand_name=brand_name,
        generic_name=data.get("generic_name", "").strip() or None,
        manufacturer=data.get("manufacturer", "").strip() or None,
        strength=data.get("strength", "").strip() or None,
        dosage_form=dosage_form,
        route=data.get("route", "").strip() or None,
        category=data.get("category", "").strip() or None,
        is_prescription_only=bool(data.get("is_prescription_only", False)),
        mrp=mrp,
        selling_price=selling_price,
        hsn_code=data.get("hsn_code", "").strip() or None,
        gst_percentage=gst_percentage,
        storage_requirements=data.get("storage_requirements", "").strip() or None,
        is_active=True,
    )
    db.session.add(medicine)
    db.session.flush()

    # Nested ingredients
    for ing in data.get("ingredients", []):
        name = ing.get("name", "").strip()
        if not name:
            continue
        ingredient = Ingredient(
            medicine_id=medicine.id,
            name=name,
            strength=ing.get("strength", "").strip() or None,
            unit=ing.get("unit", "").strip() or None,
        )
        db.session.add(ingredient)

    # Nested aliases
    for alias in data.get("aliases", []):
        alias_name = alias.get("alias_name", "").strip()
        if not alias_name:
            continue
        medicine_alias = MedicineAlias(
            medicine_id=medicine.id,
            alias_name=alias_name,
            alias_type=alias.get("alias_type", "").strip() or None,
        )
        db.session.add(medicine_alias)

    # Nested visual features (for Phase 2 CV fingerprinting)
    for vf in data.get("visual_features", []):
        ftype = vf.get("feature_type", "").strip()
        fval = vf.get("feature_value", "").strip()
        if not ftype or not fval:
            continue
        feature = MedicineVisualFeature(
            medicine_id=medicine.id,
            feature_type=ftype,
            feature_value=fval,
            description=vf.get("description", "").strip() or None,
        )
        db.session.add(feature)

    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return medicine


def get_medicine(store_id: int, medicine_id: int, include_inactive: bool = False) -> Medicine:
    """Retrieve a single medicine by ID within a store context."""
    query = Medicine.query.filter_by(id=medicine_id, store_id=store_id)
    if not include_inactive:
        query = query.filter_by(is_active=True)

    medicine = query.first()
    if not medicine:
        raise NotFoundError(f"Medicine with ID {medicine_id} not found.")
    return medicine


def list_medicines(
    store_id: int,
    page: int = 1,
    per_page: int = 20,
    search: str = None,
    category: str = None,
    is_prescription_only: bool = None,
    is_active: bool = True,
):
    """List medicines for a store with pagination, search, and filtering."""
    if page < 1:
        page = 1
    per_page = min(max(1, per_page), 100)

    query = Medicine.query.filter(Medicine.store_id == store_id)

    if is_active is not None:
        query = query.filter(Medicine.is_active == is_active)

    if category:
        query = query.filter(Medicine.category.ilike(f"%{category.strip()}%"))

    if is_prescription_only is not None:
        query = query.filter(Medicine.is_prescription_only == is_prescription_only)

    if search:
        term = search.strip()
        search_pattern = f"%{term}%"
        # Search brand name, generic name, manufacturer, or alias names
        query = query.filter(
            or_(
                Medicine.brand_name.ilike(search_pattern),
                Medicine.generic_name.ilike(search_pattern),
                Medicine.manufacturer.ilike(search_pattern),
                Medicine.aliases.any(MedicineAlias.alias_name.ilike(search_pattern)),
            )
        )

    query = query.order_by(Medicine.brand_name.asc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "items": [serialize_medicine(m) for m in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }


def update_medicine(store_id: int, medicine_id: int, data: dict) -> Medicine:
    """Update an existing medicine and optionally its ingredients/aliases."""
    medicine = get_medicine(store_id, medicine_id, include_inactive=True)
    identity_fields = ("brand_name", "strength", "manufacturer", "dosage_form", "route")
    if data.get("is_active", medicine.is_active) and (any(field in data for field in identity_fields) or data.get("is_active") is True):
        proposed = {field: data.get(field, getattr(medicine, field)) for field in identity_fields}
        proposed["dosage_form"] = _parse_dosage_form(proposed["dosage_form"])
        _reject_duplicate(store_id, proposed["brand_name"], proposed["strength"], proposed["manufacturer"],
                          proposed["dosage_form"], proposed["route"], exclude_id=medicine.id)
    if any((a.get("alias_type") or "").strip().lower() == "barcode" for a in (data.get("aliases") or [])):
        raise ValidationError("Link barcodes using the medicine barcode endpoint.")

    if "brand_name" in data:
        new_brand = data["brand_name"].strip()
        if not new_brand:
            raise ValidationError("brand_name cannot be empty.")
        medicine.brand_name = new_brand

    if "generic_name" in data:
        medicine.generic_name = data["generic_name"].strip() or None

    if "manufacturer" in data:
        medicine.manufacturer = data["manufacturer"].strip() or None

    if "strength" in data:
        medicine.strength = data["strength"].strip() or None

    if "dosage_form" in data:
        medicine.dosage_form = _parse_dosage_form(data["dosage_form"])

    if "route" in data:
        medicine.route = data["route"].strip() or None

    if "category" in data:
        medicine.category = data["category"].strip() or None

    if "is_prescription_only" in data:
        medicine.is_prescription_only = bool(data["is_prescription_only"])

    if "mrp" in data:
        medicine.mrp = _parse_decimal(data["mrp"], "mrp")

    if "selling_price" in data:
        medicine.selling_price = _parse_decimal(data["selling_price"], "selling_price")

    if "hsn_code" in data:
        medicine.hsn_code = data["hsn_code"].strip() or None

    if "gst_percentage" in data:
        medicine.gst_percentage = _parse_decimal(data["gst_percentage"], "gst_percentage")

    if "storage_requirements" in data:
        medicine.storage_requirements = data["storage_requirements"].strip() or None

    if "is_active" in data:
        medicine.is_active = bool(data["is_active"])

    # If ingredients explicitly passed, update them
    if "ingredients" in data and isinstance(data["ingredients"], list):
        medicine.ingredients.clear()
        for ing in data["ingredients"]:
            name = ing.get("name", "").strip()
            if not name:
                continue
            ingredient = Ingredient(
                medicine_id=medicine.id,
                name=name,
                strength=ing.get("strength", "").strip() or None,
                unit=ing.get("unit", "").strip() or None,
            )
            db.session.add(ingredient)

    # If aliases explicitly passed, update them
    if "aliases" in data and isinstance(data["aliases"], list):
        medicine.aliases[:] = [a for a in medicine.aliases if a.alias_type == "barcode"]
        for alias in data["aliases"]:
            alias_name = alias.get("alias_name", "").strip()
            if not alias_name:
                continue
            medicine_alias = MedicineAlias(
                medicine_id=medicine.id,
                alias_name=alias_name,
                alias_type=alias.get("alias_type", "").strip() or None,
            )
            db.session.add(medicine_alias)

    db.session.commit()
    return medicine


def delete_medicine(store_id: int, medicine_id: int) -> None:
    """Soft-delete a medicine (is_active = False) to preserve historical integrity."""
    medicine = get_medicine(store_id, medicine_id)
    medicine.is_active = False
    db.session.commit()


def search_medicines_for_ocr(store_id: int, query_text: str, limit: int = 10) -> list:
    """Match medicines against OCR detected packaging text.

    Scans brand name, generic name, and aliases with ranking:
    1. Exact brand or alias match
    2. Prefix brand or alias match
    3. Partial substring match
    """
    if not query_text or not query_text.strip():
        return []

    term = query_text.strip().lower()
    limit = min(max(1, limit), 50)

    # Fetch active medicines for this store
    medicines = Medicine.query.filter_by(store_id=store_id, is_active=True).all()
    results = []

    for med in medicines:
        score = 0
        match_reasons = []

        brand_lower = (med.brand_name or "").lower()
        generic_lower = (med.generic_name or "").lower()

        if brand_lower == term:
            score += 100
            match_reasons.append("Exact brand match")
        elif brand_lower.startswith(term) or term in brand_lower:
            score += 60
            match_reasons.append("Brand name match")

        if generic_lower == term:
            score += 80
            match_reasons.append("Exact generic match")
        elif generic_lower and term in generic_lower:
            score += 40
            match_reasons.append("Generic composition match")

        for alias in med.aliases:
            alias_lower = alias.alias_name.lower()
            if alias_lower == term:
                score += 90
                match_reasons.append(f"Exact alias match ({alias.alias_name})")
            elif term in alias_lower:
                score += 50
                match_reasons.append(f"Alias match ({alias.alias_name})")

        if score > 0:
            results.append({
                "medicine": serialize_medicine(med),
                "score": score,
                "match_reasons": match_reasons,
            })

    # Sort descending by match score
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:limit]


def serialize_medicine(medicine: Medicine, detailed: bool = False) -> dict:
    """Serialize Medicine model to dictionary representation."""
    data = {
        "id": medicine.id,
        "store_id": medicine.store_id,
        "brand_name": medicine.brand_name,
        "barcodes": [a.alias_name for a in medicine.aliases if a.alias_type == "barcode"],
        "generic_name": medicine.generic_name,
        "manufacturer": medicine.manufacturer,
        "strength": medicine.strength,
        "dosage_form": medicine.dosage_form.value if medicine.dosage_form else None,
        "route": medicine.route,
        "category": medicine.category,
        "is_prescription_only": medicine.is_prescription_only,
        "mrp": float(medicine.mrp) if medicine.mrp is not None else None,
        "selling_price": float(medicine.selling_price) if medicine.selling_price is not None else None,
        "hsn_code": medicine.hsn_code,
        "gst_percentage": float(medicine.gst_percentage) if medicine.gst_percentage is not None else None,
        "storage_requirements": medicine.storage_requirements,
        "is_active": medicine.is_active,
        "created_at": medicine.created_at.isoformat() if medicine.created_at else None,
        "updated_at": medicine.updated_at.isoformat() if medicine.updated_at else None,
        "ingredients": [
            {
                "id": ing.id,
                "name": ing.name,
                "strength": ing.strength,
                "unit": ing.unit,
            }
            for ing in medicine.ingredients
        ],
        "aliases": [
            {
                "id": al.id,
                "alias_name": al.alias_name,
                "alias_type": al.alias_type,
            }
            for al in medicine.aliases
        ],
    }

    if detailed:
        data["visual_features"] = [
            {
                "id": vf.id,
                "feature_type": vf.feature_type,
                "feature_value": vf.feature_value,
                "description": vf.description,
            }
            for vf in medicine.visual_features
        ]
        # Active batch count
        data["batch_count"] = medicine.batches.count() if hasattr(medicine.batches, "count") else len(medicine.batches.all())

    return data
