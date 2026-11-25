"""Citizen-facing API routes: metadata, OTP auth, conversational intake, and tracking."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Response
from sqlalchemy.orm import Session as OrmSession

from .. import config
from .. import governance as gov
from .. import intake as intake_engine
from ..db import Feedback, Grievance, get_db
from ..schemas import ConfirmIn, FeedbackIn, IntakeMessageIn, OtpIn, OtpVerifyIn
from ..security import otp_store, rate_limiter
from ..serializers import serialize_slip

router = APIRouter(prefix="/api/v1", tags=["citizen"])


@router.get("/meta")
def metadata(response: Response) -> dict[str, Any]:
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


@router.post("/auth/request-otp")
def request_otp(body: OtpIn) -> dict[str, Any]:
    """Issue a time-limited OTP for phone verification."""
    rate_limiter.check(f"otp_req:{body.phone}", max_requests=10, window_seconds=60)
    code = otp_store.issue(body.phone)
    payload: dict[str, Any] = {"sent": True}
    if not config.is_production():
        payload["demo_code"] = code
    return payload


@router.post("/auth/verify-otp")
def verify_otp(body: OtpVerifyIn) -> dict[str, Any]:
    """Verify an OTP and return a cryptographic session token."""
    token = otp_store.verify(body.phone, body.code)
    return {"verified": True, "token": token}


@router.post("/intake/message")
def intake_message(body: IntakeMessageIn) -> dict[str, Any]:
    """Advance the conversational grievance intake state machine by one turn."""
    rate_limiter.check(f"intake:{body.session_id}", max_requests=30, window_seconds=60)
    session = intake_engine.get_session(body.session_id, body.ui_language)
    return intake_engine.step(session, body.text)


@router.post("/grievances")
def file_grievance(
    body: ConfirmIn,
    authorization: str | None = Header(default=None),
    db: OrmSession = Depends(get_db),
) -> dict[str, Any]:
    """Register a grievance or return a duplicate warning for citizen co-reporting."""
    otp_store.require_verified(body.reporter_phone, authorization)
    rate_limiter.check(f"file:{body.reporter_phone}", max_requests=20, window_seconds=60)

    if not body.add_support_to and not body.bypass_dedup:
        dup = gov.find_duplicate(db, body.category.value, body.ward)
        if dup:
            return {
                "duplicate": True,
                "existing_id": dup.id,
                "reporter_count": dup.reporter_count,
                "message": "This issue is already registered in this ward.",
            }

    session = intake_engine.peek_session(body.session_id)
    session_sensitivity = session.acc.sensitivity if session else "normal"
    gps_dict = body.gps.model_dump() if body.gps else None

    grievance = gov.file_grievance(
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
    return serialize_slip(grievance)


@router.get("/grievances/{gid}")
def track_grievance(gid: str, db: OrmSession = Depends(get_db)) -> dict[str, Any]:
    """Retrieve public tracking status for a grievance by ID."""
    if len(gid) > 64:
        raise HTTPException(400, "Invalid tracking ID")
    grievance = db.get(Grievance, gid)
    if not grievance:
        raise HTTPException(404, "Not found")
    return serialize_slip(grievance, with_history=grievance.sensitivity != "sensitive")


@router.post("/grievances/{gid}/reopen")
def reopen_grievance(gid: str, db: OrmSession = Depends(get_db)) -> dict[str, Any]:
    """Reopen a resolved or closed grievance when the citizen is not satisfied."""
    grievance = db.get(Grievance, gid)
    if not grievance:
        raise HTTPException(404, "Not found")
    if grievance.status not in config.CLOSED_STATES:
        raise HTTPException(400, "Only resolved grievances can be reopened")

    gov.audit(
        db,
        gid,
        "reopen",
        actor_id=grievance.reporter_phone[-4:],
        actor_role="citizen",
        from_val=grievance.status,
        to_val="reopened",
        note="Citizen not satisfied",
    )
    grievance.status = "reopened"
    db.commit()
    return serialize_slip(grievance, with_history=grievance.sensitivity != "sensitive")


@router.post("/grievances/{gid}/feedback")
def submit_feedback(
    gid: str,
    rating: int | None = Query(default=None, ge=1, le=5),
    comment: str = Query(default="", max_length=500),
    body: FeedbackIn | None = Body(default=None),
    db: OrmSession = Depends(get_db),
) -> dict[str, bool]:
    """Record citizen satisfaction rating (1-5) and optional comment."""
    resolved_rating = body.rating if body is not None else rating
    resolved_comment = body.comment if body is not None else comment
    if resolved_rating is None:
        raise HTTPException(422, "Rating between 1 and 5 is required")

    grievance = db.get(Grievance, gid)
    if not grievance:
        raise HTTPException(404, "Not found")

    db.add(Feedback(grievance_id=gid, rating=resolved_rating, comment=resolved_comment))
    db.commit()
    return {"ok": True}
