/**
 * Automated WCAG 2.1 AA/AAA Accessibility & Frontend Security Hygiene Tests.
 * Explicitly fails if any <img> lacks an alt attribute or any <button> lacks an accessible name,
 * and enforces form labels, live regions, role="log", focus management, reduced motion,
 * forced-colors, >= 44px touch targets, AAA color contrast, and zero XSS/CSP violations.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '..', 'TN_Govt_assisting_chatbot-main', 'frontend');

/**
 * Parse key attribute pairs from an HTML opening tag string.
 * @param {string} tagText
 * @returns {Record<string, string>}
 */
function parseAttrs(tagText) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const withoutName = tagText.replace(/^<\s*[a-zA-Z0-9-]+/, '').replace(/\/?>$/, '');
  let match;
  while ((match = attrRegex.exec(withoutName)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

/**
 * Audit an HTML document for images without alt, buttons without accessible names,
 * unlabeled form controls, inline scripts/handlers, and ARIA landmarks.
 * @param {string} html
 * @returns {{ imgsWithoutAlt: string[], buttonsWithoutName: string[], unlabeledControls: string[], inlineHandlers: string[], hasRoleLog: boolean, liveRegions: number }}
 */
export function auditHtmlAccessibility(html) {
  const imgsWithoutAlt = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const attrs = parseAttrs(match[0]);
    if (!Object.prototype.hasOwnProperty.call(attrs, 'alt')) {
      imgsWithoutAlt.push(match[0]);
    }
  }

  const buttonsWithoutName = [];
  const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((match = btnRegex.exec(html)) !== null) {
    const attrs = parseAttrs(`<button ${match[1]}>`);
    const visibleHtml = match[2].replace(
      /<([a-z0-9-]+)\b[^>]*\baria-hidden\s*=\s*["']true["'][^>]*>[\s\S]*?<\/\1>/gi,
      ''
    );
    const innerText = visibleHtml.replace(/<[^>]+>/g, '').trim();
    const hasAccessibleName = Boolean(
      innerText || (attrs['aria-label'] && attrs['aria-label'].trim()) || attrs['aria-labelledby']
    );
    if (!hasAccessibleName) {
      buttonsWithoutName.push(match[0]);
    }
  }

  const labelFors = new Set();
  const labelRegex = /<label\b[^>]*>/gi;
  while ((match = labelRegex.exec(html)) !== null) {
    const attrs = parseAttrs(match[0]);
    if (attrs.for) labelFors.add(attrs.for);
  }

  const unlabeledControls = [];
  const ctrlRegex = /<(?:input|select|textarea)\b[^>]*>/gi;
  while ((match = ctrlRegex.exec(html)) !== null) {
    const attrs = parseAttrs(match[0]);
    if (attrs.type === 'hidden') continue;
    const hasLabel = Boolean(
      (attrs.id && labelFors.has(attrs.id)) ||
        (attrs['aria-label'] && attrs['aria-label'].trim()) ||
        attrs['aria-labelledby']
    );
    if (!hasLabel) {
      unlabeledControls.push(match[0]);
    }
  }

  const inlineHandlers = [];
  const handlerRegex = /\son[a-z]+\s*=/gi;
  while ((match = handlerRegex.exec(html)) !== null) {
    inlineHandlers.push(match[0].trim());
  }

  const liveRegions = (html.match(/\baria-live\s*=/gi) || []).length;
  const hasRoleLog = /\brole\s*=\s*["']log["']/i.test(html);

  return {
    imgsWithoutAlt,
    buttonsWithoutName,
    unlabeledControls,
    inlineHandlers,
    hasRoleLog,
    liveRegions,
  };
}

/**
 * Compute WCAG relative luminance for a hex color.
 * @param {string} hex
 * @returns {number}
 */
function hexLuminance(hex) {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const channels = [0, 2, 4].map((idx) => {
    const s = parseInt(clean.slice(idx, idx + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Compute WCAG contrast ratio between two hex colors.
 * @param {string} fg
 * @param {string} bg
 * @returns {number}
 */
function contrastRatio(fg, bg) {
  const l1 = hexLuminance(fg);
  const l2 = hexLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('Automated Accessibility Audit Gate', () => {
  it('flags missing img alt and unnamed buttons when present', () => {
    const broken = '<img src="seal.png"><button type="button"><span aria-hidden="true">X</span></button>';
    const report = auditHtmlAccessibility(broken);
    assert.equal(report.imgsWithoutAlt.length, 1);
    assert.equal(report.buttonsWithoutName.length, 1);
  });

  it('passes all WCAG checks on citizen.html', () => {
    const html = fs.readFileSync(path.join(FRONTEND_DIR, 'citizen.html'), 'utf8');
    const report = auditHtmlAccessibility(html);
    assert.deepEqual(report.imgsWithoutAlt, []);
    assert.deepEqual(report.buttonsWithoutName, []);
    assert.deepEqual(report.unlabeledControls, []);
    assert.deepEqual(report.inlineHandlers, []);
    assert.equal(report.hasRoleLog, true);
    assert.ok(report.liveRegions >= 3);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(html, /<style\b/i);
  });

  it('passes all WCAG checks on admin.html', () => {
    const html = fs.readFileSync(path.join(FRONTEND_DIR, 'admin.html'), 'utf8');
    const report = auditHtmlAccessibility(html);
    assert.deepEqual(report.imgsWithoutAlt, []);
    assert.deepEqual(report.buttonsWithoutName, []);
    assert.deepEqual(report.unlabeledControls, []);
    assert.deepEqual(report.inlineHandlers, []);
    assert.ok(report.liveRegions >= 3);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /<caption\b/);
    assert.match(html, /<option value="ward_officer" selected>/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(html, /<style\b/i);
  });

  it('enforces WCAG AAA contrast (>= 7:1), >= 44px touch targets, reduced-motion, and forced-colors in styles.css', () => {
    const css = fs.readFileSync(path.join(FRONTEND_DIR, 'styles.css'), 'utf8');
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
    assert.match(css, /min-height:\s*44px/);

    const vars = Object.fromEntries(
      Array.from(css.matchAll(/--([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g), (m) => [m[1], m[2]])
    );
    assert.ok(contrastRatio(vars.ink, vars.surface) >= 7.0);
    assert.ok(contrastRatio(vars.muted, vars.surface) >= 7.0);
    assert.ok(contrastRatio(vars.muted, vars.bg) >= 7.0);
    assert.ok(contrastRatio('#FFFFFF', vars.teal) >= 7.0);
    assert.ok(contrastRatio('#FFFFFF', vars.accent) >= 7.0);
    assert.ok(contrastRatio('#FFFFFF', vars.ok) >= 7.0);
    assert.ok(contrastRatio('#FFFFFF', vars.high) >= 7.0);
    assert.ok(contrastRatio(vars['border-input'], vars.surface) >= 3.0);
  });

  it('verifies focus management, icon-button aria-labels, and zero CSP/XSS sinks in frontend JS', () => {
    const citizenJs = fs.readFileSync(path.join(FRONTEND_DIR, 'citizen.js'), 'utf8');
    const adminJs = fs.readFileSync(path.join(FRONTEND_DIR, 'admin.js'), 'utf8');
    const utilsJs = fs.readFileSync(path.join(FRONTEND_DIR, 'ui_utils.js'), 'utf8');

    // Focus moves to confirmation card, duplicate card, slip, and modal drawer
    assert.match(citizenJs, /heading\.focus\(\)/);
    assert.match(citizenJs, /idHeading\.focus\(\)/);
    assert.match(adminJs, /closeBtn\.focus\(\)/);
    assert.match(adminJs, /'aria-label':\s*'Close grievance details'/);
    assert.match(adminJs, /createFocusTrap/);

    for (const [name, src] of [
      ['citizen.js', citizenJs],
      ['admin.js', adminJs],
      ['ui_utils.js', utilsJs],
    ]) {
      assert.ok(!src.includes('.innerHTML'), `innerHTML forbidden in ${name}`);
      assert.ok(!src.includes('document.write'), `document.write forbidden in ${name}`);
      assert.ok(!src.includes('localStorage'), `localStorage forbidden in ${name}`);
      assert.ok(!src.includes('sessionStorage'), `sessionStorage forbidden in ${name}`);
    }
  });
});
