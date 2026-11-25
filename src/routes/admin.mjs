/**
 * Officer & CM-Cell administrative Express routes with least-privilege RBAC,
 * role-namespaced audit actors, and tamper-evident chain verification.
 */
import express from 'express';
import {
  ALL_STATUSES,
  ESCALATION_ROLES,
  MUTABLE_ROLES,
  SENSITIVE_VIEW_ROLES,
} from '../config.mjs';
import { appendAudit, verifyChain } from '../audit.mjs';
import { requireAdminRole } from '../security.mjs';
import { serializeRow } from '../store.mjs';

/**
 * Create the administrative API router mounted at /api/v1/admin.
 * @param {{ store: ReturnType<import('../store.mjs').createStore> }} deps
 * @returns {import('express').Router}
 */
export function createAdminRouter({ store }) {
  const router = express.Router();
  router.use(requireAdminRole);

  router.get('/grievances', (req, res) => {
    const role = req.adminRole;
    const status = req.query.status ? String(req.query.status) : null;
    const ward = req.query.ward ? String(req.query.ward) : null;
    const category = req.query.category ? String(req.query.category) : null;

    if (status && !ALL_STATUSES.has(status)) {
      return res.status(400).json({ detail: 'Invalid status filter' });
    }

    const nowMs = Date.now();
    const rows = Array.from(store.grievances.values())
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

  router.get('/grievances/:gid', (req, res) => {
    const role = req.adminRole;
    const grievance = store.grievances.get(req.params.gid);
    if (!grievance) return res.status(404).json({ detail: 'Not found' });
    if (grievance.sensitivity === 'sensitive' && !SENSITIVE_VIEW_ROLES.has(role)) {
      return res.status(403).json({ detail: 'Restricted — sensitive grievance' });
    }
    if (grievance.sensitivity === 'sensitive') {
      appendAudit(grievance, 'sensitive_access', role, role, null, null, 'Sensitive record viewed');
    }
    return res.json({
      ...serializeRow(grievance),
      description_raw: grievance.description_raw,
      history: grievance.events.map(({ type, from, to, note, actor, role: evRole, at }) => ({
        type,
        from,
        to,
        note,
        actor,
        role: evRole,
        at,
      })),
      chain_valid: verifyChain(grievance),
    });
  });

  router.patch('/grievances/:gid', (req, res) => {
    const role = req.adminRole;
    if (!MUTABLE_ROLES.has(role)) {
      return res.status(403).json({ detail: 'Auditor role is read-only' });
    }
    const grievance = store.grievances.get(req.params.gid);
    if (!grievance) return res.status(404).json({ detail: 'Not found' });
    if (grievance.sensitivity === 'sensitive' && !SENSITIVE_VIEW_ROLES.has(role)) {
      return res.status(403).json({ detail: 'Restricted — sensitive grievance' });
    }

    const newStatus = req.body?.status ?? req.query?.status ?? null;
    const newOfficer = req.body?.officer_id ?? req.query?.officer_id ?? null;
    const note = req.body?.note ?? req.query?.note ?? null;
    const rawActor = String(req.body?.actor ?? req.query?.actor ?? 'OFF-DESK').slice(0, 64);

    if (newStatus && !ALL_STATUSES.has(String(newStatus))) {
      return res.status(422).json({ detail: 'Invalid status value' });
    }
    if (!newStatus && !newOfficer && !note) {
      return res.status(400).json({ detail: 'No update fields provided' });
    }

    if (newOfficer) {
      appendAudit(
        grievance,
        'assign',
        rawActor,
        role,
        grievance.assigned_officer_id,
        String(newOfficer),
        note ? String(note) : null
      );
      grievance.assigned_officer_id = String(newOfficer);
    }
    if (newStatus) {
      appendAudit(
        grievance,
        'status',
        rawActor,
        role,
        grievance.status,
        String(newStatus),
        note ? String(note) : null
      );
      grievance.status = String(newStatus);
    }
    if (note && !newStatus && !newOfficer) {
      appendAudit(grievance, 'note', rawActor, role, null, null, String(note));
    }
    return res.json(serializeRow(grievance));
  });

  router.get('/oversight', (req, res) => {
    return res.json(store.computeOversight(req.adminRole));
  });

  router.post('/run-escalation', (req, res) => {
    if (!ESCALATION_ROLES.has(req.adminRole)) {
      return res
        .status(403)
        .json({ detail: 'Only commissioner, collector, or CM Cell can run SLA escalation' });
    }
    return res.json({ escalated: store.escalateOverdue() });
  });

  return router;
}
