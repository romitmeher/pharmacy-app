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
