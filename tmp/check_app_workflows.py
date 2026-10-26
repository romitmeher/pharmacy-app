from pathlib import Path
import sys,json,requests
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app import create_app
from app.models.user import User
from app.services.auth_service import create_access_token
app=create_app();base=sys.argv[1]
with app.app_context():
 user=User.query.filter_by(email='admin@smartpharm.com',is_active=True).one()
 headers={'Authorization':'Bearer '+create_access_token(user)};checks=[]
 for endpoint in ['/api/health','/api/auth/me','/api/medicines?per_page=10','/api/batches?per_page=1','/api/sales?per_page=1','/api/purchases?per_page=1','/api/prescriptions?per_page=1','/api/suppliers?per_page=1','/api/expenses?per_page=1','/api/inventory/expiry?days=30','/api/ml/reorder-recommendations?limit=3']:
  response=requests.get(base+endpoint,headers=headers,timeout=60)
  assert response.status_code==200,(endpoint,response.status_code)
  if endpoint.startswith('/api/medicines?'):assert response.json()['total']==8
  checks.append({'endpoint':endpoint,'status':response.status_code})
 p=Path('output/packaging-rotation');p.mkdir(exist_ok=True)
 (p/'workflow-checks.json').write_text(json.dumps(checks,indent=2))
 print('Read-only workflow checks passed:',len(checks),'; active catalogue medicines: 8')
