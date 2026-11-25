"""Governance layer — the CM's-office standard.

* Every state change writes an APPEND-ONLY, hash-chained AuditEvent.
* Sensitive grievances are flagged, routed away from the official they concern,
  and masked from the ordinary queue.
* SLA due dates and an escalation ladder create named accountability.
* Oversight metrics and filtered listings execute directly in SQL.
* Nothing is ever hard-deleted.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import logging
import secrets
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session as OrmSession

from . import config
from .db import AuditEvent, Grievance, Officer, now
from .security import namespace_actor

logger = logging.getLogger(__name__)

_SENSITIVE_KEYWORDS_LOWER: tuple[str, ...] = tuple(
    k.lower() for k in config.SENSITIVE_KEYWORDS
)


# ---------------- audit (append-only, hash-chained) ----------------
def _last_hash(db: OrmSession, gid: str) -> str | None:
    return db.execute(
        select(AuditEvent.hash)
        .where(AuditEvent.grievance_id == gid)
        .order_by(AuditEvent.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _hash_payload(
    gid: str,
    event_type: str,
    from_val: str | None,
    to_val: str | None,
    note: str | None,
    actor_id: str,
    prev: str | None,
    ts_iso: str,
) -> str:
    payload = f"{gid}|{event_type}|{from_val}|{to_val}|{note}|{actor_id}|{prev}|{ts_iso}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def audit(
    db: OrmSession,
    gid: str,
    event_type: str,
    actor_id: str,
    actor_role: str,
    from_val: str | None = None,
    to_val: str | None = None,
    note: str | None = None,
) -> AuditEvent:
    """Append a tamper-evident SHA-256 hash-chained audit event with role-namespaced actor."""
    prev = _last_hash(db, gid)
    ts = now()
    scoped_actor = namespace_actor(actor_role, actor_id)
    digest = _hash_payload(
        gid, event_type, from_val, to_val, note, scoped_actor, prev, ts.isoformat()
    )
    ev = AuditEvent(
        grievance_id=gid,
        event_type=event_type,
        from_val=from_val,
        to_val=to_val,
        note=note,
        actor_id=scoped_actor,
        actor_role=actor_role,
        prev_hash=prev,
        hash=digest,
        at=ts,
    )
    db.add(ev)
    db.flush()
    return ev


def verify_chain(db: OrmSession, gid: str) -> bool:
    """Verify hash-chain continuity and content integrity for all events of a grievance."""
    prev: str | None = None
    events = db.execute(
        select(AuditEvent)
        .where(AuditEvent.grievance_id == gid)
        .order_by(AuditEvent.id)
    ).scalars()
    for ev in events:
        if ev.prev_hash != prev:
            return False
        expected = _hash_payload(
            gid,
            ev.event_type,
            ev.from_val,
            ev.to_val,
            ev.note,
            ev.actor_id,
            prev,
            ev.at.isoformat(),
        )
        if expected != ev.hash:
            return False
        prev = ev.hash
    return True


# ---------------- routing / sensitivity / SLA ----------------
def classify_sensitivity(text: str, hint: str = "normal") -> str:
    """Classify a grievance as sensitive using LLM hint or keyword safeguards."""
    if hint == "sensitive":
        return "sensitive"
    tl = (text or "").lower()
    return "sensitive" if any(k in tl for k in _SENSITIVE_KEYWORDS_LOWER) else "normal"


def route(
    db: OrmSession, category: str, ward: str | None, sensitivity: str
) -> tuple[str, str | None]:
    """Return (department, assigned_officer_id).

    Sensitive grievances are never routed to the ordinary ward officer; they go
    directly to the collector/cm_cell escalation tier.
    """
    dept = str(config.CATEGORIES.get(category, config.CATEGORIES["other"])["dept"])
    if sensitivity == "sensitive":
        officer = (
            db.execute(select(Officer).where(Officer.role == "collector").limit(1))
            .scalars()
            .first()
        )
        return dept, (officer.id if officer else None)

    officer = None
    if ward:
        officer = (
            db.execute(
                select(Officer)
                .where(Officer.role == "ward_officer", Officer.ward == ward)
                .limit(1)
            )
            .scalars()
            .first()
        )
    if not officer:
        officer = (
            db.execute(
                select(Officer)
                .where(Officer.role == "dept_head", Officer.department == dept)
                .limit(1)
            )
            .scalars()
            .first()
        )
    return dept, (officer.id if officer else None)


def sla_due(category: str, created: dt.datetime) -> dt.datetime:
    """Calculate SLA due timestamp for a grievance category."""
    days = int(config.CATEGORIES.get(category, config.CATEGORIES["other"])["sla_days"])
    return created + dt.timedelta(days=days)


def escalate_overdue(db: OrmSession) -> list[str]:
    """Move breached, still-open grievances one step up the ladder. Returns IDs moved."""
    cutoff = now()
    max_level = len(config.ESCALATION_LADDER) - 1
    candidates = (
        db.execute(
            select(Grievance).where(
                Grievance.status.in_(config.OPEN_STATES),
                Grievance.sla_due_at < cutoff,
                Grievance.escalation_level < max_level,
            )
        )
        .scalars()
        .all()
    )

    moved: list[str] = []
    for g in candidates:
        frm = config.ESCALATION_LADDER[g.escalation_level]
        g.escalation_level += 1
        g.status = "escalated"
        to = config.ESCALATION_LADDER[g.escalation_level]
        audit(
            db,
            g.id,
            "status",
            actor_id="system",
            actor_role="system",
            from_val=frm,
            to_val=to,
            note="SLA breached — auto-escalated",
        )
        moved.append(g.id)

    if moved:
        db.commit()
        logger.info("Auto-escalated %d overdue grievances", len(moved))
    return moved


# ---------------- filing + dedup ----------------
def new_id(db: OrmSession | None = None) -> str:
    """Generate a collision-checked, cryptographically random grievance ID."""
    year = dt.date.today().year
    for _ in range(10):
        suffix = 100000 + secrets.randbelow(900000)
        gid = f"TN-{config.CITY_CODE}-{year}-{suffix}"
        if db is None or db.get(Grievance, gid) is None:
            return gid
    return f"TN-{config.CITY_CODE}-{year}-{secrets.token_hex(4).upper()}"


def find_duplicate(db: OrmSession, category: str, ward: str | None) -> Grievance | None:
    """Find an existing open grievance matching category + ward for de-duplication."""
    if not ward or category == "other" or "not listed" in ward.lower():
        return None

    return (
        db.execute(
            select(Grievance)
            .where(
                Grievance.category == category,
                Grievance.ward == ward,
                Grievance.status.in_(config.OPEN_STATES),
                Grievance.parent_grievance_id.is_(None),
            )
            .limit(1)
        )
        .scalars()
        .first()
    )


def file_grievance(
    db: OrmSession,
    *,
    reporter_phone: str,
    ui_language: str,
    category: str,
    ward: str | None,
    landmark: str | None,
    description_raw: str,
    description_clean: str,
    severity: str,
    sensitivity: str,
    gps: dict[str, float] | None = None,
    add_support_to: str | None = None,
) -> Grievance:
    """Register a new grievance or attach co-reporter support to an existing one."""
    if add_support_to:
        parent = db.get(Grievance, add_support_to)
        if parent:
            parent.reporter_count += 1
            audit(
                db,
                parent.id,
                "note",
                actor_id=reporter_phone[-4:],
                actor_role="citizen",
                note="Additional citizen co-reported this issue",
            )
            db.commit()
            db.refresh(parent)
            return parent

    sensitivity = classify_sensitivity(description_raw, sensitivity)
    dept, officer_id = route(db, category, ward, sensitivity)
    created = now()
    g = Grievance(
        id=new_id(db),
        reporter_phone=reporter_phone,
        ui_language=ui_language,
        category=category,
        ward=ward,
        landmark=landmark,
        description_raw=description_raw,
        description_clean=description_clean or description_raw,
        severity=severity or "medium",
        sensitivity=sensitivity,
        assigned_dept=dept,
        assigned_officer_id=officer_id,
        sla_due_at=sla_due(category, created),
        created_at=created,
        gps_lat=(gps or {}).get("lat"),
        gps_lng=(gps or {}).get("lng"),
        status="assigned" if officer_id else "registered",
    )
    db.add(g)
    db.flush()
    audit(
        db,
        g.id,
        "created",
        actor_id=reporter_phone[-4:],
        actor_role="citizen",
        to_val="registered",
        note=f"Routed to {dept}"
        + (" (sensitive → collector)" if sensitivity == "sensitive" else ""),
    )
    if officer_id:
        audit(
            db,
            g.id,
            "assign",
            actor_id="system",
            actor_role="system",
            to_val=officer_id,
            note="Auto-assigned on intake",
        )
    db.commit()
    db.refresh(g)
    return g


# ---------------- query & oversight aggregations ----------------
def list_grievances(
    db: OrmSession,
    *,
    can_view_sensitive: bool,
    status: str | None = None,
    ward: str | None = None,
    category: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Grievance]:
    """Query filtered grievances in descending chronological order."""
    stmt = select(Grievance).order_by(Grievance.created_at.desc())
    if not can_view_sensitive:
        stmt = stmt.where(Grievance.sensitivity != "sensitive")
    if status:
        stmt = stmt.where(Grievance.status == status)
    if ward:
        stmt = stmt.where(Grievance.ward == ward)
    if category:
        stmt = stmt.where(Grievance.category == category)
    return list(db.execute(stmt.limit(limit).offset(offset)).scalars())


def compute_oversight(db: OrmSession, *, can_view_sensitive: bool) -> dict[str, Any]:
    """Compute role-scoped oversight summary, department breakdown, and hotspots in SQL."""
    cutoff = now()
    is_open = Grievance.status.in_(config.OPEN_STATES)
    is_closed = Grievance.status.in_(config.CLOSED_STATES)
    is_breached = is_open & (Grievance.sla_due_at < cutoff)

    visibility_filter = [] if can_view_sensitive else [Grievance.sensitivity != "sensitive"]

    summary_stmt = select(
        func.count(Grievance.id).label("total"),
        func.coalesce(func.sum(case((is_open, 1), else_=0)), 0).label("open_cnt"),
        func.coalesce(func.sum(case((is_closed, 1), else_=0)), 0).label("resolved_cnt"),
        func.coalesce(func.sum(case((is_breached, 1), else_=0)), 0).label("breached_cnt"),
        func.coalesce(
            func.sum(case((Grievance.sensitivity == "sensitive", 1), else_=0)), 0
        ).label("sensitive_cnt"),
    )
    if visibility_filter:
        summary_stmt = summary_stmt.where(*visibility_filter)
    summary = db.execute(summary_stmt).one()

    dept_stmt = select(
        Grievance.assigned_dept,
        func.count(Grievance.id).label("total"),
        func.coalesce(func.sum(case((is_open, 1), else_=0)), 0).label("open_cnt"),
        func.coalesce(func.sum(case((is_breached, 1), else_=0)), 0).label("breached_cnt"),
    ).group_by(Grievance.assigned_dept)
    if visibility_filter:
        dept_stmt = dept_stmt.where(*visibility_filter)

    by_department = {
        row.assigned_dept: {
            "total": int(row.total),
            "open": int(row.open_cnt),
            "breached": int(row.breached_cnt),
        }
        for row in db.execute(dept_stmt)
    }

    hotspot_stmt = (
        select(
            Grievance.id,
            Grievance.category,
            Grievance.ward,
            Grievance.reporter_count,
        )
        .where(Grievance.reporter_count > 1, *visibility_filter)
        .order_by(Grievance.reporter_count.desc())
        .limit(50)
    )
    hotspots = [
        {
            "id": row.id,
            "category": row.category,
            "ward": row.ward,
            "reporters": int(row.reporter_count),
        }
        for row in db.execute(hotspot_stmt)
    ]

    return {
        "total": int(summary.total),
        "open": int(summary.open_cnt),
        "resolved": int(summary.resolved_cnt),
        "breached": int(summary.breached_cnt),
        "sensitive": int(summary.sensitive_cnt) if can_view_sensitive else 0,
        "by_department": by_department,
        "hotspots": hotspots,
    }
