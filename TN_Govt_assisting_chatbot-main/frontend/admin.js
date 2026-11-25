'use strict';

(() => {
  const { el, appendKv, createStatusController, createApiClient, createFocusTrap } = window.NagarUI;

  const OFFICERS = ['OFF-WARD42', 'OFF-WARD55', 'OFF-SWM', 'OFF-CMSR', 'OFF-COLL'];
  const SENSITIVE_ROLES = new Set(['collector', 'cm_cell', 'auditor']);
  const ESCALATION_ROLES = new Set(['commissioner', 'collector', 'cm_cell']);

  const state = {
    adminApiKey: '',
    lastTriggerEl: null,
  };

  const dom = {
    roleSelect: document.getElementById('role'),
    escalateBtn: document.getElementById('escalateBtn'),
    statusSelect: document.getElementById('fStatus'),
    catSelect: document.getElementById('fCat'),
    roleNoteEl: document.getElementById('roleNote'),
    statsEl: document.getElementById('stats'),
    rowsEl: document.getElementById('rows'),
    drawerEl: document.getElementById('drawer'),
    backdropEl: document.getElementById('drawerBackdrop'),
    adminKeySection: document.getElementById('adminKeySection'),
    adminKeyForm: document.getElementById('adminKeyForm'),
    adminKeyInput: document.getElementById('adminKeyInput'),
  };

  function currentRole() {
    return dom.roleSelect.value;
  }

  const statusUI = createStatusController({
    alertEl: document.getElementById('adminAlert'),
    statusEl: document.getElementById('adminStatus'),
    srEl: document.getElementById('adminSrAnnouncer'),
  });

  const api = createApiClient({
    baseUrl: '/api/v1',
    getHeaders: () => {
      const headers = { 'X-Role': currentRole() };
      if (state.adminApiKey) headers['X-Admin-Key'] = state.adminApiKey;
      return headers;
    },
  });

  const focusTrap = createFocusTrap(dom.drawerEl, closeDrawer);

  // ---- Dashboard rendering ----
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
    dom.statsEl.textContent = '';
    dom.statsEl.appendChild(frag);
  }

  function buildGrievanceRow(g) {
    const tr = el('tr');

    const idTd = el('td');
    const idBtn = el(
      'button',
      { type: 'button', className: 'id-btn', 'aria-label': `Inspect grievance ${g.id}` },
      g.id
    );
    idBtn.addEventListener('click', () => openDrawer(g.id, idBtn));
    idTd.appendChild(idBtn);
    if (g.sensitivity === 'sensitive') {
      idTd.appendChild(document.createTextNode(' '));
      idTd.appendChild(el('span', { className: 'lock-tag', 'aria-label': 'Sensitive record' }, '🔒'));
    }
    tr.appendChild(idTd);

    tr.appendChild(el('td', null, g.category ? g.category.en : '—'));
    tr.appendChild(el('td', null, g.ward || '—'));

    const sevTd = el('td');
    const sevCls = { high: 'b-high', medium: 'b-medium', low: 'b-low' }[g.severity] || 'b-medium';
    sevTd.appendChild(el('span', { className: 'pill ' + sevCls }, g.severity));
    tr.appendChild(sevTd);

    const stTd = el('td');
    stTd.appendChild(el('span', { className: `pill ${g.status === 'resolved' ? 'b-ok' : 'b-teal'}` }, g.status));
    if (g.escalation_level > 0) {
      stTd.appendChild(el('span', { 'aria-label': `Escalation level ${g.escalation_level}` }, ` ↑${g.escalation_level}`));
    }
    tr.appendChild(stTd);

    const repTd = el('td');
    if (g.reporter_count > 1) repTd.appendChild(el('span', { 'aria-hidden': 'true' }, '👥 '));
    repTd.appendChild(document.createTextNode(String(g.reporter_count)));
    tr.appendChild(repTd);

    const slaText = g.overdue
      ? 'OVERDUE'
      : g.sla_due_at
        ? new Date(g.sla_due_at).toLocaleDateString()
        : '—';
    tr.appendChild(el('td', { className: g.overdue ? 'overdue' : '' }, slaText));
    return tr;
  }

  function renderRows(grievances) {
    const frag = document.createDocumentFragment();
    if (!grievances || grievances.length === 0) {
      const tr = el('tr');
      tr.appendChild(el('td', { colspan: '7', className: 'center muted' }, 'No grievances for this filter/role.'));
      frag.appendChild(tr);
    } else {
      grievances.forEach((g) => frag.appendChild(buildGrievanceRow(g)));
    }
    dom.rowsEl.textContent = '';
    dom.rowsEl.appendChild(frag);
  }

  async function loadDashboard() {
    statusUI.clear();
    const role = currentRole();
    dom.escalateBtn.disabled = !ESCALATION_ROLES.has(role);
    dom.roleNoteEl.textContent = SENSITIVE_ROLES.has(role)
      ? ''
      : 'Sensitive grievances are hidden from this role.';

    const params = new URLSearchParams();
    if (dom.statusSelect.value) params.set('status', dom.statusSelect.value);
    if (dom.catSelect.value) params.set('category', dom.catSelect.value);
    const query = params.toString() ? `?${params.toString()}` : '';

    try {
      const [summary, listData] = await Promise.all([
        api('/admin/oversight'),
        api('/admin/grievances' + query),
      ]);
      dom.adminKeySection.classList.add('hidden');
      renderStats(summary);
      renderRows(listData.grievances || []);
      statusUI.announce(`Loaded ${(listData.grievances || []).length} grievances.`);
    } catch (err) {
      if (err.status === 401) {
        dom.adminKeySection.classList.remove('hidden');
        dom.adminKeyInput.focus();
      }
      statusUI.showError(err.message);
    }
  }

  // ---- Modal drawer helpers ----
  function buildDrawerHeader(titleText, subtitleText, isSensitive) {
    const head = el('div', { className: 'drawer-header' });
    const titleWrap = el('div');
    const title = el('h2', { id: 'drawerTitle' }, titleText);
    if (isSensitive) {
      title.appendChild(document.createTextNode(' '));
      title.appendChild(el('span', { className: 'lock-tag', 'aria-label': 'Sensitive' }, '🔒'));
    }
    titleWrap.appendChild(title);
    if (subtitleText) {
      titleWrap.appendChild(el('p', { className: 'muted' }, subtitleText));
    }

    const closeBtn = el(
      'button',
      { type: 'button', className: 'close-btn', 'aria-label': 'Close grievance details' },
      '✕'
    );
    closeBtn.addEventListener('click', closeDrawer);
    head.appendChild(titleWrap);
    head.appendChild(closeBtn);
    return { head, closeBtn };
  }

  function buildAuditHistoryList(history) {
    const list = el('ol', { className: 'ev-list' });
    (history || []).forEach((ev) => {
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
      list.appendChild(li);
    });
    return list;
  }

  function buildOfficerActions(g) {
    const frag = document.createDocumentFragment();
    if (currentRole() === 'auditor') {
      frag.appendChild(el('p', { className: 'muted mt' }, 'Auditor role is read-only.'));
      return frag;
    }

    frag.appendChild(el('h3', null, 'Officer Actions'));

    const noteField = el('div', { className: 'field' });
    noteField.appendChild(el('label', { for: 'resolutionNote' }, 'Action / Resolution Note'));
    const noteInput = el('input', {
      id: 'resolutionNote',
      type: 'text',
      placeholder: 'Enter inspection or resolution note...',
    });
    noteField.appendChild(noteInput);
    frag.appendChild(noteField);

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
    frag.appendChild(statusBtns);

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
    frag.appendChild(assignField);
    return frag;
  }

  function showDrawerShell() {
    dom.backdropEl.classList.remove('hidden');
    dom.drawerEl.classList.remove('hidden');
    dom.drawerEl.setAttribute('aria-hidden', 'false');
    focusTrap.activate();
  }

  function closeDrawer() {
    dom.drawerEl.classList.add('hidden');
    dom.drawerEl.setAttribute('aria-hidden', 'true');
    dom.backdropEl.classList.add('hidden');
    focusTrap.deactivate();
    if (state.lastTriggerEl && typeof state.lastTriggerEl.focus === 'function') {
      state.lastTriggerEl.focus();
    }
  }

  async function openDrawer(gid, triggerEl) {
    if (triggerEl) state.lastTriggerEl = triggerEl;
    statusUI.clear();
    dom.drawerEl.textContent = '';

    try {
      const g = await api(`/admin/grievances/${encodeURIComponent(gid)}`);
      const subtitle = `${g.category ? g.category.en : '—'} · ${g.dept || '—'}`;
      const { head, closeBtn } = buildDrawerHeader(g.id, subtitle, g.sensitivity === 'sensitive');
      dom.drawerEl.appendChild(head);

      const rawBox = el('div', { className: 'raw-box' });
      rawBox.appendChild(el('strong', null, "Citizen's words (verbatim):"));
      rawBox.appendChild(document.createElement('br'));
      rawBox.appendChild(document.createTextNode(g.description_raw || ''));
      dom.drawerEl.appendChild(rawBox);

      const dl = el('dl', { className: 'kv-grid' });
      appendKv(dl, 'Ward', [g.ward || '—', g.landmark || ''].filter(Boolean).join(' · '));
      appendKv(dl, 'Severity', g.severity || '—');
      appendKv(dl, 'Status', `${g.status} (escalation ${g.escalation_level})`);
      appendKv(dl, 'Reporters', String(g.reporter_count));
      const slaDue = g.sla_due_at ? new Date(g.sla_due_at).toLocaleString() : '—';
      appendKv(dl, 'SLA due', g.overdue ? `${slaDue} — OVERDUE` : slaDue, g.overdue ? 'overdue' : '');
      dom.drawerEl.appendChild(dl);

      dom.drawerEl.appendChild(
        el(
          'p',
          { className: g.chain_valid ? 'chain-status' : 'chain-status broken' },
          g.chain_valid ? 'Audit chain verified · tamper-evident' : 'Audit chain verification FAILED'
        )
      );
      dom.drawerEl.appendChild(el('h3', null, 'Audit History'));
      dom.drawerEl.appendChild(buildAuditHistoryList(g.history));
      dom.drawerEl.appendChild(buildOfficerActions(g));

      showDrawerShell();
      closeBtn.focus();
    } catch (err) {
      const { head, closeBtn } = buildDrawerHeader('Restricted', '', false);
      dom.drawerEl.appendChild(head);
      dom.drawerEl.appendChild(el('p', { className: 'mt' }, err.message));
      showDrawerShell();
      closeBtn.focus();
    }
  }

  async function updateGrievance(gid, body) {
    statusUI.clear();
    try {
      await api(`/admin/grievances/${encodeURIComponent(gid)}`, { method: 'PATCH', body });
      statusUI.showStatus(`Updated grievance ${gid}.`);
      await Promise.all([openDrawer(gid), loadDashboard()]);
    } catch (err) {
      statusUI.showError(err.message);
    }
  }

  async function runEscalation() {
    statusUI.clear();
    try {
      const res = await api('/admin/run-escalation', { method: 'POST' });
      const moved = res.escalated || [];
      statusUI.showStatus(
        moved.length > 0
          ? `SLA escalation completed: ${moved.join(', ')}`
          : 'SLA escalation checked: no overdue grievances needed escalation.'
      );
      await loadDashboard();
    } catch (err) {
      statusUI.showError(err.message);
    }
  }

  // ---- Event bindings ----
  dom.roleSelect.addEventListener('change', loadDashboard);
  dom.statusSelect.addEventListener('change', loadDashboard);
  dom.catSelect.addEventListener('change', loadDashboard);
  dom.escalateBtn.addEventListener('click', runEscalation);
  dom.backdropEl.addEventListener('click', closeDrawer);
  dom.adminKeyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.adminApiKey = dom.adminKeyInput.value.trim();
    dom.adminKeyInput.value = '';
    loadDashboard();
  });

  loadDashboard();
})();
