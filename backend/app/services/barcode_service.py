"""Store-scoped, exact barcode mappings using typed medicine aliases."""
from sqlalchemy import select
from app.extensions import db
from app.models.store import Store
from app.models.medicine import Medicine, MedicineAlias
from app.services.medicine_service import get_medicine
from app.utils.errors import ValidationError, NotFoundError


def normalize_barcode(value):
    if not isinstance(value, str):
        raise ValidationError("Barcode must be text to preserve leading zeros.")
    code = value.strip()
    if not 4 <= len(code) <= 64 or any(ord(c) < 33 or ord(c) > 126 for c in code):
        raise ValidationError("Scan a barcode containing 4–64 printable characters without spaces.")
    return code


def decode_barcode_pixels(image):
    import cv2
    codes = set()
    try:
        from pyzbar.pyzbar import decode
        codes.update(result.data.decode("utf-8") for result in decode(image))
    except (ImportError, OSError):
        pass
    except UnicodeDecodeError:
        raise ValidationError("Barcode contains unsupported text.")
    if not codes and hasattr(cv2, "barcode_BarcodeDetector"):
        success, values, _, _ = cv2.barcode_BarcodeDetector().detectAndDecodeWithType(image)
        if success:
            codes.update(value for value in values if value)
    if not codes:
        value = cv2.QRCodeDetector().detectAndDecode(image)[0]
        if value:
            codes.add(value)
    if len(codes) > 1:
        raise ValidationError("Show only one barcode at a time.")
    if not codes:
        raise ValidationError("No readable barcode found. Show the printed barcode clearly or use a USB scanner.")
    return normalize_barcode(codes.pop())


def lookup(store_id, code):
    code = normalize_barcode(code)
    matches = (Medicine.query.join(MedicineAlias)
               .filter(Medicine.store_id == store_id, Medicine.is_active.is_(True),
                       MedicineAlias.alias_type == "barcode", MedicineAlias.alias_name == code).all())
    # Some database collations ignore case; barcode matching must be exact.
    matches = [med for med in matches if any(a.alias_type == "barcode" and a.alias_name == code for a in med.aliases)]
    if len(matches) > 1:
        raise ValidationError("This barcode has multiple mappings. Correct them in Medicines Catalog.")
    if not matches:
        raise NotFoundError("Barcode is not linked to an active medicine in this store.")
    return matches[0]


def link(store_id, medicine_id, value, remove=False, commit=True):
    code = normalize_barcode(value)
    # Serialize mapping changes within a store, including concurrent terminals.
    db.session.execute(select(Store.id).where(Store.id == store_id).with_for_update()).scalar_one()
    medicine = get_medicine(store_id, medicine_id)
    existing = (MedicineAlias.query.join(Medicine)
                .filter(Medicine.store_id == store_id, MedicineAlias.alias_type == "barcode",
                        MedicineAlias.alias_name == code).all())
    if remove:
        for alias in existing:
            if alias.medicine_id == medicine.id and alias.alias_name == code:
                db.session.delete(alias)
    else:
        if any(alias.medicine_id != medicine.id for alias in existing):
            raise ValidationError("Barcode is already linked to another medicine in this store.")
        if not any(alias.alias_name == code for alias in existing):
            db.session.add(MedicineAlias(medicine_id=medicine.id, alias_name=code, alias_type="barcode"))
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return medicine
