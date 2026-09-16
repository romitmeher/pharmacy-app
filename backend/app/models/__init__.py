"""
SmartPharm Backend — Model Registry.

Imports all models so that Flask-Migrate / Alembic can detect them
when generating migrations. Import this module wherever you need
all models to be registered with SQLAlchemy.
"""

# Store must be imported first (other models reference it via FK)
from app.models.store import Store  # noqa: F401

# User
from app.models.user import User, UserRole  # noqa: F401

# Medicine domain
from app.models.medicine import (  # noqa: F401
    Medicine,
    DosageForm,
    Ingredient,
    MedicineAlias,
    MedicineVisualFeature,
)

# Batch
from app.models.batch import Batch  # noqa: F401

# Location
from app.models.location import Location, LocationType  # noqa: F401

# Inventory
from app.models.inventory import Inventory  # noqa: F401

# Supplier
from app.models.supplier import Supplier  # noqa: F401

# Sales & Billing domain
from app.models.sale import (  # noqa: F401
    Customer,
    Sale,
    SaleItem,
    Payment,
    PaymentMethod,
    PaymentStatus,
)

# Purchases & Invoices domain
from app.models.purchase import (  # noqa: F401
    PurchaseInvoice,
    PurchaseItem,
    PurchaseInvoiceStatus,
)

# Offline Sync Queue domain
from app.models.sync_transaction import (  # noqa: F401
    SyncTransaction,
    SyncStatus,
)

# Multi-Branch & Stock Transfers domain
from app.models.stock_transfer import (  # noqa: F401
    StockTransfer,
    StockTransferItem,
    TransferStatus,
)

# Centralized Audit Log domain
from app.models.audit_log import AuditLog  # noqa: F401

# Sales Returns & Refunds domain
from app.models.sale_return import (  # noqa: F401
    Return,
    ReturnItem,
    ReturnStatus,
    RestockCondition,
)

# Prescriptions domain
from app.models.prescription import (  # noqa: F401
    Prescription,
    PrescriptionItem,
    PrescriptionStatus,
)

# Operating Expenses domain
from app.models.expense import (  # noqa: F401
    Expense,
    ExpenseCategory,
    ExpensePaymentMethod,
)

# AI / Copilot Interactions domain
from app.models.ai_interaction import AIInteraction  # noqa: F401


