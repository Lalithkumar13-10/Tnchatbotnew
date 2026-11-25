/**
 * In-memory governance store, routing, deduplication, SLA escalation, and serializers.
 */
import crypto from 'node:crypto';
import {
  CATEGORIES,
  CLOSED_STATES,
  ESCALATION_LADDER,
  OPEN_STATES,
  SENSITIVE_KEYWORDS,
  SENSITIVE_VIEW_ROLES,
  getRuntimeConfig,
} from './config.mjs';
import { appendAudit } from './audit.mjs';

export const OFFICERS = [
  { id: 'OFF-WARD42', name: 'R. Anitha', role: 'ward_officer', department: 'Street Lighting Wing', ward: 'Gandhipuram (Ward 42)' },
  { id: 'OFF-WARD55', name: 'K. Murugan', role: 'ward_officer', department: 'Solid Waste Management', ward: 'R.S. Puram (Ward 55)' },
  { id: 'OFF-SWM', name: 'S. Devi', role: 'dept_head', department: 'Solid Waste Management', ward: null },
  { id: 'OFF-CMSR', name: 'P. Rajan', role: 'commissioner', department: null, ward: null },
  { id: 'OFF-COLL', name: 'Dr. Meena IAS', role: 'collector', department: null, ward: null },
  { id: 'OFF-CMCELL', name: 'CM Cell Desk', role: 'cm_cell', department: null, ward: null },
  { id: 'OFF-AUDIT', name: 'Vigilance Audit', role: 'auditor', department: null, ward: null },
];

/**
 * Classify whether a grievance text alleges corruption, abuse, or safety sensitivity.
 * @param {string} text
 * @param {string} [hint='normal']
 * @returns {'normal' | 'sensitive'}
 */
export function classifySensitivity(text, hint = 'normal') {
  if (hint === 'sensitive') return 'sensitive';
  const lower = String(text || '').toLowerCase();
  return SENSITIVE_KEYWORDS.some((k) => lower.includes(k)) ? 'sensitive' : 'normal';
}

/**
 * Route a grievance to the responsible department and officer tier.
 * @param {string} category
 * @param {string | null} ward
 * @param {'normal' | 'sensitive'} sensitivity
 * @returns {{ dept: string, officerId: string | null }}
 */
export function routeOfficer(category, ward, sensitivity) {
  const catInfo = CATEGORIES[category] || CATEGORIES.other;
  const dept = catInfo.dept;
  if (sensitivity === 'sensitive') {
    const collector = OFFICERS.find((o) => o.role === 'collector');
    return { dept, officerId: collector ? collector.id : null };
  }
  let officer = ward
    ? OFFICERS.find((o) => o.role === 'ward_officer' && o.ward === ward)
    : null;
  if (!officer) {
    officer = OFFICERS.find((o) => o.role === 'dept_head' && o.department === dept);
  }
  return { dept, officerId: officer ? officer.id : null };
}

/**
 * Return bilingual category metadata.
 * @param {string} cat
 * @returns {{ key: string, ta: string, en: string, dept: string }}
 */
export function categoryLabel(cat) {
  const info = CATEGORIES[cat] || CATEGORIES.other;
  return { key: cat, ta: info.ta, en: info.en, dept: info.dept };
}

/**
 * Serialize a citizen-facing grievance slip.
 * @param {Record<string, any>} g
 * @param {boolean} [withHistory=false]
 * @returns {Record<string, any>}
 */
export function serializeSlip(g, withHistory = false) {
  const out = {
    id: g.id,
    status: g.status,
    category: categoryLabel(g.category),
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
      type,
      from,
      to,
      note,
      actor,
      role,
      at,
    }));
  }
  return out;
}

/**
 * Serialize an officer queue row with computed SLA breach state.
 * @param {Record<string, any>} g
 * @param {number} [nowMs=Date.now()]
 * @returns {Record<string, any>}
 */
export function serializeRow(g, nowMs = Date.now()) {
  const overdue = Boolean(
    g.sla_due_at && Date.parse(g.sla_due_at) < nowMs && OPEN_STATES.has(g.status)
  );
  return {
    ...serializeSlip(g, false),
    overdue,
    escalation_level: g.escalation_level,
    officer_id: g.assigned_officer_id,
    description: g.description_clean,
  };
}

/**
 * Create an isolated in-memory grievance store pre-seeded with demo data.
 * @returns {{ grievances: Map<string, any>, feedbackList: Array<any>, findDuplicate: Function, fileGrievance: Function, computeOversight: Function, escalateOverdue: Function, seedDemoData: Function, reset: Function }}
 */
export function createStore() {
  const grievances = new Map();
  const feedbackList = [];

  function generateId() {
    const { cityCode } = getRuntimeConfig();
    const year = new Date().getUTCFullYear();
    for (let i = 0; i < 10; i += 1) {
      const num = 100000 + crypto.randomInt(900000);
      const gid = `TN-${cityCode}-${year}-${num}`;
      if (!grievances.has(gid)) return gid;
    }
    return `TN-${cityCode}-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  function findDuplicate(category, ward) {
    if (!ward || category === 'other' || ward.toLowerCase().includes('not listed')) {
      return null;
    }
    for (const g of grievances.values()) {
      if (g.category === category && g.ward === ward && OPEN_STATES.has(g.status)) {
        return g;
      }
    }
    return null;
  }

  function fileGrievance({
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
      appendAudit(
        parent,
        'note',
        reporter_phone.slice(-4),
        'citizen',
        null,
        null,
        'Additional citizen co-reported this issue'
      );
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

  function computeOversight(role) {
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
        hotspots.push({
          id: g.id,
          category: g.category,
          ward: g.ward,
          reporters: g.reporter_count,
        });
      }
    }

    return {
      total,
      open,
      resolved,
      breached,
      sensitive: canViewSensitive ? sensitive : 0,
      by_department: byDepartment,
      hotspots: hotspots.sort((a, b) => b.reporters - a.reporters).slice(0, 50),
    };
  }

  function escalateOverdue() {
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
        appendAudit(
          g,
          'status',
          'system',
          'system',
          fromRole,
          toRole,
          'SLA breached — auto-escalated'
        );
        escalated.push(g.id);
      }
    }
    return escalated;
  }

  function seedDemoData() {
    fileGrievance({
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

    const g2 = fileGrievance({
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

    fileGrievance({
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

  function reset() {
    grievances.clear();
    feedbackList.length = 0;
    seedDemoData();
  }

  seedDemoData();

  return {
    grievances,
    feedbackList,
    findDuplicate,
    fileGrievance,
    computeOversight,
    escalateOverdue,
    seedDemoData,
    reset,
  };
}
