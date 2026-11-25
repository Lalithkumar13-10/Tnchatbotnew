"""Officer & CM-Cell administrative API routes with strict RBAC enforcement."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session as OrmSession

from .. import config
from .. import governance as gov
from ..db import Grievance, get_db, now
from ..schemas import AdminUpdateIn, GrievanceStatus
from ..security import require_admin_role
from ..serializers import serialize_event, serialize_row

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/grievances")
def admin_list(
    status: str | None = None,
    ward: str | None = None,
    category: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    role: str = Depends(require_admin_role),
    db: OrmSession = Depends(get_db),
) -> dict[str, Any]:
    """Return a paginated, role-scoped list of grievances."""
    if status and status not in config.ALL_STATUSES:
        raise HTTPException(400, "Invalid status filter")

    items = gov.list_grievances(
        db,
        can_view_sensitive=role in config.SENSITIVE_VIEW_ROLES,
        status=status,
        ward=ward,
        category=category,
        limit=limit,
        offset=offset,
    )
    cutoff = now()
    return {
        "role": role,
        "grievances": [serialize_row(g, cutoff=cutoff) for g in items],
    }


@router.get("/grievances/{gid}")
def admin_detail(
    gid: str,
    role: str = Depends(require_admin_role),
    db: OrmSession = Depends(get_db),
) -> dict[str, Any]:
    """Return full grievance details, audit history, and hash-chain verification."""
    grievance = db.get(Grievance, gid)
    if not grievance:
        raise HTTPException(404, "Not found")
    if grievance.sensitivity == "sensitive" and role not in config.SENSITIVE_VIEW_ROLES:
        raise HTTPException(403, "Restricted — sensitive grievance")

    if grievance.sensitivity == "sensitive":
        gov.audit(
            db,
            gid,
            "sensitive_access",
            actor_id=role,
            actor_role=role,
            note="Sensitive record viewed",
        )
        db.commit()
        logger.info("Sensitive grievance %s viewed by role=%s", gid, role)

    return {
        **serialize_row(grievance),
        "description_raw": grievance.description_raw,
        "history": [serialize_event(ev) for ev in grievance.events],
        "chain_valid": gov.verify_chain(db, gid),
    }


@router.patch("/grievances/{gid}")
def admin_update(
    gid: str,
    status: GrievanceStatus | None = Query(default=None),
    officer_id: str | None = Query(default=None, max_length=64),
    note: str | None = Query(default=None, max_length=1000),
    actor: str = Query(default="OFF-DESK", max_length=64),
    body: AdminUpdateIn | None = Body(default=None),
    role: str = Depends(require_admin_role),
    db: OrmSession = Depends(get_db),
) -> dict[str, Any]:
    """Update status, officer assignment, or append an audit note for a grievance."""
    if role not in config.MUTABLE_ROLES:
        raise HTTPException(403, "Auditor role is read-only")

    grievance = db.get(Grievance, gid)
    if not grievance:
        raise HTTPException(404, "Not found")
    if grievance.sensitivity == "sensitive" and role not in config.SENSITIVE_VIEW_ROLES:
        raise HTTPException(403, "Restricted — sensitive grievance")

    new_status = body.status if (body and body.status is not None) else status
    new_officer = body.officer_id if (body and body.officer_id is not None) else officer_id
    new_note = body.note if (body and body.note is not None) else note
    resolved_actor = body.actor if (body and body.actor) else actor

    if not new_status and not new_officer and not new_note:
        raise HTTPException(400, "No update fields provided")

    if new_officer:
        gov.audit(
            db,
            gid,
            "assign",
            actor_id=resolved_actor,
            actor_role=role,
            from_val=grievance.assigned_officer_id,
            to_val=new_officer,
            note=new_note,
        )
        grievance.assigned_officer_id = new_officer
    if new_status:
        gov.audit(
            db,
            gid,
            "status",
            actor_id=resolved_actor,
            actor_role=role,
            from_val=grievance.status,
            to_val=new_status.value,
            note=new_note,
        )
        grievance.status = new_status.value
    if new_note and not new_status and not new_officer:
        gov.audit(
            db,
            gid,
            "note",
            actor_id=resolved_actor,
            actor_role=role,
            note=new_note,
        )

    db.commit()
    db.refresh(grievance)
    return serialize_row(grievance)


@router.get("/oversight")
def admin_oversight(
    role: str = Depends(require_admin_role),
    db: OrmSession = Depends(get_db),
) -> dict[str, Any]:
    """Return role-scoped oversight KPIs, department breakdown, and hotspots."""
    return gov.compute_oversight(db, can_view_sensitive=role in config.SENSITIVE_VIEW_ROLES)


@router.post("/run-escalation")
def run_escalation(
    role: str = Depends(require_admin_role),
    db: OrmSession = Depends(get_db),
) -> dict[str, list[str]]:
    """Escalate overdue grievances up the accountability ladder."""
    if role not in config.ESCALATION_ROLES:
        raise HTTPException(
            403, "Only commissioner, collector, or CM Cell can run SLA escalation"
        )
    return {"escalated": gov.escalate_overdue(db)}
