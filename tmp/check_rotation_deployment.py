"""Read-only recognition probes; no verification or checkout requests."""
from pathlib import Path
import sys,json,time,io
import requests,cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app import create_app
from app.models.user import User
from app.services.auth_service import create_access_token

app=create_app();base=sys.argv[1];root=Path(__file__).resolve().parents[1]
with app.app_context():
 user=User.query.filter_by(email='admin@smartpharm.com',is_active=True).one()
 headers={'Authorization':'Bearer '+create_access_token(user)}
 items=json.loads((root/'data/demo/paired-20261025/annotations.json').read_text())['images']
 selected=[x for x in items if x['side']=='back' and (len(sys.argv)<3 or x['name']==sys.argv[2])]
 reports=[]
 for item in selected:
  file=root/'data/demo/paired-20261025'/item['file'];start=time.perf_counter()
  response=requests.post(base+'/api/vision/recognize',headers=headers,files={'image':(file.name,file.read_bytes(),'image/jpeg')},timeout=180)
  payload=response.json();data=payload.get('data',{});match=data.get('match_result') or {};candidate=match.get('top_candidate') or {}
  report={'expected':item['name'],'status':response.status_code,'seconds':round(time.perf_counter()-start,2),'candidate':candidate.get('name'),'low_confidence':match.get('low_confidence'),'rotation':data.get('rotation_degrees'),'strength':(data.get('extracted_entities') or {}).get('strength'),'correct':candidate.get('name')==item['name'] and not match.get('low_confidence',True)}
  reports.append(report);print(json.dumps(report),flush=True)
 out=root/'output/packaging-rotation';out.mkdir(exist_ok=True)
 (out/'live-photo-probes.json').write_text(json.dumps(reports,indent=2))
 if len(sys.argv)>2:assert all(x['correct'] for x in reports),reports
