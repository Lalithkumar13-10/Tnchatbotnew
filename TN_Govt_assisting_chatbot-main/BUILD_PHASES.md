# Build phases

The project was built (and verified) in seven phases. Each phase is self-contained and testable.

| Phase | What it delivers | Key files | Status |
|------|------------------|-----------|--------|
| **1 — Foundation** | Settings, pilot-city directory (wards, category→dept+SLA, escalation ladder, sensitive keywords), DB models with an append-only audit table, Pydantic schemas, bilingual strings + Gemini prompt | `config.py`, `db.py`, `schemas.py`, `prompts.py` | ✅ |
| **2 — LLM gateway** | LiteLLM→Gemini pool with rate-aware rotation over all five models (rpm **and** rpd), cooldowns on 429, graceful exhaustion, deterministic offline mock | `llm_gateway.py`, `mock_llm.py` | ✅ |
| **3 — Intake engine** | "Ask only when needed" state machine: slot merge, one-question-at-a-time, hard 3-question budget, confirmation hand-off | `intake.py` | ✅ tested |
| **4 — Governance + API** | Hash-chained audit, sensitivity routing, SLA + escalation, de-dup, filing; FastAPI routes for auth/intake/file/track/admin/oversight; seed data | `governance.py`, `main.py`, `seed.py` | ✅ tested |
| **5 — Frontends** | Citizen app (bilingual, OTP, chat, editable confirm card, tracking slip, reopen/rate) and Officer/CM console (role switch, SLA queue, audit drawer, actions) | `frontend/citizen.html`, `frontend/admin.html` | ✅ served |
| **6 — Verification** | Unit tests (7) + full HTTP walkthrough of every flow, two bugs found and fixed (audit timestamp; within-transaction chaining) | `tests/test_core.py` | ✅ 7/7 pass |
| **7 — Packaging** | `run.sh`, Dockerfile, docker-compose, `.env.example`, README + this file | root | ✅ |

## The Gemini pool (real limits from AI Studio)

| Model | Group | rpm | rpd | Role |
|-------|-------|-----|-----|------|
| `gemini-3.1-flash-lite` | intake | 15 | **500** | Workhorse — carries ordinary intake |
| `gemini-2.5-flash-lite` | intake | 10 | 20 | Overflow |
| `gemini-2.5-flash` | intake | 5 | 20 | Overflow |
| `gemini-3.5-flash` | reason | 5 | 20 | Hard / sensitive turns only |
| `gemini-3-flash` | reason | 5 | 20 | Reason fallback |

Because four models cap at **20 requests/day**, the pool leans on 3.1 Flash-Lite (500/day) and
keeps the scarce, stronger models for rare hard/sensitive classifications. When all are exhausted
the intake **degrades to a plain guided form** instead of failing.

## Suggested next phases (not built)

- **Voice intake** (Tamil ASR) — the single highest-impact addition for real citizens.
- **Photo + geotag** attachment and a hotspot map view for the CM cell.
- **Real OTP/SMS** gateway and **DigiLocker/e-Sevai** identity instead of the mock.
- **Postgres + Redis** for multi-worker deployment; move sessions out of process memory.
- **Bridge to IIPGCMS** so a filed grievance creates the official CM-Helpline ticket.
