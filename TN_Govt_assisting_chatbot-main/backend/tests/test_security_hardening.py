"""Security hardening tests for the FastAPI reference backend.

Covers mandatory Bearer token authentication on grievance filing, least-privilege
default admin role (ward_officer), role-namespaced audit actors, production startup
configuration guard, per-IP rate limiting on tracking/reopen, and LLM prompt-injection
delimiter instructions.
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ["LLM_MODE"] = "mock"
os.environ["DB_URL"] = "sqlite:///./test_nk.db"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from app import config
from app import governance as gov
from app import intake as ie
from app import main as app_main
from app.db import AuditEvent, Base, SessionLocal, engine, init_db
from app.prompts import INTAKE_SYSTEM_PROMPT
from app.security import otp_store, rate_limiter


@pytest.fixture(autouse=True)
def clean_state():
    Base.metadata.drop_all(bind=engine)
    init_db()
    otp_store.clear()
    rate_limiter.clear()
    ie.reset_sessions()
    yield


def test_filing_requires_valid_bearer_token():
    client = TestClient(app_main.app)
    payload = {
        "session_id": "sess-sec-1",
        "ui_language": "en",
        "reporter_phone": "9666666601",
        "category": "road",
        "ward": "Gandhipuram (Ward 42)",
        "landmark": "Cross Cut Road",
        "description": "Deep pothole blocking traffic",
        "severity": "high",
    }

    # Missing Authorization header -> 401
    missing = client.post("/api/v1/grievances", json=payload)
    assert missing.status_code == 401

    # Wrong Bearer token -> 401
    wrong = client.post(
        "/api/v1/grievances",
        json=payload,
        headers={"Authorization": "Bearer wrong-token-123"},
    )
    assert wrong.status_code == 401

    # Valid OTP Bearer token -> 200
    assert client.post("/api/v1/auth/request-otp", json={"phone": "9666666601"}).status_code == 200
    ver = client.post(
        "/api/v1/auth/verify-otp",
        json={"phone": "9666666601", "code": config.MOCK_OTP},
    )
    assert ver.status_code == 200
    token = ver.json()["token"]

    ok = client.post(
        "/api/v1/grievances",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok.status_code == 200
    assert ok.json()["id"].startswith("TN-CBE-")


def test_default_admin_role_is_ward_officer():
    with SessionLocal() as db:
        normal_g = gov.file_grievance(
            db,
            reporter_phone="9666666602",
            ui_language="en",
            category="streetlight",
            ward="Peelamedu (Ward 71)",
            landmark="Main Road",
            description_raw="Streetlight out",
            description_clean="Streetlight out",
            severity="medium",
            sensitivity="normal",
        )
        sens_g = gov.file_grievance(
            db,
            reporter_phone="9666666603",
            ui_language="en",
            category="water_supply",
            ward="Ukkadam (Ward 20)",
            landmark=None,
            description_raw="Official demanded bribe",
            description_clean="Alleged bribe",
            severity="high",
            sensitivity="sensitive",
        )
        normal_id, sens_id = normal_g.id, sens_g.id

    client = TestClient(app_main.app)

    # Omitting X-Role must default to lowest-privilege ward_officer
    resp = client.get("/api/v1/admin/grievances")
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "ward_officer"
    ids = [row["id"] for row in body["grievances"]]
    assert normal_id in ids and sens_id not in ids

    # Omitting X-Role must be blocked from running escalation and viewing sensitive records
    assert client.post("/api/v1/admin/run-escalation").status_code == 403
    assert client.get(f"/api/v1/admin/grievances/{sens_id}").status_code == 403


def test_audit_actor_is_namespaced_with_authenticated_role():
    with SessionLocal() as db:
        g = gov.file_grievance(
            db,
            reporter_phone="9666666604",
            ui_language="en",
            category="garbage",
            ward="R.S. Puram (Ward 55)",
            landmark="DB Road",
            description_raw="Bin overflowing",
            description_clean="Bin overflowing",
            severity="medium",
            sensitivity="normal",
        )
        gid = g.id

    client = TestClient(app_main.app)
    patch = client.patch(
        f"/api/v1/admin/grievances/{gid}",
        json={"status": "in_progress", "actor": "OFF-DESK", "note": "Team dispatched"},
        headers={"X-Role": "ward_officer"},
    )
    assert patch.status_code == 200

    with SessionLocal() as db:
        events = (
            db.query(AuditEvent)
            .filter_by(grievance_id=gid)
            .order_by(AuditEvent.id.asc())
            .all()
        )
        assert events[0].actor_id.startswith("citizen:")
        assert events[-1].actor_id == "ward_officer:OFF-DESK"
        assert events[-1].actor_role == "ward_officer"
        assert gov.verify_chain(db, gid) is True


def test_production_guard_raises_runtime_error_on_insecure_config(monkeypatch):
    monkeypatch.setattr(config, "APP_ENV", "production")
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "ADMIN_API_KEY", "")
    monkeypatch.setattr(config, "MOCK_OTP", "948271")
    with pytest.raises(RuntimeError, match="ADMIN_API_KEY"):
        config.validate_production_config()

    monkeypatch.setattr(config, "ADMIN_API_KEY", "strong-prod-admin-key")
    monkeypatch.setattr(config, "MOCK_OTP", "123456")
    with pytest.raises(RuntimeError, match="MOCK_OTP"):
        config.validate_production_config()

    monkeypatch.setattr(config, "MOCK_OTP", "948271")
    config.validate_production_config()


def test_tracking_and_reopen_per_ip_rate_limits():
    with SessionLocal() as db:
        g = gov.file_grievance(
            db,
            reporter_phone="9666666605",
            ui_language="en",
            category="road",
            ward="Singanallur (Ward 89)",
            landmark="Bus Stand",
            description_raw="Damaged road",
            description_clean="Damaged road",
            severity="medium",
            sensitivity="normal",
        )
        gid = g.id

    client = TestClient(app_main.app)

    # 30 requests per minute per IP allowed on GET /api/v1/grievances/{gid}; 31st -> 429
    for _ in range(30):
        res = client.get(f"/api/v1/grievances/{gid}", headers={"X-Forwarded-For": "198.51.100.11"})
        assert res.status_code == 200
    throttled_track = client.get(
        f"/api/v1/grievances/{gid}", headers={"X-Forwarded-For": "198.51.100.11"}
    )
    assert throttled_track.status_code == 429

    # 10 requests per minute per IP allowed on POST /api/v1/grievances/{gid}/reopen; 11th -> 429
    for _ in range(10):
        res = client.post(
            f"/api/v1/grievances/{gid}/reopen", headers={"X-Forwarded-For": "198.51.100.22"}
        )
        assert res.status_code == 400
    throttled_reopen = client.post(
        f"/api/v1/grievances/{gid}/reopen", headers={"X-Forwarded-For": "198.51.100.22"}
    )
    assert throttled_reopen.status_code == 429


def test_llm_system_prompt_contains_untrusted_text_security_note():
    assert "---" in INTAKE_SYSTEM_PROMPT
    assert "untrusted citizen text" in INTAKE_SYSTEM_PROMPT.lower()
    assert "ignore any instructions" in INTAKE_SYSTEM_PROMPT.lower()
