"""Add operational, audit, prescription and AI tables.

Revision ID: c4e82f91a701
Revises: 6832551117fc
"""
from alembic import op
import sqlalchemy as sa

revision = "c4e82f91a701"
down_revision = "6832551117fc"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('ai_interactions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('session_id', sa.String(length=100), nullable=True),
    sa.Column('user_query', sa.Text(), nullable=False),
    sa.Column('detected_intent', sa.String(length=100), nullable=True),
    sa.Column('response_text', sa.Text(), nullable=False),
    sa.Column('retrieved_context', sa.JSON(), nullable=True),
    sa.Column('citations', sa.JSON(), nullable=True),
    sa.Column('latency_ms', sa.Float(), nullable=True),
    sa.Column('is_helpful', sa.Boolean(), nullable=True),
    sa.Column('feedback_notes', sa.Text(), nullable=True),
    sa.Column('feedback_recorded_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_interactions_created_at'), 'ai_interactions', ['created_at'], unique=False)
    op.create_index(op.f('ix_ai_interactions_detected_intent'), 'ai_interactions', ['detected_intent'], unique=False)
    op.create_index(op.f('ix_ai_interactions_session_id'), 'ai_interactions', ['session_id'], unique=False)
    op.create_index(op.f('ix_ai_interactions_store_id'), 'ai_interactions', ['store_id'], unique=False)
    op.create_index(op.f('ix_ai_interactions_user_id'), 'ai_interactions', ['user_id'], unique=False)
    op.create_index('ix_ai_store_created', 'ai_interactions', ['store_id', 'created_at'], unique=False)
    op.create_index('ix_ai_store_session', 'ai_interactions', ['store_id', 'session_id'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('entity_type', sa.String(length=50), nullable=False),
    sa.Column('entity_id', sa.String(length=100), nullable=False),
    sa.Column('action', sa.String(length=50), nullable=False),
    sa.Column('old_values', sa.JSON(), nullable=True),
    sa.Column('new_values', sa.JSON(), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_id'), 'audit_logs', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_store_id'), 'audit_logs', ['store_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    op.create_table('expenses',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('expense_number', sa.String(length=50), nullable=False),
    sa.Column('category', sa.Enum('RENT', 'UTILITIES_POWER', 'COLD_CHAIN_MAINTENANCE', 'STAFF_SALARY', 'LICENSING_REGULATORY', 'LOGISTICS_PACKAGING', 'MARKETING_PROMOTION', 'MISCELLANEOUS', name='expensecategory'), nullable=False),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('payment_method', sa.Enum('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CREDIT', name='expensepaymentmethod'), nullable=False),
    sa.Column('expense_date', sa.Date(), nullable=False),
    sa.Column('vendor_recipient', sa.String(length=200), nullable=True),
    sa.Column('receipt_reference', sa.String(length=100), nullable=True),
    sa.Column('receipt_image_path', sa.String(length=500), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('store_id', 'expense_number', name='uq_expense_store_number')
    )
    op.create_index('ix_expense_store_category', 'expenses', ['store_id', 'category'], unique=False)
    op.create_index('ix_expense_store_date', 'expenses', ['store_id', 'expense_date'], unique=False)
    op.create_index(op.f('ix_expenses_category'), 'expenses', ['category'], unique=False)
    op.create_index(op.f('ix_expenses_created_at'), 'expenses', ['created_at'], unique=False)
    op.create_index(op.f('ix_expenses_expense_date'), 'expenses', ['expense_date'], unique=False)
    op.create_index(op.f('ix_expenses_store_id'), 'expenses', ['store_id'], unique=False)
    op.create_index(op.f('ix_expenses_user_id'), 'expenses', ['user_id'], unique=False)
    op.create_table('stock_transfers',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('transfer_number', sa.String(length=50), nullable=False),
    sa.Column('source_store_id', sa.Integer(), nullable=False),
    sa.Column('destination_store_id', sa.Integer(), nullable=False),
    sa.Column('created_by_user_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED', name='transferstatus'), nullable=False),
    sa.Column('dispatched_at', sa.DateTime(), nullable=True),
    sa.Column('received_at', sa.DateTime(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['destination_store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['source_store_id'], ['stores.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stock_transfers_created_by_user_id'), 'stock_transfers', ['created_by_user_id'], unique=False)
    op.create_index(op.f('ix_stock_transfers_destination_store_id'), 'stock_transfers', ['destination_store_id'], unique=False)
    op.create_index(op.f('ix_stock_transfers_source_store_id'), 'stock_transfers', ['source_store_id'], unique=False)
    op.create_index(op.f('ix_stock_transfers_status'), 'stock_transfers', ['status'], unique=False)
    op.create_index(op.f('ix_stock_transfers_transfer_number'), 'stock_transfers', ['transfer_number'], unique=True)
    op.create_table('prescriptions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('customer_id', sa.Integer(), nullable=True),
    sa.Column('verified_by_user_id', sa.Integer(), nullable=True),
    sa.Column('sale_id', sa.Integer(), nullable=True),
    sa.Column('prescription_number', sa.String(length=50), nullable=False),
    sa.Column('doctor_name', sa.String(length=200), nullable=True),
    sa.Column('doctor_reg_number', sa.String(length=100), nullable=True),
    sa.Column('patient_name', sa.String(length=200), nullable=False),
    sa.Column('patient_age', sa.Integer(), nullable=True),
    sa.Column('patient_gender', sa.String(length=20), nullable=True),
    sa.Column('raw_text', sa.Text(), nullable=True),
    sa.Column('image_path', sa.String(length=500), nullable=True),
    sa.Column('status', sa.Enum('PENDING_VERIFICATION', 'VERIFIED', 'DISPENSED', 'CANCELLED', name='prescriptionstatus'), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('dispensed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['verified_by_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('store_id', 'prescription_number', name='uq_rx_store_number')
    )
    op.create_index('ix_prescription_store_status', 'prescriptions', ['store_id', 'status'], unique=False)
    op.create_index(op.f('ix_prescriptions_created_at'), 'prescriptions', ['created_at'], unique=False)
    op.create_index(op.f('ix_prescriptions_customer_id'), 'prescriptions', ['customer_id'], unique=False)
    op.create_index(op.f('ix_prescriptions_status'), 'prescriptions', ['status'], unique=False)
    op.create_index(op.f('ix_prescriptions_store_id'), 'prescriptions', ['store_id'], unique=False)
    op.create_table('returns',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('sale_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('return_number', sa.String(length=50), nullable=False),
    sa.Column('return_date', sa.DateTime(), nullable=False),
    sa.Column('total_refund_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('refund_method', sa.String(length=50), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('COMPLETED', 'REJECTED', name='returnstatus'), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('store_id', 'return_number', name='uq_return_store_number')
    )
    op.create_index('ix_return_store_date', 'returns', ['store_id', 'return_date'], unique=False)
    op.create_index(op.f('ix_returns_return_date'), 'returns', ['return_date'], unique=False)
    op.create_index(op.f('ix_returns_sale_id'), 'returns', ['sale_id'], unique=False)
    op.create_index(op.f('ix_returns_store_id'), 'returns', ['store_id'], unique=False)
    op.create_index(op.f('ix_returns_user_id'), 'returns', ['user_id'], unique=False)
    op.create_table('stock_transfer_items',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('transfer_id', sa.Integer(), nullable=False),
    sa.Column('medicine_id', sa.Integer(), nullable=False),
    sa.Column('batch_id', sa.Integer(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], ),
    sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id'], ),
    sa.ForeignKeyConstraint(['transfer_id'], ['stock_transfers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stock_transfer_items_batch_id'), 'stock_transfer_items', ['batch_id'], unique=False)
    op.create_index(op.f('ix_stock_transfer_items_medicine_id'), 'stock_transfer_items', ['medicine_id'], unique=False)
    op.create_index(op.f('ix_stock_transfer_items_transfer_id'), 'stock_transfer_items', ['transfer_id'], unique=False)
    op.create_table('sync_transactions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('client_tx_id', sa.String(length=100), nullable=False),
    sa.Column('tx_type', sa.String(length=50), nullable=False),
    sa.Column('payload_json', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'SYNCED', 'CONFLICT', 'FAILED', name='syncstatus'), nullable=False),
    sa.Column('applied_sale_id', sa.Integer(), nullable=True),
    sa.Column('conflict_reason', sa.Text(), nullable=True),
    sa.Column('client_timestamp', sa.DateTime(), nullable=False),
    sa.Column('synced_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['applied_sale_id'], ['sales.id'], ),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_transactions_client_tx_id'), 'sync_transactions', ['client_tx_id'], unique=True)
    op.create_index(op.f('ix_sync_transactions_status'), 'sync_transactions', ['status'], unique=False)
    op.create_index(op.f('ix_sync_transactions_store_id'), 'sync_transactions', ['store_id'], unique=False)
    op.create_index(op.f('ix_sync_transactions_user_id'), 'sync_transactions', ['user_id'], unique=False)
    op.create_table('prescription_items',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('prescription_id', sa.Integer(), nullable=False),
    sa.Column('medicine_id', sa.Integer(), nullable=True),
    sa.Column('extracted_name', sa.String(length=200), nullable=False),
    sa.Column('dosage_instructions', sa.String(length=200), nullable=True),
    sa.Column('quantity_prescribed', sa.Integer(), nullable=True),
    sa.Column('is_available', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id'], ),
    sa.ForeignKeyConstraint(['prescription_id'], ['prescriptions.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_prescription_items_medicine_id'), 'prescription_items', ['medicine_id'], unique=False)
    op.create_index(op.f('ix_prescription_items_prescription_id'), 'prescription_items', ['prescription_id'], unique=False)
    op.create_table('return_items',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('return_id', sa.Integer(), nullable=False),
    sa.Column('sale_item_id', sa.Integer(), nullable=False),
    sa.Column('medicine_id', sa.Integer(), nullable=False),
    sa.Column('batch_id', sa.Integer(), nullable=False),
    sa.Column('quantity_returned', sa.Integer(), nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('refund_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('restock_condition', sa.Enum('RESTOCKED_TO_INVENTORY', 'WRITTEN_OFF_DAMAGED', 'DISCARDED_EXPIRED', name='restockcondition'), nullable=False),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], ),
    sa.ForeignKeyConstraint(['medicine_id'], ['medicines.id'], ),
    sa.ForeignKeyConstraint(['return_id'], ['returns.id'], ),
    sa.ForeignKeyConstraint(['sale_item_id'], ['sale_items.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_return_items_batch_id'), 'return_items', ['batch_id'], unique=False)
    op.create_index(op.f('ix_return_items_medicine_id'), 'return_items', ['medicine_id'], unique=False)
    op.create_index(op.f('ix_return_items_return_id'), 'return_items', ['return_id'], unique=False)
    op.create_index(op.f('ix_return_items_sale_item_id'), 'return_items', ['sale_item_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_return_items_sale_item_id'), table_name='return_items')
    op.drop_index(op.f('ix_return_items_return_id'), table_name='return_items')
    op.drop_index(op.f('ix_return_items_medicine_id'), table_name='return_items')
    op.drop_index(op.f('ix_return_items_batch_id'), table_name='return_items')
    op.drop_table('return_items')
    op.drop_index(op.f('ix_prescription_items_prescription_id'), table_name='prescription_items')
    op.drop_index(op.f('ix_prescription_items_medicine_id'), table_name='prescription_items')
    op.drop_table('prescription_items')
    op.drop_index(op.f('ix_sync_transactions_user_id'), table_name='sync_transactions')
    op.drop_index(op.f('ix_sync_transactions_store_id'), table_name='sync_transactions')
    op.drop_index(op.f('ix_sync_transactions_status'), table_name='sync_transactions')
    op.drop_index(op.f('ix_sync_transactions_client_tx_id'), table_name='sync_transactions')
    op.drop_table('sync_transactions')
    op.drop_index(op.f('ix_stock_transfer_items_transfer_id'), table_name='stock_transfer_items')
    op.drop_index(op.f('ix_stock_transfer_items_medicine_id'), table_name='stock_transfer_items')
    op.drop_index(op.f('ix_stock_transfer_items_batch_id'), table_name='stock_transfer_items')
    op.drop_table('stock_transfer_items')
    op.drop_index(op.f('ix_returns_user_id'), table_name='returns')
    op.drop_index(op.f('ix_returns_store_id'), table_name='returns')
    op.drop_index(op.f('ix_returns_sale_id'), table_name='returns')
    op.drop_index(op.f('ix_returns_return_date'), table_name='returns')
    op.drop_index('ix_return_store_date', table_name='returns')
    op.drop_table('returns')
    op.drop_index(op.f('ix_prescriptions_store_id'), table_name='prescriptions')
    op.drop_index(op.f('ix_prescriptions_status'), table_name='prescriptions')
    op.drop_index(op.f('ix_prescriptions_customer_id'), table_name='prescriptions')
    op.drop_index(op.f('ix_prescriptions_created_at'), table_name='prescriptions')
    op.drop_index('ix_prescription_store_status', table_name='prescriptions')
    op.drop_table('prescriptions')
    op.drop_index(op.f('ix_stock_transfers_transfer_number'), table_name='stock_transfers')
    op.drop_index(op.f('ix_stock_transfers_status'), table_name='stock_transfers')
    op.drop_index(op.f('ix_stock_transfers_source_store_id'), table_name='stock_transfers')
    op.drop_index(op.f('ix_stock_transfers_destination_store_id'), table_name='stock_transfers')
    op.drop_index(op.f('ix_stock_transfers_created_by_user_id'), table_name='stock_transfers')
    op.drop_table('stock_transfers')
    op.drop_index(op.f('ix_expenses_user_id'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_store_id'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_expense_date'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_created_at'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_category'), table_name='expenses')
    op.drop_index('ix_expense_store_date', table_name='expenses')
    op.drop_index('ix_expense_store_category', table_name='expenses')
    op.drop_table('expenses')
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_store_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_type'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('ix_ai_store_session', table_name='ai_interactions')
    op.drop_index('ix_ai_store_created', table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_user_id'), table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_store_id'), table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_session_id'), table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_detected_intent'), table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_created_at'), table_name='ai_interactions')
    op.drop_table('ai_interactions')
