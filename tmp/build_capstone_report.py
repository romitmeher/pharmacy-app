from pathlib import Path
import math, json, hashlib
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.utils import ImageReader
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/capstone-report'; AS=OUT/'assets';OUT.mkdir(parents=True,exist_ok=True)
FILE=OUT/'SmartPharm_Capstone_Project_Report_2026_27.pdf'
W,H=612,792; L=54; R=558; CW=504
INK=colors.HexColor('#162b29'); GRAY=colors.HexColor('#565d5c'); LIGHT=colors.HexColor('#eef1ef')
styles={
 'body':ParagraphStyle('body',fontName='Times-Roman',fontSize=12,leading=16,spaceAfter=9,alignment=TA_JUSTIFY),
 'small':ParagraphStyle('small',fontName='Times-Roman',fontSize=10,leading=13,spaceAfter=7),
 'head':ParagraphStyle('head',fontName='Times-Bold',fontSize=18,leading=23,spaceAfter=17),
 'sub':ParagraphStyle('sub',fontName='Times-Bold',fontSize=12,leading=16,spaceAfter=7),
 'center':ParagraphStyle('center',fontName='Times-Roman',fontSize=12,leading=17,alignment=TA_CENTER),
 'caption':ParagraphStyle('caption',fontName='Times-Italic',fontSize=10,leading=13,alignment=TA_CENTER),
 'cell':ParagraphStyle('cell',fontName='Times-Roman',fontSize=10,leading=13),
 'cellhead':ParagraphStyle('cellhead',fontName='Times-Bold',fontSize=10,leading=13,textColor=colors.white),
 'node':ParagraphStyle('node',fontName='Helvetica',fontSize=10,leading=13,alignment=TA_CENTER),
 'label':ParagraphStyle('label',fontName='Helvetica',fontSize=8.5,leading=10.5,alignment=TA_CENTER),
}
c=canvas.Canvas(str(FILE),pagesize=(W,H));c.setTitle('SmartPharm Capstone Project Report 2026 27')
c.setAuthor('Neev Borana; Romit Meher; Rohit Gorhekar')
c.setSubject('Review assisted pharmacy management system with FEFO billing and document recognition')
PAGE=0;y=0;heads=[];figures=[];tables=[]
def para(text,style='body',width=CW,x=L,gap=7):
 global y
 p=Paragraph(text,styles[style]);_,h=p.wrap(width,900)
 if y-h<55: raise RuntimeError(f'Page {PAGE} overflow at {text[:60]} y={y} h={h}')
 p.drawOn(c,x,y-h);y-=h+gap
def sub(text):para(text,'sub',gap=3)
def new(title=None,chapter=None):
 global PAGE,y
 if PAGE:c.showPage()
 PAGE+=1;y=H-55
 if PAGE>1:
  c.setFont('Times-Roman',9);c.setFillColor(GRAY)
  c.drawString(L,H-28,'SMARTPHARM  |  CAPSTONE PROJECT')
  c.drawRightString(R,H-28,'Academic Year 2026-27')
  c.drawCentredString(W/2,30,str(PAGE));c.setFillColor(colors.black)
 if title:
  if chapter:para(chapter,'small',gap=3)
  para(title,'head',gap=15);heads.append((title,PAGE))
def center(text,size=12,bold=False,space=8):
 global y
 s=ParagraphStyle('cover',parent=styles['center'],fontName='Times-Bold' if bold else 'Times-Roman',fontSize=size,leading=size*1.35)
 p=Paragraph(text,s);_,h=p.wrap(CW,1000);p.drawOn(c,L,y-h);y-=h+space
def table(headers,rows,widths,caption=None,fs=10):
 global y
 cell=ParagraphStyle('c',parent=styles['cell'],fontSize=fs,leading=fs+3)
 data=[[Paragraph(escape(str(v)),styles['cellhead']) for v in headers]]
 data += [[Paragraph(escape(str(v)),cell) for v in row] for row in rows]
 t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('GRID',(0,0),(-1,-1),.45,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f5f6f5')])]))
 _,h=t.wrap(CW,900)
 if y-h<55:raise RuntimeError(f'Table overflow p{PAGE}: {caption} {y} {h}')
 t.drawOn(c,L,y-h);y-=h+10
 if caption:para(caption,'caption');tables.append((caption,PAGE))
def caption(text):
 para(text,'caption',gap=10);figures.append((text,PAGE))
def image(path,maxh=390):
 global y
 im=Image.open(path);iw,ih=im.size;scale=min(CW/iw,maxh/ih);w,h=iw*scale,ih*scale
 if y-h<55:raise RuntimeError('Image overflow')
 c.drawImage(ImageReader(im),L+(CW-w)/2,y-h,w,h,mask='auto');y-=h+12
def node(x,top,w,h,text,kind='process'):
 # Diagram coordinates are relative to the left margin and a top origin.
 yy=H-155-top*.82; xx=L+x; h=h*.82
 c.setStrokeColor(INK);c.setFillColor(colors.white);c.setLineWidth(.9)
 if kind=='decision':
  p=c.beginPath();p.moveTo(xx+w/2,yy);p.lineTo(xx+w,yy-h/2);p.lineTo(xx+w/2,yy-h);p.lineTo(xx,yy-h/2);p.close();c.drawPath(p,stroke=1,fill=1)
 elif kind=='entity': c.rect(xx,yy-h,w,h,stroke=1,fill=1)
 elif kind=='store':
  c.line(xx,yy,xx+w,yy);c.line(xx,yy-h,xx+w,yy-h);c.line(xx,yy,xx,yy-h)
 elif kind=='terminal': c.roundRect(xx,yy-h,w,h,h/2,stroke=1,fill=1)
 else:c.roundRect(xx,yy-h,w,h,7,stroke=1,fill=1)
 p=Paragraph(text,styles['node']);_,ph=p.wrap(w-12,h+40);p.drawOn(c,xx+6,yy-(h+ph)/2)
 return (x,top,w,h)
def arrow(points,label=None,lx=None,ly=None,lw=110):
 pts=[(L+x,H-155-t*.82) for x,t in points];c.setStrokeColor(INK);c.setFillColor(INK);c.setLineWidth(.8)
 p=c.beginPath();p.moveTo(*pts[0])
 for a,b in pts[1:]:p.lineTo(a,b)
 c.drawPath(p,stroke=1)
 ax,ay=pts[-2];bx,by=pts[-1];ang=math.atan2(by-ay,bx-ax);sz=5
 p=c.beginPath();p.moveTo(bx,by);p.lineTo(bx-sz*math.cos(ang-.5),by-sz*math.sin(ang-.5));p.lineTo(bx-sz*math.cos(ang+.5),by-sz*math.sin(ang+.5));p.close();c.drawPath(p,fill=1,stroke=0)
 if label:
  px=L+lx;py=H-155-ly*.82;p=Paragraph(label,styles['label']);_,ph=p.wrap(lw,200)
  c.setFillColor(colors.white);c.rect(px-2,py-ph-1,lw+4,ph+3,fill=1,stroke=0);p.drawOn(c,px,py-ph);c.setFillColor(colors.black)
def enddiagram(bottom,cap,explanation):
 global y
 y=H-155-bottom*.82-20;caption(cap);para(explanation,'small')

# The cover follows the supplied synopsis's college identity and student block.
new();image(AS/'image2.jpeg',maxh=100);y-=25
center('CAPSTONE PROJECT REPORT',18,True,15)
center('SmartPharm',25,True,4)
center('Review Assisted Pharmacy Management<br/>with Computer Vision and Intelligent Inventory',17,True,20)
center('Submitted in partial fulfilment of the requirements of the degree of',12,False,4)
center('Bachelor of Engineering',14,True,2);center('in',12,False,2)
center('Artificial Intelligence and Machine Learning',14,True,14);center('by',12,False,8)
for name in ['Neev Borana &nbsp;&nbsp; [07] &nbsp;&nbsp; [EU1246063]','Romit Meher &nbsp;&nbsp; [32] &nbsp;&nbsp; [EU1226023]','Rohit Gorhekar &nbsp;&nbsp; [15] &nbsp;&nbsp; [EU1246019]']:center(name,14,True,3)
y-=13;center('Under the Guidance of',12,False,12);center('________________________________',12,False,3)
center('Department of Artificial Intelligence and Machine Learning',11,False,14)
center('ST. JOHN COLLEGE OF ENGINEERING AND MANAGEMENT',12,True,3)
center('UNIVERSITY OF MUMBAI',12,True,7);center('Academic Year 2026-27',13,True)

new('Certificate of Approval')
para('This is to certify that <b>Neev Borana [EU1246063], Romit Meher [EU1226023] and Rohit Gorhekar [EU1246019]</b>, students of the Department of Artificial Intelligence and Machine Learning, St. John College of Engineering and Management, have submitted the capstone project entitled <b>SmartPharm Review Assisted Pharmacy Management with Computer Vision and Intelligent Inventory</b> for academic evaluation during the academic year 2026-27.')
para('This certificate is to be completed and signed by the authorised college representatives following examination and approval.')
y-=35
for label in ['Project Guide','Head of Department','Principal','External Examiner']:
 sub(label);para('Name and designation: __________________________________________','body');para('Signature: ________________________    Date: ____________________','body');y-=8

new('Declaration')
para('We declare that this report describes our capstone project SmartPharm. Ideas, methods and published work used from other authors are acknowledged through numbered references. Open-source libraries, cloud platforms and model services are identified separately from the application functionality developed for this project.')
para('We understand that academic integrity requires accurate reporting of implementation, observations and test outcomes. Demonstration transactions are fictional records used to explain system behaviour. They are not evidence of actual pharmacy sales, clinical validation or commercial deployment at a licensed pharmacy.')
para('We further declare that this submission does not present assistance from optical character recognition or generative AI as a substitute for professional verification. Final medicine selection and dispensing decisions remain subject to an authorised pharmacist and applicable requirements.')
y-=30
table(['Student','PID','Signature'],[['Neev Borana','EU1246063','________________'],['Romit Meher','EU1226023','________________'],['Rohit Gorhekar','EU1246019','________________']],[180,135,189])
para('Place: ________________________<br/><br/>Date: _________________________')

new('Acknowledgement')
para('We thank St. John College of Engineering and Management and the Department of Artificial Intelligence and Machine Learning for the academic setting in which this capstone project has been developed.')
para('We acknowledge the guidance of our project supervisor, the departmental faculty and the laboratory staff. Their review and practical feedback support the organisation, implementation and presentation of our work.')
para('We acknowledge the researchers whose work on optical character recognition, document understanding and retrieval augmented generation informed the technical study. We also acknowledge the maintainers of the open-source frameworks and tools listed in this report.')
para('We thank our families and classmates for their encouragement during development and demonstration preparation.')
y-=25
para('<b>Neev Borana<br/>Romit Meher<br/>Rohit Gorhekar</b>')
para('Department of Artificial Intelligence and Machine Learning<br/>Academic Year 2026-27')

new('Abstract')
para('SmartPharm is a web-based pharmacy management project that connects medicine stocking, batch-level inventory, point-of-sale billing and operational review. It addresses the difficulty of managing medicine identity, changing batch prices, expiry dates, shelf locations and sales records across separate manual workflows. The design separates a medicine catalogue entry from a manufactured batch and from the quantity physically stored at a location.')
para('The implemented system uses a Next.js and React frontend with a Flask and SQLAlchemy backend. Aiven MySQL stores business transactions, while Aiven PostgreSQL supports AI reference and vector data. Barcode input, camera capture and packaging OCR provide assisted identification. Candidates are checked against the store catalogue and presented for human review. Prescription digitisation provides editable draft rows, and supplier invoice processing supports review before physical stock is accepted.')
para('Billing applies first-expiring-first-out selection and records stock deductions with the sale transaction. Dashboard functions show stock and expiry alerts, purchase drafts and recent invoice activity. Demand estimation and reorder calculations support planning, with a moving-average fallback for sparse sales history. PWA support provides installation controls, bounded public-asset caching and a safe reconnect page.')
para('The classroom demonstration uses eight medicines represented by sixteen front-and-back package photographs, with labelled synthetic activity for dashboard presentation. Verification combines automated tests, read-only checks against the deployed service, browser layout checks and direct observation of the recognition workflow. Recognition output remains review-assisted; benchmark-level identification accuracy and physical-device performance require separate evaluation.')
para('<b>Keywords</b> Pharmacy management, FEFO, OCR, barcode, inventory, human verification, PWA, document digitisation.','small')

new('Contents')
table(['Section','Page'],[
 ['Certificate of Approval','2'],['Declaration','3'],['Acknowledgement','4'],['Abstract','5'],['List of Figures and Abbreviations','7'],
 ['Chapter 1 Introduction','8-9'],['Chapter 2 Literature Review','10-11'],['Chapter 3 Proposed Methodology and System Design','12-24'],['Chapter 4 Project Planning','25'],['Chapter 5 Resources and Feasibility','26'],['Chapter 6 Verification and Frontend Screens','27-37'],['Chapter 7 Sustainability and Impact','38'],['Chapter 8 Conclusion and Future Scope','39'],['References','40-41'],['Appendix Examination and Demonstration Guide','42']],[420,84])
para('The diagram sequence includes activity, DFD 0, DFD 1, DFD 2, system flow, flowchart and functional flow. Eight actual frontend screens appear in Chapter 6.','small')

new('List of Figures and Abbreviations')
table(['Figure','Description','Page'],[
 ['3.1','System architecture','13'],['3.2','Activity diagram with responsibility lanes','14'],['3.3','DFD 0 context diagram','15'],['3.4','DFD 1 major business processes','16'],['3.5','DFD 2 decomposition of POS billing','17'],['3.6','System flow and deployment boundaries','18'],['3.7','Recognition decision flowchart','19'],['3.8','Functional flow through stocking and billing','20'],['3.9','Core entity relationship model','21'],['6.1','Test case and verification flow','27'],['6.2-6.9','Eight frontend screenshots','30-37']],[54,400,50],fs=9.5)
sub('Abbreviations')
para('<b>AI</b> Artificial Intelligence; <b>API</b> Application Programming Interface; <b>DFD</b> Data Flow Diagram; <b>FEFO</b> First Expiring First Out; <b>GST</b> Goods and Services Tax; <b>JWT</b> JSON Web Token; <b>ML</b> Machine Learning; <b>OCR</b> Optical Character Recognition; <b>POS</b> Point of Sale; <b>PWA</b> Progressive Web App; <b>RAG</b> Retrieval Augmented Generation; <b>ROI</b> Region of Interest; <b>UML</b> Unified Modeling Language.','small')
sub('List of Tables')
para('1.1 Functional requirements (p. 9); 2.1-2.2 Literature comparison (pp. 10-11); 3.1-3.2 API inventory (pp. 23-24); 4.1 Milestones and 4.2 Risks (p. 25); 5.1 Resources (p. 26); 6.1 Test cases (p. 28); 6.2 Demo data (p. 29); 7.1 SDG mapping (p. 38); R.1 Evidence inventory (p. 41); A.1 Demo sequence (p. 42).','small')

new('Introduction','CHAPTER 1')
sub('1.1 Background')
para('A physical pharmacy must identify the correct product, locate saleable stock, respect batch expiry, record payment and retain an auditable history. A brand may have several strengths and package sizes, while successive batches can have different purchase prices and maximum retail prices. A single product-level stock number cannot explain these differences.')
para('Manual registers and disconnected spreadsheets require staff to repeat entry of medicine names, batch numbers and invoice quantities. This raises the chance of inconsistent records and makes expiry review difficult. Computer vision can reduce typing, but printed foil, glare, rotated text and handwriting make automatic recognition uncertain. SmartPharm therefore combines assisted input with explicit review rather than making recognition the authority for a sale.')
sub('1.2 Problem Statement')
para('The project problem is to connect medicine entry, physical inventory and billing in a single traceable workflow while allowing staff to use barcodes, images or manual search. The system must preserve the medicine-batch-location hierarchy, stop invalid stock operations and make failed recognition recoverable without guessing a product.')
sub('1.3 Need of the Project')
para('The project provides an integrated academic prototype for Indian pharmacy counter operations. It demonstrates how database constraints, role-based access, transaction handling and human verification can be combined with OCR and inventory estimates. Dashboard alerts provide a practical view of expiry and replenishment needs using stored transaction records.')
sub('1.4 Scope Boundary')
para('The implemented scope covers a pharmacy chain installation with store-scoped operations. It includes management assistance and record keeping. It does not establish a clinically validated diagnosis, prescribe treatment, guarantee medicine equivalence, or certify regulatory compliance. The classroom dataset is deliberately limited to eight active demonstration medicines.')

new('Objectives and Requirements')
sub('1.5 Project Objectives')
para('The principal objective is to build a connected pharmacy workflow that remains usable when optional recognition services cannot produce a reliable result. Specific objectives are to maintain distinct medicine, batch and inventory records; support barcode and review-assisted photo entry; apply FEFO billing; make purchase acceptance and returns traceable; expose stock and expiry information; and verify the important stock and payment invariants.')
table(['ID','Functional requirement','Expected behaviour'],[
 ['FR1','Authentication and staff roles','Allow authorised actions for owner, manager, pharmacist, cashier and inventory staff.'],
 ['FR2','Medicine and stock entry','Record identity, ingredients, aliases, batch expiry, prices, location and quantity separately.'],
 ['FR3','Assisted recognition','Read barcode or package text; show candidate for review and allow manual correction.'],
 ['FR4','Billing and returns','Choose saleable batches, commit sale and stock changes together, restrict eligible returns.'],
 ['FR5','Procurement and review','Keep purchase drafts separate from accepted physical intake.'],
 ['FR6','Operational insight','Show recorded sales, low stock, near expiry and explainable replenishment estimates.']
],[38,140,326],'Table 1.1 Functional requirements')
sub('1.6 Nonfunctional Requirements')
para('The interface should remain readable on phone and desktop screens. Authentication and sensitive business responses must not enter a general offline page cache. Production access uses HTTPS, server-side validation and environment-managed secrets. Recognition and network failures must leave existing records unchanged until a user confirms a valid operation. These are design requirements; full load and security certification remain separate activities.','small')

new('Literature Review','CHAPTER 2')
para('The survey covers seven primary research papers on scene text recognition, OCR pipelines, document structure and grounded generation. Foundational papers are included because their architectural ideas remain relevant to packaging and invoice processing. The findings below describe the cited research, not measured accuracy of SmartPharm.')
table(['Paper and year','Method and finding','Relevance and remaining gap'],[
 ['[1] Shi, Bai and Yao, 2015','CRNN combines convolutional features, recurrent sequence modelling and transcription for image text.','Explains image-to-text recognition. A recognised sequence still needs medicine identity, strength and stock validation.'],
 ['[2] Liao et al., 2019 / AAAI 2020','Differentiable binarisation learns an adaptive threshold within scene text detection.','Relevant to locating text regions. Detection alone cannot establish which medicine is present.'],
 ['[3] Du et al., 2020','PP-OCR combines lightweight detection, direction classification and recognition components.','Supports a practical OCR pipeline. Reflective foil and distorted package photographs still require application-level handling.'],
 ['[4] Li et al., 2021 preprint','TrOCR combines pretrained image and text Transformers for printed and handwritten text.','Motivates handwriting assistance. Transcription does not establish a safe dosage or resolve every ambiguous brand.']
],[112,192,200],'Table 2.1 Literature comparison part one',fs=10)
sub('2.1 Implications for Recognition')
para('These studies separate text detection from text recognition and demonstrate the value of learned sequence models. SmartPharm uses an available OCR toolkit rather than claiming to reproduce each research model. The application adds catalogue matching and a review step because a plausible OCR string is insufficient evidence for dispensing. Barcode lookup is preferred when a known identifier can be decoded.','small')

new('Document Understanding and Research Gap')
table(['Paper and year','Method and finding','Project relevance and gap'],[
 ['[5] Huang et al., 2022','LayoutLMv3 uses unified text/image masking and word-patch alignment for document representations.','Shows why invoice coordinates and visual structure matter. The project uses OCR layout parsing; it does not implement LayoutLMv3.'],
 ['[6] Cui et al., 2025','PaddleOCR 3.0 describes multilingual OCR, structured parsing and information extraction components.','Supports the choice of a maintained OCR ecosystem. Published benchmarks cannot be transferred to a local pharmacy dataset.'],
 ['[7] Lewis et al., 2020','RAG combines a pretrained generator with retrieved external information.','Motivates grounding the copilot in retrieved records. Retrieval does not guarantee correctness or grant permission to change stock.']
],[112,192,200],'Table 2.2 Literature comparison part two')
sub('2.2 Research Gap')
para('The papers concentrate on recognition or representation quality. A pharmacy workflow also needs store-specific identifiers, expiry-aware stock, transaction integrity and a clear response to ambiguous input. OCR benchmark success does not address whether a scanned medicine is currently stocked, whether its batch is expired, or whether a return should restore inventory.')
sub('2.3 Project Contribution')
para('SmartPharm integrates existing recognition capabilities with the operational medicine-batch-inventory model. Its application contribution is the connected review flow from stocking to billing, including barcode aliases, manual recovery, purchase verification, FEFO allocation and audit records. This is an engineering integration contribution; no novel OCR architecture or clinical accuracy result is claimed.')
sub('2.4 Evaluation Direction')
para('A later recognition study should separate training and test photographs by original package and capture session, report rejection rate as well as accepted-match precision, and test rotated, cropped, low-light and glare examples. The same photograph used as both a reference and a test is unsuitable evidence of generalisation.','small')

new('Proposed Methodology','CHAPTER 3')
sub('3.1 Proposed System')
para('A staff member signs in to the frontend. The application obtains authorised business data through Flask APIs. Business writes are validated and recorded in MySQL; AI references are maintained separately in PostgreSQL. Optional services support document reading and search, while the authoritative stock state remains in the business database.')
sub('3.2 Working Principle')
para('<b>Stocking:</b> enter or read a product label, search the catalogue and optional reference sources, review the medicine identity, then confirm batch and location quantities. A reference photo or matching result does not by itself create saleable stock.')
para('<b>Billing:</b> scan a known barcode, read packaging, or search manually. Review the selected medicine, enter a quantity and collect payment information. The server validates stock and batch expiry, allocates eligible inventory in FEFO order and commits the transaction. A pending local bill is not treated as a synchronised sale.')
para('<b>Document review:</b> invoice OCR produces editable candidate rows before physical intake is accepted. Prescription capture produces draft medicine rows, with ambiguous fields left for review. Optional Google handwriting processing is a separate third-party transfer of the selected image.')
sub('3.3 Development Method')
para('The implementation follows an incremental workflow: inspect existing routes and models, define the stock invariants, implement the service/API boundary, connect the UI, add focused regression tests and verify the deployed workflow. Unit tests use isolated test databases; read-only service checks inspect the Aiven-backed deployment. UI checks inspect both narrow and wide layouts.')
sub('3.4 Diagram Notation')
para('The following figures use labelled arrows. In DFDs, rectangular entities are outside the system, rounded processes transform data, and open-ended stores represent logical persisted records. The DFD stores are logical groups within MySQL, not additional physical databases. Activity and flow diagrams describe intended control paths, including rejection and manual recovery.','small')

new('System Architecture')
node(100,0,304,55,'Staff browser or installed PWA<br/>Next.js 16 - React 19 - TypeScript','entity')
node(100,105,304,62,'Flask REST APIs<br/>Authentication - validation - service layer')
node(0,230,235,62,'Transactional operations<br/>Stock - sales - purchases - returns')
node(275,230,229,62,'Assisted intelligence<br/>OCR - matching - forecasting - retrieval')
node(0,365,235,65,'Aiven MySQL<br/>Authoritative business records','store')
node(275,365,229,65,'Aiven PostgreSQL<br/>AI reference and vector records','store')
node(100,490,304,56,'Optional external services<br/>Google Gemini - Tavily search','entity')
arrow([(252,55),(252,105)],'HTTPS JSON and uploads',260,67,150)
arrow([(170,167),(170,205),(117,205),(117,230)])
arrow([(334,167),(334,205),(390,205),(390,230)])
arrow([(117,292),(117,365)],'Validated transactions',2,313,150)
arrow([(390,292),(390,365)],'Reference lookup',350,313,120)
arrow([(504,262),(520,262),(520,472),(355,472),(355,490)],'Optional requests',390,448,120)
enddiagram(546,'Figure 3.1 System architecture','The browser does not connect directly to either database. MySQL is the business source of truth; PostgreSQL supports reference retrieval. External AI and search responses return through server-side validation and user review.')

new('Activity Diagram')
for xx,ww,label in [(0,158,'STAFF'),(170,164,'APPLICATION'),(346,158,'DATABASE')]:
 c.setFillColor(LIGHT);c.rect(L+xx,H-180,ww,25,fill=1,stroke=0);c.setFillColor(colors.black);c.setFont('Helvetica-Bold',10);c.drawCentredString(L+xx+ww/2,H-172,label)
node(12,55,134,38,'Start session','terminal');node(183,55,138,38,'Authenticate user');node(358,55,134,38,'Read account / role','store')
node(12,150,134,50,'Scan code / photo<br/>or type medicine');node(183,150,138,50,'Read input and<br/>retrieve candidate');node(358,150,134,50,'Read catalogue<br/>and stock','store')
node(12,255,134,60,'Review identity<br/>and quantity');node(183,255,138,60,'Validate quantity,<br/>expiry and access');node(358,255,134,60,'Lock eligible<br/>inventory records')
node(12,370,134,50,'Confirm checkout');node(183,370,138,50,'Create sale and<br/>payment records');node(358,370,134,50,'Commit sale with<br/>stock deductions','store')
node(183,480,138,45,'Show receipt / status','terminal')
arrow([(146,74),(183,74)]);arrow([(321,74),(358,74)])
arrow([(79,93),(79,150)]);arrow([(146,175),(183,175)]);arrow([(321,175),(358,175)])
arrow([(252,200),(252,225),(79,225),(79,255)],'Candidate for review',80,208,130)
arrow([(146,285),(183,285)]);arrow([(321,285),(358,285)])
arrow([(79,315),(79,370)]);arrow([(146,395),(183,395)]);arrow([(321,395),(358,395)])
arrow([(425,420),(425,500),(321,500)])
enddiagram(525,'Figure 3.2 Activity diagram for a reviewed POS sale','Uncertain recognition returns to manual search or recapture before confirmation. Validation failure stops the write and displays a correction message. A receipt is shown only after the API returns the resulting transaction state.')

new('DFD 0 Context Diagram')
node(0,30,145,68,'E1 Staff / Pharmacist','entity');node(359,30,145,68,'E2 Customer','entity')
node(140,205,224,95,'0<br/>SmartPharm Pharmacy<br/>Management System')
node(0,410,145,68,'E3 Supplier','entity');node(359,410,145,68,'E4 Owner / Manager','entity')
arrow([(145,60),(252,60),(252,205)],'Login, scans, stock and sale details',158,75,160)
arrow([(140,252),(65,252),(65,98)],'Candidates, stock and operation status',0,150,130)
arrow([(359,80),(335,80),(335,205)],'Customer and payment details entered by staff',350,130,150)
arrow([(364,275),(430,275),(430,98)],'Receipt and return outcome',375,220,125)
arrow([(80,410),(80,345),(170,345),(170,300)],'Invoice and delivered goods details',0,355,160)
arrow([(210,300),(210,450),(145,450)],'Reviewed purchase record',150,385,125)
arrow([(359,445),(315,445),(315,300)],'Review, access and planning requests',340,350,160)
arrow([(364,250),(485,250),(485,410)],'Reports and alerts',382,290,120)
enddiagram(478,'Figure 3.3 DFD 0 context diagram','The system boundary contains pharmacy record processing. Customer and supplier information is entered by authorised staff; these arrows do not imply an online customer portal, payment gateway settlement or automatic supplier ordering.')

new('DFD 1 Major Processes')
node(0,0,125,45,'E1 Staff / E4 Owner','entity');node(185,0,140,45,'1.0 Authenticate<br/>and authorise');node(380,0,124,45,'D1 Accounts','store')
node(0,115,125,55,'E3 Supplier<br/>(via staff)','entity');node(185,110,140,65,'2.0 Maintain<br/>catalogue and stock');node(380,110,124,65,'D2 Catalogue<br/>D3 Inventory','store')
node(0,255,125,55,'E2 Customer<br/>(via staff)','entity');node(185,250,140,65,'3.0 Bill and<br/>process returns');node(380,250,124,65,'D4 Sales / returns<br/>D3 Stock changes','store')
node(185,390,140,65,'4.0 Review<br/>documents and<br/>purchase drafts');node(380,390,124,65,'D5 Purchases<br/>and suppliers','store')
node(185,520,140,55,'5.0 Produce alerts<br/>and operational views')
arrow([(125,22),(185,22)],'Credentials',125,0,60);arrow([(380,22),(325,22)],'Account / role',324,38,60)
arrow([(255,45),(255,110)],'Session scope',265,66,100)
arrow([(125,140),(185,140)],'Intake data',125,116,60);arrow([(325,140),(380,140)],'Identity / stock',325,175,65)
arrow([(125,280),(185,280)],'Bill items',125,254,60);arrow([(325,280),(380,280)],'Sale / stock',325,315,65)
arrow([(442,175),(442,212),(255,212),(255,250)],'Saleable batches',300,214,110)
arrow([(185,400),(150,400),(150,165),(185,165)],'Confirmed intake',27,360,115)
arrow([(125,150),(165,150),(165,440),(185,440)],'Invoice details',45,385,100)
arrow([(325,423),(380,423)],'Draft / accepted',325,455,65)
arrow([(442,315),(490,315),(490,547),(325,547)],'Sales and stock history',348,513,140)
arrow([(185,547),(-20,547),(-20,22),(0,22)],'Reports and operation status',0,470,130)
enddiagram(575,'Figure 3.4 DFD 1 major processes','D2 stores medicine identities and aliases. D3 stores batches, quantities and locations. D4 stores sales, tender records and returns. Processes share store-scoped records; separate DFD stores do not indicate separate business databases.')

new('DFD 2 POS Billing Decomposition')
node(0,0,130,50,'Staff bill request','entity');node(190,0,145,50,'3.1 Resolve code<br/>or reviewed medicine');node(385,0,119,55,'D2 Catalogue<br/>and aliases','store')
node(190,110,145,60,'3.2 Validate user,<br/>quantity and sale rules');node(385,110,119,60,'D1 Accounts<br/>D3 Inventory','store')
node(190,235,145,60,'3.3 Allocate eligible<br/>batches in FEFO order');node(385,235,119,60,'D3 Batch expiry<br/>and quantities','store')
node(190,365,145,65,'3.4 Persist sale,<br/>payments and stock<br/>in one transaction');node(385,365,119,65,'D4 Sale / payments<br/>D3 Stock changes','store')
node(190,515,145,50,'3.5 Return invoice<br/>or correction status');node(0,515,130,50,'Staff receipt view','entity')
arrow([(130,25),(190,25)],'Items / code',130,0,60);arrow([(385,25),(335,25)],'Identity',335,58,50)
arrow([(262,50),(262,110)],'Resolved identity',270,75,115)
arrow([(385,140),(335,140)],'Role / stock',335,114,50)
arrow([(262,170),(262,235)],'Valid bill',275,194,80);arrow([(385,265),(335,265)],'Batch data',335,295,60)
arrow([(262,295),(262,365)],'Allocation',275,321,85)
arrow([(335,400),(385,400)],'Sale / stock',335,432,60)
arrow([(262,430),(262,515)],'Commit result',275,465,90)
arrow([(190,540),(130,540)],'Invoice / errors',118,573,135)
arrow([(190,140),(110,140),(110,490),(240,490),(240,515)],'Validation failure',0,315,100)
enddiagram(590,'Figure 3.5 DFD 2 decomposition of process 3.0 billing','The branch to a correction status performs no sale write. The successful branch updates inventory and financial records atomically. Return processing is a separate guarded operation against eligible previously sold items.')

new('System Flow')
node(115,0,274,45,'Browser loads HTTPS app','terminal');node(115,90,274,55,'Read current session and request<br/>protected route data')
node(115,195,274,55,'Cloud Run frontend and API services<br/>validate requests')
node(0,320,235,65,'Business operation<br/>MySQL transaction and audit record')
node(275,320,229,65,'Recognition / reference request<br/>OCR, PostgreSQL or optional API')
node(115,445,274,55,'Return structured response<br/>Show review or operation outcome')
node(115,545,274,45,'Continue workflow / sign out','terminal')
arrow([(252,45),(252,90)]);arrow([(252,145),(252,195)])
arrow([(180,250),(180,285),(117,285),(117,320)])
arrow([(324,250),(324,285),(390,285),(390,320)])
arrow([(117,385),(117,415),(180,415),(180,445)])
arrow([(390,385),(390,415),(324,415),(324,445)])
arrow([(252,500),(252,545)])
enddiagram(590,'Figure 3.6 System flow across deployment boundaries','The public PWA worker caches only permitted static assets and a reconnect screen. Protected navigation is fetched freshly, and a cold offline launch shows the reconnect fallback. Existing account-scoped POS queue behaviour remains separate from service-worker caching.')

new('Recognition Flowchart')
node(165,0,174,38,'Capture image or code','terminal');node(165,75,174,55,'Try barcode decoding /<br/>assess image quality')
node(160,170,184,75,'Known mapped<br/>barcode?','decision');node(365,175,139,65,'Look up exact<br/>catalogue identity')
node(165,295,174,55,'OCR and extract<br/>brand / strength / details')
node(160,395,184,75,'Sufficient candidate<br/>evidence?','decision');node(0,400,125,65,'Recapture or<br/>manual search')
node(165,520,174,55,'Show medicine for review<br/>and user confirmation','terminal')
arrow([(252,38),(252,75)]);arrow([(252,130),(252,170)])
arrow([(344,207),(365,207)],'Yes',342,185,25)
arrow([(252,245),(252,295)],'No',264,262,30)
arrow([(252,350),(252,395)])
arrow([(160,433),(125,433)],'No',126,406,30)
arrow([(252,470),(252,520)],'Yes',265,487,30)
arrow([(435,240),(435,547),(339,547)])
arrow([(60,400),(60,25),(165,25)],'Retry',65,275,55)
enddiagram(575,'Figure 3.7 Barcode and photo recognition decision flow','Photo recognition is a working review-assisted input path. The image-quality result indicates blur/glare assessment, not guaranteed readable text. Low evidence produces a recovery path. A candidate score is a matching score, not a calibrated probability of medical correctness.')

new('Functional Flow')
items=[(0,0,235,70,'1 Medicine entry<br/>Identity, ingredients and aliases'),(269,0,235,70,'2 Batch intake<br/>Expiry, price, location, quantity'),(269,145,235,70,'3 Retrieval<br/>Barcode / reviewed photo / search'),(0,145,235,70,'4 Billing<br/>Quantity, FEFO and tender record'),(0,290,235,70,'5 Transaction record<br/>Sale items, stock deduction and audit'),(269,290,235,70,'6 Operational views<br/>Expiry, stockout and reorder review'),(135,450,235,65,'7 Follow-up<br/>Purchases, eligible returns and counts')]
for a in items:node(*a)
arrow([(235,35),(269,35)],'Confirm',235,75,45);arrow([(386,70),(386,145)],'Available stock',390,95,100)
arrow([(269,180),(235,180)],'Selected item',198,218,105)
arrow([(117,215),(117,290)],'Confirmed bill',0,243,110)
arrow([(235,325),(269,325)],'History',235,366,45)
arrow([(386,360),(386,410),(252,410),(252,450)],'Manager review',270,415,110)
arrow([(135,480),(35,480),(35,70)],'Reviewed replenishment / stock corrections',0,391,125)
enddiagram(515,'Figure 3.8 Functional flow from stocking to operational review','The same medicine identity links stocking and billing. Product photographs support entry and retrieval, while authoritative quantity comes from accepted batch/location records. A reorder suggestion creates a draft only when a user requests it; it does not place a supplier order.')

new('Core Data Model')
node(0,0,150,65,'Store<br/>id, name','entity');node(195,0,150,65,'User<br/>store_id, role','entity')
node(0,140,150,70,'Medicine<br/>brand, strength,<br/>ingredients, aliases','entity');node(195,140,150,70,'Batch<br/>medicine_id, store_id,<br/>expiry, MRP, cost','entity')
node(385,140,119,70,'Inventory<br/>batch_id, location,<br/>quantity','entity')
node(0,320,150,70,'Sale<br/>store, customer,<br/>invoice, totals','entity');node(195,320,150,70,'SaleItem<br/>sale_id, medicine,<br/>batch, quantity, price','entity')
node(385,320,119,70,'Payment<br/>sale_id, method,<br/>amount, status','entity')
node(0,490,150,70,'PurchaseInvoice<br/>supplier, status','entity');node(195,490,150,70,'PurchaseItem<br/>invoice, medicine,<br/>batch, quantity, rate','entity')
arrow([(150,32),(195,32)],'1 : many',150,72,45)
arrow([(75,65),(75,140)],'1 : many',85,97,70)
arrow([(150,175),(195,175)],'1 : many',150,215,45)
arrow([(345,175),(385,175)],'1 : many',345,215,40)
arrow([(150,355),(195,355)],'1 : many',150,395,45)
arrow([(75,390),(75,430),(445,430),(445,390)],'Sale has payment records',185,438,180)
arrow([(150,525),(195,525)],'1 : many',150,565,45)
arrow([(270,210),(270,320)],'Batch reference',280,255,90)
enddiagram(580,'Figure 3.9 Core entity relationship model','The diagram is a logical subset, not an exhaustive schema. Medicine aliases support barcode identity. Batch numbers are unique within medicine and store. Inventory can be split across locations. Returns, audit logs, prescriptions, expenses and transfers extend these core records.')

new('Algorithms and Transaction Rules')
sub('3.5 Identification and FEFO')
para('Barcode lookup resolves a stored alias to a medicine. Packaging OCR extracts text and fields, then compares brand, strength and other evidence against catalogue candidates. The matcher exposes a score breakdown and uses a low-evidence recovery path. User verification is required before a recognised medicine is used in the bill.')
para('For a valid sale, the backend filters stock by store and medicine, rejects expired or unavailable quantities and allocates eligible batches by expiry order. Store and inventory locks support a consistent write order. Currency values use decimal arithmetic. Sale, item, payment and stock changes are committed as one operation or rolled back on error.')
sub('3.6 Forecasting and Reorder Calculation')
para('Demand forecasting uses recent daily sales. Sparse history uses an adaptive moving-average baseline; Ridge autoregression is selected only when the configured history condition is met, including at least fourteen nonzero selling days. Ridge features include previous-day demand, previous-week demand, a rolling weekly mean and weekday. Fit error measures are not independent test-set accuracy.')
para('<b>Target stock</b> = ceiling[daily demand x (lead time + review period) + safety stock].<br/><b>Net deficit</b> = target stock - current eligible stock - open purchase quantity.<br/><b>Suggested quantity</b> = positive deficit rounded up to the configured pack size.')
sub('3.7 Reference Updates and Learning')
para('Confirmed medicine/reference mappings can improve later retrieval. This feedback is distinct from retraining neural model weights. The project includes experimental photo-training utilities, but the deployed recognition workflow is not described as continuously retraining itself. A retrained model requires labelled data, independent evaluation and an explicit deployment decision.')

new('Application APIs')
para('The following endpoints are present in the inspected Flask route modules. Protected business routes require an authorised session and enforce store/role restrictions in the application. GET operations retrieve data; POST/PATCH/DELETE operations can alter state and require validation.','small')
table(['Area','Methods and route examples','Purpose'],[
 ['Authentication','POST /api/auth/login; GET /api/auth/me; POST /api/auth/users','Sign in, retrieve account and manage staff.'],
 ['Medicine catalogue','GET/POST /api/medicines; GET /api/medicines/search','Search and maintain store medicine identities.'],
 ['Barcode','GET /api/medicines/barcode; POST /api/medicines/barcode-image','Resolve a mapped barcode or decode an image.'],
 ['Inventory','GET/POST /api/batches; POST /api/inventory/adjust','Record batches and audited quantity adjustments.'],
 ['Expiry / location','GET /api/inventory/expiry; GET /api/locations; GET /api/shelf/layout','Review expiry and physical storage.'],
 ['Sales','GET/POST /api/sales; GET /api/sales/{id}','Create bills and retrieve transaction details.'],
 ['Returns','GET /api/returns/eligible-items/{reference}; POST /api/returns','Check return eligibility and record reviewed returns.'],
 ['Purchases','GET/POST /api/purchases; POST /api/purchases/{id}/accept','Maintain drafts and accept verified intake.'],
 ['Suppliers / expenses','GET/POST /api/suppliers; GET/POST /api/expenses','Maintain supplier and operating-expense records.'],
 ['Branches / audit','GET /api/multibranch/stores; GET /api/audit-logs','Inspect branches and operation history.']
],[78,236,190],'Table 3.1 Business API inventory',fs=9.5)

new('Recognition APIs and Integrations')
table(['API group','Route examples','Function'],[
 ['Vision','POST /api/vision/recognize; POST /api/vision/verify','Produce and verify packaging candidates.'],
 ['Stocking','POST /api/vision/stocking/read, /search, /confirm','Read, search and confirm reviewed entry.'],
 ['Distributor invoice','POST /api/distributor/scan-invoice; /verify-delivery; /confirm-delivery','Extract invoice rows and verify delivery.'],
 ['Prescription','POST /api/ai/prescription/scan; POST /api/prescriptions/{id}/verify','Draft transcription and pharmacist review.'],
 ['Planning / copilot','GET /api/ml/reorder-recommendations; POST /api/ai/copilot/query','Read estimates and query grounded records.'],
 ['Offline sync','GET /api/sync/offline-pack; POST /api/sync/replay','Account-scoped catalogue and idempotent replay.']
],[84,233,187],'Table 3.2 Recognition and support APIs',fs=9.5)
sub('3.8 External and Platform Integrations')
para('<b>Google Gemini:</b> server-side Google Gen AI SDK for optional handwriting transcription and copilot synthesis. The selected prescription image can contain patient information; consent and service configuration are required. Output is validated and reviewed.<br/><b>Tavily:</b> optional medicine-reference web search through its search API. Web results are reference candidates, not automatic stock or medical truth.<br/><b>Aiven:</b> MySQL business persistence and PostgreSQL AI reference/vector persistence, accessed by the backend.<br/><b>Google Cloud:</b> Cloud Run services, Cloud Build, Artifact Registry and Secret Manager for deployment and configuration.','small')
para('<b>Browser integrations:</b> ZXing camera barcode decoding, media capture, optional speech recognition and PWA installation/service-worker APIs. These depend on browser capabilities and permission. Cash, UPI and card selections record tender information; no automatic bank settlement or payment-gateway integration is claimed.','small')

new('Project Planning','CHAPTER 4')
sub('4.1 Work Breakdown and Suggested Milestones')
para('The work is organised into requirements and schema, transactional services, catalogue and stock screens, assisted input, billing and returns, planning views, deployment and verification. The schedule below is a proposed academic organisation of work; it is not a retrospectively measured work log.')
table(['Work package','W1-2','W3-4','W5-6','W7-8','W9-10','W11-12'],[
 ['Requirements and data design','X','X','','','',''],['Core stock and APIs','','X','X','','',''],['Billing and procurement UI','','','X','X','',''],['OCR and review flows','','','','X','X',''],['Deployment and verification','','','','','X','X'],['Report and demonstration','','','','','','X']
],[180,54,54,54,54,54,54],'Table 4.1 Suggested semester milestone chart',fs=9)
sub('4.2 Team Participation')
para('The project group consists of Neev Borana, Romit Meher and Rohit Gorhekar. Individual task ownership should be confirmed by the group and project guide before the viva. This report does not assign unverified development contributions to a student.')
sub('4.3 Risks and Mitigation')
table(['Risk','Impact','Mitigation'],[
 ['Ambiguous label or handwriting','Wrong candidate','Reject weak matches; retain original image and manual review.'],['Interrupted network / repeated request','Duplicate or pending bill','Persistent UUID queue and server replay receipt.'],['Thin sales history','Unstable estimate','Baseline fallback and user-reviewed draft orders.'],['Credential exposure','Unauthorised access','Keep secrets outside code; rotate exposed credentials.']
],[140,140,224],'Table 4.2 Project risk assessment',fs=9.5)

new('Resources and Feasibility','CHAPTER 5')
table(['Component','Inspected implementation or requirement'],[
 ['Frontend','Next.js 16.3.5, React 19.2.8, TypeScript 5 and responsive CSS.'],
 ['Backend','Python Flask, SQLAlchemy, Alembic migrations and a production WSGI server.'],
 ['Vision / ML','PaddleOCR, OpenCV, NumPy, scikit-learn; optional experimental PyTorch training.'],
 ['Databases','Aiven MySQL for business data; Aiven PostgreSQL for AI references/vector data.'],
 ['Hosting','Separate frontend/API containers on Google Cloud Run over HTTPS.'],
 ['Capture / devices','Desktop or phone browser with camera permission; optional USB keyboard-style barcode scanner.'],
 ['Development GPU','RTX 3070 available for local experiments; not a requirement for Cloud Run CPU inference.']
],[115,389],'Table 5.1 Software and hardware resources')
sub('5.1 Technical and Operational Feasibility')
para('The prototype reuses established web, database and OCR libraries. Manual search and review permit the core workflow to continue when optional recognition or search cannot complete. Staff still need training in batch entry, stock units, return conditions and reconciliation. Real-world concurrency, data retention and recovery procedures need operational testing.')
sub('5.2 Economic Feasibility and Budget Basis')
para('No verified procurement invoices or cloud billing statements are included. Existing computers and a camera can be reused. Costs depend on Cloud Run CPU/memory use, Aiven plans, image volume, model quotas, backups and printing/binding. Free API tiers may be useful for a classroom demonstration but are not a permanent cost guarantee. Before sustained use, set budget alerts and record the actual monthly service charges. No fabricated project expenditure is reported.','small')

new('Verification Methodology','CHAPTER 6')
para('Verification separates deterministic business tests, browser interaction checks and recognition observation. Stock and payment tests run against isolated fixtures. Deployed navigation checks are read-only and do not submit real payments, dispatch purchase orders or alter live stock.','small')
node(165,25,174,45,'Select test requirement','terminal');node(165,110,174,55,'Create isolated fixture<br/>or read-only UI scenario')
node(0,235,150,65,'Business tests<br/>Stock, payments,<br/>idempotency');node(177,235,150,65,'Frontend tests<br/>Camera lifecycle,<br/>offline and PWA');node(354,235,150,65,'Deployed checks<br/>Routes, responsive UI,<br/>API responses')
node(165,380,174,65,'Compare actual and<br/>expected outcome','decision');node(0,490,135,50,'Record failure<br/>and correct code')
node(330,490,174,50,'Save evidence and<br/>report result','terminal')
arrow([(252,70),(252,110)])
for xx in [75,252,429]:arrow([(252,165),(252,195),(xx,195),(xx,235)])
for xx in [75,252,429]:arrow([(xx,300),(xx,340),(252,340),(252,380)])
arrow([(165,413),(65,413),(65,490)],'Fail',70,430,45)
arrow([(339,413),(417,413),(417,490)],'Pass',425,430,45)
arrow([(0,515),(-15,515),(-15,138),(165,138)])
enddiagram(540,'Figure 6.1 Test-case verification and correction flow','The pass branch records only outcomes actually observed. A code-level success does not substitute for an independent medicine-image accuracy study, physical-device scan test or production load test.')

new('Test Cases and Expected Outcomes')
table(['ID','Input or action','Expected result','Evidence status'],[
 ['TC01','Import the eight-medicine demo fixture twice.','Second run creates no duplicate sales or stock.','Automated regression passed.'],
 ['TC02','Compute imported stock and payment totals.','Stock is 480 - 217 + 20 = 283; line/payment totals balance.','Automated fixture passed.'],
 ['TC03','Forecast a short series of selling days.','Use baseline; avoid recursive thousands-of-units suggestion.','Automated regression passed.'],
 ['TC04','Open dashboard with stored demo activity.','Render chart, stock/expiry alerts and purchase drafts.','Live browser observed.'],
 ['TC05','Open return lookup at 375 and 1440 px.','Icon does not overlap text; no page-level overflow.','Live dimensions checked.'],
 ['TC06','Present mapped barcode frames; repeat same code.','Resolve code, suppress duplicate add and stop camera stream on close.','Simulated browser/component checks; physical device retest needed.'],
 ['TC07','Scan a weak or rotated package photo.','Show review candidate or explicit recapture/manual fallback.','Workflow observed; general accuracy not quantified.'],
 ['TC08','Load protected deep link offline.','Public reconnect screen; do not cache private response.','Prior PWA browser evidence.'],
 ['TC09','Transcribe handwritten prescription.','Editable rows, warnings for ambiguity, no invented quantity.','Sample workflow observed; pharmacist review required.']
],[46,150,181,127],'Table 6.1 Representative test cases',fs=9.5)
para('TC02 describes the isolated seed fixture and imported demo batches, not a guarantee that all live inventory remains unchanged after later sales. Test cases describe their own scope. The screenshot set documents visible frontend screens, not successful execution of every backend operation.','small')

new('Observed Results and Demonstration Data')
sub('6.1 Verification Evidence')
para('The dashboard import and forecasting regression group completed with <b>7 tests passed</b>. The frontend test suite completed with <b>28 tests passed</b>. The production frontend build, including TypeScript checking, passed. ESLint reported <b>0 errors and 81 existing warnings</b>. These are scoped development checks recorded during this iteration, not a claim that every project path has been exhaustively tested.')
para('Read-only deployed checks confirmed eight active catalogue medicines, populated dashboard insights and a seven-day recent-invoice chart. Return lookup measurements at 375 px and 1440 px showed a 14 px gap between the icon edge and the start of input text, with no page-level overflow in that check. A candidate deployment returned finite reorder quantities after the sparse-history correction.')
sub('6.2 Demonstration Dataset')
table(['Dataset item','Prepared demonstration content'],[
 ['Medicines and photographs','8 catalogue medicines with 16 paired front/back photographs.'],
 ['Sales and people','50 added synthetic sales; 12 fictional customers and 3 fictional suppliers.'],
 ['Procurement and expenses','5 purchase invoices, including 3 drafts; 6 fictional operating expenses.'],
 ['Stock movement','217 original demo units sold through recorded sales; 20 units newly received in 3 near-expiry batches.'],
 ['Purpose','Populate operational examples without presenting them as real pharmacy activity.']
],[140,364],'Table 6.2 Prepared classroom demonstration data')
sub('6.3 Interpretation')
para('Photo recognition functions as an assisted workflow that returns evidence for review or a recoverable no-match state. The current evaluation does not establish a clinical or general packaging identification accuracy percentage. Performance and recognition depend on image orientation, lighting, readable text and available reference data.','small')

screens=[
 ('01-login.png','Sign In','The sign-in page provides staff authentication, a password visibility control and workspace setup access. The image shows the actual deployed page with no credentials entered.','Users authenticate before protected records are retrieved. A screenshot of a login form does not establish penetration-test coverage.'),
 ('02-dashboard.png','Dashboard','The dashboard combines recent invoice activity, low-stock and expiry indicators, pending purchase drafts and inventory planning insights. The screenshot uses stored demonstration activity.','The chart covers up to fifty recently loaded invoices rather than a complete sales report. Forecast and reorder values are estimates; they do not place orders automatically.'),
 ('03-pos.png','POS Billing Terminal','The counter screen provides barcode entry, catalogue search, camera/photo actions and the current bill. Cash, UPI and card choices describe recorded tender methods.','FEFO allocation and stock checks occur at the backend. Barcode or photo selection must identify the intended medicine before checkout. This capture does not submit a payment.'),
 ('04-inventory.png','Inventory and Batches','The inventory workspace exposes batch-specific stock details and supports review of quantity, expiry and location. Medicine identity is kept separate from the stock record.','A batch may have its own MRP and purchase cost. Staff should reconcile physical counts before confirming an adjustment; the report capture performs no stock write.'),
 ('05-medicines.png','Medicine Catalogue','The catalogue screen presents the eight active demonstration medicines and their stored identity details. Search and reviewed entry connect this list to stocking and billing.','The eight brands are Amlokind-AT, Candiforce-200, Cheston Cold, Cyclomine, Dromef, Multiprex, Nu Cat Kof and Telmikind-H. Package/strength details must be verified during entry.'),
 ('06-purchases.png','Purchases and Invoices','Purchase records distinguish draft review from accepted intake. Invoice digitisation supports candidate extraction, delivery comparison and confirmation.','The demo includes three pending drafts. A draft is not accepted stock, and a suggested purchase is not evidence of a supplier order or payment.'),
 ('07-prescriptions.png','Prescription Workspace','Prescription capture and digitisation support text or image input with review before verification and dispensing. Handwriting assistance produces editable draft rows.','Google handwriting mode sends the selected image to a third-party model service. Ambiguous fields need human correction. No real patient image is embedded in this report.'),
 ('08-expiry.png','Expiry Management','The expiry workspace highlights batches that need review according to their recorded expiry and remaining stock. The demonstration includes deliberately prepared near-expiry examples.','Recorded expiry controls stock eligibility. Alerts support staff review and supplier-return planning; a dashboard count is not an independent physical inspection.')]
for idx,(name,title,a,b) in enumerate(screens,start=2):
 new(title,'CHAPTER 6 FRONTEND IMPLEMENTATION')
 image(AS/name,maxh=390);caption(f'Figure 6.{idx} {title} actual deployed frontend')
 para(a);para(b);para('Capture context: deployed HTTPS application, desktop browser viewport 1440 x 1000, 26 October 2026. Fictional classroom records are used where available.','small')

new('Sustainability and Impact','CHAPTER 7')
sub('7.1 Industrial Relevance')
para('Batch-level record keeping, expiry review and consistent sales history are useful operational capabilities for a physical pharmacy. The project demonstrates how procurement and billing can share a medicine identity while preserving different batch prices and expiry dates. Audit history supports investigation of stock changes, subject to proper staff practices and reliable records.')
sub('7.2 Societal Impact')
para('Clear identification and review screens can help staff detect data-entry mistakes before a transaction. Prescription and packaging assistance reduce repeated typing but do not replace professional judgement. Accessibility, simple recovery paths and mobile layouts are relevant to staff working at busy counters. Benefits are potential operational outcomes, not measured improvements in patient health.')
sub('7.3 Environmental Impact')
para('Expiry visibility can support timely review and better replenishment planning, potentially reducing avoidable disposal. Digital receipts and records can reduce routine printing where accepted. Hosting and model inference also consume resources; smaller public caches, bounded image handling and reuse of existing equipment help limit unnecessary work. No lifecycle carbon assessment has been performed.')
sub('7.4 SDG Mapping')
table(['Goal','Connection to project','Evidence boundary'],[
 ['SDG 3 Good Health and Well-being','Organised medicine records and pharmacist verification.','Supports a workflow; no clinical outcome claim.'],
 ['SDG 9 Industry, Innovation and Infrastructure','Connected web and data infrastructure for operations.','Academic engineering prototype.'],
 ['SDG 12 Responsible Consumption and Production','Expiry review and demand-informed stock planning.','Waste reduction has not been measured.']
],[145,205,154],'Table 7.1 Qualitative sustainability mapping')

new('Conclusion and Future Scope','CHAPTER 8')
sub('8.1 Conclusion')
para('SmartPharm connects catalogue management, batch-level stock, procurement, POS billing, returns and operational insight in a deployed web application. Its core design keeps medicine identity separate from batch and location quantities. Reviewed barcode/photo input and document digitisation connect to these business records rather than acting as independent sources of stock truth.')
para('The project demonstrates functioning review-assisted recognition, FEFO stock allocation, editable document extraction, account-scoped offline transaction handling and a PWA installation/reconnect experience. Verification supports the specific behaviours and checks described in Chapter 6. Synthetic records make the demonstration repeatable without representing fictional activity as commercial sales.')
sub('8.2 Future Scope')
para('Recognition work should add orientation-aware evaluation, consistent package cropping and a larger independently labelled image test set. A public benchmark should report accepted-match precision, recall, rejection rate and end-to-end latency. Confidence calibration should be assessed before interpreting a score as probability.')
para('Operational work should include MySQL concurrent-terminal stress tests, tested backup restoration, stronger access review and a documented privacy/retention policy for uploaded prescriptions. Physical phones and USB scanners should be tested under the actual classroom lighting and network conditions. Browser support should be recorded by device and operating system.')
para('Forecasting should be validated on held-out time periods and longer real demand histories before replenishment estimates are used operationally. Optional payment gateways, supplier ordering and regulatory integrations would require separate contracts, security review and transactional reconciliation. Neither a demo tender record nor a reference web result is equivalent to such an integration.')

new('References')
refs=[
 '[1] B. Shi, X. Bai and C. Yao, "An End-to-End Trainable Neural Network for Image-based Sequence Recognition and Its Application to Scene Text Recognition," arXiv:1507.05717, 2015. https://arxiv.org/abs/1507.05717',
 '[2] M. Liao, Z. Wan, C. Yao, K. Chen and X. Bai, "Real-time Scene Text Detection with Differentiable Binarization," AAAI, 2020; preprint arXiv:1911.08947, 2019. https://arxiv.org/abs/1911.08947',
 '[3] Y. Du et al., "PP-OCR: A Practical Ultra Lightweight OCR System," arXiv:2009.09941, 2020. https://arxiv.org/abs/2009.09941',
 '[4] M. Li et al., "TrOCR: Transformer-based Optical Character Recognition with Pre-trained Models," arXiv:2109.10282, 2021, revised 2022. https://arxiv.org/abs/2109.10282',
 '[5] Y. Huang, T. Lv, L. Cui, Y. Lu and F. Wei, "LayoutLMv3: Pre-training for Document AI with Unified Text and Image Masking," ACM Multimedia, 2022, doi:10.1145/3503161.3548112. https://arxiv.org/abs/2204.08387',
 '[6] C. Cui et al., "PaddleOCR 3.0 Technical Report," arXiv:2507.05595, 2025. https://arxiv.org/abs/2507.05595',
 '[7] P. Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," NeurIPS, 2020. https://arxiv.org/abs/2005.11401'
]
for ref in refs:para(escape(ref),'body',gap=15)
para('Research metadata and original publication pages were checked on 26 October 2026. Survey findings are qualitative; paper benchmark scores have not been presented as SmartPharm results.','small')

new('Implementation Sources')
para('The implementation description is based on the inspected local repository and recorded project verification evidence as of 26 October 2026. These internal implementation sources distinguish actual project behaviour from the research literature.')
table(['Source','Relevant material'],[
 ['frontend/package.json; src/app and src/components','Framework versions, application routes, POS, staff interface, camera scanner and responsive layout.'],
 ['backend/app/models; app/services','Medicine/batch/inventory relationships, FEFO sales, locks, decimal currency and transaction handling.'],
 ['backend/app/api','Authentication, stock, vision, invoice, prescription, sales, returns, ML and sync routes.'],
 ['backend/app/vision; app/ai','OCR pipeline, evidence matching, stocking references, prescription vision and grounded copilot.'],
 ['backend/app/ml','Demand forecasts, stockout/expiry estimates and reorder calculation.'],
 ['frontend/docs/pwa.md; pwa/sw-template.js','Installation controls, public-asset cache policy, reconnect fallback and update handling.'],
 ['plans/dashboard-demo-20261026.md','Synthetic activity scope, stock balance, focused tests and deployment evidence.'],
 ['output/dashboard-demo and output/capstone-report/assets','Browser layout measurements, dashboard evidence and eight captured frontend screens.']
],[208,296],'Table R.1 Implementation evidence inventory')
para('External platform/library names identify integrations used or supported by the project. TrOCR, CRNN, DBNet and LayoutLMv3 are discussed in the literature survey; this report does not claim that every research architecture is directly deployed. Credentials, environment files and confidential connection details are intentionally excluded.','small')

new('Examination and Demonstration Guide','APPENDIX A')
sub('A.1 Print and Submission')
para('Prepare <b>two copies for the group</b>: one for the department and one for the students. Bring the report on the external examination day. Complete the blank guide, approval, date and signature fields according to college instructions. Confirm the prescribed binding, print size and final degree wording with the department before printing.')
sub('A.2 Suggested Demonstration Sequence')
table(['Step','Demonstration','Review point'],[
 ['1','Sign in and open the dashboard.','Explain that activity records are synthetic.'],
 ['2','Open catalogue and batch inventory.','Show medicine identity versus batch/location stock.'],
 ['3','Read a known barcode or search a stocked medicine.','Confirm product and strength before adding to bill.'],
 ['4','Show packaging capture and the review screen.','Explain evidence, manual correction and the no-match path.'],
 ['5','Open purchases and prescription workspace.','Show drafts and verification before accepting or dispensing.'],
 ['6','Open expiry management and reorder view.','Explain expiry eligibility and estimates rather than automatic orders.'],
 ['7','Show mobile layout / PWA installation action.','Installation and camera features depend on browser support.']
],[38,236,230],'Table A.1 Demonstration sequence')
sub('A.3 Preparation Checklist')
para('Check the login and network in advance. Use the labelled demo package photos or known barcode cards. Confirm camera permission and keep manual search available. Do not display passwords, API keys, connection strings or a real patient prescription to the audience. Ensure pending local bills are reconciled before clearing browser data.','small')

assert PAGE==42,PAGE
c.save()
(OUT/'report-index.json').write_text(json.dumps({'pages':PAGE,'sections':heads,'figures':figures,'tables':tables,'source_template_sha256':hashlib.sha256(Path(r'C:/Users/user/Downloads/AF52_ PROJECT SYNOPSYS FORMAT (1).docx').read_bytes()).hexdigest()},indent=2))
print(FILE);print('pages',PAGE)
