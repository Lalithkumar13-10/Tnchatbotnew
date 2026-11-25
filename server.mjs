/**
 * Thin Express application factory & entry point for the Nagar Kuraiteer preview runtime.
 * Exports createApp() for zero-port supertest testing; starts listening only when run directly.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import {
  HOST,
  PORT,
  getRuntimeConfig,
  isLlmLive,
  validateProductionConfig,
} from './src/config.mjs';
import { createIntakeEngine } from './src/intake.mjs';
import { createAdminRouter } from './src/routes/admin.mjs';
import { createCitizenRouter } from './src/routes/citizen.mjs';
import { OtpStore, RateLimiter, securityHeadersMiddleware } from './src/security.mjs';
import { createStore } from './src/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, 'TN_Govt_assisting_chatbot-main', 'frontend');

/**
 * Create a fully wired Express app instance with isolated store, OTP, intake, and rate limiter.
 * Validates production security invariants before returning.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {import('express').Express & { locals: Record<string, any> }}
 */
export function createApp(env = process.env) {
  validateProductionConfig(env);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const store = createStore();
  const intake = createIntakeEngine();
  const otpStore = new OtpStore();
  const rateLimiter = new RateLimiter();

  app.locals.store = store;
  app.locals.intake = intake;
  app.locals.otpStore = otpStore;
  app.locals.rateLimiter = rateLimiter;

  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use(securityHeadersMiddleware);

  app.get('/health', (_req, res) => {
    const cfg = getRuntimeConfig(env);
    return res.json({
      ok: true,
      city: cfg.cityName,
      llm_live: isLlmLive(env),
    });
  });

  app.use('/api/v1', createCitizenRouter({ store, intake, otpStore, rateLimiter }));
  app.use('/api/v1/admin', createAdminRouter({ store }));

  app.use(
    '/app',
    express.static(FRONTEND_DIR, {
      maxAge: '1h',
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  app.get('/', (_req, res) => {
    res.redirect('/app/citizen.html');
  });

  return app;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`Nagar Kuraiteer preview running at http://${HOST}:${PORT}/app/citizen.html`);
  });
}
