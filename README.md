# Nagar Kuraiteer — நகர குறைதீர்

Bilingual (Tamil, English, and Tanglish) conversational civic-grievance platform for Tamil Nadu municipalities (Coimbatore pilot), built with government-records auditability, least-privilege RBAC, and WCAG 2.1 AA/AAA accessibility.

---

## Runtime Architecture: Preview Runtime vs. Reference Implementation

This repository contains two API-compatible runtimes serving the same static frontend (`/TN_Govt_assisting_chatbot-main/frontend`):

1. **Node.js Preview Runtime (`/server.mjs` + `/src/*`)**
   - Lightweight Express server running on **port 3000** for instant preview and zero-setup evaluation.
   - Modularized into `src/config.mjs`, `src/security.mjs`, `src/audit.mjs`, `src/store.mjs`, `src/intake.mjs`, `src/routes/citizen.mjs`, and `src/routes/admin.mjs`.
   - Exports `createApp()` from `server.mjs` so the entire API can be tested in-process without binding a network port.
   - Supports optional live Gemini intake (`GEMINI_API_KEY` via `@google/genai` with a strict JSON schema and 10-second timeout) with automatic deterministic Tamil/English/Tanglish fallback, gzip compression, and static asset cache headers.

2. **Python FastAPI Reference Implementation (`/TN_Govt_assisting_chatbot-main/backend/app/*`)**
   - Production-oriented FastAPI + SQLAlchemy (SQLite WAL) reference backend with Pydantic v2 validation, LiteLLM multi-model rate-aware pool, and persistent storage.
   - Mirrors the exact same REST API contract, RBAC matrix, SHA-256 hash-chained audit trail, per-IP rate limiting, production startup guard, and prompt-injection defenses.

---

## Security & Accessibility Highlights

- **Least-Privilege Admin RBAC**: Missing `X-Role` defaults to `"ward_officer"` (never `"cm_cell"`). Sensitive grievances are hidden from ward/dept officers; `auditor` is strictly read-only; `run-escalation` requires `commissioner`, `collector`, or `cm_cell`.
- **Mandatory OTP Bearer Auth**: `POST /api/v1/grievances` always requires a valid `Authorization: Bearer <token>` issued by `/api/v1/auth/verify-otp` (`401` if missing or invalid), with 5-attempt OTP lockout (`429`).
- **Role-Namespaced Tamper-Evident Audit Trail**: Every audit event namespaces `actor` with the authenticated role (e.g., `ward_officer:OFF-DESK`, `citizen:9991`) and chains entries via SHA-256.
- **Production Startup Guard**: When `APP_ENV=production`, both runtimes refuse to start unless `ADMIN_API_KEY` is configured and `MOCK_OTP` is not `123456`.
- **Per-IP Rate Limiting**: Enforces `30 req/min` on `GET /api/v1/grievances/:gid` and `10 req/min` on `POST /api/v1/grievances/:gid/reopen` (`429`).
- **Prompt-Injection Defense**: System prompts explicitly treat everything after `---` as untrusted citizen text and instruct the model to ignore embedded instructions.
- **WCAG 2.1 AA/AAA Accessibility**: Verified `>= 7:1` AAA text contrast, `>= 44px` touch targets, explicit `<label for>` and `aria-label` names, `role="log"` + `aria-live` status updates, modal focus trapping, `prefers-reduced-motion`, `forced-colors`, strict CSP, and zero `innerHTML`/`localStorage` usage.

---

## Running & Testing

### Node.js Preview Runtime

```bash
npm ci
npm run lint
npm test
npm start
```

- Citizen portal: `http://localhost:3000/app/citizen.html`
- Admin console: `http://localhost:3000/app/admin.html`

### Python FastAPI Reference Backend

```bash
cd TN_Govt_assisting_chatbot-main
pip install -r backend/requirements.txt pytest httpx ruff mypy
ruff check backend
mypy backend/app
python -m pytest backend/tests
```
