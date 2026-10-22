"""Build an isolated, realistic demo stock database and printable scan pack."""
import base64
import csv
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import html
import io
import json
from pathlib import Path
import shutil
import sqlite3
import sys

from demo_environment import demo_app, DEMO_ROOT
from demo_credentials import get_demo_credentials
from app.extensions import db
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.location import Location, LocationType
from app.models.supplier import Supplier
from app.models.medicine import Medicine, MedicineAlias, DosageForm
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.sale import Sale
from app.models.purchase import PurchaseInvoice
from app.services.purchase_service import create_purchase_draft, accept_purchase_invoice
from app.services.sales_service import create_sale
from app.services.expense_service import record_expense
from app.sync.offline_pack import generate_offline_pack
from barcode import EAN13
from barcode.writer import ImageWriter

PHOTO_ROOT = DEMO_ROOT.parent / "medicine_photos"
SPECS = [
    ("dolo650", "650 mg", "Paracetamol", "Micro Labs", 32, "Fever & Pain"),
    ("calpol650", "650 mg", "Paracetamol", "GSK", 34, "Fever & Pain"),
    ("p650", "650 mg", "Paracetamol", "Apex Laboratories", 30, "Fever & Pain"),
    ("augmentin625", "500 mg + 125 mg", "Amoxicillin + Clavulanic acid", "GSK", 215, "Antibiotics"),
    ("azithral500", "500 mg", "Azithromycin", "Alembic Pharmaceuticals", 132, "Antibiotics"),
    ("azee500", "500 mg", "Azithromycin", "Cipla", 125, "Antibiotics"),
    ("pantop40", "40 mg", "Pantoprazole", "Aristo Pharmaceuticals", 110, "Gastro Care"),
    ("pan40", "40 mg", "Pantoprazole", "Alkem Laboratories", 155, "Gastro Care"),
    ("allegra120", "120 mg", "Fexofenadine", "Sanofi India", 225, "Allergy Care"),
    ("allegra180", "180 mg", "Fexofenadine", "Sanofi India", 275, "Allergy Care"),
    ("levocet5", "5 mg", "Levocetirizine", "Hetero Healthcare", 65, "Allergy Care"),
    ("telma40", "40 mg", "Telmisartan", "Glenmark Pharmaceuticals", 125, "Chronic Care"),
    ("thyronorm50", "50 mcg", "Thyroxine", "Abbott India", 175, "Chronic Care"),
    ("ecosprin75", "75 mg", "Aspirin", "USV", 18, "Chronic Care"),
    ("pantop20", "20 mg", "Pantoprazole", "Aristo Pharmaceuticals", 75, "Gastro Care"),
    ("azithral250", "250 mg", "Azithromycin", "Alembic Pharmaceuticals", 95, "Antibiotics"),
    ("calpol500", "500 mg", "Paracetamol", "GSK", 24, "Fever & Pain"),
    ("allegra30", "30 mg", "Fexofenadine", "Sanofi India", 85, "Allergy Care"),
]


def export_batches(app):
    with app.app_context():
        with (DEMO_ROOT / "batches.csv").open("w", encoding="utf-8-sig", newline="") as target:
            writer = csv.writer(target)
            writer.writerow(["medicine", "strength", "batch", "expiry", "demo_mrp", "demo_purchase_price", "shelf", "available_units", "expired"])
            for batch, inv, med, loc in (db.session.query(Batch, Inventory, Medicine, Location)
                .join(Inventory, Inventory.batch_id == Batch.id).join(Medicine, Medicine.id == Batch.medicine_id)
                .outerjoin(Location, Location.id == Inventory.location_id).order_by(Medicine.brand_name, Batch.expiry_date)):
                writer.writerow([med.brand_name, med.strength, batch.batch_number, batch.expiry_date,
                    batch.mrp, batch.purchase_price, loc.name if loc else "Unassigned", inv.quantity_available,
                    batch.expiry_date < date.today()])
    (DEMO_ROOT / "README.md").write_text('''# SmartPharm local demo

Start `start_demo.ps1` from the project folder, then open http://localhost:3000.

Login: **owner@demo.test**. Read the installation-specific password from **backend/instance/demo-credentials.json** on this computer. Other demo accounts use the same local password. Never include this credential file in a shared scan pack.

This demo uses its own SQLite database and ports 5000/3000. It does not seed or overwrite your normal store. It includes purchase receipts, stock across multiple batches and shelves, sales, expenses, low stock, near-expiry and expired stock examples. Prices, supplier identities, dates, quantities and barcode assignments are fictional demo data, not market quotations or manufacturer identifiers.

Open **scan-cards.html** to view the real reference photos and internal EAN-13 demo labels. Individual medicine photos are in **photos/** and separate barcode PNGs in **barcodes/**.

In demo POS, choose **Scan barcode photo / camera** and upload a PNG from **barcodes/**. On supported phones the file chooser can capture a barcode photo. Or click the barcode input and scan a printed label with a USB reader configured for Enter. One label adds one demo stock unit. The labels work because these demo codes are already linked in this demo database; they are not manufacturer product barcodes.

Medicine photos are for assisted OCR/stocking testing and are not guaranteed to identify the correct product automatically. Barcode-photo decoding bypasses OCR. The browser can decode locally when its native barcode detector is supported; otherwise it uses the local backend.

Stock exports: **stock.csv**, **batches.csv**, **stock.json**. Successful headless checks are recorded in **demo-check.json** and **barcode-check.json**. Real stock changes from testing persist in the demo database. The builder does not reset existing demo data.
''', encoding="utf-8")


def main():
    if (DEMO_ROOT / "manifest.json").exists():
        export_batches(demo_app())
        print((DEMO_ROOT / "manifest.json").read_text(encoding="utf-8"))
        return
    app = demo_app()
    photos = sqlite3.connect(PHOTO_ROOT / "library.sqlite3")
    with app.app_context():
        db.create_all()
        if Store.query.count():
            raise RuntimeError("Demo database already contains data; choose a new demo folder rather than overwriting it.")
        store = Store(name="SmartPharm Demo — Koramangala", address="Demo address: 24, 5th Block, Bengaluru 560095",
                      phone="0000000000", email="demo@example.test")
        db.session.add(store); db.session.flush()
        password = get_demo_credentials()["password"]
        users = []
        for role, name in [(UserRole.OWNER, "Ananya Rao"), (UserRole.PHARMACIST, "Rahul Mehta"),
                           (UserRole.CASHIER, "Priya Nair"), (UserRole.INVENTORY_STAFF, "Arjun Shah")]:
            user = User(store_id=store.id, email=f"{role.value}@demo.test", username=f"demo_{role.value}", full_name=name, role=role)
            user.set_password(password); db.session.add(user); users.append(user)
        locations = []
        for name in ["A1 — Fever & Pain", "A2 — Antibiotics", "B1 — Gastro Care", "B2 — Allergy Care", "C1 — Chronic Care"]:
            loc = Location(store_id=store.id, name=name, location_type=LocationType.SHELF)
            db.session.add(loc); locations.append(loc)
        suppliers = []
        for name, contact in [("Demo Bengaluru Medisupply", "Sanjay Kulkarni"), ("Demo SouthCare Distributors", "Neha Iyer"),
                              ("Demo Apex Pharma Wholesale", "Vikram Shetty")]:
            supplier = Supplier(store_id=store.id, name=name, contact_person=contact, phone="0000000000",
                                address="Fictional demo distributor, Bengaluru")
            db.session.add(supplier); suppliers.append(supplier)
        db.session.commit()
        rows, medicines = [], []
        for spec in SPECS:
            prefix, strength, generic, maker, price, category = spec
            found = photos.execute("SELECT l.name,p.path,p.url FROM labels l JOIN photos p ON p.id=l.photo_id "
                "WHERE l.normalized LIKE ? AND p.state='indexed' AND lower(l.name) LIKE '%tablet%' "
                "AND lower(l.name) NOT LIKE '%injection%' ORDER BY p.width DESC LIMIT 1", (prefix + "%",)).fetchone()
            if not found:
                continue
            name, relative, origin = found
            index = len(rows) + 1
            code = EAN13(f"200000{index:06d}", writer=ImageWriter())
            barcode_value = code.get_fullcode()
            med = Medicine(store_id=store.id, brand_name=name, generic_name=generic, strength=strength,
                manufacturer=maker, dosage_form=DosageForm.TABLET, category=category, mrp=price,
                selling_price=Decimal(str(price)) * Decimal("0.95"), gst_percentage=0,
                is_prescription_only=category in ("Antibiotics", "Chronic Care"),
                storage_requirements="Demo: cool, dry shelf away from direct sunlight")
            db.session.add(med); db.session.flush()
            db.session.add(MedicineAlias(medicine_id=med.id, alias_name=barcode_value, alias_type="barcode"))
            image_folder = DEMO_ROOT / "photos"; image_folder.mkdir(exist_ok=True)
            barcode_folder = DEMO_ROOT / "barcodes"; barcode_folder.mkdir(exist_ok=True)
            photo = image_folder / f"{index:02d}-{prefix}.jpg"
            shutil.copy2(PHOTO_ROOT / relative, photo)
            barcode_file = barcode_folder / f"{index:02d}-{prefix}.png"
            with barcode_file.open("wb") as target:
                code.write(target, options={"module_width": 0.45, "module_height": 24, "quiet_zone": 9,
                                            "font_size": 12, "text_distance": 5, "dpi": 220})
            medicines.append(med)
            rows.append({"medicine_id": med.id, "name": name, "strength": strength, "generic": generic,
                "manufacturer": maker, "category": category, "demo_mrp": price, "barcode": barcode_value,
                "photo": str(photo.relative_to(DEMO_ROOT)), "barcode_image": str(barcode_file.relative_to(DEMO_ROOT)),
                "photo_source": origin, "billing_unit": "one demo stock unit"})
        db.session.commit()
        today = date.today()
        for batch_round, offset in enumerate([45, 240, 540]):
            items = []
            for index, med in enumerate(medicines):
                quantity = (18 + index * 3) if batch_round == 0 else (48 + index * 4)
                if index == 2: quantity = 2 if batch_round == 0 else 0
                if quantity == 0: continue
                items.append({"medicine_id": med.id, "batch_number": f"DM{today:%y%m}{index+1:03d}{batch_round+1}",
                    "expiry_date": (today + timedelta(days=offset)).isoformat(), "quantity": quantity,
                    "purchase_rate": round(float(med.mrp)*0.68, 2), "mrp": float(med.mrp), "tax_percentage": 0})
            invoice = create_purchase_draft(store.id, users[0].id, {"supplier_id": suppliers[batch_round].id,
                "invoice_number": f"DEMO-IN-{batch_round+1:03d}", "invoice_date": (today-timedelta(days=10-batch_round)).isoformat(),
                "items": items, "notes": "Fictional demonstration invoice; prices and quantities are not market data."})
            accept_purchase_invoice(store.id, invoice.id, users[0].id, {"default_location_id": locations[batch_round].id,
                "items": [{"item_id": item.id, "received_quantity": item.quantity} for item in invoice.items]})
        # Explicit expired-stock case, excluded from POS FEFO availability.
        expired = Batch(store_id=store.id, medicine_id=medicines[0].id, batch_number="DEMO-EXPIRED-01",
                        expiry_date=today-timedelta(days=15), mrp=32, purchase_price=20, quantity_received=12)
        db.session.add(expired); db.session.flush()
        db.session.add(Inventory(store_id=store.id, batch_id=expired.id, location_id=locations[0].id, quantity_available=12))
        db.session.commit()
        for index in range(24):
            med = medicines[index % len(medicines)]
            if med.id == medicines[2].id: continue
            sale = create_sale(store.id, users[2].id, {"items": [{"medicine_id": med.id, "quantity": 1,
                "unit_price": float(med.mrp)}], "payments": [{"payment_method": ["cash", "upi", "card"][index % 3],
                "amount": float(med.mrp)}], "customer": {"name": ["Demo walk-in", "Demo Asha", "Demo Kiran"][index % 3]},
                "notes": "Fictional demo transaction"})
            sale.created_at = datetime.now(timezone.utc) - timedelta(days=index % 14)
            db.session.commit()
        for category, amount, description in [("rent", 18000, "Demo shop rent"), ("utilities_power", 2450, "Demo electricity"),
                                               ("logistics_packaging", 650, "Demo delivery bags")]:
            # Enum values are taken from the model below for portability.
            from app.models.expense import ExpenseCategory
            available = {member.value for member in ExpenseCategory}
            if category not in available:
                category = next(member.value for member in ExpenseCategory if "rent" in member.value) if "rent" in description else "miscellaneous"
            record_expense(store.id, users[0].id, {"category": category, "amount": amount,
                "payment_method": "bank_transfer", "expense_date": today.isoformat(), "notes": description})
        pack = generate_offline_pack(store.id)
        by_id = {med["id"]: med for med in pack["medicines"]}
        for row in rows:
            med = by_id[row["medicine_id"]]
            row["available_stock"] = med["total_stock"]
            row["batches"] = med["batches"]
        (DEMO_ROOT / "stock.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        with (DEMO_ROOT / "stock.csv").open("w", encoding="utf-8-sig", newline="") as target:
            fields = [k for k in rows[0] if k != "batches"]
            writer = csv.DictWriter(target, fieldnames=fields, extrasaction="ignore"); writer.writeheader(); writer.writerows(rows)
        cards = []
        for row in rows:
            image = base64.b64encode((DEMO_ROOT / row["photo"]).read_bytes()).decode()
            barcode_image = base64.b64encode((DEMO_ROOT / row["barcode_image"]).read_bytes()).decode()
            cards.append(f'<article><h2>{html.escape(row["name"])}</h2><p>{html.escape(row["strength"])} · {row["available_stock"]} demo units · Demo MRP ₹{row["demo_mrp"]}</p>'
                f'<img class="medicine" src="data:image/jpeg;base64,{image}" alt="Medicine packaging"><img class="barcode" src="data:image/png;base64,{barcode_image}" alt="Demo barcode {row["barcode"]}">'
                f'<p><strong>{row["barcode"]}</strong> — internal DEMO label, not the manufacturer code</p></article>')
        (DEMO_ROOT / "scan-cards.html").write_text('<!doctype html><html><meta charset="utf-8"><title>SmartPharm demo scan cards</title>'
            '<style>body{font-family:Arial;margin:24px;background:#eef2f6;color:#172033}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}article{background:white;padding:20px;border-radius:12px;break-inside:avoid}h2{font-size:20px}.medicine{width:100%;height:220px;object-fit:contain}.barcode{display:block;width:100%;max-height:180px;object-fit:contain}@media print{body{background:white}main{grid-template-columns:1fr 1fr}article{border:1px solid #ccc}}</style>'
            '<h1>SmartPharm demo scan cards</h1><p>Fictional stock and prices. Real reference photos. For POS, scan/upload the separate barcode image; photo OCR remains assisted and may need review. Each barcode adds one demo stock unit.</p><main>' + ''.join(cards) + '</main></html>', encoding="utf-8")
        manifest = {"demo_only": True, "created": today.isoformat(), "store": store.name,
            "medicines": len(medicines), "batches": Batch.query.count(), "suppliers": len(suppliers), "locations": len(locations),
            "available_units": sum(m["total_stock"] for m in pack["medicines"]), "sales": Sale.query.count(),
            "purchases": PurchaseInvoice.query.count(), "login_email": "owner@demo.test",
            "frontend": "http://localhost:3000", "backend": "http://127.0.0.1:5000"}
        (DEMO_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        export_batches(app)
        print(json.dumps(manifest))
    photos.close()


if __name__ == "__main__":
    main()
