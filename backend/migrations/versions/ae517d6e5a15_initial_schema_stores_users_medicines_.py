"""Initial schema - stores, users, medicines, batches, inventory, locations, suppliers

Revision ID: ae517d6e5a15
Revises: 
Create Date: 2026-09-13 22:39:19.614111

This migration drops all pre-existing tables from a previous project
and creates the SmartPharm schema from scratch.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'ae517d6e5a15'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # Drop pre-existing tables from previous project (order respects FKs)
    # ------------------------------------------------------------------
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # Tables to drop (children before parents due to FK constraints)
    old_tables = [
        'expenses', 'documents', 'owners', 'buyers', 'investors',
        'deals', 'districts', 'states', 'users',
    ]
    for table in old_tables:
        if table in existing_tables:
            op.drop_table(table)

    # ------------------------------------------------------------------
    # Create SmartPharm schema
    # ------------------------------------------------------------------

    # 1. Stores (top-level entity)
    op.create_table('stores',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('gstin', sa.String(length=15), nullable=True),
        sa.Column('drug_license_number', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. Users (belongs to store)
    op.create_table('users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=200), nullable=False),
        sa.Column('role', sa.Enum('OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY_STAFF', name='userrole'), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('store_id', 'email', name='uq_user_store_email'),
        sa.UniqueConstraint('store_id', 'username', name='uq_user_store_username'),
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_store_id'), ['store_id'], unique=False)

    # 3. Locations (belongs to store)
    op.create_table('locations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=300), nullable=True),
        sa.Column('location_type', sa.Enum('SHELF', 'RACK', 'DRAWER', 'FRIDGE', 'COUNTER', 'OTHER', name='locationtype'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('store_id', 'name', name='uq_location_store_name'),
    )
    with op.batch_alter_table('locations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_locations_store_id'), ['store_id'], unique=False)

    # 4. Medicines (belongs to store)
    op.create_table('medicines',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('brand_name', sa.String(length=300), nullable=False),
        sa.Column('generic_name', sa.String(length=300), nullable=True),
        sa.Column('manufacturer', sa.String(length=300), nullable=True),
        sa.Column('strength', sa.String(length=100), nullable=True),
        sa.Column('dosage_form', sa.Enum('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'CREAM', 'OINTMENT', 'GEL', 'DROPS', 'INHALER', 'POWDER', 'SUPPOSITORY', 'PATCH', 'SPRAY', 'LOTION', 'SOLUTION', 'OTHER', name='dosageform'), nullable=True),
        sa.Column('route', sa.String(length=50), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('is_prescription_only', sa.Boolean(), nullable=False),
        sa.Column('mrp', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('selling_price', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('hsn_code', sa.String(length=20), nullable=True),
        sa.Column('gst_percentage', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('storage_requirements', sa.String(length=200), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('medicines', schema=None) as batch_op:
        batch_op.create_index('ix_medicine_brand_name', ['store_id', 'brand_name'], unique=False)
        batch_op.create_index('ix_medicine_generic_name', ['store_id', 'generic_name'], unique=False)
        batch_op.create_index('ix_medicine_manufacturer', ['store_id', 'manufacturer'], unique=False)
        batch_op.create_index(batch_op.f('ix_medicines_store_id'), ['store_id'], unique=False)

    # 5. Suppliers (belongs to store)
    op.create_table('suppliers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('contact_person', sa.String(length=200), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('gstin', sa.String(length=15), nullable=True),
        sa.Column('drug_license_number', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('store_id', 'name', name='uq_supplier_store_name'),
    )
    with op.batch_alter_table('suppliers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_suppliers_store_id'), ['store_id'], unique=False)

    # 6. Batches (belongs to medicine + store)
    op.create_table('batches',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('medicine_id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('batch_number', sa.String(length=100), nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=False),
        sa.Column('manufacturing_date', sa.Date(), nullable=True),
        sa.Column('purchase_price', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('mrp', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('quantity_received', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id']),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('medicine_id', 'store_id', 'batch_number', name='uq_batch_medicine_store_number'),
    )
    with op.batch_alter_table('batches', schema=None) as batch_op:
        batch_op.create_index('ix_batch_expiry', ['store_id', 'expiry_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_batches_medicine_id'), ['medicine_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_batches_store_id'), ['store_id'], unique=False)

    # 7. Ingredients (belongs to medicine)
    op.create_table('ingredients',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('medicine_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('strength', sa.String(length=100), nullable=True),
        sa.Column('unit', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('ingredients', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_ingredients_medicine_id'), ['medicine_id'], unique=False)

    # 8. Medicine Aliases (belongs to medicine)
    op.create_table('medicine_aliases',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('medicine_id', sa.Integer(), nullable=False),
        sa.Column('alias_name', sa.String(length=300), nullable=False),
        sa.Column('alias_type', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('medicine_aliases', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_medicine_aliases_medicine_id'), ['medicine_id'], unique=False)

    # 9. Medicine Visual Features (belongs to medicine)
    op.create_table('medicine_visual_features',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('medicine_id', sa.Integer(), nullable=False),
        sa.Column('feature_type', sa.String(length=50), nullable=False),
        sa.Column('feature_value', sa.Text(), nullable=False),
        sa.Column('description', sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('medicine_visual_features', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_medicine_visual_features_medicine_id'), ['medicine_id'], unique=False)

    # 10. Inventory (belongs to batch + store + location)
    op.create_table('inventory',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('batch_id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('location_id', sa.Integer(), nullable=True),
        sa.Column('quantity_available', sa.Integer(), nullable=False),
        sa.Column('quantity_reserved', sa.Integer(), nullable=False),
        sa.Column('last_counted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['batch_id'], ['batches.id']),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id']),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('batch_id', 'store_id', 'location_id', name='uq_inventory_batch_store_location'),
    )
    with op.batch_alter_table('inventory', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_inventory_batch_id'), ['batch_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_inventory_location_id'), ['location_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_inventory_store_id'), ['store_id'], unique=False)


def downgrade():
    # Drop all SmartPharm tables (children before parents)
    op.drop_table('inventory')
    op.drop_table('medicine_visual_features')
    op.drop_table('medicine_aliases')
    op.drop_table('ingredients')
    op.drop_table('batches')
    op.drop_table('suppliers')
    op.drop_table('medicines')
    op.drop_table('locations')
    op.drop_table('users')
    op.drop_table('stores')
