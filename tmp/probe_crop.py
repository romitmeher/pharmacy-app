from pathlib import Path
import sys,os,time,json,cv2
sys.path.insert(0,str(Path('backend').resolve()))
os.environ['OCR_ENABLE_MKLDNN']='false'
from app import create_app
from app.vision.ocr_engine import default_ocr_engine
from app.vision.extractor import default_entity_extractor
from app.vision.matcher import default_medicine_matcher
app=create_app()
with app.app_context():
 for key in ['cyclomine','nucatkof']:
  im=cv2.imread(f'data/demo/paired-20261025/photos/{key}-back.jpeg')
  edges=cv2.dilate(cv2.Canny(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),40,120),cv2.getStructuringElement(cv2.MORPH_RECT,(7,7)),iterations=2)
  contours,_=cv2.findContours(edges,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
  x,y,w,h=cv2.boundingRect(max(contours,key=cv2.contourArea)); im=im[max(0,y-20):y+h+20,max(0,x-20):x+w+20]
  for angle,code in [(270,cv2.ROTATE_90_COUNTERCLOCKWISE),(90,cv2.ROTATE_90_CLOCKWISE),(0,None)]:
   start=time.perf_counter();frame=im if code is None else cv2.rotate(im,code)
   r=default_ocr_engine.run_ocr(frame);e=default_entity_extractor.extract(r);m=default_medicine_matcher.match(e,store_id=1)
   print(json.dumps(dict(key=key,angle=angle,seconds=round(time.perf_counter()-start,1),text=r.full_text,strength=e.strength,candidate=m.top_candidate.name if m.top_candidate else None,low=m.low_confidence)),flush=True)
