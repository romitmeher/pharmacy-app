from pathlib import Path
import sys,json,requests,cv2,time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app import create_app
from app.models.user import User
from app.services.auth_service import create_access_token
from app.vision.extractor import default_entity_extractor
from app.vision.matcher import default_medicine_matcher
app=create_app()
with app.app_context():
 user=User.query.filter_by(email='admin@smartpharm.com',is_active=True).one();headers={'Authorization':'Bearer '+create_access_token(user)}
 im=cv2.imread('data/demo/paired-20261025/photos/amlokindat-back.jpeg')
 if '--crop' in sys.argv:
  im=im[276:1018,107:609]
 frame=cv2.rotate(im,cv2.ROTATE_90_COUNTERCLOCKWISE);_,enc=cv2.imencode('.png',frame)
 route='/api/vision/recognize' if '--crop' in sys.argv else '/api/vision/stocking/read'
 r=requests.post('https://rx-candidate---smartpharm-api-wpx5hpgcnq-el.a.run.app'+route,headers=headers,files={'image':('pack.png',enc.tobytes(),'image/png')},timeout=120)
 obj=r.json();print(json.dumps(obj),flush=True)
 Path('output/packaging-rotation/cloud-stock-read.json').write_text(json.dumps(obj,indent=2))
