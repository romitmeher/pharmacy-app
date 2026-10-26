from pathlib import Path
from html.parser import HTMLParser
import hashlib
import requests

class Scripts(HTMLParser):
    sources = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('src'):
            self.sources.append(dict(attrs)['src'])

base = 'https://smartpharm-web-244760124290.asia-south1.run.app'
page = requests.get(base+'/login', timeout=60)
parser = Scripts()
parser.feed(page.text)
scripts = ''.join(requests.get(base+src, timeout=60).text for src in parser.sources)
asset = requests.get(base+'/images/pharmacy-counter.png', timeout=60)
optimized = requests.get(base+'/_next/image', params={'url':'/images/pharmacy-counter.png','w':640,'q':75}, timeout=60)
local = Path('frontend/public/images/pharmacy-counter.png').read_bytes()
report = {'login':page.status_code, 'image':asset.status_code, 'optimization':optimized.status_code,
          'image_matches':hashlib.sha256(asset.content).digest()==hashlib.sha256(local).digest(),
          'new_image_in_scripts':'pharmacy-counter.png' in scripts,
          'cloud_api_in_scripts':'https://smartpharm-api-244760124290.asia-south1.run.app' in scripts}
print(report)
assert all(report[k]==200 for k in ['login','image','optimization'])
assert report['image_matches'] and report['new_image_in_scripts'] and report['cloud_api_in_scripts']
