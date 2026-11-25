/**
 * Append-only SHA-256 hash-chained audit trail and role-namespaced actor helpers.
 */
import crypto from 'node:crypto';

/**
 * Namespace an actor identifier with the authenticated role so callers cannot
 * impersonate another role in the audit trail.
 * @param {string} role
 * @param {string} actorId
 * @returns {string}
 */
export function namespaceActor(role, actorId) {
  const cleanRole = String(role || 'unknown').trim().toLowerCase();
  const cleanActor = String(actorId || 'unknown').trim().slice(0, 64) || 'unknown';
  const prefix = `${cleanRole}:`;
  return cleanActor.startsWith(prefix) ? cleanActor : `${prefix}${cleanActor}`;
}

/**
 * Compute the deterministic SHA-256 digest for a single audit event.
 * @param {string} gid
 * @param {string} evType
 * @param {string | null} fromVal
 * @param {string | null} toVal
 * @param {string | null} note
 * @param {string} actorId
 * @param {string | null} prevHash
 * @param {string} atIso
 * @returns {string}
 */
export function hashEvent(gid, evType, fromVal, toVal, note, actorId, prevHash, atIso) {
  const payload =
    `${gid}|${evType}|${fromVal ?? 'None'}|${toVal ?? 'None'}|` +
    `${note ?? 'None'}|${actorId}|${prevHash ?? 'None'}|${atIso}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Append a new hash-chained audit event onto a grievance record.
 * @param {{ id: string, events: Array<Record<string, unknown>> }} grievance
 * @param {string} eventType
 * @param {string} actorId
 * @param {string} actorRole
 * @param {string | null} [fromVal=null]
 * @param {string | null} [toVal=null]
 * @param {string | null} [note=null]
 * @returns {Record<string, unknown>}
 */
export function appendAudit(
  grievance,
  eventType,
  actorId,
  actorRole,
  fromVal = null,
  toVal = null,
  note = null
) {
  const prevHash =
    grievance.events.length > 0 ? grievance.events[grievance.events.length - 1].hash : null;
  const atIso = new Date().toISOString();
  const namespacedActor = namespaceActor(actorRole, actorId);
  const hash = hashEvent(
    grievance.id,
    eventType,
    fromVal,
    toVal,
    note,
    namespacedActor,
    prevHash,
    atIso
  );
  const event = {
    type: eventType,
    from: fromVal,
    to: toVal,
    note,
    actor: namespacedActor,
    role: actorRole,
    at: atIso,
    prev_hash: prevHash,
    hash,
  };
  grievance.events.push(event);
  return event;
}

/**
 * Verify hash-chain linkage and content integrity for all events on a grievance.
 * @param {{ id: string, events: Array<Record<string, unknown>> }} grievance
 * @returns {boolean}
 */
export function verifyChain(grievance) {
  let prev = null;
  for (const ev of grievance.events) {
    if (ev.prev_hash !== prev) return false;
    const expected = hashEvent(
      grievance.id,
      ev.type,
      ev.from,
      ev.to,
      ev.note,
      ev.actor,
      prev,
      ev.at
    );
    if (expected !== ev.hash) return false;
    prev = ev.hash;
  }
  return true;
}
