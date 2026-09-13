"""
Tests for core database models.

Validates the critical Medicine -> Batch -> Inventory relationship hierarchy,
model creation, constraints, and basic behaviors.
"""

from datetime import date, datetime, timezone

from app.models.store import Store
from app.models.user import User, UserRole
from app.models.medicine import Medicine, DosageForm, Ingredient, MedicineAlias
from app.models.batch import Batch
from app.models.inventory import Inventory
from app.models.location import Location, LocationType
from app.models.supplier import Supplier


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

class TestStore:
    def test_create_store(self, db):
        store = Store(name="Apollo Pharmacy", phone="9876543210")
        db.session.add(store)
        db.session.commit()

        assert store.id is not None
        assert store.name == "Apollo Pharmacy"
        assert store.is_active is True
        assert store.created_at is not None


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class TestUser:
    def test_create_user(self, db, sample_store):
        user = User(
            store_id=sample_store.id,
            email="pharmacist@test.com",
            username="pharmacist1",
            full_name="Dr. Test",
            role=UserRole.PHARMACIST,
        )
        user.set_password("securepass")
        db.session.add(user)
        db.session.commit()

        assert user.id is not None
        assert user.role == UserRole.PHARMACIST
        assert user.store_id == sample_store.id

    def test_password_hashing(self, db, sample_store):
        user = User(
            store_id=sample_store.id,
            email="test@test.com",
            username="testuser",
            full_name="Test User",
            role=UserRole.CASHIER,
        )
        user.set_password("mypassword")
        db.session.add(user)
        db.session.commit()

        assert user.password_hash != "mypassword"
        assert user.check_password("mypassword") is True
        assert user.check_password("wrongpassword") is False

    def test_user_belongs_to_store(self, db, sample_store, sample_owner):
        assert sample_owner.store.id == sample_store.id
        assert sample_owner in sample_store.users.all()


# ---------------------------------------------------------------------------
# Medicine
# ---------------------------------------------------------------------------

class TestMedicine:
    def test_create_medicine(self, db, sample_store):
        medicine = Medicine(
            store_id=sample_store.id,
            brand_name="Crocin Advance",
            generic_name="Paracetamol",
            manufacturer="GSK",
            strength="500mg",
            dosage_form=DosageForm.TABLET,
            route="oral",
            category="analgesic",
            is_prescription_only=False,
            mrp=30.00,
            selling_price=28.00,
            hsn_code="3004",
            gst_percentage=12.00,
        )
        db.session.add(medicine)
        db.session.commit()

        assert medicine.id is not None
        assert medicine.brand_name == "Crocin Advance"
        assert medicine.dosage_form == DosageForm.TABLET

    def test_medicine_with_ingredients(self, db, sample_store):
        medicine = Medicine(
            store_id=sample_store.id,
            brand_name="Combiflam",
            generic_name="Ibuprofen + Paracetamol",
            manufacturer="Sanofi",
            strength="400mg+325mg",
            dosage_form=DosageForm.TABLET,
        )
        medicine.ingredients.append(
            Ingredient(name="Ibuprofen", strength="400", unit="mg")
        )
        medicine.ingredients.append(
            Ingredient(name="Paracetamol", strength="325", unit="mg")
        )
        db.session.add(medicine)
        db.session.commit()

        assert len(medicine.ingredients) == 2
        names = {i.name for i in medicine.ingredients}
        assert "Ibuprofen" in names
        assert "Paracetamol" in names

    def test_medicine_with_alias(self, db, sample_store):
        medicine = Medicine(
            store_id=sample_store.id,
            brand_name="Dolo 650",
            generic_name="Paracetamol",
            manufacturer="Micro Labs",
        )
        medicine.aliases.append(
            MedicineAlias(alias_name="Dolo", alias_type="common_name")
        )
        db.session.add(medicine)
        db.session.commit()

        assert len(medicine.aliases) == 1
        assert medicine.aliases[0].alias_name == "Dolo"


# ---------------------------------------------------------------------------
# Medicine -> Batch -> Inventory (Critical Hierarchy)
# ---------------------------------------------------------------------------

class TestCriticalHierarchy:
    """Tests for the PRD's most critical data relationship:
    Medicine -> Batch -> Inventory.
    """

    def test_batch_belongs_to_medicine(self, db, sample_store):
        medicine = Medicine(
            store_id=sample_store.id,
            brand_name="Augmentin 625",
            generic_name="Amoxicillin + Clavulanic Acid",
            manufacturer="GSK",
        )
        db.session.add(medicine)
        db.session.commit()

        batch = Batch(
            medicine_id=medicine.id,
            store_id=sample_store.id,
            batch_number="AUG2024A",
            expiry_date=date(2025, 6, 30),
            purchase_price=120.00,
            mrp=185.50,
            quantity_received=100,
        )
        db.session.add(batch)
        db.session.commit()

        assert batch.medicine_id == medicine.id
        assert batch.medicine.brand_name == "Augmentin 625"
        assert medicine.batches.count() == 1

    def test_inventory_belongs_to_batch(self, db, sample_store):
        medicine = Medicine(
            store_id=sample_store.id,
            brand_name="Calpol",
            generic_name="Paracetamol",
            manufacturer="GSK",
        )
        batch = Batch(
            medicine=medicine,
            store_id=sample_store.id,
            batch_number="CAL001",
            expiry_date=date(2025, 12, 31),
            quantity_received=50,
        )
        db.session.add_all([medicine, batch])
        db.session.commit()

        inventory = Inventory(
            batch_id=batch.id,
            store_id=sample_store.id,
            quantity_available=50,
        )
        db.session.add(inventory)
        db.session.commit()

        assert inventory.batch_id == batch.id
        assert inventory.batch.medicine.brand_name == "Calpol"

    def test_full_hierarchy_traversal(self, db, sample_store):
        """Medicine -> Batch -> Inventory with Location.
        Verifies the complete three-level hierarchy can be traversed.
        """
        location = Location(
            store_id=sample_store.id,
            name="Shelf A-1",
            location_type=LocationType.SHELF,
        )
        medicine = Medicine(
            store_id=sample_store.id,
            brand_name="Azithral 500",
            generic_name="Azithromycin",
            manufacturer="Alembic",
            strength="500mg",
            dosage_form=DosageForm.TABLET,
        )
        db.session.add_all([location, medicine])
        db.session.commit()

        batch = Batch(
            medicine_id=medicine.id,
            store_id=sample_store.id,
            batch_number="AZ500-B1",
            expiry_date=date(2026, 3, 31),
            purchase_price=85.00,
            mrp=142.00,
            quantity_received=200,
        )
        db.session.add(batch)
        db.session.commit()

        inventory = Inventory(
            batch_id=batch.id,
            store_id=sample_store.id,
            location_id=location.id,
            quantity_available=200,
        )
        db.session.add(inventory)
        db.session.commit()

        # Traverse: Inventory -> Batch -> Medicine
        assert inventory.batch.medicine.brand_name == "Azithral 500"
        assert inventory.batch.expiry_date == date(2026, 3, 31)
        assert inventory.location.name == "Shelf A-1"

        # Traverse: Medicine -> Batches -> Inventory
        batches = medicine.batches.all()
        assert len(batches) == 1
        assert len(batches[0].inventory) == 1
        assert batches[0].inventory[0].quantity_available == 200


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------

class TestLocation:
    def test_create_location(self, db, sample_store):
        location = Location(
            store_id=sample_store.id,
            name="Fridge 1",
            description="Temperature-controlled storage",
            location_type=LocationType.FRIDGE,
        )
        db.session.add(location)
        db.session.commit()

        assert location.id is not None
        assert location.location_type == LocationType.FRIDGE


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------

class TestSupplier:
    def test_create_supplier(self, db, sample_store):
        supplier = Supplier(
            store_id=sample_store.id,
            name="ABC Distributors",
            contact_person="Rajesh Kumar",
            phone="9876543210",
            gstin="27BBBBB0000B1Z5",
        )
        db.session.add(supplier)
        db.session.commit()

        assert supplier.id is not None
        assert supplier.name == "ABC Distributors"
        assert supplier.store_id == sample_store.id
