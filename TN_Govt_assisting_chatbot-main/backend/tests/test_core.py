"""Core guarantees, RBAC security, governance, and efficiency tests (mock LLM, no network)."""
from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app import config
from app import governance as gov
from app import intake as ie
from app import main as app_main
from app.db import AuditEvent, Base, Officer, SessionLocal, engine, init_db, now
from app.llm_gateway import GatewayExhausted, GeminiPool, _ModelState
from app.security import otp_store, rate_limiter


@pytest.fixture(autouse=True)
def clean_state():
    Base.metadata.drop_all(bind=engine)
    init_db()
    otp_store.clear()
    rate_limiter.clear()
    ie.reset_sessions()
    yield


def fresh(sid: str):
    ie._SESSIONS.pop(sid, None)
    return ie.get_session(sid, "en")


# ---------------- Intake state machine tests ----------------
def test_asks_for_location_then_files():
    s = fresh("s1")
    r1 = ie.step(s, "street light not working")     # has category + desc, missing ward
    assert r1["mode"] == "ask"
    r2 = ie.step(s, "in Gandhipuram")               # supplies ward
    assert r2["mode"] == "confirm"
    assert r2["draft"]["category"] == "streetlight"
    assert "Gandhipuram" in r2["draft"]["ward"]


def test_complete_first_message_files_without_questions():
    s = fresh("s2")
    r = ie.step(s, "garbage not collected in R.S. Puram for days")
    assert r["mode"] == "confirm"          # nothing to ask — must not interrogate
    assert s.clarify_count == 0


def test_question_budget_is_hard_capped():
    s = fresh("s3")
    for _ in range(10):
        ie.step(s, "there is a problem")   # deliberately vague, never gives location
        if s.clarify_count >= config.QUESTION_BUDGET:
            break
    r = ie.step(s, "still vague")
    assert s.clarify_count <= config.QUESTION_BUDGET
    assert r["mode"] == "confirm"           # forced to confirm, never a 4th question


def test_severity_inferred_high_for_danger():
    s = fresh("s4")
    r = ie.step(s, "open manhole overflowing near Ukkadam, very dangerous")
    assert r["mode"] == "confirm"
    assert r["draft"]["severity"] == "high"


def test_sensitivity_flagged():
    s = fresh("s5")
    r = ie.step(s, "the water officer demanded money in Ukkadam to fix the line")
    assert r["draft"]["sensitivity"] == "sensitive"


def test_loop_prevention_and_address_extraction():
    s = fresh("s6")
    r1 = ie.step(s, "garbage not collected")
    assert r1["mode"] == "ask"
    assert s.acc.category == "garbage"
    assert s.acc.description_clean == "garbage not collected"

    r2 = ie.step(s, "sathya nagar")
    assert r2["mode"] == "confirm"
    assert s.acc.category == "garbage"
    assert s.acc.description_clean == "garbage not collected"
    assert s.acc.address_text == "sathya nagar"
    assert r2["draft"]["landmark"] == "sathya nagar"


def test_session_store_is_bounded(monkeypatch):
    monkeypatch.setattr(ie, "MAX_SESSIONS", 3)
    for i in range(5):
        ie.get_session(f"bounded-{i}", "en")
    assert len(ie._SESSIONS) <= 3


def test_gateway_exhausted_degrades_gracefully(monkeypatch):
    def _boom(**_kwargs):
        raise GatewayExhausted("throttled")

    monkeypatch.setattr(ie.POOL, "generate", _boom)
    s = fresh("s-degrade")
    r = ie.step(s, "water pipe broken")
    assert r["mode"] == "confirm"
    assert r["forced"] is True
    assert r["note"] == "high_load"


# ---------------- Governance & audit integrity tests ----------------
def test_governance_filing_dedup_and_audit_chain():
    with SessionLocal() as db:
        g = gov.file_grievance(
            db,
            reporter_phone="9111111111",
            ui_language="en",
            category="streetlight",
            ward="Peelamedu (Ward 71)",
            landmark="x",
            description_raw="light off",
            description_clean="light off",
            severity="high",
            sensitivity="normal",
        )
        assert g.id.startswith("TN-CBE-")
        assert gov.verify_chain(db, g.id) is True
        dup = gov.find_duplicate(db, "streetlight", "Peelamedu (Ward 71)")
        assert dup is not None and dup.id == g.id


def test_audit_chain_detects_tampering():
    with SessionLocal() as db:
        g = gov.file_grievance(
            db,
            reporter_phone="9111111112",
            ui_language="en",
            category="road",
            ward="Gandhipuram (Ward 42)",
            landmark="main road",
            description_raw="deep pothole",
            description_clean="deep pothole",
            severity="high",
            sensitivity="normal",
        )
        assert gov.verify_chain(db, g.id) is True
        ev = db.query(AuditEvent).filter_by(grievance_id=g.id).first()
        assert ev is not None
        ev.note = "tampered note"
        db.commit()
        assert gov.verify_chain(db, g.id) is False


def test_sensitive_never_routed_to_ward_officer():
    with SessionLocal() as db:
        db.add(Officer(id="C1", name="Collector", role="collector"))
        db.commit()
        g = gov.file_grievance(
            db,
            reporter_phone="9222222222",
            ui_language="en",
            category="water_supply",
            ward="Ukkadam (Ward 20)",
            landmark=None,
            description_raw="engineer took a bribe",
            description_clean="bribe",
            severity="high",
            sensitivity="sensitive",
        )
        assert g.sensitivity == "sensitive"
        off = db.get(Officer, g.assigned_officer_id) if g.assigned_officer_id else None
        assert off is None or off.role == "collector"


def test_other_category_never_triggers_duplicate():
    with SessionLocal() as db:
        g1 = gov.file_grievance(
            db,
            reporter_phone="9999999999",
            ui_language="en",
            category="other",
            ward="Gandhipuram (Ward 42)",
            landmark="street 1",
            description_raw="stray dogs",
            description_clean="stray dogs",
            severity="medium",
            sensitivity="normal",
        )
        assert g1.id is not None
        dup = gov.find_duplicate(db, "other", "Gandhipuram (Ward 42)")
        assert dup is None


def test_other_or_not_listed_ward_never_triggers_duplicate():
    with SessionLocal() as db:
        g1 = gov.file_grievance(
            db,
            reporter_phone="9999999992",
            ui_language="en",
            category="streetlight",
            ward="Other / Not Listed",
            landmark="street 1",
            description_raw="light off",
            description_clean="light off",
            severity="medium",
            sensitivity="normal",
        )
        assert g1.id is not None
        dup = gov.find_duplicate(db, "streetlight", "Other / Not Listed")
        assert dup is None


def test_co_report_and_sla_escalation():
    with SessionLocal() as db:
        g = gov.file_grievance(
            db,
            reporter_phone="9333333333",
            ui_language="en",
            category="garbage",
            ward="R.S. Puram (Ward 55)",
            landmark="cross 2",
            description_raw="bin overflowing",
            description_clean="bin overflowing",
            severity="medium",
            sensitivity="normal",
        )
        supported = gov.file_grievance(
            db,
            reporter_phone="9444444444",
            ui_language="en",
            category="garbage",
            ward="R.S. Puram (Ward 55)",
            landmark="cross 2",
            description_raw="bin overflowing",
            description_clean="bin overflowing",
            severity="medium",
            sensitivity="normal",
            add_support_to=g.id,
        )
        assert supported.id == g.id
        assert supported.reporter_count == 2

        g.sla_due_at = now() - dt.timedelta(days=2)
        db.commit()
        moved = gov.escalate_overdue(db)
        assert g.id in moved
        db.refresh(g)
        assert g.status == "escalated"
        assert g.escalation_level == 1
        assert gov.verify_chain(db, g.id) is True


# ---------------- API, RBAC, Security & Efficiency tests ----------------
def test_bypass_dedup_flag():
    with SessionLocal() as db:
        g1 = gov.file_grievance(
            db,
            reporter_phone="9999999991",
            ui_language="en",
            category="streetlight",
            ward="Gandhipuram (Ward 42)",
            landmark="street 1",
            description_raw="light off",
            description_clean="light off",
            severity="medium",
            sensitivity="normal",
        )
        g1_id = g1.id

    client = TestClient(app_main.app)
    otp_resp = client.post("/api/v1/auth/request-otp", json={"phone": "9999999991"})
    assert otp_resp.status_code == 200

    verify_resp = client.post(
        "/api/v1/auth/verify-otp", json={"phone": "9999999991", "code": "123456"}
    )
    assert verify_resp.status_code == 200
    token = verify_resp.json()["token"]
    assert len(token) >= 24

    payload = {
        "session_id": "sess-test",
        "ui_language": "en",
        "reporter_phone": "9999999991",
        "category": "streetlight",
        "ward": "Gandhipuram (Ward 42)",
        "landmark": "street 1",
        "description": "light off again",
        "severity": "medium",
    }
    resp1 = client.post(
        "/api/v1/grievances",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 200
    assert resp1.json().get("duplicate") is True

    payload["bypass_dedup"] = True
    resp2 = client.post(
        "/api/v1/grievances",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200
    assert resp2.json().get("duplicate") is not True
    assert resp2.json().get("id") != g1_id


def test_security_headers_and_rbac_enforcement():
    with SessionLocal() as db:
        normal_g = gov.file_grievance(
            db,
            reporter_phone="9555555551",
            ui_language="en",
            category="road",
            ward="Peelamedu (Ward 71)",
            landmark="near college",
            description_raw="broken pavement",
            description_clean="broken pavement",
            severity="medium",
            sensitivity="normal",
        )
        sens_g = gov.file_grievance(
            db,
            reporter_phone="9555555552",
            ui_language="en",
            category="water_supply",
            ward="Ukkadam (Ward 20)",
            landmark=None,
            description_raw="officer demanded bribe",
            description_clean="alleged bribe",
            severity="high",
            sensitivity="sensitive",
        )
        normal_id, sens_id = normal_g.id, sens_g.id

    client = TestClient(app_main.app)

    # Security headers present
    health = client.get("/health")
    assert health.status_code == 200
    assert health.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" in health.headers
    assert "referrer-policy" in health.headers

    # Unknown role rejected
    assert client.get("/api/v1/admin/grievances", headers={"X-Role": "superadmin"}).status_code == 403

    # Ward officer cannot see or patch sensitive grievances
    wo_list = client.get("/api/v1/admin/grievances", headers={"X-Role": "ward_officer"})
    assert wo_list.status_code == 200
    ids = [g["id"] for g in wo_list.json()["grievances"]]
    assert normal_id in ids and sens_id not in ids

    assert (
        client.get(f"/api/v1/admin/grievances/{sens_id}", headers={"X-Role": "ward_officer"}).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/admin/grievances/{sens_id}",
            json={"status": "resolved", "note": "attempt"},
            headers={"X-Role": "ward_officer"},
        ).status_code
        == 403
    )

    # Oversight masks sensitive count for ward officer, reveals to cm_cell
    wo_ov = client.get("/api/v1/admin/oversight", headers={"X-Role": "ward_officer"}).json()
    cm_ov = client.get("/api/v1/admin/oversight", headers={"X-Role": "cm_cell"}).json()
    assert wo_ov["sensitive"] == 0
    assert wo_ov["total"] == 1
    assert cm_ov["sensitive"] == 1
    assert cm_ov["total"] == 2

    # Auditor is strictly read-only
    assert (
        client.patch(
            f"/api/v1/admin/grievances/{normal_id}",
            json={"status": "resolved"},
            headers={"X-Role": "auditor"},
        ).status_code
        == 403
    )
    assert (
        client.post("/api/v1/admin/run-escalation", headers={"X-Role": "auditor"}).status_code
        == 403
    )

    # Valid status update via JSON body works for cm_cell; invalid status rejected
    bad_status = client.patch(
        f"/api/v1/admin/grievances/{normal_id}",
        json={"status": "invalid_state"},
        headers={"X-Role": "cm_cell"},
    )
    assert bad_status.status_code == 422

    ok_patch = client.patch(
        f"/api/v1/admin/grievances/{normal_id}",
        json={"status": "resolved", "note": "Repaired"},
        headers={"X-Role": "cm_cell"},
    )
    assert ok_patch.status_code == 200
    assert ok_patch.json()["status"] == "resolved"

    # Reopen works on resolved grievance; feedback validates 1..5 bounds
    assert client.post(f"/api/v1/grievances/{normal_id}/reopen").status_code == 200
    assert client.post(f"/api/v1/grievances/{normal_id}/feedback", json={"rating": 6}).status_code == 422
    assert client.post(f"/api/v1/grievances/{normal_id}/feedback", json={"rating": 5}).status_code == 200


def test_otp_attempt_lockout_and_admin_key(monkeypatch):
    client = TestClient(app_main.app)

    # Invalid phone rejected
    assert client.post("/api/v1/auth/request-otp", json={"phone": "123"}).status_code == 422

    # Lockout after OTP_MAX_ATTEMPTS wrong attempts
    assert client.post("/api/v1/auth/request-otp", json={"phone": "9888888888"}).status_code == 200
    for _ in range(config.OTP_MAX_ATTEMPTS):
        r = client.post("/api/v1/auth/verify-otp", json={"phone": "9888888888", "code": "000000"})
        assert r.status_code == 400
    locked = client.post("/api/v1/auth/verify-otp", json={"phone": "9888888888", "code": "123456"})
    assert locked.status_code == 429

    # Optional ADMIN_API_KEY enforcement
    monkeypatch.setattr(config, "ADMIN_API_KEY", "test-secret-key")
    assert client.get("/api/v1/admin/oversight", headers={"X-Role": "cm_cell"}).status_code == 401
    assert (
        client.get(
            "/api/v1/admin/oversight",
            headers={"X-Role": "cm_cell", "X-Admin-Key": "test-secret-key"},
        ).status_code
        == 200
    )


def test_llm_pool_token_accounting_and_cooldown():
    cfg = config.ModelCfg("gemini/test-model", "intake", 1, rpm=2, tpm=1000, rpd=5)
    state = _ModelState(cfg)
    assert state.available(400) is True
    state.record(600)
    assert state.available(500) is False  # exceeds tpm
    assert state.available(300) is True
    state.record(300)
    assert state.available(10) is False   # exceeds rpm=2
    state.cooldown(60)
    assert state.snapshot()["cooling_down"] is True
    pool = GeminiPool()
    assert len(pool.status()) == len(config.GEMINI_POOL)
