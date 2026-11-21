"""FastAPI application: wires the routes, security middleware, and static frontends."""
from __future__ import annotations

import hmac
import secrets
import threading
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Iterator

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session as OrmSession

from . import config
from . import governance as gov
from . import intake as intake_engine
from .db import AuditEvent, Feedback, Grievance, SessionLocal, init_db, now
from .llm_gateway import POOL
from .schemas import (
    AdminUpdateIn,
    ConfirmIn,
    FeedbackIn,
    GrievanceStatus,
    IntakeMessageIn,
    OtpIn,
    OtpVerifyIn,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Nagar Kuraiteer — Civic Grievance Platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Role", "X-Admin-Key"],
)


_CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(self), camera=(), microphone=()"
    )
    response.headers.setdefault("Content-Security-Policy", _CSP_HEADER)
    if request.url.path.startswith("/app/") and request.url.path.endswith((".css", ".js")):
        response.headers.setdefault("Cache-Control", "public, max-age=3600")
    return response


# ---------------- bounded OTP & session store ----------------
_OTP: OrderedDict[str, dict] = OrderedDict()  # phone -> {code, verified, expires_at, attempts, token}
_OTP_LOCK = threading.Lock()
_RATE_BUCKETS: dict[str, deque[float]] = {}
_RATE_LOCK = threading.Lock()


def _prune_otp_store(now_ts: float) -> None:
    expired = [p for p, rec in _OTP.items() if rec["expires_at"] < now_ts]
    for p in expired:
        _OTP.pop(p, None)
    while len(_OTP) > config.MAX_OTP_RECORDS:
        _OTP.popitem(last=False)


def _check_rate_limit(bucket_key: str, max_requests: int, window_seconds: int) -> None:
    now_ts = time.monotonic()
    cutoff = now_ts - window_seconds
    with _RATE_LOCK:
        dq = _RATE_BUCKETS.setdefault(bucket_key, deque())
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= max_requests:
            raise HTTPException(429, "Too many requests. Please try again shortly.")
        dq.append(now_ts)


def db_dep() -> Iterator[OrmSession]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- health & metadata ----------------
@app.get("/health")
def health() -> dict:
    return {"ok": True, "city": config.CITY_NAME, "llm_live": config.llm_is_live()}


@app.get("/health/llm")
def health_llm() -> dict:
    return {"live": config.llm_is_live(), "pool": POOL.status()}


@app.get("/api/v1/meta")
def metadata(response: Response) -> dict:
    """Expose city directory metadata so frontend stays synchronized with backend config."""
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {
        "city": config.CITY_NAME,
        "city_code": config.CITY_CODE,
        "categories": [
            {"key": key, "ta": info["ta"], "en": info["en"], "dept": info["dept"]}
            for key, info in config.CATEGORIES.items()
        ],
        "wards": config.WARDS,
    }


# ---------------- auth (OTP verification) ----------------
@app.post("/api/v1/auth/request-otp")
def request_otp(body: OtpIn) -> dict:
    _check_rate_limit(f"otp_req:{body.phone}", max_requests=10, window_seconds=60)
    now_ts = time.monotonic()
    with _OTP_LOCK:
        _prune_otp_store(now_ts)
        _OTP[body.phone] = {
            "code": config.MOCK_OTP,
            "verified": False,
            "expires_at": now_ts + config.OTP_TTL_SECONDS,
            "attempts": 0,
            "token": None,
        }
        _OTP.move_to_end(body.phone)

    payload: dict[str, object] = {"sent": True}
    if not config.is_production():
        payload["demo_code"] = config.MOCK_OTP
    return payload


@app.post("/api/v1/auth/verify-otp")
def verify_otp(body: OtpVerifyIn) -> dict:
    now_ts = time.monotonic()
    with _OTP_LOCK:
        _prune_otp_store(now_ts)
        rec = _OTP.get(body.phone)
        if not rec or rec["expires_at"] < now_ts:
            raise HTTPException(400, "OTP expired or not requested")
        if rec["attempts"] >= config.OTP_MAX_ATTEMPTS:
            raise HTTPException(429, "Too many failed OTP attempts. Request a new OTP.")
        if not hmac.compare_digest(str(rec["code"]), body.code):
            rec["attempts"] += 1
            raise HTTPException(400, "Invalid code")

        token = secrets.token_urlsafe(32)
        rec["verified"] = True
        rec["attempts"] = 0
        rec["token"] = token
        rec["expires_at"] = now_ts + config.OTP_SESSION_TTL_SECONDS
        _OTP.move_to_end(body.phone)
    return {"verified": True, "token": token}


def _require_phone(phone: str, authorization: str | None = None) -> None:
    now_ts = time.monotonic()
    with _OTP_LOCK:
        _prune_otp_store(now_ts)
        rec = _OTP.get(phone)
        if not rec or not rec.get("verified") or rec["expires_at"] < now_ts:
            raise HTTPException(401, "Phone not verified")
        if authorization:
            scheme, _, supplied = authorization.partition(" ")
            expected = rec.get("token")
            if (
                scheme.lower() != "bearer"
                or not expected
                or not hmac.compare_digest(expected, supplied.strip())
            ):
                raise HTTPException(401, "Invalid session token")


# ---------------- intake ----------------
@app.post("/api/v1/intake/message")
def intake_message(body: IntakeMessageIn) -> dict:
    _check_rate_limit(f"intake:{body.session_id}", max_requests=30, window_seconds=60)
    session = intake_engine.get_session(body.session_id, body.ui_language)
    return intake_engine.step(session, body.text)


# ---------------- file / track / reopen / feedback ----------------
@app.post("/api/v1/grievances")
def file_grievance(
    body: ConfirmIn,
    authorization: str | None = Header(default=None),
    db: OrmSession = Depends(db_dep),
) -> dict:
    _require_phone(body.reporter_phone, authorization)
    _check_rate_limit(f"file:{body.reporter_phone}", max_requests=20, window_seconds=60)

    if not body.add_support_to and not body.bypass_dedup:
        dup = gov.find_duplicate(db, body.category.value, body.ward)
        if dup:
            return {
                "duplicate": True,
                "existing_id": dup.id,
                "reporter_count": dup.reporter_count,
                "message": "This issue is already registered in this ward.",
            }

    session = intake_engine._SESSIONS.get(body.session_id)
    session_sensitivity = session.acc.sensitivity if session else "normal"
    gps_dict = body.gps.model_dump() if body.gps else None

    g = gov.file_grievance(
        db,
        reporter_phone=body.reporter_phone,
        ui_language=body.ui_language,
        category=body.category.value,
        ward=body.ward,
        landmark=body.landmark,
        description_raw=body.description,
        description_clean=body.description,
        severity=body.severity.value,
        sensitivity=session_sensitivity,
        gps=gps_dict,
        add_support_to=body.add_support_to,
    )
    return _slip(g)


@app.get("/api/v1/grievances/{gid}")
def track(gid: str, db: OrmSession = Depends(db_dep)) -> dict:
    if len(gid) > 64:
        raise HTTPException(400, "Invalid tracking ID")
    g = db.get(Grievance, gid)
    if not g:
        raise HTTPException(404, "Not found")
    return _slip(g, with_history=g.sensitivity != "sensitive")


@app.post("/api/v1/grievances/{gid}/reopen")
def reopen(gid: str, db: OrmSession = Depends(db_dep)) -> dict:
    g = db.get(Grievance, gid)
    if not g:
        raise HTTPException(404, "Not found")
    if g.status not in config.CLOSED_STATES:
        raise HTTPException(400, "Only resolved grievances can be reopened")
    gov.audit(
        db,
        gid,
        "reopen",
        actor_id=g.reporter_phone[-4:],
        actor_role="citizen",
        from_val=g.status,
        to_val="reopened",
        note="Citizen not satisfied",
    )
    g.status = "reopened"
    db.commit()
    return _slip(g, with_history=g.sensitivity != "sensitive")


@app.post("/api/v1/grievances/{gid}/feedback")
def feedback(
    gid: str,
    rating: int | None = Query(default=None, ge=1, le=5),
    comment: str = Query(default="", max_length=500),
    body: FeedbackIn | None = Body(default=None),
    db: OrmSession = Depends(db_dep),
) -> dict:
    resolved_rating = body.rating if body is not None else rating
    resolved_comment = body.comment if body is not None else comment
    if resolved_rating is None:
        raise HTTPException(422, "Rating between 1 and 5 is required")

    g = db.get(Grievance, gid)
    if not g:
        raise HTTPException(404, "Not found")
    db.add(Feedback(grievance_id=gid, rating=resolved_rating, comment=resolved_comment))
    db.commit()
    return {"ok": True}


# ---------------- admin (role-scoped + optional API key) ----------------
def _role(
    x_role: str = Header(default="cm_cell"),
    x_admin_key: str | None = Header(default=None),
) -> str:
    if config.ADMIN_API_KEY:
        if not x_admin_key or not hmac.compare_digest(config.ADMIN_API_KEY, x_admin_key):
            raise HTTPException(401, "Valid X-Admin-Key header required")
    normalized = (x_role or "").strip().lower()
    if normalized not in config.VALID_ROLES:
        raise HTTPException(403, "Unknown or unauthorized role")
    return normalized


@app.get("/api/v1/admin/grievances")
def admin_list(
    status: str | None = None,
    ward: str | None = None,
    category: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    role: str = Depends(_role),
    db: OrmSession = Depends(db_dep),
) -> dict:
    q = select(Grievance).order_by(Grievance.created_at.desc())
    if role not in config.SENSITIVE_VIEW_ROLES:
        q = q.where(Grievance.sensitivity != "sensitive")
    if status:
        if status not in config.ALL_STATUSES:
            raise HTTPException(400, "Invalid status filter")
        q = q.where(Grievance.status == status)
    if ward:
        q = q.where(Grievance.ward == ward)
    if category:
        q = q.where(Grievance.category == category)

    q = q.limit(limit).offset(offset)
    cutoff = now()
    rows = [_row(g, cutoff=cutoff) for g in db.execute(q).scalars()]
    return {"role": role, "grievances": rows}


@app.get("/api/v1/admin/grievances/{gid}")
def admin_detail(
    gid: str,
    role: str = Depends(_role),
    db: OrmSession = Depends(db_dep),
) -> dict:
    g = db.get(Grievance, gid)
    if not g:
        raise HTTPException(404, "Not found")
    if g.sensitivity == "sensitive" and role not in config.SENSITIVE_VIEW_ROLES:
        raise HTTPException(403, "Restricted — sensitive grievance")
    if g.sensitivity == "sensitive":
        gov.audit(
            db,
            gid,
            "sensitive_access",
            actor_id=role,
            actor_role=role,
            note="Sensitive record viewed",
        )
        db.commit()
    return {
        **_row(g),
        "description_raw": g.description_raw,
        "history": [_ev(e) for e in g.events],
        "chain_valid": gov.verify_chain(db, gid),
    }


@app.patch("/api/v1/admin/grievances/{gid}")
def admin_update(
    gid: str,
    status: GrievanceStatus | None = Query(default=None),
    officer_id: str | None = Query(default=None, max_length=64),
    note: str | None = Query(default=None, max_length=1000),
    actor: str = Query(default="OFF-DESK", max_length=64),
    body: AdminUpdateIn | None = Body(default=None),
    role: str = Depends(_role),
    db: OrmSession = Depends(db_dep),
) -> dict:
    if role not in config.MUTABLE_ROLES:
        raise HTTPException(403, "Auditor role is read-only")

    g = db.get(Grievance, gid)
    if not g:
        raise HTTPException(404, "Not found")
    if g.sensitivity == "sensitive" and role not in config.SENSITIVE_VIEW_ROLES:
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
            from_val=g.assigned_officer_id,
            to_val=new_officer,
            note=new_note,
        )
        g.assigned_officer_id = new_officer
    if new_status:
        gov.audit(
            db,
            gid,
            "status",
            actor_id=resolved_actor,
            actor_role=role,
            from_val=g.status,
            to_val=new_status.value,
            note=new_note,
        )
        g.status = new_status.value
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
    db.refresh(g)
    return _row(g)


@app.get("/api/v1/admin/oversight")
def oversight(role: str = Depends(_role), db: OrmSession = Depends(db_dep)) -> dict:
    """Compute oversight metrics in SQL (O(N) database aggregation, role-scoped)."""
    cutoff = now()
    can_view_sensitive = role in config.SENSITIVE_VIEW_ROLES

    is_open = Grievance.status.in_(config.OPEN_STATES)
    is_closed = Grievance.status.in_(config.CLOSED_STATES)
    is_breached = is_open & (Grievance.sla_due_at < cutoff)

    base_filter = []
    if not can_view_sensitive:
        base_filter.append(Grievance.sensitivity != "sensitive")

    summary_stmt = select(
        func.count(Grievance.id).label("total"),
        func.coalesce(func.sum(case((is_open, 1), else_=0)), 0).label("open_cnt"),
        func.coalesce(func.sum(case((is_closed, 1), else_=0)), 0).label("resolved_cnt"),
        func.coalesce(func.sum(case((is_breached, 1), else_=0)), 0).label("breached_cnt"),
        func.coalesce(
            func.sum(case((Grievance.sensitivity == "sensitive", 1), else_=0)), 0
        ).label("sensitive_cnt"),
    )
    if base_filter:
        summary_stmt = summary_stmt.where(*base_filter)
    summary = db.execute(summary_stmt).one()

    dept_stmt = select(
        Grievance.assigned_dept,
        func.count(Grievance.id).label("total"),
        func.coalesce(func.sum(case((is_open, 1), else_=0)), 0).label("open_cnt"),
        func.coalesce(func.sum(case((is_breached, 1), else_=0)), 0).label("breached_cnt"),
    ).group_by(Grievance.assigned_dept)
    if base_filter:
        dept_stmt = dept_stmt.where(*base_filter)

    by_dept = {
        row.assigned_dept: {
            "total": int(row.total),
            "open": int(row.open_cnt),
            "breached": int(row.breached_cnt),
        }
        for row in db.execute(dept_stmt)
    }

    hotspot_stmt = (
        select(Grievance.id, Grievance.category, Grievance.ward, Grievance.reporter_count)
        .where(Grievance.reporter_count > 1, *base_filter)
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
        "by_department": by_dept,
        "hotspots": hotspots,
    }


@app.post("/api/v1/admin/run-escalation")
def run_escalation(
    role: str = Depends(_role),
    db: OrmSession = Depends(db_dep),
) -> dict:
    if role not in config.ESCALATION_ROLES:
        raise HTTPException(
            403, "Only commissioner, collector, or CM Cell can run SLA escalation"
        )
    return {"escalated": gov.escalate_overdue(db)}


# ---------------- serializers ----------------
def _cat_label(cat: str) -> dict:
    c = config.CATEGORIES.get(cat, config.CATEGORIES["other"])
    return {"key": cat, "ta": c["ta"], "en": c["en"], "dept": c["dept"]}


def _slip(g: Grievance, with_history: bool = False) -> dict:
    data: dict[str, object] = {
        "id": g.id,
        "status": g.status,
        "category": _cat_label(g.category),
        "dept": g.assigned_dept,
        "ward": g.ward,
        "landmark": g.landmark,
        "severity": g.severity,
        "sensitivity": g.sensitivity,
        "sla_due_at": g.sla_due_at.isoformat() if g.sla_due_at else None,
        "reporter_count": g.reporter_count,
        "created_at": g.created_at.isoformat(),
        "ui_language": g.ui_language,
    }
    if with_history:
        data["history"] = [_ev(e) for e in g.events]
    return data


def _row(g: Grievance, cutoff: object | None = None) -> dict:
    ref_time = cutoff if cutoff is not None else now()
    overdue = bool(
        g.sla_due_at and g.sla_due_at < ref_time and g.status in config.OPEN_STATES
    )
    return {
        **_slip(g),
        "overdue": overdue,
        "escalation_level": g.escalation_level,
        "officer_id": g.assigned_officer_id,
        "description": g.description_clean,
    }


def _ev(e: AuditEvent) -> dict:
    return {
        "type": e.event_type,
        "from": e.from_val,
        "to": e.to_val,
        "note": e.note,
        "actor": e.actor_id,
        "role": e.actor_role,
        "at": e.at.isoformat(),
    }


# ---------------- static frontends ----------------
FRONT = Path(__file__).resolve().parents[2] / "frontend"
if FRONT.exists():
    app.mount("/app", StaticFiles(directory=str(FRONT), html=True), name="frontend")


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse("/app/citizen.html")
