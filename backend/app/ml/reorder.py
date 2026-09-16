"""
SmartPharm - Smart Reorder Recommendation Engine
Strict compliance with SmartPharm PRD Rule 18:
- Formula:
  Recommended Order Quantity = max(
      0,
      (Daily Forecast * (Lead Time + Review Period)) + Safety Stock - Current Inventory - Open Purchase Orders
  )
- Fully explainable calculations for pharmacists and store owners:
  - Transparent breakdown of Lead Time, Review Horizon, Daily Velocity, Safety Margin, and Pipeline Stock.
  - Linked to preferred distributor with historical unit purchase rates.
- Recommendation workflow ONLY:
  - Supports 1-click draft PO generation that creates a DRAFT PurchaseInvoice for human review.
  - Never automatically submits orders to external suppliers or mutates inventory.
"""

from dataclasses import dataclass
import datetime
import enum
import logging
import math
from typing import Any, Dict, List, Optional

from app.extensions import db
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.purchase import PurchaseInvoice, PurchaseInvoiceStatus, PurchaseItem
from app.models.supplier import Supplier
from app.ml.forecasting import default_forecasting_engine

logger = logging.getLogger(__name__)


class ReorderUrgency(str, enum.Enum):
    CRITICAL = "CRITICAL"    # Current stock is below lead time demand (will stock out before order arrives)
    HIGH = "HIGH"            # Current stock is below safety stock threshold
    MEDIUM = "MEDIUM"        # Reorder point reached within review cycle
    ROUTINE = "ROUTINE"      # Suggested replenishment to maintain optimal cycle inventory


@dataclass
class ReorderRecommendation:
    medicine_id: int
    brand_name: str
    category: Optional[str]
    current_stock: int
    open_po_quantity: int
    forecasted_daily_demand: float
    review_period_days: int
    forecast_cycle_demand: float
    supplier_lead_time_days: int
    lead_time_demand: float
    safety_stock: int
    target_stock_level: int
    net_deficit: float
    recommended_order_quantity: int
    estimated_purchase_rate: float
    estimated_total_cost: float
    urgency: ReorderUrgency
    preferred_supplier_id: Optional[int]
    preferred_supplier_name: Optional[str]
    explanation: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "medicine_id": self.medicine_id,
            "brand_name": self.brand_name,
            "category": self.category,
            "current_stock": self.current_stock,
            "open_po_quantity": self.open_po_quantity,
            "forecasted_daily_demand": round(self.forecasted_daily_demand, 2),
            "review_period_days": self.review_period_days,
            "forecast_cycle_demand": round(self.forecast_cycle_demand, 1),
            "supplier_lead_time_days": self.supplier_lead_time_days,
            "lead_time_demand": round(self.lead_time_demand, 1),
            "safety_stock": self.safety_stock,
            "target_stock_level": self.target_stock_level,
            "net_deficit": round(self.net_deficit, 1),
            "recommended_order_quantity": self.recommended_order_quantity,
            "estimated_purchase_rate": round(self.estimated_purchase_rate, 2),
            "estimated_total_cost": round(self.estimated_total_cost, 2),
            "urgency": self.urgency.value,
            "preferred_supplier_id": self.preferred_supplier_id,
            "preferred_supplier_name": self.preferred_supplier_name,
            "explanation": self.explanation,
        }


class SmartReorderEngine:
    """
    Computes intelligent inventory replenishment quantities according to
    PRD Rule 18 with explicit mathematical explainability.
    """

    def __init__(
        self,
        default_lead_time_days: int = 3,
        default_review_period_days: int = 14,
        safety_stock_coverage_days: int = 5,
        default_pack_size: int = 10,
    ):
        self.default_lead_time_days = default_lead_time_days
        self.default_review_period_days = default_review_period_days
        self.safety_stock_coverage_days = safety_stock_coverage_days
        self.default_pack_size = default_pack_size

    def compute_reorder_recommendation(
        self,
        store_id: int,
        medicine: Medicine,
        review_period_days: Optional[int] = None,
        lead_time_days: Optional[int] = None,
    ) -> Optional[ReorderRecommendation]:
        """
        Compute reorder recommendation for a specific medicine in a store.
        """
        review_days = review_period_days or self.default_review_period_days
        effective_lead_time = lead_time_days or self.default_lead_time_days

        # 1. Determine Current Physical Stock (non-expired inventory units)
        now_date = datetime.date.today()
        stock_units = (
            db.session.query(db.func.coalesce(db.func.sum(Inventory.quantity_available), 0))
            .join(Batch, Inventory.batch_id == Batch.id)
            .filter(
                Inventory.store_id == store_id,
                Batch.medicine_id == medicine.id,
                Batch.expiry_date >= now_date,
            )
            .scalar()
        )
        current_stock = int(stock_units)

        # 2. Determine Open Purchase Orders / Draft Invoices (Pipeline stock)
        # Any items in DRAFT or VERIFIED invoices not yet accepted
        open_items = (
            db.session.query(PurchaseItem)
            .join(PurchaseInvoice, PurchaseItem.purchase_invoice_id == PurchaseInvoice.id)
            .filter(
                PurchaseInvoice.store_id == store_id,
                PurchaseInvoice.status.in_([PurchaseInvoiceStatus.DRAFT, PurchaseInvoiceStatus.VERIFIED]),
                PurchaseItem.medicine_id == medicine.id,
            )
            .all()
        )
        open_po_qty = sum(item.quantity for item in open_items)

        # 3. Forecast Daily Demand Rate
        forecast = default_forecasting_engine.forecast_demand(
            medicine_id=medicine.id,
            store_id=store_id,
            horizon_days=review_days + effective_lead_time,
        )
        daily_demand = max(forecast.average_daily_demand, 0.0)

        # If zero demand and zero past sales, check if medicine has minimum stock requirement
        if daily_demand <= 0.0:
            # Baseline 0.1 units/day if active catalog item to avoid division by zero
            daily_demand = 0.2

        # 4. PRD Rule 18 Mathematical Computations
        lead_time_demand = daily_demand * effective_lead_time
        cycle_demand = daily_demand * review_days
        safety_stock = int(math.ceil(daily_demand * self.safety_stock_coverage_days))
        
        # Target stock = Demand during (Lead Time + Review Cycle) + Safety Stock
        target_stock_level = int(math.ceil((daily_demand * (effective_lead_time + review_days)) + safety_stock))
        
        # Net Deficit = Target - Current Stock - Open POs
        net_deficit = target_stock_level - current_stock - open_po_qty

        # 5. Determine Urgency
        if current_stock <= lead_time_demand:
            urgency = ReorderUrgency.CRITICAL
        elif current_stock <= safety_stock:
            urgency = ReorderUrgency.HIGH
        elif net_deficit > 0:
            urgency = ReorderUrgency.MEDIUM
        else:
            urgency = ReorderUrgency.ROUTINE

        # Only recommend if deficit > 0
        if net_deficit <= 0:
            recommended_order_qty = 0
        else:
            # Round up to nearest standard pack size (e.g. 10s or strips)
            pack = self.default_pack_size
            recommended_order_qty = int(math.ceil(net_deficit / pack) * pack)
            if recommended_order_qty == 0 and net_deficit > 0:
                recommended_order_qty = pack

        # 6. Lookup Preferred Supplier & Last Purchase Rate
        last_purchase_item = (
            db.session.query(PurchaseItem)
            .join(PurchaseInvoice, PurchaseItem.purchase_invoice_id == PurchaseInvoice.id)
            .filter(
                PurchaseInvoice.store_id == store_id,
                PurchaseItem.medicine_id == medicine.id,
            )
            .order_by(PurchaseInvoice.invoice_date.desc(), PurchaseItem.id.desc())
            .first()
        )

        supplier_id = None
        supplier_name = None
        unit_rate = 0.0

        if last_purchase_item and last_purchase_item.purchase_invoice:
            supplier_id = last_purchase_item.purchase_invoice.supplier_id
            if last_purchase_item.purchase_invoice.supplier:
                supplier_name = last_purchase_item.purchase_invoice.supplier.name
            if last_purchase_item.purchase_rate:
                unit_rate = float(last_purchase_item.purchase_rate)
        
        if unit_rate <= 0.0:
            latest_batch = (
                db.session.query(Batch)
                .filter(Batch.medicine_id == medicine.id, Batch.store_id == store_id)
                .order_by(Batch.id.desc())
                .first()
            )
            if latest_batch and latest_batch.purchase_price:
                unit_rate = float(latest_batch.purchase_price)
            elif medicine.selling_price:
                unit_rate = float(medicine.selling_price) * 0.7
            else:
                unit_rate = float(medicine.mrp or 10.0) * 0.7
        else:
            # Fallback: check any supplier registered in store
            first_sup = db.session.query(Supplier).filter(Supplier.store_id == store_id, Supplier.is_active.is_(True)).first()
            if first_sup:
                supplier_id = first_sup.id
                supplier_name = first_sup.name

        estimated_total_cost = recommended_order_qty * unit_rate

        # 7. Construct PRD-compliant Mathematical Explanation
        explanation = (
            f"Forecasted velocity: {daily_demand:.2f} units/day over {review_days}d review period "
            f"+ {effective_lead_time}d lead time (Target: {target_stock_level} units). "
            f"Current stock ({current_stock}) + Open orders ({open_po_qty}) = {current_stock + open_po_qty} units. "
            f"Net required: {max(0, int(net_deficit))} units (ordered as {recommended_order_qty} units in standard pack sizes)."
        )

        return ReorderRecommendation(
            medicine_id=medicine.id,
            brand_name=medicine.brand_name,
            category=medicine.category,
            current_stock=current_stock,
            open_po_quantity=open_po_qty,
            forecasted_daily_demand=daily_demand,
            review_period_days=review_days,
            forecast_cycle_demand=cycle_demand,
            supplier_lead_time_days=effective_lead_time,
            lead_time_demand=lead_time_demand,
            safety_stock=safety_stock,
            target_stock_level=target_stock_level,
            net_deficit=net_deficit,
            recommended_order_quantity=recommended_order_qty,
            estimated_purchase_rate=unit_rate,
            estimated_total_cost=estimated_total_cost,
            urgency=urgency,
            preferred_supplier_id=supplier_id,
            preferred_supplier_name=supplier_name,
            explanation=explanation,
        )

    def get_store_reorder_recommendations(
        self,
        store_id: int,
        limit: int = 50,
        min_urgency: Optional[str] = None,
        only_actionable: bool = True,
    ) -> List[ReorderRecommendation]:
        """
        Evaluate all active medicines in store catalog and return prioritized reorder recommendations.
        """
        medicines = (
            db.session.query(Medicine)
            .filter(Medicine.store_id == store_id, Medicine.is_active.is_(True))
            .all()
        )

        recommendations: List[ReorderRecommendation] = []
        for med in medicines:
            rec = self.compute_reorder_recommendation(store_id=store_id, medicine=med)
            if not rec:
                continue

            if only_actionable and rec.recommended_order_quantity <= 0:
                continue

            if min_urgency:
                urgency_order = [ReorderUrgency.ROUTINE, ReorderUrgency.MEDIUM, ReorderUrgency.HIGH, ReorderUrgency.CRITICAL]
                try:
                    target_idx = urgency_order.index(ReorderUrgency(min_urgency))
                    rec_idx = urgency_order.index(rec.urgency)
                    if rec_idx < target_idx:
                        continue
                except ValueError:
                    pass

            recommendations.append(rec)

        # Priority Sort: CRITICAL > HIGH > MEDIUM > ROUTINE, then highest net deficit
        urgency_priority = {
            ReorderUrgency.CRITICAL: 0,
            ReorderUrgency.HIGH: 1,
            ReorderUrgency.MEDIUM: 2,
            ReorderUrgency.ROUTINE: 3,
        }
        recommendations.sort(
            key=lambda r: (urgency_priority.get(r.urgency, 99), -r.net_deficit)
        )

        return recommendations[:limit]

    def create_draft_purchase_order(
        self,
        store_id: int,
        user_id: int,
        supplier_id: int,
        items: List[Dict[str, Any]],
        notes: Optional[str] = None,
    ) -> PurchaseInvoice:
        """
        Creates a DRAFT PurchaseInvoice from ML recommendations per PRD Rule 18.
        Human-in-the-loop boundary:
        - Status is strictly DRAFT.
        - DOES NOT alter physical inventory or batch records.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        today = datetime.date.today()
        # Generate automated draft invoice tracking code
        draft_num = f"PO-DRAFT-{now.strftime('%Y%m%d%H%M%S')}"

        invoice = PurchaseInvoice(
            store_id=store_id,
            supplier_id=supplier_id,
            user_id=user_id,
            invoice_number=draft_num,
            invoice_date=today,
            status=PurchaseInvoiceStatus.DRAFT,
            notes=notes or "Auto-generated draft purchase order from SmartPharm ML Reorder Engine.",
            subtotal=0.0,
            tax_amount=0.0,
            discount_amount=0.0,
            total_amount=0.0,
        )
        db.session.add(invoice)
        db.session.flush()

        subtotal = 0.0
        for it in items:
            medicine_id = it.get("medicine_id")
            qty = int(it.get("quantity", 1))
            rate = float(it.get("purchase_rate", 0.0))
            line_total = qty * rate
            subtotal += line_total

            medicine = db.session.get(Medicine, medicine_id) if medicine_id else None
            mname = medicine.brand_name if medicine else "Unknown Medicine"
            mrp = float(medicine.mrp) if (medicine and medicine.mrp) else (rate * 1.2)

            p_item = PurchaseItem(
                purchase_invoice_id=invoice.id,
                medicine_id=medicine_id,
                raw_medicine_name=mname,
                batch_number="PENDING-DELIVERY",
                expiry_date=today + datetime.timedelta(days=365),  # Placeholder until delivery scan
                quantity=qty,
                received_quantity=0,
                purchase_rate=rate,
                mrp=mrp,
                discount_percentage=0.0,
                tax_percentage=0.0,
                total_amount=line_total,
                is_verified=False,
            )
            db.session.add(p_item)

        invoice.subtotal = subtotal
        invoice.total_amount = subtotal
        db.session.commit()

        logger.info(
            f"Created DRAFT PurchaseInvoice #{invoice.id} ({invoice.invoice_number}) "
            f"for Supplier #{supplier_id} with {len(items)} items, Total: {invoice.total_amount}"
        )
        return invoice


default_reorder_engine = SmartReorderEngine()
