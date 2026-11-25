/**
 * Central configuration, pilot-city directory, and production startup guard
 * for the Nagar Kuraiteer Node.js preview runtime.
 */

export const PORT = Number(process.env.PORT || 3000);
export const HOST = '0.0.0.0';
export const QUESTION_BUDGET = Number(process.env.QUESTION_BUDGET || 3);
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 60 * 60 * 1000;
export const MAX_SESSIONS = 1000;
export const MAX_OTP_RECORDS = 5000;
export const GEMINI_TIMEOUT_MS = 10_000;

export const OPEN_STATES = new Set([
  'registered',
  'assigned',
  'in_progress',
  'reopened',
  'escalated',
]);
export const CLOSED_STATES = new Set(['resolved', 'closed']);
export const ALL_STATUSES = new Set([...OPEN_STATES, ...CLOSED_STATES]);

export const DEFAULT_ADMIN_ROLE = 'ward_officer';
export const VALID_ROLES = new Set([
  'ward_officer',
  'dept_head',
  'commissioner',
  'collector',
  'cm_cell',
  'auditor',
]);
export const SENSITIVE_VIEW_ROLES = new Set(['collector', 'cm_cell', 'auditor']);
export const MUTABLE_ROLES = new Set([
  'ward_officer',
  'dept_head',
  'commissioner',
  'collector',
  'cm_cell',
]);
export const ESCALATION_ROLES = new Set(['commissioner', 'collector', 'cm_cell']);
export const ESCALATION_LADDER = [
  'ward_officer',
  'dept_head',
  'commissioner',
  'collector',
  'cm_cell',
];

export const CATEGORIES = {
  streetlight: { ta: 'தெருவிளக்கு', en: 'Streetlight', dept: 'Street Lighting Wing', sla_days: 3 },
  garbage: { ta: 'குப்பை / கழிவு', en: 'Garbage / Solid Waste', dept: 'Solid Waste Management', sla_days: 2 },
  water_supply: { ta: 'குடிநீர்', en: 'Water Supply', dept: 'Water Supply Wing', sla_days: 2 },
  drainage: { ta: 'மழைநீர் வடிகால்', en: 'Storm Water Drain', dept: 'Storm Water Drain Wing', sla_days: 4 },
  sewage: { ta: 'கழிவுநீர் / சாக்கடை', en: 'Sewage', dept: 'Underground Sewerage Wing', sla_days: 2 },
  road: { ta: 'சாலை / பள்ளம்', en: 'Road / Pothole', dept: 'Roads Wing', sla_days: 7 },
  other: { ta: 'மற்றவை', en: 'Other', dept: 'Public Grievance Cell', sla_days: 5 },
};

export const WARDS = [
  'Gandhipuram (Ward 42)',
  'R.S. Puram (Ward 55)',
  'Peelamedu (Ward 71)',
  'Saibaba Colony (Ward 49)',
  'Singanallur (Ward 89)',
  'Ukkadam (Ward 20)',
  'Thudiyalur (Wards 1, 2)',
  'Saravanampatti (Wards 3, 4)',
  'Keeranatham (Ward 4)',
  'Chinnavedampatti (Ward 27)',
  'Ganapathy (Wards 28, 29)',
  'Sivanandha Colony (Ward 40)',
  'Saibaba Colony (Wards 42, 43)',
  'R.S. Puram (Wards 46, 47)',
  'Town Hall (Ward 80)',
  'Ukkadam (Ward 81)',
  'Selvapuram (Ward 82)',
  'Race Course (Ward 83)',
  'Ramanathapuram (Ward 67)',
  'Singanallur (Wards 63, 64)',
  'Peelamedu (Wards 56, 57, 58)',
  'Hope College (Ward 58)',
  'Civil Aerodrome (Ward 59)',
  'Avinashi Road (East Stretch - Wards 60, 61, 62)',
  'Ondipudur (Ward 69)',
  'Podanur (Wards 92, 93)',
  'Sundarapuram (Ward 95)',
  'Kuniyamuthur (Wards 96, 97)',
  'Madukkarai (Ward 100)',
  'Other / Not Listed',
];

export const SENSITIVE_KEYWORDS = [
  'bribe', 'corrupt', 'corruption', 'harass', 'molest', 'assault', 'threat',
  'safety', 'unsafe', 'women', 'girl', 'caste', 'official took', 'officer took',
  'engineer took', 'demanded money', 'money for', 'kickback',
  'லஞ்சம்', 'ஊழல்', 'மிரட்டல்', 'தாக்குதல்', 'பாதுகாப்பு', 'பெண்', 'சாதி', 'பணம் கேட்டார்',
];

export const CATEGORY_HINTS = {
  streetlight: ['street light', 'streetlight', 'தெருவிளக்கு', 'lamp', 'light', 'eriyala', 'எரியல', 'விளக்கு'],
  garbage: ['garbage', 'trash', 'waste', 'குப்பை', 'கழிவு', 'kuppai', 'rubbish', 'bin'],
  water_supply: ['water', 'தண்ணீ', 'தண்ணி', 'குடிநீர்', 'thanni', 'supply', 'no water', 'tap'],
  drainage: ['drain', 'storm water', 'வடிகால்', 'flood', 'water logging', 'மழைநீர்'],
  sewage: ['sewage', 'sewer', 'manhole', 'சாக்கடை', 'கழிவுநீர்', 'overflow', 'மேன்ஹோல்'],
  road: ['road', 'pothole', 'pit', 'சாலை', 'பள்ளம்', 'pallam', 'rasta', 'ரோடு'],
};

export const HIGH_SEVERITY_HINTS = [
  'manhole', 'மேன்ஹோல்', 'live wire', 'current', 'மின்சாரம்', 'dark', 'இருட்ட',
  'ratri', 'ராத்திரி', 'flood', 'overflow', 'danger', 'ஆபத்து', 'shock', 'spark', 'night',
];

export const REFUSAL_HINTS = [
  "don't know", 'dont know', 'no idea', "i don't", 'idk', 'teriyathu', 'தெரியாது',
];

export const WARD_AREAS = WARDS
  .filter((w) => !w.toLowerCase().includes('not listed'))
  .map((w) => [w.split(' (')[0].toLowerCase(), w]);

/**
 * Read dynamic runtime configuration from environment variables.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {{ appEnv: string, isProduction: boolean, cityName: string, cityCode: string, mockOtp: string, adminApiKey: string, geminiApiKey: string, llmMode: string, geminiModel: string }}
 */
export function getRuntimeConfig(env = process.env) {
  const appEnv = (env.APP_ENV || 'development').trim().toLowerCase();
  return {
    appEnv,
    isProduction: appEnv === 'production',
    cityName: env.CITY_NAME || 'Coimbatore',
    cityCode: env.CITY_CODE || 'CBE',
    mockOtp: env.MOCK_OTP || '123456',
    adminApiKey: (env.ADMIN_API_KEY || '').trim(),
    geminiApiKey: (env.GEMINI_API_KEY || '').trim(),
    llmMode: (env.LLM_MODE || 'auto').trim().toLowerCase(),
    geminiModel: (env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim(),
  };
}

/**
 * Return true when live Gemini API calls are enabled for intake.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean}
 */
export function isLlmLive(env = process.env) {
  const cfg = getRuntimeConfig(env);
  if (cfg.llmMode === 'mock') return false;
  if (cfg.llmMode === 'live') return Boolean(cfg.geminiApiKey);
  return Boolean(cfg.geminiApiKey);
}

/**
 * Validate mandatory security invariants before starting in production mode.
 * Throws an Error if APP_ENV=production lacks ADMIN_API_KEY or retains the demo OTP.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {void}
 */
export function validateProductionConfig(env = process.env) {
  const cfg = getRuntimeConfig(env);
  if (!cfg.isProduction) return;
  if (!cfg.adminApiKey) {
    throw new Error('Refusing to start in production: ADMIN_API_KEY must be configured.');
  }
  if (!cfg.mockOtp || cfg.mockOtp === '123456') {
    throw new Error('Refusing to start in production: MOCK_OTP must not use the demo value 123456.');
  }
}
