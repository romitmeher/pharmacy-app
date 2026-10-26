exec(open('tmp/probe_crop.py').read().split('with app.app_context():')[0])
with app.app_context():
 for key in ['cyclomine','nucatkof']:
  im=cv2.imread(f'data/demo/paired-20261025/photos/{key}-back.jpeg');im=cv2.rotate(im,cv2.ROTATE_90_COUNTERCLOCKWISE)
  r=default_ocr_engine.run_ocr(im)
  for word in r.word_boxes:
   if any(t in word.text.lower() for t in ['325','2lm','2mg','5m','5 m']):
    pts=word.box;x=max(0,int(min(p[0] for p in pts))-15);y=max(0,int(min(p[1] for p in pts))-10);xx=min(im.shape[1],int(max(p[0] for p in pts))+15);yy=min(im.shape[0],int(max(p[1] for p in pts))+10)
    crop=im[y:yy,x:xx]; rr=default_ocr_engine.run_ocr(crop)
    print(json.dumps(dict(key=key,original=word.text,reread=rr.full_text)),flush=True)
