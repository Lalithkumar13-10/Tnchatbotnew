/**
 * Security primitives: OTP store, sliding-window rate limiter, RBAC guards,
 * constant-time secret checks, and browser defense-in-depth HTTP headers.
 */
import crypto from 'node:crypto';
import {
  DEFAULT_ADMIN_ROLE,
  MAX_OTP_RECORDS,
  OTP_MAX_ATTEMPTS,
  OTP_SESSION_TTL_MS,
  OTP_TTL_MS,
  VALID_ROLES,
  getRuntimeConfig,
} from './config.mjs';

export const CSP_HEADER =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "connect-src 'self'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "object-src 'none'";

/**
 * Constant-time string comparison to prevent timing side channels.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normalize and validate a mobile phone number (10 to 15 digits).
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/**
 * Extract normalized client IP address from an Express request for rate limiting.
 * @param {import('express').Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * TTL-bounded OTP challenge and Bearer session token store.
 */
export class OtpStore {
  constructor() {
    this.records = new Map();
  }

  /** @param {number} nowMs */
  prune(nowMs) {
    for (const [phone, rec] of this.records.entries()) {
      if (rec.expiresAt < nowMs) this.records.delete(phone);
    }
    while (this.records.size > MAX_OTP_RECORDS) {
      const oldest = this.records.keys().next().value;
      this.records.delete(oldest);
    }
  }

  /**
   * Issue a new OTP challenge for a validated phone number.
   * @param {string} phone
   * @param {string} code
   * @returns {string}
   */
  issue(phone, code) {
    const nowMs = Date.now();
    this.prune(nowMs);
    this.records.set(phone, {
      code,
      verified: false,
      expiresAt: nowMs + OTP_TTL_MS,
      attempts: 0,
      token: null,
    });
    return code;
  }

  /**
   * Verify an OTP code with attempt lockouts and issue a cryptographic Bearer token.
   * @param {string} phone
   * @param {string} code
   * @returns {{ ok: true, token: string } | { ok: false, status: number, detail: string }}
   */
  verify(phone, code) {
    const nowMs = Date.now();
    this.prune(nowMs);
    const rec = this.records.get(phone);
    if (!rec || rec.expiresAt < nowMs) {
      return { ok: false, status: 400, detail: 'OTP expired or not requested' };
    }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      return {
        ok: false,
        status: 429,
        detail: 'Too many failed OTP attempts. Request a new OTP.',
      };
    }
    if (!timingSafeEqualStr(rec.code, code)) {
      rec.attempts += 1;
      return { ok: false, status: 400, detail: 'Invalid code' };
    }

    const token = crypto.randomBytes(24).toString('base64url');
    rec.verified = true;
    rec.attempts = 0;
    rec.token = token;
    rec.expiresAt = nowMs + OTP_SESSION_TTL_MS;
    return { ok: true, token };
  }

  /**
   * Verify that the phone has an active session AND a valid Authorization: Bearer token.
   * @param {string} phone
   * @param {string | undefined} authorization
   * @returns {{ ok: true } | { ok: false, status: number, detail: string }}
   */
  requireVerifiedToken(phone, authorization) {
    const nowMs = Date.now();
    this.prune(nowMs);
    const rec = this.records.get(phone);
    if (!rec || !rec.verified || rec.expiresAt < nowMs) {
      return { ok: false, status: 401, detail: 'Phone not verified' };
    }
    if (!authorization) {
      return { ok: false, status: 401, detail: 'Authorization Bearer token required' };
    }
    const parts = String(authorization).trim().split(/\s+/);
    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== 'bearer' ||
      !rec.token ||
      !timingSafeEqualStr(rec.token, parts[1])
    ) {
      return { ok: false, status: 401, detail: 'Invalid session token' };
    }
    return { ok: true };
  }

  /** Clear all OTP records. */
  clear() {
    this.records.clear();
  }
}

/**
 * Sliding-window in-memory rate limiter keyed by bucket string.
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  /**
   * Check and record a request against a sliding window limit.
   * @param {string} key
   * @param {number} maxRequests
   * @param {number} windowMs
   * @returns {boolean} True when allowed, false when limit exceeded.
   */
  allow(key, maxRequests, windowMs) {
    const nowMs = Date.now();
    const cutoff = nowMs - windowMs;
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    while (list.length > 0 && list[0] < cutoff) {
      list.shift();
    }
    if (list.length >= maxRequests) return false;
    list.push(nowMs);
    return true;
  }

  /** Clear all rate-limit buckets. */
  clear() {
    this.buckets.clear();
  }
}

/**
 * Express middleware setting standard browser security headers.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function securityHeadersMiddleware(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', CSP_HEADER);
  next();
}

/**
 * Express middleware enforcing RBAC role validation (defaulting to lowest privilege
 * `ward_officer`) and optional X-Admin-Key protection.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAdminRole(req, res, next) {
  const cfg = getRuntimeConfig();
  if (cfg.adminApiKey) {
    const providedKey = req.header('X-Admin-Key') || '';
    if (!timingSafeEqualStr(cfg.adminApiKey, providedKey)) {
      return res.status(401).json({ detail: 'Valid X-Admin-Key header required' });
    }
  }
  const role = (req.header('X-Role') || DEFAULT_ADMIN_ROLE).trim().toLowerCase();
  if (!VALID_ROLES.has(role)) {
    return res.status(403).json({ detail: 'Unknown or unauthorized role' });
  }
  req.adminRole = role;
  return next();
}
