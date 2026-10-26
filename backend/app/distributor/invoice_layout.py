"""Reconstruct invoice columns from OCR coordinates; never invent missing quantities."""
import re
import calendar
from datetime import date
import cv2
from app.vision.ocr_engine import default_ocr_engine


def cells(ocr):
    result = []
    for word in ocr.word_boxes:
        if len(word.box) != 4:
            continue
        points = word.box
        x = sum(p[0] for p in points)/4
        y = sum(p[1] for p in points)/4
        dx = points[1][0]-points[0][0]
        slope = (points[1][1]-points[0][1])/dx if dx else 0
        result.append(dict(text=word.text, x=x, y=y, slope=max(-.15, min(.15, slope))))
    return result


def number(value):
    match = re.fullmatch(r"(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)%?", value.strip(), re.I)
    if not match:
        return None
    raw = match[1]
    if re.fullmatch(r"\d+,\d{2}", raw):
        return float(raw.replace(",", "."))
    return float(raw.replace(",", ""))


def expiry_in(text):
    match = re.search(r"(?<!\d)(0?[1-9]|1[0-2])\s*/\s*(20\d\d|\d{2})(?!\d)", text)
    if not match:
        match = re.search(r"(?:\s|^)(0?[1-9]|1[0-2])(\d{2})$", text)
    return match


def parse_layout(ocr, parser):
    from app.distributor.invoice_parser import ParsedInvoiceItem
    words = cells(ocr)
    if not words:
        return parser.parse_text(ocr.full_text)
    headings = {}
    patterns = {"name": r"(?:prod[a-z]*|item).*(?:desc|disc)|description|^prdt[a-z]*",
                "mrp": r"^m\.?r\.?p\.?$", "rate": r"^rate$",
                "amount": r"^(?:amount|amt|al|a)$", "qty": r"^qty$",
                "gst": r"^gst%?$"}
    for word in sorted(words, key=lambda w:w["y"]):
        for key, pattern in patterns.items():
            if key not in headings and re.search(pattern, word["text"], re.I):
                headings[key] = word
    if "name" not in headings and "mrp" in headings and "rate" in headings:
        top = max(headings["mrp"]["y"], headings["rate"]["y"])
        end = min([w["y"] for w in words if w["y"]>top+50 and re.search(r"remark|subtotal|total qty|to pay|grand total|thousand",w["text"],re.I)] or [float("inf")])
        candidates = [w for w in words if top+7<w["y"]<end and w["x"]<headings["mrp"]["x"]-70
                      and len(re.findall(r"[A-Za-z]",w["text"]))>=7]
        if len(candidates)>=2:
            anchor=max(candidates,key=lambda w:sum(abs(w["x"]-c["x"])<60 for c in candidates))
            cluster=sorted(c["x"] for c in candidates if abs(c["x"]-anchor["x"])<60)
            headings["name"]={"x":cluster[len(cluster)//2],"y":top,"text":"inferred description column"}
    if not all(k in headings for k in ("name", "mrp", "rate", "amount")):
        return parser.parse_text(ocr.full_text)
    header_y = headings["name"]["y"]
    name_x = headings["name"]["x"]
    mrp_x = headings["mrp"]["x"]
    # Rows remain separate even when the invoice has a perspective slope.
    names = sorted([w for w in words if abs(w["x"]-name_x) < (mrp_x-name_x)*.18
                    and w["y"] > header_y+5 and re.search(r"[A-Za-z]{3}", w["text"])
                    and not re.search(r"total|deliver|remark|thousand|invoice|GST|terms|class|checked|bank", w["text"], re.I)],
                   key=lambda w:w["y"])
    footer = min([w["y"] for w in words if w["y"]>header_y+50 and re.search(r"deliver to|remark|one thousand|subtotal|total qty|to pay|grand total", w["text"], re.I)] or [float("inf")])
    names = [w for w in names if w["y"]<footer]
    warnings = ["OCR preview only: review all names, quantities, batches, expiries and prices. No stock or purchase draft has been saved."]
    def column(key):
        h = headings[key]
        return sorted([w for w in words if ((headings["rate"]["x"]+h["x"])/2<w["x"]<h["x"]+80 if key=="amount" else abs(w["x"]-h["x"])<28) and h["y"]+7<w["y"]<footer and number(w["text"]) is not None], key=lambda w:w["y"])
    rates, mrps, amounts = column("rate"), column("mrp"), column("amount")
    if not names or not (len(names)==len(rates)==len(mrps)==len(amounts)):
        return _sparse_preview(ocr, parser, names, words)
    possible_dates = [w for w in words if name_x+70<w["x"]<mrp_x-30 and header_y+7<w["y"]<footer and expiry_in(w["text"])]
    if not possible_dates:
        return _sparse_preview(ocr, parser, names, words)
    date_x = sorted(w["x"] for w in possible_dates)[len(possible_dates)//2]
    batch_cells = sorted([w for w in words if name_x+90<w["x"]<date_x+40 and header_y+7<w["y"]<footer
                          and (expiry_in(w["text"]) or re.search(r"[A-Za-z].*\d|\d.*[A-Za-z]|\d+-\d+", w["text"]))], key=lambda w:w["y"])
    groups = []
    for word in batch_cells:
        if not groups or word["y"]-groups[-1][0]["y"]>5:
            groups.append([word])
        else:
            groups[-1].append(word)
    if len(groups)!=len(names):
        return _sparse_preview(ocr, parser, names, words)
    items = []
    for index,(anchor,rate,mrp,amount,group) in enumerate(zip(names,rates,mrps,amounts,groups),1):
        batch_text = " ".join(w["text"] for w in sorted(group,key=lambda w:w["x"]))
        match = expiry_in(batch_text)
        expiry = None
        if match:
            year = int(match[2]) + (2000 if len(match[2])==2 else 0)
            month = int(match[1])
            if 2000 <= year <= date.today().year+20:
                expiry = date(year, month, calendar.monthrange(year, month)[1])
        batch = batch_text[:match.start()].strip() if match else batch_text
        if not expiry:
            warnings.append(f"Line {index}: expiry unreadable; enter it from the physical bill.")
        name = re.sub(r"^\d+[Xx]\d+(?:GM|ML)?\s*", "", anchor["text"]).strip()
        warnings.append(f"Line {index}: confirm quantity; unreadable quantity is left zero.")
        mrp_value = number(mrp["text"])
        rate_value = number(rate["text"])
        if mrp_value is not None and rate_value and (mrp_value<rate_value or mrp_value>rate_value*20):
            mrp_value = None
            warnings.append(f"Line {index}: MRP is inconsistent with the rate; enter it manually.")
        items.append(ParsedInvoiceItem(index,name,name,batch_number=batch,expiry_date=expiry,quantity=0,
            purchase_rate=rate_value,mrp=mrp_value,gst_percentage=0,
            total_amount=number(amount["text"])))
    parsed = parser.parse_text(ocr.full_text)
    parsed.items = items
    parsed.raw_text = ocr.full_text
    parsed.extraction_method = "ocr_coordinate_layout"
    parsed.warnings = warnings
    parsed.parse_confidence = 0.0  # No calibrated extraction accuracy is available.
    return _metadata(parsed, words)


def parse_image(image, parser):
    if image is None or image.size == 0:
        raise ValueError("Invalid invoice image. Upload a readable JPEG or PNG.")
    # Sideways phone photographs are common; an unsuccessful orientation falls
    # back to the original. No model output or invoice fixture is substituted.
    rotations = [90, 0, 270] if image.shape[0] > image.shape[1]*1.3 else [0, 90, 270]
    best = None
    for angle in rotations:
        oriented = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE if angle==90 else cv2.ROTATE_90_COUNTERCLOCKWISE) if angle else image
        ocr = default_ocr_engine.run_ocr(oriented)
        parsed = parse_layout(ocr, parser)
        if best is None or len(parsed.items)>len(best.items):
            best = parsed
        if parsed.items and parsed.extraction_method == "ocr_coordinate_layout":
            return parsed
    return best


def _metadata(parsed, words):
    # Spatial labels also handle header values printed in a separate OCR box.
    for label in words:
        key = label["text"]
        right = sorted([w for w in words if w["x"]>label["x"]+15
                        and abs(w["y"]-label["y"])<15], key=lambda w:w["x"])
        if re.search(r"^(?:to pay|(?:g?rand|grand) total)$", key, re.I):
            values = [number(w["text"]) for w in right]
            values = [v for v in values if v is not None and v>0]
            if values:
                parsed.total_amount = values[-1]
        if re.search(r"^(?:inv|invoice|involce)\s*(?:no|number)\.?", key, re.I):
            combined = key+" "+" ".join(w["text"] for w in right[:2])
            match = re.search(r"(?:no|number)\.?\s*[:\s]+([A-Z0-9][A-Z0-9/-]+)", combined, re.I)
            if match:
                parsed.invoice_number = match[1]
        if re.match(r"^(?:inv\.?\s*(?:date|dt)|date|dated)\b", key, re.I):
            from app.distributor.invoice_parser import _parse_invoice_date_header
            combined = key+" "+" ".join(w["text"] for w in right[:2])
            match = re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b", combined)
            if match:
                parsed.invoice_date = _parse_invoice_date_header(match[0])
        if re.search(r"^(?:for|fur)\s+.*(?:pharma|enterprises)", key, re.I):
            parsed.distributor_name = re.sub(r"^(?:for|fur)\s+", "", key, flags=re.I)
    return parsed


def _sparse_preview(ocr, parser, names, words):
    from app.distributor.invoice_parser import ParsedInvoiceItem
    parsed=parser.parse_text(ocr.full_text)
    parsed.items=[ParsedInvoiceItem(i,w["text"],w["text"],quantity=0,gst_percentage=0) for i,w in enumerate(names,1)]
    parsed.extraction_method="ocr_coordinate_layout"
    parsed.total_amount=None
    parsed.parse_confidence=0.0
    parsed.warnings=["Table cells could not be aligned reliably. Only product text is shown; enter quantities, batches, expiries and prices from the original bill. No values were guessed."]
    return _metadata(parsed,words)
