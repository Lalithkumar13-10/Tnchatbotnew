/**
 * Citizen-facing Express routes: metadata, OTP verification, conversational intake,
 * grievance filing (Bearer token mandatory), tracking (30/min/IP), reopen (10/min/IP), and feedback.
 */
import express from 'express';
import {
  CATEGORIES,
  CLOSED_STATES,
  WARDS,
  getRuntimeConfig,
} from '../config.mjs';
import { appendAudit } from '../audit.mjs';
import { getClientIp, normalizePhone } from '../security.mjs';
import { serializeSlip } from '../store.mjs';

const ONE_MINUTE_MS = 60_000;

/**
 * Create the citizen API router mounted at /api/v1.
 * @param {{ store: ReturnType<import('../store.mjs').createStore>, intake: ReturnType<import('../intake.mjs').createIntakeEngine>, otpStore: import('../security.mjs').OtpStore, rateLimiter: import('../security.mjs').RateLimiter }} deps
 * @returns {import('express').Router}
 */
export function createCitizenRouter({ store, intake, otpStore, rateLimiter }) {
  const router = express.Router();

  router.get('/meta', (_req, res) => {
    const cfg = getRuntimeConfig();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json({
      city: cfg.cityName,
      city_code: cfg.cityCode,
      categories: Object.entries(CATEGORIES).map(([key, info]) => ({
        key,
        ta: info.ta,
        en: info.en,
        dept: info.dept,
      })),
      wards: WARDS,
    });
  });

  router.post('/auth/request-otp', (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(422).json({ detail: 'Valid 10-digit mobile number is required' });
    }
    if (!rateLimiter.allow(`otp_req:${phone}`, 10, ONE_MINUTE_MS)) {
      return res.status(429).json({ detail: 'Too many OTP requests. Please try again shortly.' });
    }
    const cfg = getRuntimeConfig();
    otpStore.issue(phone, cfg.mockOtp);
    const payload = { sent: true };
    if (!cfg.isProduction) payload.demo_code = cfg.mockOtp;
    return res.json(payload);
  });

  router.post('/auth/verify-otp', (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!phone || !code) {
      return res.status(422).json({ detail: 'Phone and OTP code are required' });
    }
    const result = otpStore.verify(phone, code);
    if (!result.ok) {
      return res.status(result.status).json({ detail: result.detail });
    }
    return res.json({ verified: true, token: result.token });
  });

  router.post('/intake/message', async (req, res) => {
    const sid = String(req.body?.session_id || '').trim();
    const uiLang = req.body?.ui_language === 'ta' ? 'ta' : 'en';
    const text = String(req.body?.text || '').trim();
    if (!sid || !text || text.length > 2000) {
      return res.status(422).json({ detail: 'Valid session_id and message text are required' });
    }
    if (!rateLimiter.allow(`intake:${sid}`, 30, ONE_MINUTE_MS)) {
      return res.status(429).json({ detail: 'Too many messages. Please slow down.' });
    }
    const sess = intake.getSession(sid, uiLang);
    const reply = await intake.step(sess, text);
    return res.json(reply);
  });

  router.post('/grievances', (req, res) => {
    const phone = normalizePhone(req.body?.reporter_phone);
    if (!phone) {
      return res.status(422).json({ detail: 'Valid reporter_phone is required' });
    }
    const authCheck = otpStore.requireVerifiedToken(phone, req.header('Authorization'));
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ detail: authCheck.detail });
    }
    if (!rateLimiter.allow(`file:${phone}`, 20, ONE_MINUTE_MS)) {
      return res.status(429).json({ detail: 'Too many grievance submissions. Try again shortly.' });
    }

    const category = String(req.body?.category || '');
    const description = String(req.body?.description || '').trim();
    const ward = req.body?.ward ? String(req.body.ward).slice(0, 120) : null;
    const landmark = req.body?.landmark ? String(req.body.landmark).slice(0, 200) : null;
    const severity = ['low', 'medium', 'high'].includes(req.body?.severity)
      ? req.body.severity
      : 'medium';
    const uiLang = req.body?.ui_language === 'ta' ? 'ta' : 'en';
    const addSupportTo = req.body?.add_support_to ? String(req.body.add_support_to) : null;
    const bypassDedup = Boolean(req.body?.bypass_dedup);

    if (!CATEGORIES[category] || !description || (!ward && !landmark)) {
      return res.status(422).json({ detail: 'Category, description, and location are required' });
    }

    if (!addSupportTo && !bypassDedup) {
      const dup = store.findDuplicate(category, ward);
      if (dup) {
        return res.json({
          duplicate: true,
          existing_id: dup.id,
          reporter_count: dup.reporter_count,
          message: 'This issue is already registered in this ward.',
        });
      }
    }

    const sess = intake.peekSession(String(req.body?.session_id || ''));
    const grievance = store.fileGrievance({
      reporter_phone: phone,
      ui_language: uiLang,
      category,
      ward,
      landmark,
      description_raw: description,
      description_clean: description,
      severity,
      sensitivity: sess ? sess.acc.sensitivity : 'normal',
      gps: req.body?.gps || null,
      add_support_to: addSupportTo,
    });
    return res.json(serializeSlip(grievance));
  });

  router.get('/grievances/:gid', (req, res) => {
    const ip = getClientIp(req);
    if (!rateLimiter.allow(`track:${ip}`, 30, ONE_MINUTE_MS)) {
      return res.status(429).json({ detail: 'Too many tracking requests. Please try again shortly.' });
    }
    if (String(req.params.gid || '').length > 64) {
      return res.status(400).json({ detail: 'Invalid tracking ID' });
    }
    const grievance = store.grievances.get(req.params.gid);
    if (!grievance) return res.status(404).json({ detail: 'Not found' });
    return res.json(serializeSlip(grievance, grievance.sensitivity !== 'sensitive'));
  });

  router.post('/grievances/:gid/reopen', (req, res) => {
    const ip = getClientIp(req);
    if (!rateLimiter.allow(`reopen:${ip}`, 10, ONE_MINUTE_MS)) {
      return res.status(429).json({ detail: 'Too many reopen requests. Please try again shortly.' });
    }
    const grievance = store.grievances.get(req.params.gid);
    if (!grievance) return res.status(404).json({ detail: 'Not found' });
    if (!CLOSED_STATES.has(grievance.status)) {
      return res.status(400).json({ detail: 'Only resolved grievances can be reopened' });
    }
    appendAudit(
      grievance,
      'reopen',
      grievance.reporter_phone.slice(-4),
      'citizen',
      grievance.status,
      'reopened',
      'Citizen not satisfied'
    );
    grievance.status = 'reopened';
    return res.json(serializeSlip(grievance, grievance.sensitivity !== 'sensitive'));
  });

  router.post('/grievances/:gid/feedback', (req, res) => {
    const grievance = store.grievances.get(req.params.gid);
    if (!grievance) return res.status(404).json({ detail: 'Not found' });
    const rating = Number(req.body?.rating ?? req.query?.rating);
    const comment = String(req.body?.comment ?? req.query?.comment ?? '').slice(0, 500);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(422).json({ detail: 'Rating must be an integer between 1 and 5' });
    }
    store.feedbackList.push({
      grievance_id: grievance.id,
      rating,
      comment,
      at: new Date().toISOString(),
    });
    return res.json({ ok: true });
  });

  return router;
}
