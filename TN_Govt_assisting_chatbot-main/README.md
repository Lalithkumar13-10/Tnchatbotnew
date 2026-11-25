# Nagar Kuraiteer — நகர குறைதீர்

A **conversational civic-grievance platform for Tamil Nadu cities**. A citizen describes a
problem in Tamil, English, or Tanglish; the assistant understands it, asks only the follow-ups
it needs, and files a correctly-routed official grievance with a tracking ID. Officers resolve
it under SLA, and the CM cell oversees the whole state of play — handled to a **government-records
standard** (immutable audit trail, sensitive-grievance protection, escalation, no hard deletes).

It is a **conversational front-door** that removes the form friction of the existing TN CM
Helpline / IIPGCMS portal — not a parallel portal.

---

## Run it (one command, no key needed)

```bash
cp .env.example .env        # Add a GEMINI_API_KEY to go live (automatically loaded at startup)
./run.sh                    # or: docker compose up --build
```

- **Citizen app** → http://localhost:8000/app/citizen.html
- **Officer / CM console** → http://localhost:8000/app/admin.html

With **no key**, the app runs in deterministic **mock mode** — the full flow works offline.
Add `GEMINI_API_KEY` to `.env` and the backend automatically switches to the live Gemini pool.

---

## 90-second demo script

1. Open the **Citizen app**, select **English** or **தமிழ்**, and verify your phone (demo OTP is shown on screen). If you switch UI language after requesting the OTP, the hint translates dynamically.
2. Type a messy Tanglish line: *"anna en area la street light 3 naala eriyala ratri romba dark"*.
   - The welcome suggestion chips vanish immediately on the first message.
   - The bot asks **only** for the location (one question) and infers **severity: high** (Urgent) from "dark".
3. Reply with a location: *"ragavendra garden, sathya nagar, kuniyamuthur"*.
   - Since **Kuniyamuthur** is now in our expanded ward list, it is automatically matched.
   - The **editable confirmation card** appears with **Urgent** correctly highlighted.
4. Experiment with the confirmation card:
   - Click different priority/severity levels (Routine, Priority, Urgent) and verify they toggle correctly.
   - Leave the Ward dropdown as `—` or select **Other / Not Listed** (used for unlisted areas) and verify you can file successfully using just the landmark.
5. File a **streetlight** complaint in **Gandhipuram (Ward 42)** twice to trigger **de-dup**:
   - The duplicate warning card appears: "Grievance Already Exists — support this or file separately".
   - Click **File separately** — it bypasses the duplicate engine, successfully registers the new grievance in the DB, and shows up on the admin panel.
   - *(Note: complaints in the "Other" category or unlisted wards skip duplicate detection entirely).*
6. Open the **Admin console** (as *CM Cell*): see stats — 1 **SLA breach**, 1 **sensitive 🔒**.
   - Switch role to **Ward Officer**: the sensitive grievance disappears (masked).
7. Click **Run SLA escalation** → the back-dated garbage grievance auto-escalates up the ladder.
8. Open a grievance → read the **citizen's verbatim words**, the **hash-chained audit trail** (tamper-evident), and **Resolve** it.

---

## Architecture

```
Citizen app ─┐                         ┌─ Officer / CM console
             ▼                         ▼
        FastAPI  ──  intake engine  ──  governance (audit · sensitivity · SLA/escalation)
             │            │                     │
             │      LLM gateway            repositories → SQLite
             │      (LiteLLM → Gemini pool,
             │       rpm/tpm/rpd rotation)
             └──────────────────────────────────┘
```

- **LLM gateway** (`app/llm_gateway.py`): LiteLLM to Gemini, with rate-aware rotation across the five-model pool — per-minute (rpm/tpm) **and** per-day (rpd) — cooldowns on 429, and a graceful form fallback when everything is throttled. See the pool + limits in `app/config.py`.
- **Intake engine** (`app/intake.py`): the "ask only when needed" state machine with a hard 3-question budget; anything still fuzzy drops into the editable card, never another question.
- **Governance** (`app/governance.py`): append-only hash-chained audit log with role-namespaced actors, sensitivity routing (never to the official concerned), SLA due dates + escalation ladder, de-duplication.

### Preview Runtime vs. Reference Implementation

- **Root `/server.mjs` + `/src/*` (Express / Node.js)** is the lightweight **preview runtime** (port `3000`) mirroring the full API contract, security invariants, optional live Gemini intake, compression, and static caching for zero-setup previews and automated Node testing (`npm test`, `npm run lint`).
- **`TN_Govt_assisting_chatbot-main/backend/app/*` (FastAPI / SQLAlchemy)** is the **reference implementation** with SQLite WAL persistence, Pydantic v2 schemas, and multi-model LiteLLM pooling (`python -m pytest backend/tests`).

---

## What's Mocked / Configured

- **OTP / SMS** — mock code `123456`, behind the same interface a real gateway would use.
- **LLM** — deterministic mock when no `GEMINI_API_KEY`; live Gemini pool when set.
- **City Wards** — Expanded list of 23 zone-wise Coimbatore wards plus `"Other / Not Listed"` fallback in `app/config.py`. Update this list to onboard new cities.

---

## Accessibility & Security Standards

- **WCAG 2.1 Level AA/AAA Accessibility**:
  - Full keyboard operability, visible `:focus-visible` indicators, skip-to-main-content links, semantic landmarks (`<header>`, `<main>`, `<footer>`, `<section>`), and valid heading hierarchies across both Citizen and Admin portals.
  - Explicit `<label for="...">` associations, `aria-describedby` / `aria-invalid` validation feedback, `role="log"` + `aria-live` polite/assertive status announcements, and accessible modal focus trapping with `Escape` dismissal and focus restoration.
  - Verified color contrast ratios (`>= 4.5:1` for text/badges, `>= 3:1` for form control borders), `44px` minimum touch targets, pinch-to-zoom enabled, `prefers-reduced-motion`, and `forced-colors` support.
  - Dynamic `<html lang="ta|en">` switching for Tamil and English screen readers.
- **Security & Performance**:
  - Strict Content-Security-Policy (zero inline scripts/styles/handlers), DOM `textContent`-only rendering (zero `innerHTML` XSS sinks), explicit CORS allowlist, and security response headers.
  - Enforced server-side RBAC (read-only `auditor`, SQL-level sensitive grievance masking, optional `X-Admin-Key`), timing-safe OTP verification with attempt lockouts, bounded in-memory stores, SQLite WAL mode + composite indexes, and SQL-aggregated oversight queries.

---

## Tests

The project includes unit, security, governance, efficiency, and automated WCAG accessibility tests.

To install dependencies and run the test suite:
```bash
.venv\Scripts\activate
pip install -r backend/requirements.txt pytest httpx
python -m pytest backend/tests
```

Covers:
- Conversational intake transitions, 3-question cap, severity & sensitivity inference, and graceful degradation.
- Duplicate detection rules, unlisted ward / "Other" exemptions, and `bypass_dedup`.
- Append-only SHA-256 audit chain integrity and tamper detection.
- RBAC enforcement (read-only auditor, sensitive record masking, optional `ADMIN_API_KEY`), OTP lockouts, and security headers.
- SQL oversight aggregation, SLA escalation ladder, bounded sessions, and O(1) LLM token accounting.
- Automated WCAG 2.1 AA HTML structure, CSS color-contrast ratios, and zero-XSS JavaScript hygiene (`backend/tests/test_accessibility.py`).

