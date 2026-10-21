"""Shared lock order for stock writers, including MySQL repeatable-read sessions."""
from app.models.store import Store
from app.models.inventory import Inventory


def lock_stores(*store_ids):
    # Always lock stores before business headers/batches/inventory. Current reads
    # refresh cached objects; an earlier authentication SELECT may have started
    # a MySQL repeatable-read snapshot before another terminal committed.
    return (Store.query.filter(Store.id.in_(sorted(set(store_ids))))
            .order_by(Store.id).populate_existing().with_for_update().all())


def locked_inventory(batch_id, store_id):
    return (Inventory.query.filter_by(batch_id=batch_id, store_id=store_id)
            .order_by(Inventory.id).populate_existing().with_for_update().all())
