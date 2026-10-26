"""
SmartPharm - Distributor Invoice Parser
Extracts metadata (distributor name, GSTIN, invoice number, date) and tabular line items
(medicine name, pack, batch, expiry, quantity, purchase rate, MRP, GST) from distributor invoices.

Strict compliance with SmartPharm PRD:
- Rule 11: Supports variable invoice layouts without hard-coding to one distributor.
- Handles text PDFs, image scans, and structured text formats.
- Normalizes pharma expiry dates to calendar end-of-month.
"""

from dataclasses import dataclass, field
import datetime
import io
import re
import logging
from typing import Any, Dict, List, Optional, Union
import numpy as np

from app.vision.extractor import _parse_pharma_date
from app.vision.ocr_engine import default_ocr_engine

logger = logging.getLogger(__name__)

# Regex Patterns for Indian Distributor Invoice Headers
RE_GSTIN = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b", re.IGNORECASE)
RE_INVOICE_NUM = re.compile(
    r"(?:(?:Invoice|Inv)\.?\s*(?:No\.?|Number|#)?|Bill\s*(?:No\.?|Number|#)?)\s*[:.\-]?\s*([A-Za-z0-9\-\/]{3,30})",
    re.IGNORECASE,
)
RE_INVOICE_DATE = re.compile(
    r"(?:Inv\.?\s*Date|Date|Bill\s*Date|Dated)\s*[:.\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{2,4})",
    re.IGNORECASE,
)
RE_GRAND_TOTAL = re.compile(
    r"\b(?:Grand\s*Total|Invoice\s*Total|Net\s*Amount|Total\s*Payable|Total\s*Amount)\s*[:.\-]?\s*(?:Rs\.?|₹)?\s*([0-9,]+\.[0-9]{2})",
    re.IGNORECASE,
)
RE_GENERIC_TOTAL = re.compile(
    r"(?<!GST\s)(?<!TAX\s)(?<!SUB)\bTotal\s*[:.\-]?\s*(?:Rs\.?|₹)?\s*([0-9,]+\.[0-9]{2})",
    re.IGNORECASE,
)

# Common Distributor / Stockist Keywords
DISTRIBUTOR_KEYWORDS = [
    "pharma", "pharmaceuticals", "healthcare", "distributors", "enterprises",
    "agencies", "medical", "druggist", "wholesaler", "traders", "supply", "network"
]


@dataclass
class ParsedInvoiceItem:
    """Individual invoiced line item extracted from distributor invoice table."""
    line_number: int
    raw_item_name: str
    cleaned_medicine_name: str
    packing: Optional[str] = None
    hsn_code: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[datetime.date] = None
    quantity: int = 1
    free_quantity: int = 0
    purchase_rate: Optional[float] = None
    mrp: Optional[float] = None
    discount_percentage: float = 0.0
    gst_percentage: float = 12.0
    total_amount: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "line_number": self.line_number,
            "raw_item_name": self.raw_item_name,
            "cleaned_medicine_name": self.cleaned_medicine_name,
            "packing": self.packing,
            "hsn_code": self.hsn_code,
            "batch_number": self.batch_number,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "quantity": self.quantity,
            "free_quantity": self.free_quantity,
            "purchase_rate": self.purchase_rate,
            "mrp": self.mrp,
            "discount_percentage": self.discount_percentage,
            "gst_percentage": self.gst_percentage,
            "total_amount": self.total_amount,
        }


@dataclass
class ParsedInvoice:
    """Consolidated extracted invoice metadata and line items."""
    distributor_name: Optional[str]
    distributor_gstin: Optional[str]
    invoice_number: Optional[str]
    invoice_date: Optional[datetime.date]
    total_amount: Optional[float]
    items: List[ParsedInvoiceItem] = field(default_factory=list)
    raw_text: str = ""
    parse_confidence: float = 0.85
    extraction_method: str = "regex_layout"
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "distributor_name": self.distributor_name,
            "distributor_gstin": self.distributor_gstin,
            "invoice_number": self.invoice_number,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "total_amount": self.total_amount,
            "items_count": len(self.items),
            "items": [item.to_dict() for item in self.items],
            "parse_confidence": round(self.parse_confidence, 2),
            "extraction_method": self.extraction_method,
            "warnings": self.warnings,
        }


def _parse_invoice_date_header(date_str: str) -> Optional[datetime.date]:
    """Parse invoice header dates (e.g., 15/09/2026, 2026-09-15, 15-Sep-2026)."""
    if not date_str:
        return None
    cleaned = date_str.strip().replace("-", "/").replace(".", "/")
    parts = cleaned.split("/")
    if len(parts) == 3:
        try:
            # Check DD/MM/YYYY vs YYYY/MM/DD
            if len(parts[0]) == 4:
                return datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
            y = int(parts[2])
            if y < 100:
                y += 2000
            return datetime.date(y, int(parts[1]), int(parts[0]))
        except Exception:
            pass
    return None


class DistributorInvoiceParser:
    """
    Multi-format parser for Indian pharmaceutical distributor invoices.
    Extracts distributor metadata and tabular medicine line items.
    """

    def parse_image(self, image) -> ParsedInvoice:
        from app.distributor.invoice_layout import parse_image
        return parse_image(image, self)

    def parse_text(self, text: str) -> ParsedInvoice:
        """Parse raw text representation of invoice (from PDF text stream or OCR)."""
        lines = [line.strip() for line in text.split("\n") if line.strip()]

        distributor_name = None
        distributor_gstin = None
        invoice_number = None
        invoice_date = None
        total_amount = None

        # 1. Header extraction
        # Look for distributor name in first 10 lines
        for line in lines[:10]:
            lower_line = line.lower()
            if any(k in lower_line for k in DISTRIBUTOR_KEYWORDS):
                distributor_name = line.strip(" :-#")
                break

        if not distributor_name and lines:
            # Fallback to very first line if it looks like a business title
            if len(lines[0]) > 4 and not lines[0].startswith(("TAX", "INVOICE", "GST")):
                distributor_name = lines[0]

        # GSTIN search
        full_doc = " \n ".join(lines)
        gstin_match = RE_GSTIN.search(full_doc)
        if gstin_match:
            distributor_gstin = gstin_match.group(0).upper()

        # Invoice Number search
        inv_num_match = RE_INVOICE_NUM.search(full_doc)
        if inv_num_match:
            invoice_number = inv_num_match.group(1).strip()
        else:
            # Fallback pattern like 'INV-1234' or 'BILL 4492'
            alt_num = re.search(r"\b(?:INV|BILL|GST)[\s\-\/]?\d{3,10}\b", full_doc, re.IGNORECASE)
            if alt_num:
                invoice_number = alt_num.group(0).upper()

        # Invoice Date search
        inv_date_match = RE_INVOICE_DATE.search(full_doc)
        if inv_date_match:
            invoice_date = _parse_invoice_date_header(inv_date_match.group(1))

        # Total Amount search
        tot_match = RE_GRAND_TOTAL.search(full_doc) or RE_GENERIC_TOTAL.search(full_doc)
        if tot_match:
            try:
                clean_tot = tot_match.group(1).replace(",", "")
                total_amount = float(clean_tot)
            except ValueError:
                pass

        # 2. Tabular Line Items Extraction
        items: List[ParsedInvoiceItem] = []
        line_counter = 1

        # Common table row regex in pharma invoices:
        # e.g.: "Crocin 650mg Tab  15T  3004  CRO-2026-X1  05/2027  20  0  28.00  35.00  5.0  12.0  532.00"
        # Or structured rows containing medicine name, batch, expiry, qty, rate
        HEADER_SKIP_KEYWORDS = [
            "invoice no", "inv no", "bill no", "invoice date", "inv date", "bill date",
            "due date", "customer", "buyer", "consignee", "dl no", "gstin", "fssai",
            "item description", "product description", "item name", "hsn", "batch no",
            "grand total", "subtotal", "sub total", "net amount", "total amount", "bank details",
            "terms & conditions", "authorized signatory", "e. & o.e", "page "
        ]

        for line in lines:
            lower_l = line.lower()
            if any(h in lower_l for h in HEADER_SKIP_KEYWORDS):
                continue

            # Look for lines containing an expiry date pattern
            exp_match = re.search(r"\b(0[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})\b", line)
            if exp_match:
                parsed_exp = _parse_pharma_date(exp_match.group(0))
                tokens = line.split()
                if len(tokens) >= 4:
                    exp_idx = -1
                    for idx, t in enumerate(tokens):
                        if exp_match.group(0) in t:
                            exp_idx = idx
                            break

                    if exp_idx == -1:
                        continue

                    # Parse numbers to the RIGHT of the expiry date
                    right_tokens = tokens[exp_idx + 1:]
                    right_numbers = []
                    gst_pct = 12.0
                    for rt in right_tokens:
                        if "%" in rt:
                            try:
                                gst_pct = float(rt.replace("%", "").strip())
                            except ValueError:
                                pass
                            continue
                        clean_rt = rt.replace(",", "")
                        try:
                            val = float(clean_rt)
                            right_numbers.append(val)
                        except ValueError:
                            pass

                    # Expected layout after expiry: Qty, Rate, MRP, [Line Total]
                    qty = 1
                    rate = 0.0
                    mrp = 0.0
                    line_tot = None

                    if len(right_numbers) >= 3:
                        qty = int(right_numbers[0])
                        rate = right_numbers[1]
                        mrp = right_numbers[2]
                        if len(right_numbers) >= 4:
                            line_tot = right_numbers[3]
                    elif len(right_numbers) == 2:
                        qty = int(right_numbers[0])
                        rate = right_numbers[1]
                        mrp = round(rate * 1.25, 2)
                    elif len(right_numbers) == 1:
                        qty = int(right_numbers[0])

                    # Parse tokens to the LEFT of the expiry date
                    left_tokens = tokens[:exp_idx]
                    batch_token = "BATCH-DEFAULT"
                    packing = None
                    hsn = None

                    if left_tokens:
                        batch_token = left_tokens.pop()

                    # Check for HSN (4-8 digits)
                    if left_tokens and re.match(r"^\d{4,8}$", left_tokens[-1]):
                        hsn = left_tokens.pop()

                    # Check for packing notation (e.g. 10's, 15T, 10x10, 100ml)
                    if left_tokens and re.search(r"(\d+['s|t|x|ml|gm]|\d+x\d+)", left_tokens[-1], re.I):
                        packing = left_tokens.pop()

                    # Filter out leading row number (e.g. '1', '1.')
                    if left_tokens and re.match(r"^\d+\.?$", left_tokens[0]):
                        left_tokens = left_tokens[1:]

                    raw_name = " ".join(left_tokens).strip()

                    if raw_name:
                        total_amt = line_tot if line_tot is not None else round(rate * qty, 2)
                        item = ParsedInvoiceItem(
                            line_number=line_counter,
                            raw_item_name=raw_name,
                            cleaned_medicine_name=raw_name,
                            packing=packing,
                            hsn_code=hsn,
                            batch_number=batch_token,
                            expiry_date=parsed_exp,
                            quantity=qty,
                            free_quantity=0,
                            purchase_rate=rate,
                            mrp=mrp,
                            gst_percentage=gst_pct,
                            total_amount=total_amt,
                        )
                        items.append(item)
                        line_counter += 1

        # If no explicit total was parsed, sum item amounts
        if total_amount is None and items:
            total_amount = sum(i.total_amount or 0.0 for i in items)

        return ParsedInvoice(
            distributor_name=distributor_name or "Unknown Distributor",
            distributor_gstin=distributor_gstin,
            invoice_number=invoice_number or f"DRAFT-{datetime.date.today().strftime('%Y%m%d')}-{np.random.randint(100, 999)}",
            invoice_date=invoice_date or datetime.date.today(),
            total_amount=total_amount,
            items=items,
            raw_text=full_doc,
            parse_confidence=0.85 if items else 0.40,
            extraction_method="regex_layout",
        )

    def parse_pdf(self, pdf_bytes: bytes) -> ParsedInvoice:
        """Parse text or scanned PDF document using pypdfium2."""
        text_content = ""
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(pdf_bytes)
            for page in pdf:
                text_page = page.get_textpage()
                page_text = text_page.get_text_range()
                if page_text and len(page_text.strip()) > 20:
                    text_content += page_text + "\n"
                else:
                    # Scanned page fallback: render to image and run OCR
                    pil_image = page.render(scale=2).to_pil()
                    np_img = np.array(pil_image)
                    ocr_res = default_ocr_engine.run_ocr(np_img)
                    if ocr_res and ocr_res.full_text:
                        text_content += ocr_res.full_text + "\n"
        except Exception as err:
            logger.error(f"Failed to parse PDF document: {err}")

        return self.parse_text(text_content)


default_invoice_parser = DistributorInvoiceParser()
