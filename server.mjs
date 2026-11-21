/**
 * Node.js preview server for Nagar Kuraiteer (port 3000).
 * Serves the WCAG 2.1 AA frontend directly from TN_Govt_assisting_chatbot-main/frontend
 * and mirrors the full FastAPI grievance intake, governance, RBAC, and audit-chain API.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, 'TN_Govt_assisting_chatbot-main', 'frontend');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const APP_ENV = (process.env.APP_ENV || 'development').trim().toLowerCase();
const CITY_NAME = process.env.CITY_NAME || 'Coimbatore';
const CITY_CODE = process.env.CITY_CODE || 'CBE';
const MOCK_OTP = process.env.MOCK_OTP || '123456';
const QUESTION_BUDGET = Number(process.env.QUESTION_BUDGET || 3);
const ADMIN_API_KEY = (process.env.ADMIN_API_KEY || '').trim();
const OTP_MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 1000;

const OPEN_STATES = new Set(['registered', 'assigned', 'in_progress', 'reopened', 'escalated']);
const CLOSED_STATES = new Set(['resolved', 'closed']);
const ALL_STATUSES = new Set([...OPEN_STATES, ...CLOSED_STATES]);
const VALID_ROLES = new Set(['ward_officer', 'dept_head', 'commissioner', 'collector', 'cm_cell', 'auditor']);
const SENSITIVE_VIEW_ROLES = new Set(['collector', 'cm_cell', 'auditor']);
const MUTABLE_ROLES = new Set(['ward_officer', 'dept_head', 'commissioner', 'collector', 'cm_cell']);
const ESCALATION_ROLES = new Set(['commissioner', 'collector', 'cm_cell']);
const ESCALATION_LADDER = ['ward_officer', 'dept_head', 'commissioner', 'collector', 'cm_cell'];

const CATEGORIES = {
  streetlight: { ta: 'தெருவிளக்கு', en: 'Streetlight', dept: 'Street Lighting Wing', sla_days: 3 },
  garbage: { ta: 'குப்பை / கழிவு', en: 'Garbage / Solid Waste', dept: 'Solid Waste Management', sla_days: 2 },
  water_supply: { ta: 'குடிநீர்', en: 'Water Supply', dept: 'Water Supply Wing', sla_days: 2 },
  drainage: { ta: 'மழைநீர் வடிகால்', en: 'Storm Water Drain', dept: 'Storm Water Drain Wing', sla_days: 4 },
  sewage: { ta: 'கழிவுநீர் / சாக்கடை', en: 'Sewage', dept: 'Underground Sewerage Wing', sla_days: 2 },
  road: { ta: 'சாலை / பள்ளம்', en: 'Road / Pothole', dept: 'Roads Wing', sla_days: 7 },
  other: { ta: 'மற்றவை', en: 'Other', dept: 'Public Grievance Cell', sla_days: 5 },
};

const WARDS = [
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

const SENSITIVE_KEYWORDS = [
  'bribe', 'corrupt', 'corruption', 'harass', 'molest', 'assault', 'threat',
  'safety', 'unsafe', 'women', 'girl', 'caste', 'official took', 'officer took',
  'engineer took', 'demanded money', 'money for', 'kickback',
  'லஞ்சம்', 'ஊழல்', 'மிரட்டல்', 'தாக்குதல்', 'பாதுகாப்பு', 'பெண்', 'சாதி', 'பணம் கேட்டார்',
];

const CATEGORY_HINTS = {
  streetlight: ['street light', 'streetlight', 'தெருவிளக்கு', 'lamp', 'light', 'eriyala', 'எரியல', 'விளக்கு'],
  garbage: ['garbage', 'trash', 'waste', 'குப்பை', 'கழிவு', 'kuppai', 'rubbish', 'bin'],
  water_supply: ['water', 'தண்ணீ', 'தண்ணி', 'குடிநீர்', 'thanni', 'supply', 'no water', 'tap'],
  drainage: ['drain', 'storm water', 'வடிகால்', 'flood', 'water logging', 'மழைநீர்'],
  sewage: ['sewage', 'sewer', 'manhole', 'சாக்கடை', 'கழிவுநீர்', 'overflow', 'மேன்ஹோல்'],
  road: ['road', 'pothole', 'pit', 'சாலை', 'பள்ளம்', 'pallam', 'rasta', 'ரோடு'],
};

const ALL_CATEGORY_HINTS = Object.values(CATEGORY_HINTS).flat();
const HIGH_HINTS = [
  'manhole', 'மேன்ஹோல்', 'live wire', 'current', 'மின்சாரம்', 'dark', 'இருட்ட',
  'ratri', 'ராத்திரி', 'flood', 'overflow', 'danger', 'ஆபத்து', 'shock', 'spark', 'night',
];
const REFUSAL_HINTS = ["don't know", 'dont know', 'no idea', "i don't", 'idk', 'teriyathu', 'தெரியாது'];
const WARD_AREAS = WARDS.filter((w) => !w.toLowerCase().includes('not listed')).map((w) => [
  w.split(' (')[0].toLowerCase(),
  w,
]);

// ---------------- In-memory governance store ----------------
const officers = [
  { id: 'OFF-WARD42', name: 'R. Anitha', role: 'ward_officer', department: 'Street Lighting Wing', ward: 'Gandhipuram (Ward 42)' },
  { id: 'OFF-WARD55', name: 'K. Murugan', role: 'ward_officer', department: 'Solid Waste Management', ward: 'R.S. Puram (Ward 55)' },
  { id: 'OFF-SWM', name: 'S. Devi', role: 'dept_head', department: 'Solid Waste Management', ward: null },
  { id: 'OFF-CMSR', name: 'P. Rajan', role: 'commissioner', department: null, ward: null },
  { id: 'OFF-COLL', name: 'Dr. Meena IAS', role: 'collector', department: null, ward: null },
  { id: 'OFF-CMCELL', name: 'CM Cell Desk', role: 'cm_cell', department: null, ward: null },
  { id: 'OFF-AUDIT', name: 'Vigilance Audit', role: 'auditor', department: null, ward: null },
];

const grievances = new Map();
const feedbackList = [];
const otpStore = new Map();
const intakeSessions = new Map();

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function hashEvent(gid, evType, fromVal, toVal, note, actorId, prevHash, atIso) {
  const payload = `${gid}|${evType}|${fromVal ?? 'None'}|${toVal ?? 'None'}|${note ?? 'None'}|${actorId}|${prevHash ?? 'None'}|${atIso}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function appendAudit(g, eventType, actorId, actorRole, fromVal = null, toVal = null, note = null) {
  const prevHash = g.events.length > 0 ? g.events[g.events.length - 1].hash : null;
  const atIso = new Date().toISOString();
  const hash = hashEvent(g.id, eventType, fromVal, toVal, note, actorId, prevHash, atIso);
  g.events.push({
    type: eventType,
    from: fromVal,
    to: toVal,
    note,
    actor: actorId,
    role: actorRole,
    at: atIso,
    prev_hash: prevHash,
    hash,
  });
}

function verifyChain(g) {
  let prev = null;
  for (const ev of g.events) {
    if (ev.prev_hash !== prev) return false;
    const expected = hashEvent(g.id, ev.type, ev.from, ev.to, ev.note, ev.actor, prev, ev.at);
    if (expected !== ev.hash) return false;
    prev = ev.hash;
  }
  return true;
}

function classifySensitivity(text, hint = 'normal') {
  if (hint === 'sensitive') return 'sensitive';
  const tl = String(text || '').toLowerCase();
  return SENSITIVE_KEYWORDS.some((k) => tl.includes(k)) ? 'sensitive' : 'normal';
}

function routeOfficer(category, ward, sensitivity) {
  const catInfo = CATEGORIES[category] || CATEGORIES.other;
  const dept = catInfo.dept;
  if (sensitivity === 'sensitive') {
    const collector = officers.find((o) => o.role === 'collector');
    return { dept, officerId: collector ? collector.id : null };
  }
  let officer = ward ? officers.find((o) => o.role === 'ward_officer' && o.ward === ward) : null;
  if (!officer) {
    officer = officers.find((o) => o.role === 'dept_head' && o.department === dept);
  }
  return { dept, officerId: officer ? officer.id : null };
}

function generateId() {
  const year = new Date().getUTCFullYear();
  for (let i = 0; i < 10; i += 1) {
    const num = 100000 + crypto.randomInt(900000);
    const gid = `TN-${CITY_CODE}-${year}-${num}`;
    if (!grievances.has(gid)) return gid;
  }
  return `TN-${CITY_CODE}-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function findDuplicate(category, ward) {
  if (!ward || category === 'other' || ward.toLowerCase().includes('not listed')) return null;
  for (const g of grievances.values()) {
    if (g.category === category && g.ward === ward && OPEN_STATES.has(g.status)) {
      return g;
    }
  }
  return null;
}

function fileGrievanceRecord({
  reporter_phone,
  ui_language = 'en',
  category,
  ward = null,
  landmark = null,
  description_raw,
  description_clean,
  severity = 'medium',
  sensitivity = 'normal',
  gps = null,
  add_support_to = null,
}) {
  if (add_support_to && grievances.has(add_support_to)) {
    const parent = grievances.get(add_support_to);
    parent.reporter_count += 1;
    appendAudit(parent, 'note', reporter_phone.slice(-4), 'citizen', null, null, 'Additional citizen co-reported this issue');
    return parent;
  }

  const resolvedSens = classifySensitivity(description_raw, sensitivity);
  const { dept, officerId } = routeOfficer(category, ward, resolvedSens);
  const createdAt = new Date();
  const slaDays = (CATEGORIES[category] || CATEGORIES.other).sla_days;
  const slaDueAt = new Date(createdAt.getTime() + slaDays * 24 * 60 * 60 * 1000);

  const g = {
    id: generateId(),
    reporter_phone,
    ui_language,
    category,
    ward,
    landmark,
    description_raw,
    description_clean: description_clean || description_raw,
    severity: severity || 'medium',
    sensitivity: resolvedSens,
    assigned_dept: dept,
    assigned_officer_id: officerId,
    sla_due_at: slaDueAt.toISOString(),
    created_at: createdAt.toISOString(),
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
    status: officerId ? 'assigned' : 'registered',
    escalation_level: 0,
    reporter_count: 1,
    events: [],
  };
  grievances.set(g.id, g);
  appendAudit(
    g,
    'created',
    reporter_phone.slice(-4),
    'citizen',
    null,
    'registered',
    `Routed to ${dept}${resolvedSens === 'sensitive' ? ' (sensitive → collector)' : ''}`
  );
  if (officerId) {
    appendAudit(g, 'assign', 'system', 'system', null, officerId, 'Auto-assigned on intake');
  }
  return g;
}

function catLabel(cat) {
  const info = CATEGORIES[cat] || CATEGORIES.other;
  return { key: cat, ta: info.ta, en: info.en, dept: info.dept };
}

function serializeSlip(g, withHistory = false) {
  const out = {
    id: g.id,
    status: g.status,
    category: catLabel(g.category),
    dept: g.assigned_dept,
    ward: g.ward,
    landmark: g.landmark,
    severity: g.severity,
    sensitivity: g.sensitivity,
    sla_due_at: g.sla_due_at,
    reporter_count: g.reporter_count,
    created_at: g.created_at,
    ui_language: g.ui_language,
  };
  if (withHistory) {
    out.history = g.events.map(({ type, from, to, note, actor, role, at }) => ({
      type, from, to, note, actor, role, at,
    }));
  }
  return out;
}

function serializeRow(g, nowMs = Date.now()) {
  const overdue = Boolean(g.sla_due_at && Date.parse(g.sla_due_at) < nowMs && OPEN_STATES.has(g.status));
  return {
    ...serializeSlip(g, false),
    overdue,
    escalation_level: g.escalation_level,
    officer_id: g.assigned_officer_id,
    description: g.description_clean,
  };
}

// Seed the exact 3 demo records matching backend/app/seed.py
function seedDemoData() {
  fileGrievanceRecord({
    reporter_phone: '9000000001',
    ui_language: 'ta',
    category: 'streetlight',
    ward: 'Gandhipuram (Ward 42)',
    landmark: 'near bus stop',
    description_raw: 'தெருவிளக்கு 3 நாட்களாக எரியவில்லை',
    description_clean: 'Streetlight not working for 3 days',
    severity: 'high',
    sensitivity: 'normal',
  });

  const g2 = fileGrievanceRecord({
    reporter_phone: '9000000002',
    ui_language: 'en',
    category: 'garbage',
    ward: 'R.S. Puram (Ward 55)',
    landmark: '4th cross',
    description_raw: 'Garbage not collected for a week',
    description_clean: 'Garbage uncollected for a week',
    severity: 'medium',
    sensitivity: 'normal',
  });
  const nowMs = Date.now();
  g2.created_at = new Date(nowMs - 6 * 86400000).toISOString();
  g2.sla_due_at = new Date(nowMs - 4 * 86400000).toISOString();

  fileGrievanceRecord({
    reporter_phone: '9000000003',
    ui_language: 'en',
    category: 'water_supply',
    ward: 'Ukkadam (Ward 20)',
    landmark: null,
    description_raw: 'The water officer demanded money to fix our supply line',
    description_clean: 'Alleged bribe demand by water officer',
    severity: 'high',
    sensitivity: 'sensitive',
  });
}

seedDemoData();

// ---------------- Intake engine (bilingual mock parity) ----------------
function getIntakeSession(sid, uiLanguage) {
  const nowMs = Date.now();
  for (const [key, sess] of intakeSessions.entries()) {
    if (nowMs - sess.lastActive > SESSION_TTL_MS) intakeSessions.delete(key);
  }
  while (intakeSessions.size >= MAX_SESSIONS) {
    const oldest = intakeSessions.keys().next().value;
    intakeSessions.delete(oldest);
  }
  let sess = intakeSessions.get(sid);
  if (!sess) {
    sess = {
      id: sid,
      ui_language: uiLanguage || 'en',
      clarify_count: 0,
      lastActive: nowMs,
      acc: {
        category: null,
        sub_category: null,
        description_clean: null,
        ward: null,
        landmark: null,
        address_text: null,
        severity: null,
        language_detected: 'en',
        sensitivity: 'normal',
      },
    };
    intakeSessions.set(sid, sess);
  }
  sess.ui_language = uiLanguage || sess.ui_language;
  sess.lastActive = nowMs;
  return sess;
}

function stepIntake(sess, text) {
  const latest = String(text || '').trim();
  const latestLower = latest.toLowerCase();
  const combinedLower = `${JSON.stringify(sess.acc)} ${latest}`.toLowerCase();

  let detectedCat = null;
  for (const [cat, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some((h) => combinedLower.includes(h))) {
      detectedCat = cat;
      break;
    }
  }

  let detectedWard = null;
  for (const [area, fullWard] of WARD_AREAS) {
    if (combinedLower.includes(area)) {
      detectedWard = fullWard;
      break;
    }
  }

  const hasTamil = /[\u0B80-\u0BFF]/.test(latest);
  const hasLatin = /[a-zA-Z]/.test(latest);
  const langDetected = hasTamil && hasLatin ? 'mixed' : hasTamil ? 'ta' : 'en';
  const severity = HIGH_HINTS.some((h) => combinedLower.includes(h)) ? 'high' : 'medium';

  if (detectedCat) sess.acc.category = detectedCat;
  if (detectedWard) sess.acc.ward = detectedWard;
  if (!sess.acc.description_clean && latest.length > 8) {
    sess.acc.description_clean = latest;
  } else if (!sess.acc.ward && !sess.acc.landmark && !sess.acc.address_text && sess.acc.description_clean) {
    const isRefusal = REFUSAL_HINTS.some((w) => latestLower.includes(w));
    const isCatHint = ALL_CATEGORY_HINTS.some((h) => latestLower.includes(h));
    if (!isRefusal && !isCatHint) {
      sess.acc.address_text = latest;
    }
  }

  sess.acc.severity = sess.acc.severity === 'high' ? 'high' : severity;
  sess.acc.language_detected = langDetected;
  if (classifySensitivity(combinedLower, sess.acc.sensitivity) === 'sensitive') {
    sess.acc.sensitivity = 'sensitive';
  }

  const haveCat = Boolean(sess.acc.category);
  const haveLoc = Boolean(sess.acc.ward || sess.acc.landmark || sess.acc.address_text);
  const haveDesc = Boolean(sess.acc.description_clean);
  const ready = haveCat && haveLoc && haveDesc;
  const budgetHit = sess.clarify_count >= QUESTION_BUDGET;

  if (ready || budgetHit) {
    return {
      mode: 'confirm',
      assistant_message:
        sess.ui_language === 'ta'
          ? 'நன்றி. உங்கள் புகாரின் விவரங்கள் கீழே தயார் செய்யப்பட்டுள்ளன. தயவுசெய்து அவற்றைச் சரிபார்த்து சமர்ப்பிக்கவும்.'
          : 'Thank you. The details of your grievance have been drafted below. Please review and submit.',
      draft: {
        category: sess.acc.category,
        sub_category: sess.acc.sub_category,
        description: sess.acc.description_clean,
        ward: sess.acc.ward,
        landmark: sess.acc.landmark || sess.acc.address_text,
        severity: sess.acc.severity || 'medium',
        sensitivity: sess.acc.sensitivity,
        language_detected: sess.acc.language_detected,
      },
      forced: budgetHit && !ready,
      note: '',
    };
  }

  sess.clarify_count += 1;
  const replyTa = sess.ui_language === 'ta' || langDetected === 'ta';
  let assistantMessage;
  if (!haveLoc) {
    assistantMessage = replyTa ? 'இது எந்தப் பகுதி அல்லது வார்டில்?' : 'Which area or ward is this in?';
  } else if (!haveCat) {
    assistantMessage = replyTa ? 'என்ன பிரச்சினை என்று சொல்ல முடியுமா?' : 'What is the problem exactly?';
  } else {
    assistantMessage = replyTa ? 'சிறிது விவரம் சொல்லுங்கள்.' : 'Could you describe it briefly?';
  }

  return {
    mode: 'ask',
    assistant_message: assistantMessage,
    clarify_count: sess.clarify_count,
    budget: QUESTION_BUDGET,
  };
}

// ---------------- Express App & Security Middleware ----------------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const CSP_HEADER =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "connect-src 'self'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "object-src 'none'";

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', CSP_HEADER);
  next();
});

function requireAdminRole(req, res, next) {
  if (ADMIN_API_KEY) {
    const providedKey = req.header('X-Admin-Key') || '';
    if (!timingSafeEqualStr(ADMIN_API_KEY, providedKey)) {
      return res.status(401).json({ detail: 'Valid X-Admin-Key header required' });
    }
  }
  const role = (req.header('X-Role') || 'cm_cell').trim().toLowerCase();
  if (!VALID_ROLES.has(role)) {
    return res.status(403).json({ detail: 'Unknown or unauthorized role' });
  }
  req.adminRole = role;
  return next();
}

// ---------------- Routes ----------------
app.get('/health', (_req, res) => {
  res.json({ ok: true, city: CITY_NAME, llm_live: false });
});

app.get('/api/v1/meta', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    city: CITY_NAME,
    city_code: CITY_CODE,
    categories: Object.entries(CATEGORIES).map(([key, info]) => ({
      key,
      ta: info.ta,
      en: info.en,
      dept: info.dept,
    })),
    wards: WARDS,
  });
});

app.post('/api/v1/auth/request-otp', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(422).json({ detail: 'Valid 10-digit mobile number is required' });
  otpStore.set(phone, {
    code: MOCK_OTP,
    verified: false,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    token: null,
  });
  const payload = { sent: true };
  if (APP_ENV !== 'production') payload.demo_code = MOCK_OTP;
  return res.json(payload);
});

app.post('/api/v1/auth/verify-otp', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!phone || !code) return res.status(422).json({ detail: 'Phone and OTP code are required' });

  const rec = otpStore.get(phone);
  if (!rec || rec.expiresAt < Date.now()) {
    return res.status(400).json({ detail: 'OTP expired or not requested' });
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ detail: 'Too many failed OTP attempts. Request a new OTP.' });
  }
  if (!timingSafeEqualStr(rec.code, code)) {
    rec.attempts += 1;
    return res.status(400).json({ detail: 'Invalid code' });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  rec.verified = true;
  rec.attempts = 0;
  rec.token = token;
  rec.expiresAt = Date.now() + OTP_SESSION_TTL_MS;
  return res.json({ verified: true, token });
});

app.post('/api/v1/intake/message', (req, res) => {
  const sid = String(req.body?.session_id || '').trim();
  const uiLang = req.body?.ui_language === 'ta' ? 'ta' : 'en';
  const text = String(req.body?.text || '').trim();
  if (!sid || !text || text.length > 2000) {
    return res.status(422).json({ detail: 'Valid session_id and message text are required' });
  }
  const sess = getIntakeSession(sid, uiLang);
  return res.json(stepIntake(sess, text));
});

app.post('/api/v1/grievances', (req, res) => {
  const phone = normalizePhone(req.body?.reporter_phone);
  if (!phone) return res.status(422).json({ detail: 'Valid reporter_phone is required' });

  const rec = otpStore.get(phone);
  if (!rec || !rec.verified || rec.expiresAt < Date.now()) {
    return res.status(401).json({ detail: 'Phone not verified' });
  }
  const auth = req.header('Authorization');
  if (auth) {
    const [scheme, supplied] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !rec.token || !timingSafeEqualStr(rec.token, supplied || '')) {
      return res.status(401).json({ detail: 'Invalid session token' });
    }
  }

  const category = String(req.body?.category || '');
  const description = String(req.body?.description || '').trim();
  const ward = req.body?.ward ? String(req.body.ward).slice(0, 120) : null;
  const landmark = req.body?.landmark ? String(req.body.landmark).slice(0, 200) : null;
  const severity = ['low', 'medium', 'high'].includes(req.body?.severity) ? req.body.severity : 'medium';
  const uiLang = req.body?.ui_language === 'ta' ? 'ta' : 'en';
  const addSupportTo = req.body?.add_support_to ? String(req.body.add_support_to) : null;
  const bypassDedup = Boolean(req.body?.bypass_dedup);

  if (!CATEGORIES[category] || !description || (!ward && !landmark)) {
    return res.status(422).json({ detail: 'Category, description, and location are required' });
  }

  if (!addSupportTo && !bypassDedup) {
    const dup = findDuplicate(category, ward);
    if (dup) {
      return res.json({
        duplicate: true,
        existing_id: dup.id,
        reporter_count: dup.reporter_count,
        message: 'This issue is already registered in this ward.',
      });
    }
  }

  const sess = intakeSessions.get(String(req.body?.session_id || ''));
  const g = fileGrievanceRecord({
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
  return res.json(serializeSlip(g));
});

app.get('/api/v1/grievances/:gid', (req, res) => {
  const g = grievances.get(req.params.gid);
  if (!g) return res.status(404).json({ detail: 'Not found' });
  return res.json(serializeSlip(g, g.sensitivity !== 'sensitive'));
});

app.post('/api/v1/grievances/:gid/reopen', (req, res) => {
  const g = grievances.get(req.params.gid);
  if (!g) return res.status(404).json({ detail: 'Not found' });
  if (!CLOSED_STATES.has(g.status)) {
    return res.status(400).json({ detail: 'Only resolved grievances can be reopened' });
  }
  appendAudit(g, 'reopen', g.reporter_phone.slice(-4), 'citizen', g.status, 'reopened', 'Citizen not satisfied');
  g.status = 'reopened';
  return res.json(serializeSlip(g, g.sensitivity !== 'sensitive'));
});

app.post('/api/v1/grievances/:gid/feedback', (req, res) => {
  const g = grievances.get(req.params.gid);
  if (!g) return res.status(404).json({ detail: 'Not found' });
  const rating = Number(req.body?.rating ?? req.query?.rating);
  const comment = String(req.body?.comment ?? req.query?.comment ?? '').slice(0, 500);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(422).json({ detail: 'Rating must be an integer between 1 and 5' });
  }
  feedbackList.push({ grievance_id: g.id, rating, comment, at: new Date().toISOString() });
  return res.json({ ok: true });
});

// ---------------- Admin routes (RBAC enforced) ----------------
app.get('/api/v1/admin/grievances', requireAdminRole, (req, res) => {
  const role = req.adminRole;
  const status = req.query.status ? String(req.query.status) : null;
  const ward = req.query.ward ? String(req.query.ward) : null;
  const category = req.query.category ? String(req.query.category) : null;

  if (status && !ALL_STATUSES.has(status)) {
    return res.status(400).json({ detail: 'Invalid status filter' });
  }

  const nowMs = Date.now();
  const rows = Array.from(grievances.values())
    .filter((g) => {
      if (g.sensitivity === 'sensitive' && !SENSITIVE_VIEW_ROLES.has(role)) return false;
      if (status && g.status !== status) return false;
      if (ward && g.ward !== ward) return false;
      if (category && g.category !== category) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((g) => serializeRow(g, nowMs));

  return res.json({ role, grievances: rows });
});

app.get('/api/v1/admin/grievances/:gid', requireAdminRole, (req, res) => {
  const role = req.adminRole;
  const g = grievances.get(req.params.gid);
  if (!g) return res.status(404).json({ detail: 'Not found' });
  if (g.sensitivity === 'sensitive' && !SENSITIVE_VIEW_ROLES.has(role)) {
    return res.status(403).json({ detail: 'Restricted — sensitive grievance' });
  }
  if (g.sensitivity === 'sensitive') {
    appendAudit(g, 'sensitive_access', role, role, null, null, 'Sensitive record viewed');
  }
  return res.json({
    ...serializeRow(g),
    description_raw: g.description_raw,
    history: g.events.map(({ type, from, to, note, actor, role: evRole, at }) => ({
      type, from, to, note, actor, role: evRole, at,
    })),
    chain_valid: verifyChain(g),
  });
});

app.patch('/api/v1/admin/grievances/:gid', requireAdminRole, (req, res) => {
  const role = req.adminRole;
  if (!MUTABLE_ROLES.has(role)) {
    return res.status(403).json({ detail: 'Auditor role is read-only' });
  }
  const g = grievances.get(req.params.gid);
  if (!g) return res.status(404).json({ detail: 'Not found' });
  if (g.sensitivity === 'sensitive' && !SENSITIVE_VIEW_ROLES.has(role)) {
    return res.status(403).json({ detail: 'Restricted — sensitive grievance' });
  }

  const newStatus = req.body?.status ?? req.query?.status ?? null;
  const newOfficer = req.body?.officer_id ?? req.query?.officer_id ?? null;
  const note = req.body?.note ?? req.query?.note ?? null;
  const actor = String(req.body?.actor ?? req.query?.actor ?? 'OFF-DESK').slice(0, 64);

  if (newStatus && !ALL_STATUSES.has(String(newStatus))) {
    return res.status(422).json({ detail: 'Invalid status value' });
  }
  if (!newStatus && !newOfficer && !note) {
    return res.status(400).json({ detail: 'No update fields provided' });
  }

  if (newOfficer) {
    appendAudit(g, 'assign', actor, role, g.assigned_officer_id, String(newOfficer), note ? String(note) : null);
    g.assigned_officer_id = String(newOfficer);
  }
  if (newStatus) {
    appendAudit(g, 'status', actor, role, g.status, String(newStatus), note ? String(note) : null);
    g.status = String(newStatus);
  }
  if (note && !newStatus && !newOfficer) {
    appendAudit(g, 'note', actor, role, null, null, String(note));
  }
  return res.json(serializeRow(g));
});

app.get('/api/v1/admin/oversight', requireAdminRole, (req, res) => {
  const role = req.adminRole;
  const canViewSensitive = SENSITIVE_VIEW_ROLES.has(role);
  const nowMs = Date.now();

  let total = 0;
  let open = 0;
  let resolved = 0;
  let breached = 0;
  let sensitive = 0;
  const byDepartment = {};
  const hotspots = [];

  for (const g of grievances.values()) {
    if (!canViewSensitive && g.sensitivity === 'sensitive') continue;
    total += 1;
    const isOpen = OPEN_STATES.has(g.status);
    const isClosed = CLOSED_STATES.has(g.status);
    const isBreached = isOpen && g.sla_due_at && Date.parse(g.sla_due_at) < nowMs;
    if (isOpen) open += 1;
    if (isClosed) resolved += 1;
    if (isBreached) breached += 1;
    if (g.sensitivity === 'sensitive') sensitive += 1;

    if (!byDepartment[g.assigned_dept]) {
      byDepartment[g.assigned_dept] = { total: 0, open: 0, breached: 0 };
    }
    byDepartment[g.assigned_dept].total += 1;
    if (isOpen) byDepartment[g.assigned_dept].open += 1;
    if (isBreached) byDepartment[g.assigned_dept].breached += 1;

    if (g.reporter_count > 1) {
      hotspots.push({ id: g.id, category: g.category, ward: g.ward, reporters: g.reporter_count });
    }
  }

  return res.json({
    total,
    open,
    resolved,
    breached,
    sensitive: canViewSensitive ? sensitive : 0,
    by_department: byDepartment,
    hotspots: hotspots.sort((a, b) => b.reporters - a.reporters).slice(0, 50),
  });
});

app.post('/api/v1/admin/run-escalation', requireAdminRole, (req, res) => {
  if (!ESCALATION_ROLES.has(req.adminRole)) {
    return res.status(403).json({ detail: 'Only commissioner, collector, or CM Cell can run SLA escalation' });
  }
  const nowMs = Date.now();
  const maxLevel = ESCALATION_LADDER.length - 1;
  const escalated = [];

  for (const g of grievances.values()) {
    if (
      OPEN_STATES.has(g.status) &&
      g.sla_due_at &&
      Date.parse(g.sla_due_at) < nowMs &&
      g.escalation_level < maxLevel
    ) {
      const fromRole = ESCALATION_LADDER[g.escalation_level];
      g.escalation_level += 1;
      g.status = 'escalated';
      const toRole = ESCALATION_LADDER[g.escalation_level];
      appendAudit(g, 'status', 'system', 'system', fromRole, toRole, 'SLA breached — auto-escalated');
      escalated.push(g.id);
    }
  }
  return res.json({ escalated });
});

// ---------------- Static frontends ----------------
app.use('/app', express.static(FRONTEND_DIR, { maxAge: '1h' }));

app.get('/', (_req, res) => {
  res.redirect('/app/citizen.html');
});

app.listen(PORT, HOST, () => {
  console.log(`Nagar Kuraiteer preview running at http://${HOST}:${PORT}/app/citizen.html`);
});
