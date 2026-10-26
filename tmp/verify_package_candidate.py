from pathlib import Path
import sys,json,time,requests
sys.path.insert(0,str(Path('backend').resolve()))
from app import create_app
from app.models.user import User
from app.services.auth_service import create_access_token
app=create_app();base=sys.argv[1];reports=[]
with app.app_context():
 user=User.query.filter_by(email='admin@smartpharm.com',is_active=True).one()
 headers={'Authorization':'Bearer '+create_access_token(user)}
 for key,expected in [('cyclomine','Cyclomine'),('nucatkof','Nu Cat Kof'),('dromef','Dromef')]:
  f=Path(f'data/demo/paired-20261025/photos/{key}-back.jpeg');start=time.perf_counter()
  r=requests.post(base+'/api/vision/recognize',headers=headers,files={'image':(f.name,f.read_bytes(),'image/jpeg')},timeout=180)
  data=r.json().get('data',{});match=data.get('match_result') or {};top=match.get('top_candidate') or {}
  report=dict(expected=expected,status=r.status_code,seconds=round(time.perf_counter()-start,2),candidate=top.get('name'),engine=data.get('recognition_engine'),barcode=data.get('barcode'),notice=data.get('recognition_notice'),strength=(data.get('extracted_entities') or {}).get('strength'),review_required=data.get('human_verification_required'))
  print(json.dumps(report),flush=True);reports.append(report)
  assert r.status_code==200 and top.get('name')==expected and not match.get('low_confidence') and data.get('human_verification_required'),report
  if key!='dromef':assert data.get('recognition_engine')=='google_package_transcription',report
 out=Path('output/packaging-rotation');out.mkdir(exist_ok=True)
 (out/'google-candidate-probes.json').write_text(json.dumps(reports,indent=2))
