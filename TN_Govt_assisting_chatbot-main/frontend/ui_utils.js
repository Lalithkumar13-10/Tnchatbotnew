'use strict';

/**
 * Shared accessible DOM, API, status-banner, and focus-trap utilities
 * for Nagar Kuraiteer Citizen and Admin frontends.
 */
window.NagarUI = (() => {
  /**
   * Create a DOM element safely using attributes and textContent (never innerHTML).
   * @param {string} tag
   * @param {Record<string, string | number | boolean | null | undefined> | null} [attrs]
   * @param {string | number | null} [text]
   * @returns {HTMLElement}
   */
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (key === 'className') {
          node.className = String(value);
        } else {
          node.setAttribute(key, String(value));
        }
      });
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  /**
   * Append a term/definition pair to a <dl> list.
   * @param {HTMLDListElement} dl
   * @param {string} label
   * @param {string} value
   * @param {string} [ddClass]
   */
  function appendKv(dl, label, value, ddClass) {
    dl.appendChild(el('dt', null, label));
    dl.appendChild(el('dd', ddClass ? { className: ddClass } : null, value));
  }

  /**
   * Generate a random session identifier using Web Crypto when available.
   * @returns {string}
   */
  function generateSessionId() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(12);
      window.crypto.getRandomValues(buf);
      return Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return String(Date.now());
  }

  /**
   * Manage accessible inline alert/status banners and screen-reader announcements.
   * @param {{ alertEl: HTMLElement, statusEl: HTMLElement, srEl: HTMLElement }} nodes
   */
  function createStatusController({ alertEl, statusEl, srEl }) {
    function clear() {
      alertEl.classList.add('hidden');
      alertEl.textContent = '';
      statusEl.classList.add('hidden');
      statusEl.textContent = '';
    }

    function announce(message) {
      srEl.textContent = '';
      window.setTimeout(() => {
        srEl.textContent = message;
      }, 30);
    }

    function showError(message) {
      statusEl.classList.add('hidden');
      alertEl.textContent = message;
      alertEl.classList.remove('hidden');
    }

    function showStatus(message) {
      alertEl.classList.add('hidden');
      statusEl.textContent = message;
      statusEl.classList.remove('hidden');
      announce(message);
    }

    return { clear, announce, showError, showStatus };
  }

  /**
   * Create a typed JSON HTTP client with unified error normalization.
   * @param {{ baseUrl?: string, getHeaders?: () => Record<string, string>, fallbackError?: () => string }} [options]
   */
  function createApiClient(options = {}) {
    const baseUrl = options.baseUrl || '';
    const getHeaders = options.getHeaders || (() => ({}));
    const fallbackError = options.fallbackError || (() => 'Request failed');

    return async function request(path, { method = 'GET', body } = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...getHeaders(),
      };
      const init = { method, headers };
      if (body !== undefined && body !== null && method !== 'GET') {
        init.body = JSON.stringify(body);
      }

      const response = await fetch(baseUrl + path, init);
      let data = {};
      try {
        data = await response.json();
      } catch (_err) {
        data = {};
      }
      if (!response.ok) {
        const error = new Error(data.detail || fallbackError());
        error.status = response.status;
        throw error;
      }
      return data;
    };
  }

  /**
   * Keyboard focus-trap controller for accessible modal dialogs/drawers.
   * @param {HTMLElement} container
   * @param {() => void} onEscape
   */
  function createFocusTrap(container, onEscape) {
    const FOCUSABLE_SELECTOR =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    return {
      activate: () => document.addEventListener('keydown', handleKeydown),
      deactivate: () => document.removeEventListener('keydown', handleKeydown),
    };
  }

  return {
    el,
    appendKv,
    generateSessionId,
    createStatusController,
    createApiClient,
    createFocusTrap,
  };
})();
