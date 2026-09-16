"""
SmartPharm Backend — Audit Service.

Centralized domain service for recording, querying, and reporting
on immutable audit log events per PRD Rule 7 and Rule 22.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import desc
from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.user import User


def log_audit_event(
    store_id: int,
    entity_type: str,
    entity_id: Any,
    action: str,
    reason: str,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    """
    Record an immutable audit log entry within the active transaction.

    Must be called inside the same DB transaction as the business operation
    to ensure transactional integrity (PRD Rule 8 & 22).
    """
    if not reason or not reason.strip():
        reason = "Operational change recorded by system"

    audit_entry = AuditLog(
        store_id=store_id,
        user_id=user_id,
        entity_type=str(entity_type).lower(),
        entity_id=str(entity_id),
        action=str(action).upper(),
        old_values=old_values,
        new_values=new_values,
        reason=reason.strip(),
        ip_address=ip_address,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(audit_entry)
    return audit_entry


def get_audit_logs(
    store_id: int,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
) -> Tuple[List[AuditLog], int, int]:
    """
    Retrieve filterable, paginated audit logs for a store.

    Returns:
        (audit_logs, total_count, total_pages)
    """
    query = AuditLog.query.filter(AuditLog.store_id == store_id)

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type.lower())

    if action:
        query = query.filter(AuditLog.action == action.upper())

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            db.or_(
                AuditLog.reason.ilike(search_pattern),
                AuditLog.entity_id.ilike(search_pattern),
                AuditLog.action.ilike(search_pattern),
            )
        )

    if start_date:
        try:
            st_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.filter(AuditLog.created_at >= st_dt)
        except (ValueError, TypeError):
            pass

    if end_date:
        try:
            en_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.filter(AuditLog.created_at <= en_dt)
        except (ValueError, TypeError):
            pass

    query = query.order_by(desc(AuditLog.created_at))

    total_count = query.count()
    total_pages = (total_count + per_page - 1) // per_page if per_page > 0 else 1

    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return items, total_count, total_pages


def get_audit_summary_metrics(store_id: int) -> Dict[str, Any]:
    """
    Summarize audit activity for the store executive dashboard.
    """
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    total_records = AuditLog.query.filter(AuditLog.store_id == store_id).count()

    today_count = AuditLog.query.filter(
        AuditLog.store_id == store_id,
        AuditLog.created_at >= today_start,
    ).count()

    adjustments_7d = AuditLog.query.filter(
        AuditLog.store_id == store_id,
        AuditLog.created_at >= seven_days_ago,
        AuditLog.action.ilike("%ADJUSTMENT%"),
    ).count()

    reconciliations_7d = AuditLog.query.filter(
        AuditLog.store_id == store_id,
        AuditLog.created_at >= seven_days_ago,
        AuditLog.action.ilike("%RECONCILE%"),
    ).count()

    return {
        "total_audit_events": total_records,
        "events_today": today_count,
        "adjustments_last_7d": adjustments_7d,
        "reconciliations_last_7d": reconciliations_7d,
    }
