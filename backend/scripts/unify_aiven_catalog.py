"""Keep the eight user-confirmed photo medicines active in the Aiven store.

Archives earlier catalog entries without deleting invoices or their medicine
references. A local, ignored reversal snapshot is written before any changes.
"""
import argparse
from datetime import date, timedelta
import gzip
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from app.extensions import db
from app.models.user import User, UserRole
from app.models.store import Store
from app.models.medicine import Medicine, MedicineAlias, DosageForm
from app.models.location import Location, LocationType
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.services.audit_service import log_audit_event
from app.vision.stocking import connect
from prepare_paired_demo import PAIRS
from barcode import EAN13
from sqlalchemy import select


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit('Explicit --apply is required.')
    app = create_app()
    root = Path(__file__).resolve().parents[2] / 'data' / 'backups'
    root.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        if db.engine.dialect.name != 'mysql':
            raise RuntimeError('This operation requires the configured Aiven MySQL database.')
        # Verify PostgreSQL before changing the business catalog.
        pg = connect()
        if not getattr(pg, 'postgres', False):
            raise RuntimeError('Aiven PostgreSQL is required; SQLite is not an operational fallback.')
        owner = User.query.filter_by(is_active=True, role=UserRole.OWNER).order_by(User.id).first()
        if owner is None:
            raise RuntimeError('No existing owner/store was found.')
        store_id = owner.store_id
        db.session.execute(select(Store.id).where(Store.id==store_id).with_for_update()).scalar_one()
        names = [row[0] for row in PAIRS]
        keep = {m.brand_name:m for m in Medicine.query.filter(Medicine.store_id==store_id,
                Medicine.brand_name.in_(names), Medicine.category=='Paired photo demo').all()}
        keep_ids = [m.id for m in keep.values()]
        older = Medicine.query.with_entities(Medicine.id).filter_by(store_id=store_id,is_active=True)
        if keep_ids:
            older = older.filter(Medicine.id.notin_(keep_ids))
        previous_ids = [row[0] for row in older.all()]
        snapshot = {'store_id':store_id,'previously_active_ids':previous_ids,
                    'previous_photo_ids':keep_ids,'operation':'archive previous catalog; preserve financial history'}
        encoded = json.dumps(snapshot).encode()
        backup = root / f'aiven-catalog-{store_id}-{date.today().isoformat()}-{hashlib.sha256(encoded).hexdigest()[:12]}.json.gz'
        if not backup.exists():
            with gzip.open(backup,'wb') as handle:
                handle.write(encoded)
        if previous_ids:
            Medicine.query.filter(Medicine.store_id==store_id,Medicine.is_active.is_(True),
                Medicine.id.notin_(keep_ids) if keep_ids else db.true()).update(
                    {'is_active':False},synchronize_session=False)
        location = Location.query.filter_by(store_id=store_id,name='Demo photo stock').first()
        if location is None:
            location=Location(store_id=store_id,name='Demo photo stock',location_type=LocationType.SHELF)
            db.session.add(location);db.session.flush()
        for index,spec in enumerate(PAIRS,1):
            name,generic,strength,maker,form,price,*_=spec
            med=keep.get(name)
            if med is None:
                med=Medicine(store_id=store_id,brand_name=name,generic_name=generic,strength=strength,
                    manufacturer=maker,dosage_form=DosageForm(form),category='Paired photo demo',
                    mrp=price,selling_price=price,gst_percentage=0,is_prescription_only=name!='Multiprex',
                    storage_requirements='DEMO: fictional stock and prices; one unit is one strip',is_active=True)
                db.session.add(med);db.session.flush();keep[name]=med
            med.is_active=True
            code=EAN13(f'20000001{index:04d}').get_fullcode()
            if not MedicineAlias.query.filter_by(medicine_id=med.id,alias_type='barcode',alias_name=code).first():
                db.session.add(MedicineAlias(medicine_id=med.id,alias_type='barcode',alias_name=code))
            for number,(days,quantity) in enumerate([(180,20),(540,40)],1):
                batch_number=f'DEMO-PAIR-20261025-{index:02d}-{number}'
                if not Batch.query.filter_by(store_id=store_id,medicine_id=med.id,batch_number=batch_number).first():
                    batch=Batch(store_id=store_id,medicine_id=med.id,batch_number=batch_number,
                        manufacturing_date=date.today()-timedelta(days=60),expiry_date=date.today()+timedelta(days=days),
                        purchase_price=round(price*.7,2),mrp=price,quantity_received=quantity)
                    db.session.add(batch);db.session.flush()
                    db.session.add(Inventory(store_id=store_id,batch_id=batch.id,location_id=location.id,quantity_available=quantity))
        log_audit_event(store_id,'medicine_catalog',store_id,'ARCHIVE',
            'User requested only the eight medicines from the supplied photo pairs; older identities retained for history.',
            old_values={'active_count':len(previous_ids),'reversal_snapshot_sha256':hashlib.sha256(encoded).hexdigest()},
            new_values={'active_medicine_ids':[m.id for m in keep.values()]},user_id=owner.id)
        db.session.commit()
        with pg:
            for spec in PAIRS:
                name,generic,strength,maker,*_=spec
                pg.execute('INSERT INTO reference(name,composition,manufacturer,pack,source,url) '
                    'SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM reference WHERE name=? AND source=?)',
                    (name,generic+((' '+strength) if strength else ''),maker or '',
                     'one demo strip','user-confirmed-photos-20261025','',name,'user-confirmed-photos-20261025'))
        pg.close()
        active=Medicine.query.filter_by(store_id=store_id,is_active=True).count()
        if active!=8:
            raise RuntimeError(f'Expected eight active medicines; found {active}.')
        report={'database':'Aiven MySQL','store_id':store_id,'active_medicines':active,
                'archived_previous_medicines':len(previous_ids),'backup':str(backup),
                'photo_medicine_ids':{name:med.id for name,med in keep.items()},
                'reference_memory':'Aiven PostgreSQL','history_preserved':True}
        (root/'aiven-unification-report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
        db.session.remove();db.engine.dispose()


if __name__=='__main__':
    main()
