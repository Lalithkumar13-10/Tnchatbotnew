'use strict';

(() => {
  const API = '/api/v1';
  const OFFICERS = ['OFF-WARD42', 'OFF-WARD55', 'OFF-SWM', 'OFF-CMSR', 'OFF-COLL'];
  const SENSITIVE_ROLES = new Set(['collector', 'cm_cell', 'auditor']);
  const ESCALATION_ROLES = new Set(['commissioner', 'collector', 'cm_cell']);

  let adminApiKey = '';
  let lastTriggerEl = null;

  const roleSelect = document.getElementById('role');
  const escalateBtn = document.getElementById('escalateBtn');
  const statusSelect = document.getElementById('fStatus');
  const catSelect = document.getElementById('fCat');
  const roleNoteEl = document.getElementById('roleNote');
  const statsEl = document.getElementById('stats');
  const rowsEl = document.getElementById('rows');
  const drawerEl = document.getElementById('drawer');
  const backdropEl = document.getElementById('drawerBackdrop');
  const alertEl = document.getElementById('adminAlert');
  const statusEl = document.getElementById('adminStatus');
  const srEl = document.getElementById('adminSrAnnouncer');
  const adminKeySection = document.getElementById('adminKeySection');
  const adminKeyForm = document.getElementById('adminKeyForm');
  const adminKeyInput = document.getElementById('adminKeyInput');

  function currentRole() {
    return roleSelect.value;
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        if (k === 'className') {
          node.className = v;
        } else {
          node.setAttribute(k, String(v));
        }
      });
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function clearBanners() {
    alertEl.classList.add('hidden');
    alertEl.textContent = '';
    statusEl.classList.add('hidden');
    statusEl.textContent = '';
  }

  function showError(msg) {
    statusEl.classList.add('hidden');
    alertEl.textContent = msg;
    alertEl.classList.remove('hidden');
  }

  function showStatus(msg) {
    alertEl.classList.add('hidden');
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
    announce(msg);
  }

  function announce(msg) {
    srEl.textContent = '';
    window.setTimeout(() => {
      srEl.textContent = msg;
    }, 30);
  }

  async function api(path, method = 'GET', body) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Role': currentRole(),
    };
    if (adminApiKey) {
      headers['X-Admin-Key'] = adminApiKey;
    }
    const opts = { method, headers };
    if (body !== undefined && body !== null) {
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(API + path, opts);
    let data = {};
    try {
      data = await resp.json();
    } catch (_err) {
      data = {};
    }
    if (!resp.ok) {
      const err = new Error(data.detail || `Request failed (${resp.status})`);
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  function renderStats(summary) {
    const frag = document.createDocumentFragment();
    const cards = [
      { value: summary.total, label: 'Total grievances', cls: '' },
      { value: summary.open, label: 'Open', cls: '' },
      { value: summary.resolved, label: 'Resolved', cls: '' },
      { value: summary.breached, label: 'SLA breached', cls: 'breach' },
      { value: summary.sensitive, label: 'Sensitive', cls: 'sens', lock: true },
    ];
    cards.forEach((item) => {
      const card = el('div', { className: `stat-card ${item.cls}`.trim() });
      card.appendChild(el('div', { className: 'stat-value' }, item.value));
      const labelEl = el('div', { className: 'stat-label' }, item.label);
      if (item.lock) {
        labelEl.appendChild(document.createTextNode(' '));
        labelEl.appendChild(el('span', { 'aria-hidden': 'true' }, '🔒'));
      }
      card.appendChild(labelEl);
      frag.appendChild(card);
    });
    statsEl.textContent = '';
    statsEl.appendChild(frag);
  }

  function renderRows(grievances) {
    const frag = document.createDocumentFragment();
    if (!grievances || grievances.length === 0) {
      const tr = el('tr');
      const td = el(
        'td',
        { colspan: '7', className: 'center muted' },
        'No grievances for this filter/role.'
      );
      tr.appendChild(td);
      frag.appendChild(tr);
    } else {
      grievances.forEach((g) => {
        const tr = el('tr');

        // Accessible button trigger inside ID cell
        const idTd = el('td');
        const idBtn = el(
          'button',
          {
            type: 'button',
            className: 'id-btn',
            'aria-label': `Inspect grievance ${g.id}`,
          },
          g.id
        );
        idBtn.addEventListener('click', () => openDrawer(g.id, idBtn));
        idTd.appendChild(idBtn);
        if (g.sensitivity === 'sensitive') {
          idTd.appendChild(document.createTextNode(' '));
          idTd.appendChild(
            el('span', { className: 'lock-tag', 'aria-label': 'Sensitive record' }, '🔒')
          );
        }
        tr.appendChild(idTd);

        tr.appendChild(el('td', null, g.category ? g.category.en : '—'));
        tr.appendChild(el('td', null, g.ward || '—'));

        const sevTd = el('td');
        const sevCls = { high: 'b-high', medium: 'b-medium', low: 'b-low' }[g.severity] || 'b-medium';
        sevTd.appendChild(el('span', { className: 'pill ' + sevCls }, g.severity));
        tr.appendChild(sevTd);

        const stTd = el('td');
        const stCls = g.status === 'resolved' ? 'b-ok' : 'b-teal';
        stTd.appendChild(el('span', { className: 'pill ' + stCls }, g.status));
        if (g.escalation_level > 0) {
          stTd.appendChild(
            el(
              'span',
              { 'aria-label': `Escalation level ${g.escalation_level}` },
              ` ↑${g.escalation_level}`
            )
          );
        }
        tr.appendChild(stTd);

        const repTd = el('td');
        if (g.reporter_count > 1) {
          repTd.appendChild(el('span', { 'aria-hidden': 'true' }, '👥 '));
        }
        repTd.appendChild(document.createTextNode(String(g.reporter_count)));
        tr.appendChild(repTd);

        const slaText = g.overdue
          ? 'OVERDUE'
          : g.sla_due_at
            ? new Date(g.sla_due_at).toLocaleDateString()
            : '—';
        tr.appendChild(el('td', { className: g.overdue ? 'overdue' : '' }, slaText));
        frag.appendChild(tr);
      });
    }
    rowsEl.textContent = '';
    rowsEl.appendChild(frag);
  }

  async function loadDashboard() {
    clearBanners();
    const role = currentRole();
    escalateBtn.disabled = !ESCALATION_ROLES.has(role);
    roleNoteEl.textContent = SENSITIVE_ROLES.has(role)
      ? ''
      : 'Sensitive grievances are hidden from this role.';

    const params = new URLSearchParams();
    if (statusSelect.value) params.set('status', statusSelect.value);
    if (catSelect.value) params.set('category', catSelect.value);
    const query = params.toString() ? `?${params.toString()}` : '';

    try {
      const [summary, listData] = await Promise.all([
        api('/admin/oversight'),
        api('/admin/grievances' + query),
      ]);
      adminKeySection.classList.add('hidden');
      renderStats(summary);
      renderRows(listData.grievances || []);
      announce(`Loaded ${(listData.grievances || []).length} grievances.`);
    } catch (err) {
      if (err.status === 401) {
        adminKeySection.classList.remove('hidden');
        adminKeyInput.focus();
      }
      showError(err.message);
    }
  }

  // ---- Accessible Modal Drawer with Focus Trap ----
  function getFocusable(container) {
    return Array.from(
      container.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function handleDrawerKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = getFocusable(drawerEl);
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
  }

  function showDrawerShell() {
    backdropEl.classList.remove('hidden');
    drawerEl.classList.remove('hidden');
    drawerEl.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', handleDrawerKeydown);
  }

  function closeDrawer() {
    drawerEl.classList.add('hidden');
    drawerEl.setAttribute('aria-hidden', 'true');
    backdropEl.classList.add('hidden');
    document.removeEventListener('keydown', handleDrawerKeydown);
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
  }

  async function openDrawer(gid, triggerEl) {
    if (triggerEl) lastTriggerEl = triggerEl;
    clearBanners();
    drawerEl.textContent = '';

    try {
      const g = await api(`/admin/grievances/${encodeURIComponent(gid)}`);
      renderDrawerContent(g);
      showDrawerShell();
      const closeBtn = drawerEl.querySelector('.close-btn');
      if (closeBtn) closeBtn.focus();
    } catch (err) {
      const head = el('div', { className: 'drawer-header' });
      head.appendChild(el('h2', { id: 'drawerTitle' }, 'Restricted'));
      const closeBtn = el('button', {
        type: 'button',
        className: 'close-btn',
        'aria-label': 'Close grievance details',
      }, '✕');
      closeBtn.addEventListener('click', closeDrawer);
      head.appendChild(closeBtn);
      drawerEl.appendChild(head);
      drawerEl.appendChild(el('p', { className: 'mt' }, err.message));
      showDrawerShell();
      closeBtn.focus();
    }
  }

  function renderDrawerContent(g) {
    const head = el('div', { className: 'drawer-header' });
    const titleWrap = el('div');
    const title = el('h2', { id: 'drawerTitle' }, g.id);
    if (g.sensitivity === 'sensitive') {
      title.appendChild(document.createTextNode(' '));
      title.appendChild(el('span', { className: 'lock-tag', 'aria-label': 'Sensitive' }, '🔒'));
    }
    titleWrap.appendChild(title);
    titleWrap.appendChild(
      el('p', { className: 'muted' }, `${g.category ? g.category.en : '—'} · ${g.dept || '—'}`)
    );

    const closeBtn = el(
      'button',
      {
        type: 'button',
        className: 'close-btn',
        'aria-label': 'Close grievance details',
      },
      '✕'
    );
    closeBtn.addEventListener('click', closeDrawer);
    head.appendChild(titleWrap);
    head.appendChild(closeBtn);
    drawerEl.appendChild(head);

    // Verbatim citizen words (strictly textContent — zero XSS)
    const rawBox = el('div', { className: 'raw-box' });
    rawBox.appendChild(el('strong', null, "Citizen's words (verbatim):"));
    rawBox.appendChild(document.createElement('br'));
    rawBox.appendChild(document.createTextNode(g.description_raw || ''));
    drawerEl.appendChild(rawBox);

    // Metadata definition list
    const dl = el('dl', { className: 'kv-grid' });
    const locStr = [g.ward || '—', g.landmark || ''].filter(Boolean).join(' · ');
    appendKv(dl, 'Ward', locStr);
    appendKv(dl, 'Severity', g.severity || '—');
    appendKv(dl, 'Status', `${g.status} (escalation ${g.escalation_level})`);
    appendKv(dl, 'Reporters', String(g.reporter_count));
    const slaDue = g.sla_due_at ? new Date(g.sla_due_at).toLocaleString() : '—';
    appendKv(dl, 'SLA due', g.overdue ? `${slaDue} — OVERDUE` : slaDue, g.overdue ? 'overdue' : '');
    drawerEl.appendChild(dl);

    // Audit chain status
    const chainEl = el(
      'p',
      { className: g.chain_valid ? 'chain-status' : 'chain-status broken' },
      g.chain_valid
        ? 'Audit chain verified · tamper-evident'
        : 'Audit chain verification FAILED'
    );
    drawerEl.appendChild(chainEl);

    // History timeline
    drawerEl.appendChild(el('h3', null, 'Audit History'));
    const histList = el('ol', { className: 'ev-list' });
    (g.history || []).forEach((ev) => {
      const li = el('li', { className: 'ev-item' });
      li.appendChild(el('strong', null, ev.type));
      const transition = ev.from ? ` ${ev.from} → ${ev.to || ''}` : ev.to ? ` ${ev.to}` : '';
      li.appendChild(document.createTextNode(`${transition} · ${ev.role}`));
      if (ev.note) {
        li.appendChild(document.createElement('br'));
        li.appendChild(document.createTextNode(ev.note));
      }
      li.appendChild(document.createElement('br'));
      li.appendChild(el('time', { datetime: ev.at }, new Date(ev.at).toLocaleString()));
      histList.appendChild(li);
    });
    drawerEl.appendChild(histList);

    // Officer actions (hidden for read-only auditor)
    if (currentRole() === 'auditor') {
      drawerEl.appendChild(el('p', { className: 'muted mt' }, 'Auditor role is read-only.'));
      return;
    }

    drawerEl.appendChild(el('h3', null, 'Officer Actions'));

    const noteField = el('div', { className: 'field' });
    noteField.appendChild(el('label', { for: 'resolutionNote' }, 'Action / Resolution Note'));
    const noteInput = el('input', {
      id: 'resolutionNote',
      type: 'text',
      placeholder: 'Enter inspection or resolution note...',
    });
    noteField.appendChild(noteInput);
    drawerEl.appendChild(noteField);

    const statusBtns = el('div', { className: 'row mt' });
    const inProgBtn = el('button', { type: 'button', className: 'btn row-grow' }, 'Mark In Progress');
    inProgBtn.addEventListener('click', () =>
      updateGrievance(g.id, {
        status: 'in_progress',
        note: noteInput.value.trim() || `Updated by ${currentRole()}`,
      })
    );

    const resolveBtn = el('button', { type: 'button', className: 'btn amber row-grow' }, 'Resolve');
    resolveBtn.addEventListener('click', () =>
      updateGrievance(g.id, {
        status: 'resolved',
        note: noteInput.value.trim() || 'Resolved by officer',
      })
    );
    statusBtns.appendChild(inProgBtn);
    statusBtns.appendChild(resolveBtn);
    drawerEl.appendChild(statusBtns);

    // Assign officer form
    const assignField = el('div', { className: 'field' });
    assignField.appendChild(el('label', { for: 'assignSel' }, 'Assign Officer'));
    const assignRow = el('div', { className: 'row' });
    const assignSel = el('select', { id: 'assignSel', className: 'row-grow' });
    OFFICERS.forEach((offId) => {
      const opt = el('option', { value: offId }, offId);
      if (g.officer_id === offId) opt.selected = true;
      assignSel.appendChild(opt);
    });
    const assignBtn = el('button', { type: 'button', className: 'btn ghost' }, 'Assign');
    assignBtn.addEventListener('click', () =>
      updateGrievance(g.id, {
        officer_id: assignSel.value,
        status: 'assigned',
        note: noteInput.value.trim() || `Assigned to ${assignSel.value}`,
      })
    );
    assignRow.appendChild(assignSel);
    assignRow.appendChild(assignBtn);
    assignField.appendChild(assignRow);
    drawerEl.appendChild(assignField);
  }

  function appendKv(dl, key, value, ddClass) {
    dl.appendChild(el('dt', null, key));
    dl.appendChild(el('dd', { className: ddClass || null }, value));
  }

  async function updateGrievance(gid, payload) {
    clearBanners();
    try {
      await api(`/admin/grievances/${encodeURIComponent(gid)}`, 'PATCH', payload);
      showStatus(`Updated grievance ${gid}.`);
      await Promise.all([openDrawer(gid), loadDashboard()]);
    } catch (err) {
      showError(err.message);
    }
  }

  async function runEscalation() {
    clearBanners();
    try {
      const res = await api('/admin/run-escalation', 'POST');
      const moved = res.escalated || [];
      showStatus(
        moved.length > 0
          ? `SLA escalation completed: ${moved.join(', ')}`
          : 'SLA escalation checked: no overdue grievances needed escalation.'
      );
      await loadDashboard();
    } catch (err) {
      showError(err.message);
    }
  }

  // ---- Event listeners ----
  roleSelect.addEventListener('change', loadDashboard);
  statusSelect.addEventListener('change', loadDashboard);
  catSelect.addEventListener('change', loadDashboard);
  escalateBtn.addEventListener('click', runEscalation);
  backdropEl.addEventListener('click', closeDrawer);
  adminKeyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    adminApiKey = adminKeyInput.value.trim();
    adminKeyInput.value = '';
    loadDashboard();
  });

  loadDashboard();
})();
