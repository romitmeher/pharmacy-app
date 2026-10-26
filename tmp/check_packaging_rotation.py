from pathlib import Path
import sys,json,time
import cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app import create_app
from app.vision.ocr_engine import default_ocr_engine
from app.vision.extractor import default_entity_extractor
from app.vision.matcher import default_medicine_matcher

image=cv2.imread(str(Path(r'C:/Users/user/Downloads/WhatsApp Unknown 2026-10-25 at 1.42.21 PM/WhatsApp Image 2026-10-25 at 1.41.16 PM.jpeg')))
assert image is not None
app=create_app()
with app.app_context():
 for angle,code in [(0,None),(90,cv2.ROTATE_90_CLOCKWISE),(270,cv2.ROTATE_90_COUNTERCLOCKWISE),(180,cv2.ROTATE_180)]:
  start=time.perf_counter();frame=image if code is None else cv2.rotate(image,code)
  result=default_ocr_engine.run_ocr(frame)
  entities=default_entity_extractor.extract(result)
  match=default_medicine_matcher.match(entities,store_id=1)
  print(json.dumps({'angle':angle,'seconds':round(time.perf_counter()-start,2),'strength':entities.strength,'brands':entities.brand_candidates,'candidate':match.top_candidate.name if match.top_candidate else None,'low':match.low_confidence}),flush=True)
