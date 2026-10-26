exec(open('tmp/probe_package_vision.py').read().split('with app.app_context():')[0])
with app.app_context():
 for key in ['amlokindat','telmikindh','cyclomine']:
  start=time.perf_counter();e=read_package(cv2.imread(f'data/demo/paired-20261025/photos/{key}-front.jpeg'))
  print(json.dumps(dict(front=key,seconds=round(time.perf_counter()-start,1),brand=e.brand_name if e else None)),flush=True)
