"""Pure response serializers mapping ORM entities to API JSON payloads."""
from __future__ import annotations

import datetime as dt
from typing import Any

from . import config
from .db import AuditEvent, Grievance, now


def category_label(category: str) -> dict[str, Any]:
    """Return bilingual category metadata and owning department."""
    info = config.CATEGORIES.get(category, config.CATEGORIES["other"])
    return {
        "key": category,
        "ta": info["ta"],
        "en": info["en"],
        "dept": info["dept"],
    }


def serialize_event(event: AuditEvent) -> dict[str, Any]:
    """Serialize an immutable audit-log event."""
    return {
        "type": event.event_type,
        "from": event.from_val,
        "to": event.to_val,
        "note": event.note,
        "actor": event.actor_id,
        "role": event.actor_role,
        "at": event.at.isoformat(),
    }


def serialize_slip(
    grievance: Grievance, *, with_history: bool = False
) -> dict[str, Any]:
    """Serialize the citizen-facing grievance slip (omits reporter phone and verbatim PII)."""
    payload: dict[str, Any] = {
        "id": grievance.id,
        "status": grievance.status,
        "category": category_label(grievance.category),
        "dept": grievance.assigned_dept,
        "ward": grievance.ward,
        "landmark": grievance.landmark,
        "severity": grievance.severity,
        "sensitivity": grievance.sensitivity,
        "sla_due_at": grievance.sla_due_at.isoformat() if grievance.sla_due_at else None,
        "reporter_count": grievance.reporter_count,
        "created_at": grievance.created_at.isoformat(),
        "ui_language": grievance.ui_language,
    }
    if with_history:
        payload["history"] = [serialize_event(ev) for ev in grievance.events]
    return payload


def serialize_row(
    grievance: Grievance, *, cutoff: dt.datetime | None = None
) -> dict[str, Any]:
    """Serialize an officer/admin queue row with SLA breach status."""
    ref_time = cutoff if cutoff is not None else now()
    overdue = bool(
        grievance.sla_due_at
        and grievance.sla_due_at < ref_time
        and grievance.status in config.OPEN_STATES
    )
    return {
        **serialize_slip(grievance),
        "overdue": overdue,
        "escalation_level": grievance.escalation_level,
        "officer_id": grievance.assigned_officer_id,
        "description": grievance.description_clean,
    }
