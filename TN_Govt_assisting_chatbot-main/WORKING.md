# Working Guide — Nagar Kuraiteer

This file explains how to work on this repository, what each component does, how to run and test locally, and notes about what has been added.

**Quick Overview**

- Purpose: A conversational civic-grievance platform for Tamil Nadu cities (citizen intake → governance → officer workflows).
- Stack: FastAPI backend (Python), static frontend pages, SQLite for local dev, optional LLM integration (Gemini) or deterministic mock mode.

**One-line Quick Start**

```bash
# create .env or edit with real key; the repo contains a .env for convenience
cp .env.example .env   # or edit .env directly
./run.sh                # or: docker compose up --build
```

- Citizen app: http://localhost:8000/app/citizen.html
- Admin console: http://localhost:8000/app/admin.html

**What to edit / run during development**

1. Backend code: `backend/app/*.py` — main app logic lives here:
   - `main.py`: FastAPI entrypoint and static file serving.
   - `intake.py`: Intake state machine ("ask only when needed").
   - `governance.py`: Audit-chain, sensitivity, SLA/escalation logic.
   - `llm_gateway.py`: Abstraction to call a local mock LLM or the Gemini pool.
   - `mock_llm.py`: Deterministic mock LLM used when no live key is present.
   - `config.py`: City data (wards, departments, SLAs) and model pool limits.
   - `db.py`, `schemas.py`, `seed.py`: DB models, Pydantic schemas, and seed helpers.

2. Frontend: `frontend/citizen.html`, `frontend/admin.html` — single-file static pages that talk to the backend API.

3. Tests: `tests/test_core.py` — run with:

```bash
cd backend && LLM_MODE=mock python -m pytest -q
```

**Environment variables and config**

- `.env` (read at runtime):
  - `GEMINI_API_KEY` — when empty, the system runs in deterministic mock mode.
  - `LLM_MODE` — `auto | mock | live` (the app chooses behavior; tests may set `LLM_MODE=mock`).
  - `DB_URL` — default: `sqlite:///./nagar_kuraiteer.db` for local dev.
  - `QUESTION_BUDGET` — number of follow-up questions the intake engine may ask (default 3).
  - `MOCK_OTP` — demo OTP for verification when SMS is mocked.
  - `CITY_NAME`, `CITY_CODE` — city dataset in `app/config.py` ties to these values.

Note: `.env` is in `.gitignore` to avoid leaking keys. Keep real keys out of commits.

**Mock vs Live behavior**

- Mock: With no `GEMINI_API_KEY` or `LLM_MODE=mock`, the app uses `mock_llm.py` and mocked SMS. This is deterministic and ideal for development and demos.
- Live: Provide `GEMINI_API_KEY` and set `LLM_MODE=live` (or `auto` with a valid key). The gateway rotates across the model pool with rate-limit handling.

**What has been added in this repo**

- Project scaffold and run scripts: `run.sh`, `Dockerfile`, `docker-compose.yml`.
- Backend implementation: `backend/app/*.py` (intake, governance, llm gateway, mock logic, DB helpers).
- Frontend static demo pages: `frontend/citizen.html`, `frontend/admin.html`.
- Tests: `tests/test_core.py` with core unit tests for intake and governance behavior.
- Configuration: `app/config.py` contains ward/department/SLA sample data for Coimbatore.
- `BUILD_PHASES.md` and `README.md` with architecture and demo script.

**Development workflow (recommended)**

- Create a feature branch: `git checkout -b feat/describe-change`.
- Run locally in mock mode while developing UI or backend logic:

```bash
# ensure env is set to mock
cp .env.example .env    # or edit .env; leave GEMINI_API_KEY empty
./run.sh
# or run backend only
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

- Run tests for changes:

```bash
cd backend
LLM_MODE=mock python -m pytest -q
```

- Commit small changes with clear messages and open a PR against `main`.

**Adding or onboarding a new city**

- City-specific data lives in `backend/app/config.py`. Update the wards, departments, and SLA mapping there.
- No code compilation needed; restart the server to pick up the new config.

**Database**

- Default: local SQLite controlled by `DB_URL`.
- For prod or multi-node setups, swap `DB_URL` to a server DB and update DB initialization accordingly.

**Logging and troubleshooting**

- Check backend logs (console) for errors and model gateway throttling logic.
- If the LLM returns errors or 429s, the gateway has cooldowns and fallbacks — check `llm_gateway.py`.
- For audit-chain issues, inspect the append-only records in the DB via `db.py` helpers.

**Testing notes**

- Tests exercise the intake state machine, sensitivity routing, de-dup, and audit integrity.
- Use `LLM_MODE=mock` during tests to avoid network calls.

**Code style and conventions**

- Keep changes focused and small; prefer explicit behavior over magic.
- Python: follow standard idioms; use type hints and Pydantic schemas already in `schemas.py`.

**Commit & PR checklist**

- Tests pass locally (`pytest`).
- `.env` not included in commits.
- Document any public API changes in `README.md` or this `WORKING.md`.

**Next steps you might want me to do**

- Expand `README.md` with an onboarding checklist and city-import script.
- Add a `CONTRIBUTING.md` with branch/PR templates and CI guidance.
- Wire a basic GitHub Actions workflow to run `pytest` on PRs.

---

If you'd like, I can also add a `CONTRIBUTING.md` or update the existing `README.md` directly. Which would you prefer?