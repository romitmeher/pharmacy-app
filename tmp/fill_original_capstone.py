"""Fill the retained AF52 package without rewriting its styles or page system."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from copy import deepcopy
from lxml import etree as E
from PIL import Image
import ast, hashlib, json, re

ROOT=Path(__file__).resolve().parents[1]
REF=Path(r'C:/Users/user/Downloads/AF52_ PROJECT SYNOPSYS FORMAT (1).docx')
OUT=ROOT/'output/capstone-report';AS=OUT/'assets'
FINAL=OUT/'SmartPharm_AF52_Original_Format_Corrected.docx'
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def w(n):return '{'+NS['w']+'}'+n
with ZipFile(REF) as z: parts={i.filename:z.read(i.filename) for i in z.infolist()};infos=z.infolist()
source_hash=hashlib.sha256(REF.read_bytes()).hexdigest()
doc=E.fromstring(parts['word/document.xml']);body=doc.find('w:body',NS);b=list(body)
original_sections=[E.tostring(x) for x in doc.findall('.//w:sectPr',NS)]
rels=E.fromstring(parts['word/_rels/document.xml.rels'])
def text(p,s):
 ts=p.findall('.//w:t',NS)
 if not ts:
  r=E.SubElement(p,w('r'));t=E.SubElement(r,w('t'));ts=[t]
 ts[0].text=s;ts[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 for t in ts[1:]:t.text=''
 return p
def put(i,s):return text(b[i],s)
def plain(s):return re.sub('<[^>]*>','',s.replace('<br/>',' ').replace('&nbsp;',' '))
def clonep(s,template=106):
 p=deepcopy(b[template]);
 for x in p.findall('.//w:sectPr',NS):x.getparent().remove(x)
 for x in p.findall('.//w:bookmarkStart',NS)+p.findall('.//w:bookmarkEnd',NS):x.getparent().remove(x)
 return text(p,plain(s))
def insert_after(ref,nodes):
 at=body.index(ref)+1
 for p in nodes:body.insert(at,p);at+=1
def replace(i,nodes):
 at=body.index(b[i]);body.remove(b[i])
 for p in nodes:body.insert(at,p);at+=1
def blank(i):put(i,'')
bookmark_id=500
def bookmark(p,name):
 global bookmark_id
 bookmark_id+=1
 start=E.Element(w('bookmarkStart'),{w('id'):str(bookmark_id),w('name'):name})
 end=E.Element(w('bookmarkEnd'),{w('id'):str(bookmark_id)})
 p.insert(1 if p.find('w:pPr',NS) is not None else 0,start);p.append(end)
def pageref(p,name):
 text(p,'');f=E.SubElement(p,w('fldSimple'),{w('instr'):f' PAGEREF {name} \\h ',w('dirty'):'true'})
 r=E.SubElement(f,w('r'));E.SubElement(r,w('t')).text=''
def newtable(headers,rows,widths=None):
 t=deepcopy(b[80]);oldrows=t.findall('w:tr',NS);rh=deepcopy(oldrows[0]);rb=deepcopy(oldrows[1])
 for r in oldrows:t.remove(r)
 widths=widths or [10080//len(headers)]*len(headers)
 grid=t.find('w:tblGrid',NS)
 for x in list(grid):grid.remove(x)
 for width in widths:E.SubElement(grid,w('gridCol'),{w('w'):str(width)})
 for j,vals in enumerate([headers]+rows):
  r=deepcopy(rh if j==0 else rb);cells=r.findall('w:tc',NS);seed=deepcopy(cells[0])
  for x in cells:r.remove(x)
  for k,val in enumerate(vals):
   cell=deepcopy(seed);pr=cell.find('w:tcPr',NS)
   if pr is not None:
    for bad in pr.findall('w:gridSpan',NS)+pr.findall('w:vMerge',NS):pr.remove(bad)
    wid=pr.find('w:tcW',NS)
    if wid is not None:wid.set(w('w'),str(widths[k]))
   ps=cell.findall('w:p',NS);p=ps[0]
   for other in ps[1:]:cell.remove(other)
   text(p,str(val));r.append(cell)
  for h in r.findall('.//w:trHeight',NS):h.getparent().remove(h)
  t.append(r)
 return t

# Read verified data tables and references from the previous report source.
tree=ast.parse((ROOT/'tmp/build_capstone_report.py').read_text(encoding='utf8'))
datasets={};references=[]
for st in tree.body:
 if isinstance(st,ast.Expr) and isinstance(st.value,ast.Call) and isinstance(st.value.func,ast.Name) and st.value.func.id=='table':
  call=st.value
  if len(call.args)>3:
   try:datasets[ast.literal_eval(call.args[3])]=(ast.literal_eval(call.args[0]),ast.literal_eval(call.args[1]))
   except (ValueError,TypeError):pass
 if isinstance(st,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='refs' for t in st.targets):references=ast.literal_eval(st.value)

put(2,'           SmartPharm')
for i,s in {9:'Neev Borana [07] [EU1246063]',10:'Romit Meher [32] [EU1226023]',11:'Rohit Gorhekar [15] [EU1246019]',16:'__________________________',17:'__________________________'}.items():put(i,s)
put(32,'This is to certify that Neev Borana [EU1246063], Romit Meher [EU1226023] and Rohit Gorhekar [EU1246019] are bonafide students of the Department of Artificial Intelligence and Machine Learning, St. John College of Engineering and Management. They have submitted the project SmartPharm for evaluation during the academic year 2026-2027.')
for t in b[35].findall('.//w:t',NS):
 if t.text and ('Guide Name' in t.text or 'HOD Name' in t.text):t.text='_______________________'
put(55,'Neev Borana / Romit Meher / Rohit Gorhekar')
put(63,'We also acknowledge all the faculty members and laboratory staff of the Department of Artificial Intelligence and Machine Learning for their timely assistance, cooperation, and technical support.')
put(62,'We would like to express our sincere appreciation to our project guide, __________________________, for guidance, constructive suggestions and support throughout the project.')
put(66,'Group Members')
for i,name in [(67,'Neev Borana'),(68,'Romit Meher'),(69,'Rohit Gorhekar')]:
 put(i,name)

content={
106:'SmartPharm is a pharmacy management web application that connects medicine stocking, batch-level inventory, billing, procurement, prescription review and operational insight. A medicine identity is separated from its manufactured batches and from physical quantity at a storage location. This distinction supports changing batch prices and expiry dates.',
109:'The project addresses repeated manual entry and disconnected medicine, inventory and billing records.',
110:'Existing problem: staff must identify the intended medicine while tracking strength, batch, expiry and physical availability.',
111:'Industrial issue: product-level stock totals do not explain differences between batch prices, expiry dates or shelf locations.',
112:'Research gap: OCR output alone does not establish a saleable medicine identity or a valid stock transaction.',
113:'Need for improvement: connect reviewed identification with catalogue matching, FEFO billing and traceable stock changes.',
116:'The project supports consistent pharmacy records and reduces repeated typing through barcode input, camera capture and document reading. Human review and manual search keep uncertain recognition recoverable.',
119:'Develop an integrated pharmacy workflow that remains usable when optional recognition or network services cannot provide a reliable result.',
120:'Maintain separate medicine, batch and location-stock records with store-scoped access.',
121:'Provide barcode lookup and working review-assisted photo recognition for medicine entry and billing.',
122:'Apply FEFO allocation and validate stock and expiry before accepting a sale.',
123:'Support reviewed procurement, eligible returns and audited stock adjustments.',
124:'Present recent activity, expiry alerts and explainable replenishment estimates.',
125:'Verify stock/payment invariants, offline replay behaviour and responsive user interfaces.',
128:'The project covers counter and back-office workflows for a pharmacy chain installation.',
129:'Included: catalogue, inventory, POS, purchases, suppliers, prescriptions, returns, shelf locations, staff access, expenses and dashboard.',
130:'Boundary: recognition assists review; it does not independently prescribe or make final dispensing decisions.',
131:'Future expansion includes independently evaluated image recognition, physical-device testing, backup restoration exercises and longer-history forecast validation.',
134:'The project provides a deployed web prototype with connected business records and a repeatable classroom demonstration.',
135:'Working prototype: responsive browser interface and PWA installation support.',
136:'Software: Next.js / React frontend, Flask APIs, Aiven MySQL business records and Aiven PostgreSQL AI references.',
137:'Demonstration: eight medicines represented by sixteen paired package photos.',
138:'Traceability: medicine, batch, location, sale and purchase records remain distinct.',
139:'Operational output: recent invoice chart, low-stock and expiry alerts, purchase drafts and reorder estimates.',
140:'Verification output: scoped automated tests and deployed browser checks.',
141:'Academic contribution: integration of reviewed recognition with transactional pharmacy operations.',
146:'Seven primary research papers are surveyed on OCR, scene-text detection, handwriting, document layout and retrieval-augmented generation. Findings describe the cited research rather than measured SmartPharm recognition accuracy.',
149:'The literature comparison follows the prescribed paper, author, year, method, findings and research-gap structure.',
151:'The selected papers combine foundational recognition research with recent OCR and document-understanding work.',
154:'Previous research provides strong methods for recognising text and representing document content.',
155:'CRNN and Transformer recognisers turn image regions into text; detection methods locate candidate text regions.',
156:'Unresolved application concerns include reflective medicine foil, rotated labels, ambiguous handwriting and linking extracted text to verified store stock.',
157:'SmartPharm addresses the integration gap with catalogue evidence, manual recovery, review before confirmation and batch-aware transactions.',
160:'The engineering contribution is a connected review workflow rather than a new OCR architecture.',
161:'Medicine entry and billing share reviewed identity mappings and barcode aliases.',
162:'Purchase drafts are separate from accepted physical intake; FEFO billing uses recorded batch expiry.',
163:'A low-evidence scan leads to recapture or manual search rather than an invented medicine identity.',
168:'A Next.js and React frontend communicates with Flask APIs over HTTPS. SQLAlchemy services validate and persist business operations in Aiven MySQL. Aiven PostgreSQL supports AI reference/vector retrieval. Optional Google Gemini and Tavily integrations assist handwriting and reference search.',
171:'1. Sign in and retrieve the current store and role. 2. Enter a medicine manually or read a barcode/package. 3. Review identity and batch details before stock entry. 4. Select a stocked medicine and quantity in POS. 5. Validate saleable batches and allocate FEFO stock. 6. Commit sale, tender records and stock deduction together. 7. Review dashboard alerts, purchase drafts and eligible returns.',
179:'Implementation uses incremental service, API, UI and regression-test changes.',
180:'The design preserves authoritative business data and separates optional recognition results from confirmed stock.',
181:'Design procedure: model medicine identity, batch pricing/expiry, location quantities and transaction links.',
182:'Experimental procedure: prepare isolated fixtures, exercise deterministic operations, inspect deployed read-only paths and review scan outcomes.',
183:'Algorithms: catalogue evidence matching, barcode alias lookup, FEFO allocation, adaptive moving-average demand estimation and Ridge regression when sufficient selling-day history exists.',
184:'Physical workflow: compare actual delivered quantities with invoice drafts before accepting stock.',
185:'Programming steps: implement validation and service transactions; expose authenticated routes; connect review forms; add focused tests; build and verify deployment.',
188:'The principal implementation components are listed below.',
194:'Work packages comprise requirements/schema, transactional services, responsive UI, camera/document input, billing and returns, planning views, deployment, tests and academic documentation.',
196:'Suggested semester milestones are shown below; this is a planning schedule, not a retrospectively measured development log.',
199:'The group members participate in project review and demonstration. Individual development contributions should be confirmed with the project guide.',
208:'Established web, database and OCR libraries make the prototype technically feasible. Manual search remains available when recognition is uncertain. MySQL is used for business persistence and PostgreSQL for AI/reference data. Production services are containerised on Google Cloud Run.',
210:'Existing computers and a camera can be reused. Costs depend on hosting, database plans, image volume, API quotas, backups and printing. Free tiers can support a classroom demo but are not permanent cost guarantees.',
212:'Staff must understand batch entry, quantity units, expiry eligibility and reconciliation. The interface supports phone/desktop layouts and review before state changes. Physical-device and operational-load evaluation remain separate from isolated tests.',
217:'No dedicated manufactured hardware assembly is required. A computer or supported phone browser, network connection and camera are sufficient for the core demonstration; a keyboard-style barcode scanner is optional.',
220:'The expected outcomes below are supported by implemented review flows and the scoped verification evidence in the appendix.',
221:'The project presents recognition as a working review-assisted feature, with a recovery path for uncertain input.',
222:'Prototype: connected catalogue, stocking, FEFO billing, purchases, returns and operational dashboard.',
223:'Accuracy: exact mapped barcode lookup and evidence-based candidate review; independent image-recognition accuracy is not expressed as an untested percentage.',
224:'Efficiency: reduce repeated entry through camera, barcode, catalogue search and editable invoice/prescription drafts.',
225:'Performance: use bounded public-asset PWA caching, fresh protected requests and a simpler forecast baseline for short history.',
226:'Simulation: labelled synthetic sales, suppliers, customers, purchase drafts and expenses populate the demonstration.',
227:'Verification: focused tests check balanced stock/payment import, idempotency, sparse forecasts, camera lifecycle and browser layout.',
228:'Detailed test cases, recorded outcomes, API integrations and actual frontend screenshots are included in the appendices.',
233:'Batch-level stock, reviewed procurement, expiry handling and consistent transaction history are relevant to physical pharmacy operations.',
235:'Structured records and pharmacist review can support safer data entry. The project does not replace professional clinical judgement or establish measured patient outcomes.',
237:'Expiry visibility and replenishment planning may help reduce avoidable disposal. Digital records can reduce routine paper use. No carbon or waste-reduction measurement is claimed.',
239:'The following SDG connections are qualitative project mappings.',
240:'SDG 3: organised medicine records and pharmacist verification.',
241:'SDG 9: connected web and data infrastructure for operations.',
242:'SDG 12: expiry review and demand-informed stock planning.',
243:'Operational impact depends on accurate data and staff procedures.',
244:'Cloud/model resource use should be monitored alongside potential paper savings.',
245:'Sustainability outcomes require measurement during real operational use.',
249:'SmartPharm connects pharmacy records through reviewed identification and batch-aware operations.',
250:'The problem is inconsistent identity, expiry and quantity information across disconnected workflows.',
251:'The solution integrates barcode/photo assistance, a store catalogue, FEFO billing, reviewed intake and traceable transactions.',
252:'The contribution is a deployed academic prototype with repeatable demo records and scoped verification. Future work includes recognition evaluation across capture conditions, longer-history forecasts, concurrent-terminal testing and backup restoration.',
256:'The following references use numbered citations corresponding to the literature survey.',
257:'Research papers',
266:'The following appendices contain additional labelled diagrams, API integrations, verification cases and eight actual frontend screens.',
267:'Additional diagrams',268:'API and integration inventory',269:'Working methodology and test cases',270:'Frontend screenshots'
}
for i,s in content.items():put(i,s)

# Abstract body uses the source body paragraph style rather than a new design.
abstract=[
'SmartPharm is a web-based pharmacy management project that connects medicine stocking, batch inventory, POS billing, procurement, prescription review and operational insight. The design separates a medicine identity from its manufactured batch and from the physical quantity stored at a location.',
'The implementation uses a Next.js / React / TypeScript frontend, Flask and SQLAlchemy APIs, Aiven MySQL for business records and Aiven PostgreSQL for AI/reference data. Barcode input, camera capture and packaging OCR provide working review-assisted identification. Prescription and invoice reading produce editable drafts for verification.',
'Billing validates stock and expiry, allocates eligible batches in FEFO order and commits stock, sale and payment records together. Dashboard views show recent invoices, stock and expiry alerts, purchase drafts and replenishment estimates. PWA support provides installation controls and a safe reconnect experience.',
'The classroom demonstration contains eight medicines and sixteen paired package photos, with labelled synthetic transactions. Verification includes focused automated tests and deployed browser checks. Recognition output remains subject to human review; no untested accuracy percentage or autonomous clinical capability is claimed.'
]
insert_after(b[72],[clonep(x) for x in abstract])

survey=[
['[1] CRNN','Shi, Bai and Yao','2015','CNN + recurrent sequence recognition','End-to-end image text sequence modelling','Text must still be linked to a valid medicine identity.'],
['[2] Differentiable Binarization','Liao et al.','2019 / 2020','Learned text-region binarisation','Efficient scene text detection','Detection is not product identification.'],
['[3] PP-OCR','Du et al.','2020','Lightweight detector, direction classifier, recogniser','Practical OCR pipeline','Foil, rotation and glare need application handling.'],
['[4] TrOCR','Li et al.','2021','Pretrained image and text Transformers','Printed and handwritten transcription','Ambiguous names/directions require review.'],
['[5] LayoutLMv3','Huang et al.','2022','Unified text/image masking and alignment','Document layout and content representation','Project uses OCR layout parsing, not this whole model.'],
['[6] PaddleOCR 3.0','Cui et al.','2025','OCR, structured parsing and extraction','Maintained document processing toolkit','Toolkit benchmarks do not establish project accuracy.'],
['[7] RAG','Lewis et al.','2020','Generator with retrieved external memory','Grounded knowledge-intensive generation','Retrieved content still needs validation and provenance.']]
replace(150,[newtable(['Paper','Author','Year','Method','Findings','Research Gap'],survey,[1350,1200,800,2050,2200,2480])])

def use_table(i,caption,widths=None):
 headers,rows=datasets[caption];replace(i,[newtable(headers,rows,widths)])
use_table(189,'Table 5.1 Software and hardware resources',[2300,7780])
# Correct task ownership slot with the group identity, not invented allocations.
replace(200,[newtable(['Student','PID','Responsibility'],[['Neev Borana','EU1246063','Group review and demonstration; individual allocation to be confirmed.'],['Romit Meher','EU1226023','Group review and demonstration; individual allocation to be confirmed.'],['Rohit Gorhekar','EU1246019','Group review and demonstration; individual allocation to be confirmed.']],[2200,1800,6080])])
use_table(203,'Table 4.2 Project risk assessment',[2600,2400,5080])
gh,gr=datasets['Table 4.1 Suggested semester milestone chart'];insert_after(b[196],[newtable(gh,gr,[3000,1180,1180,1180,1180,1180,1180])])
replace(214,[newtable(['Item','Quantity','Cost basis'],[['Existing development computer','As available','Existing resource; invoice not supplied.'],['Camera / scanner','Camera; optional scanner','Reuse available equipment; quote if purchased.'],['Cloud and database services','Usage / plan based','Monitor actual billing and quota.'],['API services','Optional usage','Free-tier eligibility and paid rates can change.'],['Printing and binding','2 group copies','Obtain local print-shop quotation.']],[3000,1900,5180])])
for i,ref in zip(range(258,263),references[:5]):put(i,ref)
insert_after(b[262],[clonep(x) for x in references[5:]])

# Image paragraphs use native inline OOXML; original image relationships remain intact.
new_parts={};image_no=1000
def picture(path,width=6.4):
 global image_no
 image_no+=1;im=Image.open(path);iw,ih=im.size
 cx=int(width*914400);cy=int(cx*ih/iw)
 rid=f'rIdSmartPharm{image_no}';name=f'smartpharm-{image_no}.png'
 new_parts['word/media/'+name]=Path(path).read_bytes()
 E.SubElement(rels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship',Id=rid,Type=NS['r']+'/image',Target='media/'+name)
 xml=f'''<w:p xmlns:w="{NS['w']}" xmlns:r="{NS['r']}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:pPr><w:jc w:val="center"/><w:keepNext/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{image_no}" name="{name}" descr="SmartPharm labelled diagram or actual frontend screenshot"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'''
 return E.fromstring(xml.encode())
def cap(s):
 p=clonep(s);pr=p.find('w:pPr',NS)
 if pr is None:pr=E.Element(w('pPr'));p.insert(0,pr)
 jc=pr.find('w:jc',NS)
 if jc is None:jc=E.SubElement(pr,w('jc'))
 jc.set(w('val'),'center');return p
def heading(s):return clonep(s,template=173)
def pagebreak():
 p=E.Element(w('p'));r=E.SubElement(p,w('r'));E.SubElement(r,w('br'),{w('type'):'page'});return p
def figure(page,bottom,label,refname):
 im=Image.open(OUT/'qa'/f'page-{page:02}.png')
 im=im.crop((42,215,870,int((155+bottom*.82+8)*1.5)))
 target=AS/f'original-format-diagram-{page}.png';im.save(target)
 p=picture(target);bookmark(p,refname)
 return [p,cap(label)]
replace(174,figure(13,546,'Figure 1 System Architecture','fig_architecture'))
replace(177,figure(19,575,'Figure 2 Recognition Flowchart','fig_flowchart'))
diagrams=[(14,525,'Activity Diagram','fig_activity'),(15,478,'DFD 0 Context Diagram','fig_dfd0'),(16,575,'DFD 1 Major Processes','fig_dfd1'),(17,590,'DFD 2 Billing Decomposition','fig_dfd2'),(18,590,'System Flow','fig_systemflow'),(20,515,'Functional Flow','fig_functional'),(21,580,'Core Data Model','fig_data'),(27,540,'Test Case Verification Diagram','fig_test')]
nodes=[]
for num,(page,bottom,label,refname) in enumerate(diagrams,start=3):nodes.extend([heading(label)]+figure(page,bottom,f'Figure {num} {label}',refname))
insert_after(b[267],nodes)

api_nodes=[]
for title in ['Table 3.1 Business API inventory','Table 3.2 Recognition and support APIs']:
 h,r=datasets[title];api_nodes.extend([clonep(title),newtable(h,r,[1800,4600,3680])])
api_nodes.extend([clonep('External integrations: Google Gemini for optional handwriting/coplan synthesis; Tavily for optional medicine-reference search; Aiven MySQL and PostgreSQL for server-side persistence; Google Cloud Run, Cloud Build, Artifact Registry and Secret Manager for hosting and configuration. Browser integrations include ZXing, camera permission, optional speech recognition and PWA APIs. No payment-gateway settlement or automatic supplier ordering is claimed.')])
text(api_nodes[-1],''.join(api_nodes[-1].xpath('.//w:t/text()',namespaces=NS)).replace('coplan','copilot'))
insert_after(b[268],api_nodes)
th,tr=datasets['Table 6.1 Representative test cases']
test_nodes=[clonep('Verification combines isolated transactional tests, frontend tests, read-only live-service checks and browser interaction checks. The focused demo/ML group passed 7 tests and the frontend suite passed 28 tests. The frontend production build/type check passed; lint recorded 0 errors and 81 existing warnings. These are scoped recorded checks, not exhaustive or clinical validation.'),newtable(th,tr,[900,2900,3500,2780]),clonep('Demonstration data: eight active medicines with sixteen front/back photographs; fifty added synthetic sales, twelve fictional customers, three fictional suppliers, five purchases including three drafts, six expenses and three new near-expiry batches. The isolated seed fixture balances 480 - 217 + 20 = 283 units; later live transactions can change stock.')]
insert_after(b[269],test_nodes)
screen_names=['01-login.png','02-dashboard.png','03-pos.png','04-inventory.png','05-medicines.png','06-purchases.png','07-prescriptions.png','08-expiry.png']
screen_titles=['Sign In','Dashboard','POS Billing Terminal','Inventory and Batches','Medicines Catalogue','Purchases and Invoices','Prescription Workspace','Expiry Management']
screen_nodes=[]
for n,(file,title) in enumerate(zip(screen_names,screen_titles),start=11):
 p=picture(AS/file);bookmark(p,f'fig_screen{n-10}')
 screen_nodes.extend([heading(title),p,cap(f'Figure {n} {title} Actual Frontend'),clonep('Actual deployed frontend captured on 26 October 2026. The screenshot documents visible functionality with classroom demonstration records; it does not submit a payment or stock operation.')])
insert_after(b[270],screen_nodes)

# Replace sample figure and table indexes while retaining their original styles.
fig_entries=[('1','System Architecture','fig_architecture'),('2','Recognition Flowchart','fig_flowchart')]+[(str(n),label,refname) for n,(_,_,label,refname) in enumerate(diagrams,start=3)]+[(str(n),title,f'fig_screen{n-10}') for n,title in enumerate(screen_titles,start=11)]
figtable=newtable(['Figure No.','Figure Name','Page No.'],[[a,title,''] for a,title,_ in fig_entries],[1500,6880,1700])
for row,(_,_,refname) in zip(figtable.findall('w:tr',NS)[1:],fig_entries):pageref(row.findall('w:tc',NS)[2].find('w:p',NS),refname)
replace(85,[figtable])
tab_entries=[('1','Literature Review','table_lit'),('2','Components and Materials','table_components'),('3','Semester Planning','table_gantt'),('4','Roles and Responsibilities','table_roles'),('5','Risk Assessment','table_risks'),('6','Budget Estimation','table_budget'),('7','Business APIs','table_api'),('8','Recognition APIs','table_aiapi'),('9','Test Cases','table_tests')]
table_index=newtable(['Table No.','Table Name','Page No.'],[[a,title,''] for a,title,_ in tab_entries],[1500,6880,1700])
for row,(_,_,refname) in zip(table_index.findall('w:tr',NS)[1:],tab_entries):pageref(row.findall('w:tc',NS)[2].find('w:p',NS),refname)
replace(89,[table_index])
# Anchor the nearest preceding paragraph for table page references.
for table,refname in [(body[body.index(b[149])+1],'table_lit')]:bookmark(b[149],refname)
for i,name in [(188,'table_components'),(196,'table_gantt'),(199,'table_roles'),(202,'table_risks'),(213,'table_budget'),(268,'table_api'),(269,'table_tests')]:bookmark(b[i],name)
bookmark(api_nodes[2],'table_aiapi')
for i,name in [(83,'list_figures'),(87,'list_tables'),(91,'abbreviations')]:bookmark(b[i],name)
for i,name in [(76,'list_figures'),(77,'list_tables'),(78,'abbreviations')]:
 s=''.join(b[i].xpath('.//w:t/text()',namespaces=NS));put(i,s.rstrip('i')+'\t');f=E.SubElement(b[i],w('fldSimple'),{w('instr'):f' PAGEREF {name} \\h ',w('dirty'):'true'});E.SubElement(E.SubElement(f,w('r')),w('t')).text=''
for i,head in enumerate([104,144,166,192,206,219,231,248,255,265]):bookmark(b[head],f'chapter_{i+1}')
tocrows=b[80].findall('w:tr',NS)
if len(tocrows)==10:
 b[80].append(deepcopy(tocrows[-1]))
tocrows=b[80].findall('w:tr',NS)
for i,row in enumerate(tocrows[1:]):
 if i>=10:break
 cells=row.findall('w:tc',NS);pageref(cells[2].find('w:p',NS),f'chapter_{i+1}')
 # The source sample table merges chapters 6-7; align text with actual headings.
 if i<8:
  text(cells[0].find('w:p',NS),f'Chapter {i+1}')
  titles=['Introduction','Literature Review','Proposed Methodology','Project Planning','Resources & Feasibility','Expected Results','Sustainability & Impact','Conclusion']
  text(cells[1].find('w:p',NS),titles[i])
 elif i==8:text(cells[0].find('w:p',NS),'References');text(cells[1].find('w:p',NS),'Numbered research references')
 elif i==9:text(cells[0].find('w:p',NS),'Appendices');text(cells[1].find('w:p',NS),'Diagrams, APIs, test cases and frontend screenshots')

# Keep every original section/page setting; request native Word field refresh.
settings=E.fromstring(parts['word/settings.xml']);up=settings.find('w:updateFields',NS)
if up is None:up=E.SubElement(settings,w('updateFields'))
up.set(w('val'),'true')
assert [E.tostring(x) for x in doc.findall('.//w:sectPr',NS)]==original_sections
changed={'word/document.xml':E.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True),'word/_rels/document.xml.rels':E.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True),'word/settings.xml':E.tostring(settings,xml_declaration=True,encoding='UTF-8',standalone=True)}
with ZipFile(FINAL,'w',ZIP_DEFLATED) as z:
 for info in infos:z.writestr(info,changed.get(info.filename,parts[info.filename]))
 for name,data in new_parts.items():z.writestr(name,data)
with ZipFile(FINAL) as z:
 preserved=[name for name in parts if name not in changed]
 assert all(z.read(name)==parts[name] for name in preserved)
 assert z.testzip() is None
out_text=' '.join(doc.xpath('//w:t/text()',namespaces=NS))
for value in ['Neev Borana','EU1246063','Romit Meher','EU1226023','Rohit Gorhekar','EU1246019']:assert value in out_text
assert source_hash==hashlib.sha256(REF.read_bytes()).hexdigest()
(OUT/'original-format-fidelity.json').write_text(json.dumps({'source_sha256':source_hash,'source_unchanged':True,'original_sections_preserved':len(original_sections),'styles_fonts_theme_numbering_footers_original_media_byte_identical':True,'unchanged_package_parts':preserved,'added_images':len(new_parts),'native_Word_field_refresh_requested':True,'render_status':'Native Word/LibreOffice renderer unavailable; inspect pagination in Word before printing.'},indent=2))
print(FINAL)
print('Original styles, margins, section settings, theme, footers and original media preserved byte-for-byte.')
