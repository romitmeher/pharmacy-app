"""Import explicitly paired user photos into an isolated demo training set.

No business database is accessed. Both sides of each physical package are
training-only: there are no independent packages for an honest holdout score.
"""
import argparse
import csv
from datetime import date, timedelta
from decimal import Decimal
import hashlib
import html
import json
from pathlib import Path
import shutil
import sqlite3

from demo_environment import DEMO_ROOT, demo_app
from app.extensions import db
from app.models.medicine import Medicine, MedicineAlias, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.store import Store
from app.models.location import Location
from app.sync.offline_pack import generate_offline_pack
from app.vision.photo_library import connect_library, normalize_label
from PIL import Image
from barcode import EAN13
from barcode.writer import ImageWriter

# Exact pairs supplied by the user, not inferred from pill appearance or filename order.
# Prices and stock below are fictional demo values per strip, not market quotations.
PAIRS = [
    ("Telmikind-H", "Telmisartan + Hydrochlorothiazide", None, "Mankind Pharma", "tablet", 100,
     "20 PM", "20 PM (1)"),
    ("Amlokind-AT", "Amlodipine + Atenolol", "5 mg + 50 mg", "Mankind Pharma", "tablet", 60,
     "16 PM", "17 PM"),
    ("Cyclomine", "Dicyclomine Hydrochloride + Paracetamol", "20 mg + 325 mg", "Saint Michael Biotech", "tablet", 30,
     "17 PM (1)", "17 PM (2)"),
    ("Cheston Cold", "Paracetamol + Phenylephrine + Caffeine + Diphenhydramine", None, "Cipla", "tablet", 65,
     "18 PM", "18 PM (1)"),
    ("Dromef", "Drotaverine Hydrochloride + Mefenamic Acid", "80 mg + 250 mg", None, "tablet", 105,
     "19 PM", "18 PM (2)"),
    ("Nu Cat Kof", "Dextromethorphan Hydrobromide + Chlorpheniramine Maleate + Phenylephrine Hydrochloride",
     "10 mg + 2 mg + 5 mg", "Signature Phytochemical Industries", "tablet", 60,
     "19 PM (1)", "19 PM (2)"),
    ("Multiprex", "Multivitamin + Multimineral + Antioxidant", None, "Zee Laboratories", "capsule", 145,
     "21 PM", "21 PM (1)"),
    ("Candiforce-200", "Itraconazole", "200 mg", "Mankind Pharma", "capsule", 235,
     "21 PM (2)", "22 PM"),
]


def filename(suffix):
    return f"WhatsApp Image 2026-10-25 at 1.41.{suffix}.jpeg"


def prepare(source):
    root = DEMO_ROOT / "paired-20261025"
    # Validate the complete input before creating labels or touching demo stock.
    for spec in PAIRS:
        for suffix in spec[-2:]:
            with Image.open(source / filename(suffix)) as image:
                image.verify()
    root.mkdir(parents=True, exist_ok=True)
    connection = connect_library(root)
    labels = []
    for index, spec in enumerate(PAIRS, 1):
        name, generic, strength, maker, form, price, back, front = spec
        key = normalize_label(name)
        for side, suffix in [("back", back), ("front", front)]:
            original = source / filename(suffix)
            relative = f"photos/{key}-{side}.jpeg"
            destination = root / relative
            destination.parent.mkdir(exist_ok=True)
            shutil.copy2(original, destination)
            digest = hashlib.sha256(destination.read_bytes()).hexdigest()
            with Image.open(destination) as image:
                width, height = image.size
            url = f"user-paired-20261025:{key}:{side}"
            connection.execute("INSERT OR IGNORE INTO photos(url) VALUES (?)", (url,))
            connection.execute("UPDATE photos SET state='indexed',path=?,sha256=?,width=?,height=? WHERE url=?",
                               (relative, digest, width, height, url))
            photo_id = connection.execute("SELECT id FROM photos WHERE url=?", (url,)).fetchone()[0]
            connection.execute("INSERT OR IGNORE INTO labels(photo_id,name,normalized,source) VALUES (?,?,?,?)",
                               (photo_id, name, key, "user-confirmed-pair; printed-back identity"))
            labels.append(dict(name=name, key=key, side=side, package_group=key, file=relative,
                               source_file=original.name, sha256=digest, split="train",
                               label_basis="printed back" if side == "back" else "user-confirmed pair"))
    connection.commit()
    connection.close()
    (root / "annotations.json").write_text(json.dumps({
        "demo_only": True, "independent_packages": 8, "images": labels,
        "evaluation": "No independent holdout. Front/back and augmentations must not be treated as independent packages.",
        "uncertain_fields": "Telmikind-H/Cheston Cold strengths, Dromef manufacturer left unset; Multiprex is a multi-ingredient supplement.",
    }, indent=2), encoding="utf-8")
    return root


def seed_demo(root):
    database = DEMO_ROOT / "smartpharm-demo.sqlite3"
    if not database.is_file():
        raise RuntimeError("Build the existing isolated demo first.")
    backup = root / "before-stock.sqlite3"
    if not backup.exists():
        with sqlite3.connect(database) as original, sqlite3.connect(backup) as target:
            original.backup(target)
    app = demo_app()
    rows = json.loads((DEMO_ROOT / "stock.json").read_text(encoding="utf-8"))
    cards = []
    with app.app_context():
        store = Store.query.order_by(Store.id).first()
        if not store or not store.name.startswith("SmartPharm Demo"):
            raise RuntimeError("Refusing to seed a non-demo store.")
        location = Location.query.filter_by(store_id=store.id).first()
        for index, spec in enumerate(PAIRS, 1):
            name, generic, strength, maker, form, price, *_ = spec
            key = normalize_label(name)
            code = EAN13(f"20000001{index:04d}", writer=ImageWriter())
            barcode = code.get_fullcode()
            med = Medicine.query.filter_by(store_id=store.id, brand_name=name).first()
            if med is None:
                med = Medicine(store_id=store.id, brand_name=name, generic_name=generic,
                    strength=strength, manufacturer=maker, dosage_form=DosageForm(form),
                    mrp=price, selling_price=price, gst_percentage=0, is_prescription_only=name != "Multiprex",
                    category="Paired photo demo", storage_requirements="Demo stock: one unit = one strip")
                db.session.add(med)
                db.session.flush()
            alias = MedicineAlias.query.filter_by(medicine_id=med.id, alias_name=barcode).first()
            if alias is None:
                db.session.add(MedicineAlias(medicine_id=med.id, alias_name=barcode, alias_type="barcode"))
            for number, (days, quantity) in enumerate([(180, 20), (540, 40)], 1):
                batch_number = f"DEMO-PAIR-20261025-{index:02d}-{number}"
                if not Batch.query.filter_by(store_id=store.id, medicine_id=med.id, batch_number=batch_number).first():
                    batch = Batch(store_id=store.id, medicine_id=med.id, batch_number=batch_number,
                        manufacturing_date=date.today()-timedelta(days=60), expiry_date=date.today()+timedelta(days=days),
                        mrp=price, purchase_price=Decimal(str(price))*Decimal("0.7"), quantity_received=quantity)
                    db.session.add(batch)
                    db.session.flush()
                    db.session.add(Inventory(store_id=store.id, batch_id=batch.id,
                        location_id=location.id if location else None, quantity_available=quantity))
            barcode_path = root / f"{key}-barcode.png"
            with barcode_path.open("wb") as handle:
                code.write(handle, options={"module_width": 0.45, "module_height": 24, "quiet_zone": 9, "dpi": 220})
            row = dict(medicine_id=med.id, name=name, strength=strength or "See printed composition",
                generic=generic, manufacturer=maker, category="Paired photo demo", demo_mrp=price, barcode=barcode,
                photo=f"paired-20261025/photos/{key}-back.jpeg", front_photo=f"paired-20261025/photos/{key}-front.jpeg",
                barcode_image=f"paired-20261025/{key}-barcode.png", photo_source="User supplied paired photos",
                billing_unit="one demo strip", demo_only=True)
            rows = [r for r in rows if r["medicine_id"] != med.id]
            rows.append(row)
            cards.append(f'<article><h2>{html.escape(name)}</h2><p>{html.escape(strength or "Strength requires review")} · Demo price ₹{price}/strip</p>'
                         f'<img src="photos/{key}-back.jpeg" alt="Printed back"><img src="photos/{key}-front.jpeg" alt="Paired front">'
                         f'<img src="{key}-barcode.png" alt="Internal demo barcode"><p>{barcode}</p></article>')
        db.session.commit()
        pack = generate_offline_pack(store.id)
        by_id = {m["id"]: m for m in pack["medicines"]}
        for row in rows:
            row["available_stock"] = by_id[row["medicine_id"]]["total_stock"]
            row["batches"] = by_id[row["medicine_id"]]["batches"]
        (DEMO_ROOT / "stock.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        with (DEMO_ROOT / "stock.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=[k for k in rows[-1] if k != "batches"], extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        manifest_path = DEMO_ROOT / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest.update(medicines=Medicine.query.filter_by(store_id=store.id).count(),
                        batches=Batch.query.filter_by(store_id=store.id).count(), paired_photo_medicines=8)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (root / "scan-cards.html").write_text('<!doctype html><meta charset="utf-8"><title>Paired photo demo</title>'
        '<style>body{font:16px Arial;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{border:1px solid #ccc;padding:16px}img{width:45%;height:300px;object-fit:contain}img:last-of-type{width:100%;height:140px}</style>'
        '<h1>Paired medicine photo demo</h1><p>User-confirmed pairs. Fictional demo stock, prices and internal barcodes. Photo matches require review; these are training images, not an accuracy test.</p><main>'
        + ''.join(cards) + '</main>', encoding="utf-8")
    from build_demo import export_batches
    export_batches(app)
    print(json.dumps({"labelled_images": 16, "medicine_classes": 8, "demo_stock_strips_added_on_first_run": 480, "root": str(root)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    seed_demo(prepare(args.source.resolve()))
