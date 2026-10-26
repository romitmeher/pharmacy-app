"""Read-only service checks; credentials never leave process memory."""
from pathlib import Path
import sys
import json
import requests
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import create_app
from app.models.user import User, UserRole
from app.models.medicine import Medicine
from app.services.auth_service import create_access_token

app = create_app()
with app.app_context():
    user = User.query.filter_by(store_id=1, role=UserRole.OWNER, is_active=True).first()
    headers = {'Authorization': 'Bearer ' + create_access_token(user)}
    medicines = Medicine.query.filter_by(store_id=1,is_active=True).all()
    codes = [(m.id, a.alias_name) for m in medicines for a in m.aliases if a.alias_type=='barcode']
    assert len(medicines)==8 and len(codes)==8
    for base in sys.argv[1:]:
        report = {'service':base}
        report['health'] = requests.get(base+'/api/health',timeout=90).status_code
        listing = requests.get(base+'/api/medicines',headers=headers,timeout=90)
        assert listing.status_code==200, listing.status_code
        assert listing.json()['total']==8
        report['active_medicines']=listing.json()['total']
        report['catalog_status']=listing.status_code
        search=requests.post(base+'/api/vision/stocking/search',headers=headers,
                             json={'query':'Telmikind','include_web':False},timeout=90)
        assert search.status_code==200, search.status_code
        found=search.json()
        assert found['catalog'] and found['references']
        report['postgres_stocking_references']=len(found['references'])
        correct=0
        for medicine_id,code in codes:
            lookup=requests.get(base+'/api/medicines/barcode',params={'code':code},headers=headers,timeout=30)
            assert lookup.status_code==200 and lookup.json()['medicine']['id']==medicine_id
            correct+=1
        report['barcodes_verified']=correct
        print(json.dumps(report),flush=True)
