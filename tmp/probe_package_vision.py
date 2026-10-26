from pathlib import Path
import sys,time,json,cv2
sys.path.insert(0,str(Path('backend').resolve()))
from app import create_app
from app.vision.packaging_vision import read_package
from app.vision.matcher import default_medicine_matcher
app=create_app()
with app.app_context():
 for key in sys.argv[1:] or ['cyclomine','nucatkof']:
  start=time.perf_counter()
  try:
   e=read_package(cv2.imread(f'data/demo/paired-20261025/photos/{key}-back.jpeg'))
   m=default_medicine_matcher.match(e,store_id=1) if e else None
   print(json.dumps(dict(key=key,seconds=round(time.perf_counter()-start,1),entities=e.to_dict() if e else None,candidate=m.top_candidate.name if m and m.top_candidate else None,low=m.low_confidence if m else True)),flush=True)
  except Exception as error: print(type(error).__name__,str(error)[:180],flush=True)
