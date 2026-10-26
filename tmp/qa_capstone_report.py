from pathlib import Path
import json
import pdfplumber
import subprocess
from PIL import Image, ImageOps, ImageDraw
root=Path(__file__).resolve().parents[1]/'output/capstone-report'
pdfpath=root/'SmartPharm_Capstone_Project_Report_2026_27.pdf'
pdf=pdfplumber.open(pdfpath).pages
render=root/'qa';render.mkdir(exist_ok=True)
issues=[]
subprocess.run([r'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe','-r','108','-png',str(pdfpath),str(render/'page')],check=True)
for i,page in enumerate(pdf):
    for word in page.extract_words():
        x0,y0,x1,y1=word['x0'],word['top'],word['x1'],word['bottom']
        if x0<20 or x1>592 or y0<10 or y1>775:issues.append({'page':i+1,'text':word['text'],'bounds':[x0,y0,x1,y1]})
    txt=page.extract_text()
    if '\ufffd' in txt or '\u25a0' in txt:issues.append({'page':i+1,'glyph':'replacement'})
for start in range(0,len(pdf),6):
    canvas=Image.new('RGB',(1224,2448),'#cccccc');draw=ImageDraw.Draw(canvas)
    for j in range(6):
        n=start+j
        if n>=len(pdf):break
        im=Image.open(render/f'page-{n+1:02}.png');im.thumbnail((606,784))
        x=(j%2)*612+(612-im.width)//2;y=(j//2)*816+25
        canvas.paste(im,(x,y));draw.text((x+8,y-19),f'PAGE {n+1}',fill='black')
    canvas.save(render/f'contact-{start+1:02}-{min(start+6,len(pdf)):02}.jpg',quality=94)
expected=['Neev Borana','Romit Meher','Rohit Gorhekar','EU1246063','EU1226023','EU1246019']
assert all(t in pdf[0].extract_text() for t in expected)
assert len(pdf)==42
assert not issues,issues
(root/'qa-summary.json').write_text(json.dumps({'pages':len(pdf),'text_bounds_issues':issues,'student_details_checked':True,'frontend_screens':8,'research_papers':7},indent=2))
print('42 pages rendered; text bounds and student details passed.')
