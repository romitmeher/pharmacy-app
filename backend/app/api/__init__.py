# SmartPharm Backend — API Package
from app.api.auth import auth_bp
from app.api.medicines import medicines_bp
from app.api.locations import locations_bp
from app.api.suppliers import suppliers_bp
from app.api.inventory import inventory_bp
from app.api.sales import sales_bp
from app.api.purchases import purchases_bp
from app.api.vision import vision_bp
from app.api.distributor import distributor_bp
from app.api.ai import ai_bp
from app.api.ml import ml_bp
from app.api.shelf import shelf_bp
from app.api.audit import audit_bp
from app.api.returns import returns_bp
from app.api.prescriptions import prescriptions_bp
from app.api.expenses import expenses_bp

__all__ = [
    "auth_bp",
    "medicines_bp",
    "locations_bp",
    "suppliers_bp",
    "inventory_bp",
    "sales_bp",
    "purchases_bp",
    "vision_bp",
    "distributor_bp",
    "ai_bp",
    "ml_bp",
    "shelf_bp",
    "audit_bp",
    "returns_bp",
    "prescriptions_bp",
    "expenses_bp",
]


