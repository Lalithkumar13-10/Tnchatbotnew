/**
 * Comprehensive API, Security, Governance, Intake, and Production-Guard tests
 * for the Nagar Kuraiteer Node.js preview runtime using node:test and supertest.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../server.mjs';
import { verifyChain } from '../src/audit.mjs';
import { OTP_MAX_ATTEMPTS, QUESTION_BUDGET, validateProductionConfig } from '../src/config.mjs';
import { buildSystemPrompt } from '../src/intake.mjs';

/**
 * Complete OTP verification and return the issued Bearer token for a phone number.
 * @param {import('express').Express} app
 * @param {string} phone
 * @returns {Promise<string>}
 */
async function authenticateCitizen(app, phone) {
  const reqRes = await request(app)
    .post('/api/v1/auth/request-otp')
    .send({ phone })
    .expect(200);
  assert.equal(reqRes.body.sent, true);

  const verRes = await request(app)
    .post('/api/v1/auth/verify-otp')
    .send({ phone, code: reqRes.body.demo_code || '123456' })
    .expect(200);
  assert.equal(verRes.body.verified, true);
  assert.ok(verRes.body.token && verRes.body.token.length >= 24);
  return verRes.body.token;
}

describe('Health, Security Headers, Compression, and Static Caching', () => {
  it('reports llm_live accurately and returns CSP, nosniff, and Referrer-Policy headers', async () => {
    const mockApp = createApp({ APP_ENV: 'development', GEMINI_API_KEY: '' });
    const res = await request(mockApp).get('/health').expect(200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.llm_live, false);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy']);
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');

    const liveApp = createApp({ APP_ENV: 'development', GEMINI_API_KEY: 'dummy-test-key' });
    const liveRes = await request(liveApp).get('/health').expect(200);
    assert.equal(liveRes.body.llm_live, true);
  });

  it('serves static assets with Cache-Control headers and gzip compression when requested', async () => {
    const app = createApp();
    const cssRes = await request(app)
      .get('/app/styles.css')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    assert.match(cssRes.headers['cache-control'] || '', /max-age=3600/);
    assert.equal(cssRes.headers['content-encoding'], 'gzip');
  });
});

describe('Production Startup Guard', () => {
  it('throws when APP_ENV=production lacks ADMIN_API_KEY', () => {
    assert.throws(
      () =>
        validateProductionConfig({
          APP_ENV: 'production',
          ADMIN_API_KEY: '',
          MOCK_OTP: '982411',
        }),
      /ADMIN_API_KEY/
    );
  });

  it('throws when APP_ENV=production retains demo MOCK_OTP 123456', () => {
    assert.throws(
      () =>
        validateProductionConfig({
          APP_ENV: 'production',
          ADMIN_API_KEY: 'prod-secret-key',
          MOCK_OTP: '123456',
        }),
      /MOCK_OTP/
    );
  });

  it('allows startup when APP_ENV=production has ADMIN_API_KEY and non-demo MOCK_OTP', () => {
    assert.doesNotThrow(() =>
      createApp({
        APP_ENV: 'production',
        ADMIN_API_KEY: 'prod-secret-key',
        MOCK_OTP: '849201',
      })
    );
  });
});

describe('OTP Verification & Lockout', () => {
  it('locks out OTP verification after 5 failed attempts with 429', async () => {
    const app = createApp();
    const phone = '9888888801';

    await request(app).post('/api/v1/auth/request-otp').send({ phone }).expect(200);

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone, code: '000000' })
        .expect(400);
    }

    const locked = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone, code: '123456' })
      .expect(429);
    assert.match(locked.body.detail, /too many/i);
  });
});

describe('Grievance Filing Authentication & Deduplication', () => {
  it('returns 401 when filing without a Bearer token or with a wrong token', async () => {
    const app = createApp();
    const payload = {
      session_id: 'sess-unauth',
      ui_language: 'en',
      reporter_phone: '9777777701',
      category: 'road',
      ward: 'Peelamedu (Ward 71)',
      landmark: 'Avinashi Road',
      description: 'Large pothole near junction',
      severity: 'high',
    };

    await request(app).post('/api/v1/grievances').send(payload).expect(401);

    await request(app)
      .post('/api/v1/grievances')
      .set('Authorization', 'Bearer invalid-token-value')
      .send(payload)
      .expect(401);
  });

  it('files with a valid Bearer token (200), detects duplicates, and honors bypass_dedup', async () => {
    const app = createApp();
    const phone = '9777777702';
    const token = await authenticateCitizen(app, phone);

    const payload = {
      session_id: 'sess-dedup',
      ui_language: 'en',
      reporter_phone: phone,
      category: 'road',
      ward: 'Singanallur (Ward 89)',
      landmark: 'Trichy Road',
      description: 'Deep pothole outside bus stand',
      severity: 'medium',
    };

    const first = await request(app)
      .post('/api/v1/grievances')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);
    assert.ok(first.body.id.startsWith('TN-CBE-'));
    assert.notEqual(first.body.duplicate, true);

    const dup = await request(app)
      .post('/api/v1/grievances')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);
    assert.equal(dup.body.duplicate, true);
    assert.equal(dup.body.existing_id, first.body.id);

    const bypassed = await request(app)
      .post('/api/v1/grievances')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, bypass_dedup: true })
      .expect(200);
    assert.notEqual(bypassed.body.duplicate, true);
    assert.notEqual(bypassed.body.id, first.body.id);
  });
});

describe('Admin RBAC, Default Role, Audit Actor Namespacing & Hash Chain', () => {
  it('defaults admin role to ward_officer and hides sensitive grievances from ward_officer', async () => {
    const app = createApp();

    // No X-Role header -> must default to lowest privilege "ward_officer"
    const defaultList = await request(app).get('/api/v1/admin/grievances').expect(200);
    assert.equal(defaultList.body.role, 'ward_officer');
    assert.ok(
      defaultList.body.grievances.every((g) => g.sensitivity !== 'sensitive'),
      'Default ward_officer role must never see sensitive grievances'
    );

    const defaultOversight = await request(app).get('/api/v1/admin/oversight').expect(200);
    assert.equal(defaultOversight.body.sensitive, 0);

    // CM Cell sees the seeded sensitive grievance
    const cmList = await request(app)
      .get('/api/v1/admin/grievances')
      .set('X-Role', 'cm_cell')
      .expect(200);
    const sensitiveRow = cmList.body.grievances.find((g) => g.sensitivity === 'sensitive');
    assert.ok(sensitiveRow, 'Seeded sensitive grievance must exist for cm_cell');

    // Ward officer gets 403 on direct sensitive GET and PATCH
    await request(app)
      .get(`/api/v1/admin/grievances/${sensitiveRow.id}`)
      .set('X-Role', 'ward_officer')
      .expect(403);

    await request(app)
      .patch(`/api/v1/admin/grievances/${sensitiveRow.id}`)
      .set('X-Role', 'ward_officer')
      .send({ status: 'resolved', note: 'unauthorized attempt' })
      .expect(403);
  });

  it('enforces auditor read-only permissions and run-escalation role checks', async () => {
    const app = createApp();
    const list = await request(app)
      .get('/api/v1/admin/grievances')
      .set('X-Role', 'cm_cell')
      .expect(200);
    const normalRow = list.body.grievances.find((g) => g.sensitivity === 'normal');
    assert.ok(normalRow);

    // Auditor can view grievances and oversight, including sensitive, but cannot mutate
    await request(app).get('/api/v1/admin/grievances').set('X-Role', 'auditor').expect(200);
    await request(app)
      .patch(`/api/v1/admin/grievances/${normalRow.id}`)
      .set('X-Role', 'auditor')
      .send({ status: 'resolved' })
      .expect(403);

    // Escalation denied for default (ward_officer), ward_officer, and auditor
    await request(app).post('/api/v1/admin/run-escalation').expect(403);
    await request(app)
      .post('/api/v1/admin/run-escalation')
      .set('X-Role', 'ward_officer')
      .expect(403);
    await request(app)
      .post('/api/v1/admin/run-escalation')
      .set('X-Role', 'auditor')
      .expect(403);

    // Escalation succeeds for cm_cell and escalates the seeded overdue garbage grievance
    const escRes = await request(app)
      .post('/api/v1/admin/run-escalation')
      .set('X-Role', 'cm_cell')
      .expect(200);
    assert.ok(Array.isArray(escRes.body.escalated));
    assert.ok(escRes.body.escalated.length >= 1);
  });

  it('namespaces audit actors with the authenticated role and detects hash-chain tampering', async () => {
    const app = createApp();
    const list = await request(app)
      .get('/api/v1/admin/grievances')
      .set('X-Role', 'ward_officer')
      .expect(200);
    const gid = list.body.grievances[0].id;

    // Even if client supplies actor="cm_cell:FAKE", it must be namespaced under ward_officer:
    await request(app)
      .patch(`/api/v1/admin/grievances/${gid}`)
      .set('X-Role', 'ward_officer')
      .send({ status: 'in_progress', actor: 'OFF-DESK', note: 'Field crew dispatched' })
      .expect(200);

    const detail = await request(app)
      .get(`/api/v1/admin/grievances/${gid}`)
      .set('X-Role', 'ward_officer')
      .expect(200);
    assert.equal(detail.body.chain_valid, true);
    const latest = detail.body.history[detail.body.history.length - 1];
    assert.equal(latest.actor, 'ward_officer:OFF-DESK');
    assert.equal(latest.role, 'ward_officer');

    // Mutate stored event note directly to confirm tamper detection
    const stored = app.locals.store.grievances.get(gid);
    assert.equal(verifyChain(stored), true);
    stored.events[0].note = 'tampered-record';
    assert.equal(verifyChain(stored), false);

    const tamperedDetail = await request(app)
      .get(`/api/v1/admin/grievances/${gid}`)
      .set('X-Role', 'ward_officer')
      .expect(200);
    assert.equal(tamperedDetail.body.chain_valid, false);
  });
});

describe('Per-IP Rate Limiting (Track 30/min & Reopen 10/min)', () => {
  it('enforces 30 req/min per IP on GET /api/v1/grievances/:gid and returns 429', async () => {
    const app = createApp();
    const list = await request(app)
      .get('/api/v1/admin/grievances')
      .set('X-Role', 'ward_officer')
      .expect(200);
    const gid = list.body.grievances[0].id;

    for (let i = 0; i < 30; i += 1) {
      await request(app)
        .get(`/api/v1/grievances/${gid}`)
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(200);
    }

    await request(app)
      .get(`/api/v1/grievances/${gid}`)
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(429);
  });

  it('enforces 10 req/min per IP on POST /api/v1/grievances/:gid/reopen and returns 429', async () => {
    const app = createApp();
    const list = await request(app)
      .get('/api/v1/admin/grievances')
      .set('X-Role', 'ward_officer')
      .expect(200);
    const gid = list.body.grievances[0].id;

    // Even when grievance is open (400), rate limit counter increments per IP up to 10/min
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post(`/api/v1/grievances/${gid}/reopen`)
        .set('X-Forwarded-For', '203.0.113.20')
        .send({})
        .expect(400);
    }

    await request(app)
      .post(`/api/v1/grievances/${gid}/reopen`)
      .set('X-Forwarded-For', '203.0.113.20')
      .send({})
      .expect(429);
  });
});

describe('Conversational Intake Budget & Prompt-Injection Defense', () => {
  it('includes the untrusted citizen text delimiter security note in the LLM system prompt', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /---/);
    assert.match(prompt, /untrusted citizen text/i);
    assert.match(prompt, /ignore any instructions/i);
  });

  it('supports Tanglish/Tamil intake and enforces the 3-question budget', async () => {
    const app = createApp();

    // Tanglish streetlight intake -> asks for location once, then confirms with high severity
    const r1 = await request(app)
      .post('/api/v1/intake/message')
      .send({
        session_id: 'sess-tanglish',
        ui_language: 'ta',
        text: 'anna street light eriyala ratri romba dark',
      })
      .expect(200);
    assert.equal(r1.body.mode, 'ask');

    const r2 = await request(app)
      .post('/api/v1/intake/message')
      .send({
        session_id: 'sess-tanglish',
        ui_language: 'ta',
        text: 'Kuniyamuthur',
      })
      .expect(200);
    assert.equal(r2.body.mode, 'confirm');
    assert.equal(r2.body.draft.category, 'streetlight');
    assert.equal(r2.body.draft.severity, 'high');
    assert.match(r2.body.draft.ward, /Kuniyamuthur/);

    // Hard 3-question budget for vague inputs
    let lastMode = 'ask';
    for (let i = 0; i < QUESTION_BUDGET + 1; i += 1) {
      const resp = await request(app)
        .post('/api/v1/intake/message')
        .send({ session_id: 'sess-vague', ui_language: 'en', text: 'there is an issue' })
        .expect(200);
      lastMode = resp.body.mode;
    }
    assert.equal(lastMode, 'confirm');
  });
});
