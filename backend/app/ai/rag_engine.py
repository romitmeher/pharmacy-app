"""
SmartPharm - Grounded AI / RAG Pharmacy Copilot Engine
Strict compliance with SmartPharm PRD Rule 19:
- The database is the absolute source of truth for:
  Inventory, Transactions, Sales, Purchases, Supplier balances, Stock quantities.
- Answers are strictly grounded in live database rows.
- No hallucinated quantities, batch numbers, or pricing.
- When information is missing, clearly communicates that data was not found.
"""

from dataclasses import dataclass, field
import datetime
from decimal import Decimal
import enum
import logging
import re
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.medicine import Medicine, MedicineAlias
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location
from app.models.sale import Sale, SaleItem
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)


class CopilotIntent(str, enum.Enum):
    STOCK_LOOKUP = "STOCK_LOOKUP"
    LOW_STOCK = "LOW_STOCK"
    EXPIRY_RISK = "EXPIRY_RISK"
    SALES_METRICS = "SALES_METRICS"
    PURCHASE_METRICS = "PURCHASE_METRICS"
    GENERAL_PHARMA = "GENERAL_PHARMA"
    UNKNOWN = "UNKNOWN"


@dataclass
class GroundedFact:
    """A factual citation retrieved directly from the database."""
    category: str
    record_id: Optional[int]
    summary: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CopilotResponse:
    """Explainable grounded response from the Pharmacy Copilot."""
    intent: CopilotIntent
    answer: str
    grounded_facts: List[GroundedFact] = field(default_factory=list)
    confidence: float = 0.95
    suggested_actions: List[str] = field(default_factory=list)
    is_data_available: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.intent.value,
            "answer": self.answer,
            "grounded_facts": [
                {
                    "category": f.category,
                    "record_id": f.record_id,
                    "summary": f.summary,
                    "details": f.details,
                }
                for f in self.grounded_facts
            ],
            "confidence": round(self.confidence, 2),
            "suggested_actions": self.suggested_actions,
            "is_data_available": self.is_data_available,
        }


class PharmacyRAGEngine:
    """
    Grounds user questions into deterministic database queries and produces
    accurate, hallucination-free answers for pharmacy staff and owners.
    """

    def classify_intent(self, query: str) -> CopilotIntent:
        q = query.lower()

        if any(k in q for k in ["expir", "expiry", "expire", "near expiry", "outdated", "short date"]):
            return CopilotIntent.EXPIRY_RISK

        if any(k in q for k in ["low stock", "out of stock", "reorder", "shortage", "running out", "depleted"]):
            return CopilotIntent.LOW_STOCK

        if any(k in q for k in ["sale", "sales", "revenue", "bills", "profit", "collection", "today's total"]):
            return CopilotIntent.SALES_METRICS

        if any(k in q for k in ["purchase", "distributor", "supplier", "invoice", "intake", "order"]):
            return CopilotIntent.PURCHASE_METRICS

        if any(k in q for k in ["stock", "where", "location", "shelf", "rack", "available", "units", "quantity", "have"]):
            return CopilotIntent.STOCK_LOOKUP

        return CopilotIntent.GENERAL_PHARMA

    def answer_query(self, query: str, store_id: int) -> CopilotResponse:
        intent = self.classify_intent(query)

        if intent == CopilotIntent.STOCK_LOOKUP:
            return self._handle_stock_lookup(query, store_id)
        elif intent == CopilotIntent.LOW_STOCK:
            return self._handle_low_stock(query, store_id)
        elif intent == CopilotIntent.EXPIRY_RISK:
            return self._handle_expiry_risk(query, store_id)
        elif intent == CopilotIntent.SALES_METRICS:
            return self._handle_sales_metrics(query, store_id)
        elif intent == CopilotIntent.PURCHASE_METRICS:
            return self._handle_purchase_metrics(query, store_id)
        else:
            return self._handle_general_or_unknown(query, store_id)

    def _extract_medicine_keyword(self, query: str) -> str:
        """Strip conversational filler to isolate the medicine name."""
        cleaned = re.sub(
            r"\b(where is|how many|do we have|stock of|units of|available|what is the price of|tell me about|check|find|lookup|the|stored|kept|located|placed|in stock|at)\b",
            "",
            query,
            flags=re.IGNORECASE,
        )
        return cleaned.strip(" ?.,!")

    def _handle_stock_lookup(self, query: str, store_id: int) -> CopilotResponse:
        keyword = self._extract_medicine_keyword(query)
        if not keyword:
            return CopilotResponse(
                intent=CopilotIntent.STOCK_LOOKUP,
                answer="Please specify which medicine you want to check stock or location for.",
                is_data_available=False,
            )

        # Search Medicine by name or alias
        medicines = (
            Medicine.query.filter(
                Medicine.store_id == store_id,
                Medicine.is_active == True,
                (Medicine.brand_name.ilike(f"%{keyword}%") | Medicine.generic_name.ilike(f"%{keyword}%")),
            )
            .limit(5)
            .all()
        )

        if not medicines:
            # Try non-trivial individual tokens (e.g. "Crocin", "Dolo", "Mox")
            tokens = [t for t in keyword.split() if len(t) >= 3 and not t.isdigit()]
            for t in tokens:
                matches = (
                    Medicine.query.filter(
                        Medicine.store_id == store_id,
                        Medicine.is_active == True,
                        (Medicine.brand_name.ilike(f"%{t}%") | Medicine.generic_name.ilike(f"%{t}%")),
                    )
                    .limit(5)
                    .all()
                )
                if matches:
                    medicines = matches
                    break

        if not medicines:
            # Check aliases
            alias_match = (
                MedicineAlias.query.join(Medicine)
                .filter(Medicine.store_id == store_id, MedicineAlias.alias_name.ilike(f"%{keyword}%"))
                .first()
            )
            if alias_match and alias_match.medicine:
                medicines = [alias_match.medicine]

        if not medicines:
            return CopilotResponse(
                intent=CopilotIntent.STOCK_LOOKUP,
                answer=f"No active medicine matching '{keyword}' was found in the store catalog.",
                is_data_available=False,
                suggested_actions=["Check spelling or search by generic molecule name", "Register new medicine"],
            )

        med = medicines[0]
        facts: List[GroundedFact] = []
        total_units = 0

        # Query all active inventory and batches for this medicine
        inventories = (
            Inventory.query.join(Batch)
            .filter(
                Inventory.store_id == store_id,
                Batch.medicine_id == med.id,
                Inventory.quantity_available > 0,
            )
            .all()
        )

        batch_details = []
        for inv in inventories:
            batch = inv.batch
            loc_name = inv.location.name if inv.location else "Unassigned Location"
            total_units += inv.quantity_available
            batch_details.append(
                f"Batch {batch.batch_number} (Exp: {batch.expiry_date.strftime('%b %Y')}): {inv.quantity_available} units at {loc_name}"
            )
            facts.append(
                GroundedFact(
                    category="INVENTORY_BATCH",
                    record_id=inv.id,
                    summary=f"{med.brand_name} Batch {batch.batch_number}: {inv.quantity_available} units at {loc_name}",
                    details={
                        "medicine_id": med.id,
                        "brand_name": med.brand_name,
                        "batch_number": batch.batch_number,
                        "expiry_date": batch.expiry_date.isoformat(),
                        "quantity_available": inv.quantity_available,
                        "location_name": loc_name,
                        "mrp": float(batch.mrp or med.mrp or 0.0),
                    },
                )
            )

        if total_units > 0:
            batches_text = "; ".join(batch_details)
            ans = f"{med.brand_name} ({med.strength or ''}) has {total_units} units available across {len(inventories)} batch(es). Locations: {batches_text}."
            actions = ["Add to POS Bill", "View Alternative Medicines"]
        else:
            ans = f"{med.brand_name} is currently OUT OF STOCK (0 units available in store)."
            actions = ["Find in-stock generic alternatives", "Create purchase order recommendation"]

        return CopilotResponse(
            intent=CopilotIntent.STOCK_LOOKUP,
            answer=ans,
            grounded_facts=facts,
            is_data_available=True,
            suggested_actions=actions,
        )

    def _handle_low_stock(self, query: str, store_id: int) -> CopilotResponse:
        """List products with stock <= 15 units or out of stock."""
        threshold = 15

        # Query medicines in store
        meds = Medicine.query.filter_by(store_id=store_id, is_active=True).all()
        low_stock_items = []
        facts: List[GroundedFact] = []

        for m in meds:
            total_stock = (
                db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
                .join(Batch, Inventory.batch_id == Batch.id)
                .filter(Inventory.store_id == store_id, Batch.medicine_id == m.id)
                .scalar()
            )
            if total_stock <= threshold:
                low_stock_items.append((m, total_stock))
                facts.append(
                    GroundedFact(
                        category="LOW_STOCK",
                        record_id=m.id,
                        summary=f"{m.brand_name}: {total_stock} units left",
                        details={"medicine_id": m.id, "brand_name": m.brand_name, "units": total_stock},
                    )
                )

        if not low_stock_items:
            return CopilotResponse(
                intent=CopilotIntent.LOW_STOCK,
                answer="All catalog medicines currently have healthy stock levels above minimum thresholds.",
                is_data_available=True,
            )

        low_stock_items.sort(key=lambda x: x[1])
        item_summaries = [f"{m.brand_name} ({qty} units)" for m, qty in low_stock_items[:5]]
        answer = (
            f"Found {len(low_stock_items)} medicine(s) with low stock (<= {threshold} units): "
            + ", ".join(item_summaries)
            + ". Consider generating purchase orders."
        )

        return CopilotResponse(
            intent=CopilotIntent.LOW_STOCK,
            answer=answer,
            grounded_facts=facts,
            is_data_available=True,
            suggested_actions=["Draft Reorder with Preferred Distributors", "Check Sales Velocity"],
        )

    def _handle_expiry_risk(self, query: str, store_id: int) -> CopilotResponse:
        """Find batches expiring within 30, 60, or 90 days."""
        today = datetime.date.today()
        days_ahead = 90
        if "30" in query or "month" in query:
            days_ahead = 30

        cutoff = today + datetime.timedelta(days=days_ahead)

        expiring_inventories = (
            Inventory.query.join(Batch)
            .join(Medicine)
            .filter(
                Inventory.store_id == store_id,
                Inventory.quantity_available > 0,
                Batch.expiry_date <= cutoff,
            )
            .order_by(Batch.expiry_date.asc())
            .all()
        )

        facts: List[GroundedFact] = []
        for inv in expiring_inventories:
            med = inv.batch.medicine
            batch = inv.batch
            loc = inv.location.name if inv.location else "Unassigned"
            facts.append(
                GroundedFact(
                    category="EXPIRY_RISK",
                    record_id=batch.id,
                    summary=f"{med.brand_name} (Batch {batch.batch_number}): {inv.quantity_available} units expire on {batch.expiry_date.isoformat()} at {loc}",
                    details={
                        "medicine_id": med.id,
                        "brand_name": med.brand_name,
                        "batch_number": batch.batch_number,
                        "expiry_date": batch.expiry_date.isoformat(),
                        "quantity": inv.quantity_available,
                        "location": loc,
                    },
                )
            )

        if not expiring_inventories:
            return CopilotResponse(
                intent=CopilotIntent.EXPIRY_RISK,
                answer=f"No active inventory is at risk of expiring within the next {days_ahead} days.",
                is_data_available=True,
            )

        top_items = [
            f"{inv.batch.medicine.brand_name} ({inv.quantity_available} units, Exp: {inv.batch.expiry_date.strftime('%d-%b-%Y')})"
            for inv in expiring_inventories[:4]
        ]
        answer = (
            f"Identified {len(expiring_inventories)} batch(es) expiring within {days_ahead} days: "
            + "; ".join(top_items)
            + ". Auto-FEFO prioritization is active for POS dispensing."
        )

        return CopilotResponse(
            intent=CopilotIntent.EXPIRY_RISK,
            answer=answer,
            grounded_facts=facts,
            is_data_available=True,
            suggested_actions=["Prioritize in FEFO POS billing", "Initiate distributor return claim"],
        )

    def _handle_sales_metrics(self, query: str, store_id: int) -> CopilotResponse:
        """Grounded summary of today's sales and revenue."""
        today = datetime.date.today()
        sales_today = (
            Sale.query.filter(
                Sale.store_id == store_id,
                db.func.date(Sale.sale_date) == today,
            ).all()
        )

        total_rev = sum(s.total_amount for s in sales_today) if sales_today else Decimal("0.0")
        facts = [
            GroundedFact(
                category="SALES_METRICS",
                record_id=None,
                summary=f"Today's Sales ({today}): {len(sales_today)} bills, Total Revenue: Rs. {total_rev}",
                details={"date": today.isoformat(), "bill_count": len(sales_today), "total_revenue": float(total_rev)},
            )
        ]

        answer = (
            f"Today's metrics for Store #{store_id}: {len(sales_today)} bill(s) dispensed, "
            f"generating Rs. {total_rev:.2f} in total revenue."
        )

        return CopilotResponse(
            intent=CopilotIntent.SALES_METRICS,
            answer=answer,
            grounded_facts=facts,
            is_data_available=True,
            suggested_actions=["View Detailed Sales Report", "Check Cash Drawer Reconciliation"],
        )

    def _handle_purchase_metrics(self, query: str, store_id: int) -> CopilotResponse:
        """Grounded status of distributor purchases and pending drafts."""
        drafts = (
            PurchaseInvoice.query.filter_by(
                store_id=store_id,
                status=PurchaseInvoiceStatus.DRAFT,
            )
            .order_by(PurchaseInvoice.created_at.desc())
            .all()
        )

        facts: List[GroundedFact] = []
        for d in drafts:
            sup_name = d.supplier.name if d.supplier else "Unknown Supplier"
            facts.append(
                GroundedFact(
                    category="PURCHASE_DRAFT",
                    record_id=d.id,
                    summary=f"Draft #{d.id} ({d.invoice_number}) from {sup_name}: Rs. {d.total_amount:.2f}",
                    details={"invoice_id": d.id, "invoice_number": d.invoice_number, "supplier": sup_name, "total": float(d.total_amount)},
                )
            )

        if not drafts:
            return CopilotResponse(
                intent=CopilotIntent.PURCHASE_METRICS,
                answer="There are no pending purchase drafts awaiting receiving verification.",
                is_data_available=True,
            )

        answer = f"You have {len(drafts)} purchase draft(s) awaiting intake verification. Latest: Invoice #{drafts[0].invoice_number} (Rs. {drafts[0].total_amount:.2f})."
        return CopilotResponse(
            intent=CopilotIntent.PURCHASE_METRICS,
            answer=answer,
            grounded_facts=facts,
            is_data_available=True,
            suggested_actions=["Open Receiving Workstation", "Scan Distributor Delivery"],
        )

    def _handle_general_or_unknown(self, query: str, store_id: int) -> CopilotResponse:
        return CopilotResponse(
            intent=CopilotIntent.GENERAL_PHARMA,
            answer=(
                "I am your SmartPharm AI Copilot grounded in your pharmacy database. "
                "You can ask me about medicine stock ('Where is Crocin?'), low stock warnings, "
                "upcoming batch expiries, or today's sales totals."
            ),
            is_data_available=True,
            suggested_actions=[
                "Where is Crocin 650?",
                "What products expire next month?",
                "What medicines are low in stock?",
                "Show today's sales",
            ],
        )


default_rag_engine = PharmacyRAGEngine()
