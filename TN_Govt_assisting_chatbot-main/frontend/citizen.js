'use strict';

(() => {
  const T = {
    en: {
      skipMain: 'Skip to main content',
      verifyTitle: 'Verify Mobile Number',
      verifySub: 'Please verify your mobile number to file a grievance and receive tracking updates via SMS.',
      phoneLabel: 'Mobile Number (10 digits)',
      otpLabel: 'One-Time Passcode (OTP)',
      sendOtp: 'Request OTP',
      verify: 'Verify OTP',
      haveId: 'Track Existing Grievance',
      chatTitle: 'Civic Grievance Assistant Chat',
      messageLabel: 'Describe your civic grievance',
      enterHint: 'Press Enter to submit, or Shift plus Enter for a new line.',
      typeHere: 'Describe the civic issue in your area...',
      sendBtn: 'Submit',
      demoNote: 'Official Civic Grievance Portal — Coimbatore City Municipal Corporation',
      trackTitle: 'Track Grievance Status',
      trackIdLabel: 'Grievance Tracking ID',
      trackBtn: 'Track Status',
      backHome: 'Back to Home',
      review: 'Review Grievance Details',
      cat: 'Grievance Category',
      ward: 'Area / Ward',
      landmark: 'Landmark / Street (Optional)',
      desc: 'Detailed Description',
      sev: 'Priority / Severity Level',
      fileBtn: 'Submit Grievance',
      shareLoc: 'Use My Location',
      need: 'Grievance category, description, and location (Area/Ward or Landmark) are required.',
      invalidPhone: 'Please enter a valid 10-digit mobile number.',
      invalidOtp: 'Please enter the OTP code.',
      otpSent: 'OTP sent. Please enter the code below.',
      otpFailed: 'Invalid or expired OTP. Please try again.',
      networkErr: 'Unable to reach the server. Please check your connection and try again.',
      low: 'Routine',
      medium: 'Priority',
      high: 'Urgent',
      filedNew: 'Grievance Successfully Registered',
      supportAdded: 'Grievance Co-signed / Supported',
      type: 'Category',
      dept: 'Assigned Department',
      area: 'Ward / Location',
      reporters: 'Co-reporters',
      slaNote: 'Grievance registered. Targeted SLA updates will be sent to your mobile number.',
      another: 'Submit Another Grievance',
      reopen: 'Reopen Grievance',
      reopenedMsg: 'Grievance has been reopened for further review.',
      reopenErr: 'Only resolved grievances can be reopened.',
      ratePrompt: 'Rate Resolution (1 to 5 stars)',
      thanks: 'Thank you for your feedback.',
      dupTitle: 'Grievance Already Exists',
      dupBody: 'A similar grievance has already been registered in this ward',
      addSupport: 'Support this Grievance',
      fileSep: 'File Separately',
      status: 'Status',
      notFound: 'No grievance found with the specified Tracking ID.',
      enterTrackId: 'Please enter a Grievance Tracking ID.',
      otpHint: 'Demo OTP: ',
      welcome: 'Hello! Tell me the problem in your area — streetlight, garbage, water, potholes, or anything else.',
      typing: 'Assistant is typing a reply...',
      assistantPrefix: 'Assistant: ',
      citizenPrefix: 'You: ',
      sensitiveNote: 'Flagged sensitive — routed directly to a senior officer and kept confidential.',
      locFound: 'Location attached.',
      locFallback: 'Location access unavailable; please pick your area or enter a landmark.',
      progressLabel: 'Grievance status progress',
      suggestedChipsLabel: 'Common civic issues',
    },
    ta: {
      skipMain: 'முக்கிய உள்ளடக்கத்திற்குச் செல்ல',
      verifyTitle: 'கைபேசி எண் சரிபார்ப்பு',
      verifySub: 'தங்களின் புகாரைக் கண்காணிக்கவும், அதுகுறித்த புதிய தகவல்களை SMS மூலம் அனுப்பவும் மட்டுமே கைபேசி எண் பயன்படுத்தப்படும்.',
      phoneLabel: 'கைபேசி எண் (10 இலக்கங்கள்)',
      otpLabel: 'ஒருமுறை கடவுச்சொல் (OTP)',
      sendOtp: 'கடவுச்சொல் (OTP) அனுப்பு',
      verify: 'சரிபார்க்கவும்',
      haveId: 'மனு எண் மூலம் கண்காணிக்க',
      chatTitle: 'குறைதீர் உதவியாளர் உரையாடல்',
      messageLabel: 'உங்கள் புகாரை விவரிக்கவும்',
      enterHint: 'சமர்ப்பிக்க Enter அழுத்தவும், புதிய வரிக்கு Shift+Enter அழுத்தவும்.',
      typeHere: 'உங்கள் புகாரை இங்கே தட்டச்சு செய்யவும்...',
      sendBtn: 'சமர்ப்பி',
      demoNote: 'நகர குறைதீர் — கோவை மாநகராட்சி குடிமக்கள் குறைதீர்வு முகப்பு',
      trackTitle: 'மனு நிலை அறிதல் (Track Grievance)',
      trackIdLabel: 'மனு எண் (Tracking ID)',
      trackBtn: 'நிலை அறிய',
      backHome: 'முகப்பு பக்கத்திற்கு செல்ல',
      review: 'மனு விவரங்களைச் சரிபார்க்கவும்',
      cat: 'புகார் வகை (Category)',
      ward: 'பகுதி / வார்டு (Area / Ward)',
      landmark: 'அடையாளம் / தெருப்பெயர் (விருப்பம்)',
      desc: 'புகார் விவரம் (Description)',
      sev: 'தீவிரம் (Severity)',
      fileBtn: 'மனுவை சமர்ப்பிக்கவும்',
      shareLoc: 'என் இருப்பிடத்தைப் பயன்படுத்து',
      need: 'புகார் வகை, விவரம் மற்றும் இடம் (பகுதி/வார்டு அல்லது அடையாளம்) ஆகியவை தேவை.',
      invalidPhone: 'தயவுசெய்து சரியான 10 இலக்க கைபேசி எண்ணை உள்ளிடவும்.',
      invalidOtp: 'தயவுசெய்து OTP எண்ணை உள்ளிடவும்.',
      otpSent: 'OTP அனுப்பப்பட்டது. கீழே உள்ளிடவும்.',
      otpFailed: 'தவறான அல்லது காலாவதியான OTP. மீண்டும் முயற்சிக்கவும்.',
      networkErr: 'சேவையகத்தைத் தொடர்பு கொள்ள முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
      low: 'சாதாரண நிலை',
      medium: 'நடுத்தர நிலை',
      high: 'உடனடி கவனம் தேவை',
      filedNew: 'மனு வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது',
      supportAdded: 'மனு ஆதரவு பதிவு செய்யப்பட்டது',
      type: 'புகார் வகை',
      dept: 'துறை (Department)',
      area: 'வட்டார பகுதி (Ward)',
      reporters: 'ஆதரவாளர்கள்',
      slaNote: 'மனு எண் தங்களின் கைபேசி எண்ணிற்கு SMS செய்யப்பட்டுள்ளது. குறிப்பிட்ட கால அளவிற்குள் தீர்வு காணப்படும்.',
      another: 'மற்றொரு மனுவைத் தாக்கல் செய்ய',
      reopen: 'மனுவை மீண்டும் திறக்கவும்',
      reopenedMsg: 'மனு மறுபரிசீலனைக்காக மீண்டும் திறக்கப்பட்டது.',
      reopenErr: 'தீர்வு காணப்பட்ட மனுக்களை மட்டுமே மீண்டும் திறக்க முடியும்.',
      ratePrompt: 'தீர்வுக்கு மதிப்பீடு வழங்கவும் (1 முதல் 5)',
      thanks: 'தங்களின் மேலான கருத்துகளுக்கு நன்றி.',
      dupTitle: 'புகார் ஏற்கனவே பதிவாகியுள்ளது',
      dupBody: 'இந்த பகுதியில் இதே போன்ற புகார் ஏற்கனவே பதிவாகி விசாரணையில் உள்ளது',
      addSupport: 'நானும் இந்த புகாரை ஆதரிக்கிறேன்',
      fileSep: 'புதிய புகாராகப் பதிவு செய்க',
      status: 'மனுவின் தற்போதைய நிலை',
      notFound: 'இந்த மனு எண்ணில் எந்த புகாரும் கண்டறியப்படவில்லை.',
      enterTrackId: 'தயவுசெய்து மனு எண்ணை உள்ளிடவும்.',
      otpHint: 'டெமோ OTP: ',
      welcome: 'வணக்கம்! உங்கள் பகுதியில் உள்ள பிரச்சினையைச் சொல்லுங்கள் — தெருவிளக்கு, குப்பை, குடிநீர், சாலை பள்ளம், எதுவானாலும்.',
      typing: 'உதவியாளர் பதிலை தயார் செய்கிறது...',
      assistantPrefix: 'உதவியாளர்: ',
      citizenPrefix: 'நீங்கள்: ',
      sensitiveNote: 'இது முக்கியமான புகார் — உயர் அதிகாரிக்கு ரகசியமாக அனுப்பப்படும்.',
      locFound: 'இருப்பிட விவரம் இணைக்கப்பட்டது.',
      locFallback: 'இருப்பிட அனுமதி கிடைக்கவில்லை; பட்டியலிலிருந்து பகுதியைத் தேர்ந்தெடுக்கவும்.',
      progressLabel: 'மனு முன்னேற்ற நிலை',
      suggestedChipsLabel: 'பொதுவான புகார் வகைகள்',
    },
  };

  let categories = [
    { key: 'streetlight', ta: 'தெருவிளக்கு', en: 'Streetlight' },
    { key: 'garbage', ta: 'குப்பை / கழிவு', en: 'Garbage / Solid Waste' },
    { key: 'water_supply', ta: 'குடிநீர்', en: 'Water Supply' },
    { key: 'drainage', ta: 'மழைநீர் வடிகால்', en: 'Storm Water Drain' },
    { key: 'sewage', ta: 'கழிவுநீர் / சாக்கடை', en: 'Sewage' },
    { key: 'road', ta: 'சாலை / பள்ளம்', en: 'Road / Pothole' },
    { key: 'other', ta: 'மற்றவை', en: 'Other' },
  ];

  let wards = [
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

  // Runtime state (session token held strictly in module memory)
  let lang = 'ta';
  let phone = '';
  let authToken = '';
  let demoCode = '';
  let selectedSeverity = 'medium';
  let attachedGps = null;
  const sid = 'sess-' + generateSessionId();

  // DOM references
  const ltaBtn = document.getElementById('lta');
  const lenBtn = document.getElementById('len');
  const hSub = document.getElementById('hSub');
  const alertBanner = document.getElementById('alertBanner');
  const statusBanner = document.getElementById('statusBanner');
  const srAnnouncer = document.getElementById('srAnnouncer');

  const authSection = document.getElementById('authSection');
  const chatSection = document.getElementById('chatSection');
  const trackSection = document.getElementById('trackSection');

  const otpRequestForm = document.getElementById('otpRequestForm');
  const otpVerifyForm = document.getElementById('otpVerifyForm');
  const phoneInput = document.getElementById('phone');
  const otpInput = document.getElementById('otp');
  const otpHint = document.getElementById('otpHint');
  const showTrackBtn = document.getElementById('showTrackBtn');

  const logEl = document.getElementById('log');
  const postChatEl = document.getElementById('postChat');
  const composerForm = document.getElementById('composerForm');
  const inpEl = document.getElementById('inp');

  const trackForm = document.getElementById('trackForm');
  const tidInput = document.getElementById('tid');
  const trackOutEl = document.getElementById('trackOut');
  const backHomeBtn = document.getElementById('backHomeBtn');

  function generateSessionId() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(12);
      window.crypto.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return String(Date.now());
  }

  function tr(key) {
    return (T[lang] && T[lang][key]) || T.en[key] || key;
  }

  function clearBanners() {
    alertBanner.classList.add('hidden');
    alertBanner.textContent = '';
    statusBanner.classList.add('hidden');
    statusBanner.textContent = '';
  }

  function showError(message) {
    statusBanner.classList.add('hidden');
    alertBanner.textContent = message;
    alertBanner.classList.remove('hidden');
  }

  function showStatus(message) {
    alertBanner.classList.add('hidden');
    statusBanner.textContent = message;
    statusBanner.classList.remove('hidden');
    announce(message);
  }

  function announce(message) {
    srAnnouncer.textContent = '';
    window.setTimeout(() => {
      srAnnouncer.textContent = message;
    }, 30);
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

  function updateOtpHint() {
    otpHint.textContent = demoCode ? tr('otpHint') + demoCode : '';
  }

  function setLang(nextLang) {
    lang = nextLang === 'en' ? 'en' : 'ta';
    document.documentElement.lang = lang;
    ltaBtn.setAttribute('aria-pressed', String(lang === 'ta'));
    lenBtn.setAttribute('aria-pressed', String(lang === 'en'));
    hSub.textContent =
      lang === 'ta'
        ? 'கோயம்புத்தூர் · குடிமக்கள் குறைதீர் உதவியாளர்'
        : 'Coimbatore · Civic Grievance Assistant';

    document.querySelectorAll('[data-t]').forEach((node) => {
      node.textContent = tr(node.dataset.t);
    });
    document.querySelectorAll('[data-tph]').forEach((node) => {
      node.setAttribute('placeholder', tr(node.dataset.tph));
    });
    updateOtpHint();
  }

  async function api(path, body, method = 'POST') {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers.Authorization = 'Bearer ' + authToken;
    }
    const opts = { method, headers };
    if (body !== undefined && body !== null && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(path, opts);
    let data = {};
    try {
      data = await resp.json();
    } catch (_err) {
      data = {};
    }
    if (!resp.ok) {
      const err = new Error(data.detail || tr('networkErr'));
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  async function syncMeta() {
    try {
      const meta = await api('/api/v1/meta', null, 'GET');
      if (Array.isArray(meta.categories) && meta.categories.length > 0) {
        categories = meta.categories;
      }
      if (Array.isArray(meta.wards) && meta.wards.length > 0) {
        wards = meta.wards;
      }
    } catch (_err) {
      // Fallback lists remain active offline.
    }
  }

  // ---- Step 1: OTP auth ----
  async function handleOtpRequest(event) {
    event.preventDefault();
    clearBanners();
    const cleaned = phoneInput.value.replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 15) {
      phoneInput.setAttribute('aria-invalid', 'true');
      showError(tr('invalidPhone'));
      phoneInput.focus();
      return;
    }
    phoneInput.setAttribute('aria-invalid', 'false');
    phone = cleaned;

    try {
      const data = await api('/api/v1/auth/request-otp', { phone });
      demoCode = data.demo_code || '';
      otpVerifyForm.classList.remove('hidden');
      updateOtpHint();
      showStatus(tr('otpSent'));
      otpInput.focus();
    } catch (err) {
      showError(err.message || tr('networkErr'));
    }
  }

  async function handleOtpVerify(event) {
    event.preventDefault();
    clearBanners();
    const code = otpInput.value.trim();
    if (!code) {
      otpInput.setAttribute('aria-invalid', 'true');
      showError(tr('invalidOtp'));
      otpInput.focus();
      return;
    }
    otpInput.setAttribute('aria-invalid', 'false');

    try {
      const data = await api('/api/v1/auth/verify-otp', { phone, code });
      if (!data.verified) {
        showError(tr('otpFailed'));
        return;
      }
      authToken = data.token || '';
      authSection.classList.add('hidden');
      chatSection.classList.remove('hidden');
      addMessage('b', tr('welcome'));
      renderSuggestionChips();
      inpEl.focus();
    } catch (_err) {
      otpInput.setAttribute('aria-invalid', 'true');
      showError(tr('otpFailed'));
      otpInput.focus();
    }
  }

  // ---- Step 2: Chat intake ----
  function addMessage(who, text) {
    const row = el('div', { className: 'msg ' + who });
    const bubble = el('div', { className: 'bub' });
    const prefix = el(
      'span',
      { className: 'sr-only' },
      who === 'b' ? tr('assistantPrefix') : tr('citizenPrefix')
    );
    bubble.appendChild(prefix);
    bubble.appendChild(document.createTextNode(text));
    row.appendChild(bubble);
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setTyping(active) {
    const existing = document.getElementById('typingIndicator');
    if (active && !existing) {
      const row = el('div', {
        id: 'typingIndicator',
        className: 'msg b',
        role: 'status',
      });
      const bubble = el('div', { className: 'bub dots' });
      bubble.appendChild(el('span', { className: 'sr-only' }, tr('typing')));
      for (let i = 0; i < 3; i += 1) {
        bubble.appendChild(el('span', { 'aria-hidden': 'true' }));
      }
      row.appendChild(bubble);
      logEl.appendChild(row);
      logEl.scrollTop = logEl.scrollHeight;
    } else if (!active && existing) {
      existing.remove();
    }
  }

  function renderSuggestionChips() {
    const wrap = el('div', {
      className: 'chips',
      role: 'group',
      'aria-label': tr('suggestedChipsLabel'),
    });
    const examples =
      lang === 'ta'
        ? ['தெருவிளக்கு எரியல', 'குப்பை அள்ளல', 'தண்ணி வரல', 'ரோட்ல பள்ளம்']
        : ['streetlight not working', 'garbage not collected', 'no water supply', 'pothole on road'];

    examples.forEach((sample) => {
      const chip = el('button', { type: 'button', className: 'chip' }, sample);
      chip.addEventListener('click', () => {
        wrap.remove();
        sendMessage(sample);
      });
      wrap.appendChild(chip);
    });
    postChatEl.appendChild(wrap);
  }

  async function sendMessage(presetText) {
    clearBanners();
    const text = (presetText !== undefined ? presetText : inpEl.value).trim();
    if (!text) return;

    const existingChips = postChatEl.querySelector('.chips');
    if (existingChips) existingChips.remove();

    inpEl.value = '';
    addMessage('u', text);
    setTyping(true);

    try {
      const res = await api('/api/v1/intake/message', {
        session_id: sid,
        ui_language: lang,
        text,
      });
      setTyping(false);
      addMessage('b', res.assistant_message);
      if (res.mode === 'confirm') {
        renderConfirmCard(res.draft || {});
      } else {
        inpEl.focus();
      }
    } catch (err) {
      setTyping(false);
      showError(err.message || tr('networkErr'));
    }
  }

  function renderConfirmCard(draft) {
    composerForm.classList.add('hidden');
    postChatEl.textContent = '';
    selectedSeverity = draft.severity || 'medium';
    attachedGps = null;

    const panel = el('section', { className: 'panel', 'aria-labelledby': 'confirmHeading' });
    const heading = el('h2', { id: 'confirmHeading', tabindex: '-1' }, tr('review'));
    panel.appendChild(heading);

    const form = el('form', { id: 'confirmForm', novalidate: '' });

    // Category field
    const catField = el('div', { className: 'field' });
    catField.appendChild(el('label', { for: 'fCat' }, tr('cat')));
    const catSelect = el('select', { id: 'fCat', name: 'category', required: '' });
    categories.forEach((c) => {
      const opt = el('option', { value: c.key }, `${c.ta} · ${c.en}`);
      if (draft.category === c.key) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catField.appendChild(catSelect);
    form.appendChild(catField);

    // Ward + Location button
    const wardField = el('div', { className: 'field' });
    wardField.appendChild(el('label', { for: 'fWard' }, tr('ward')));
    const wardRow = el('div', { className: 'row' });
    const wardSelect = el('select', { id: 'fWard', name: 'ward', className: 'row-grow' });
    wardSelect.appendChild(el('option', { value: '' }, '—'));
    wards.forEach((w) => {
      const opt = el('option', { value: w }, w);
      if (draft.ward === w) opt.selected = true;
      wardSelect.appendChild(opt);
    });
    const locBtn = el('button', { type: 'button', className: 'btn ghost' });
    locBtn.appendChild(el('span', { 'aria-hidden': 'true' }, '📍'));
    locBtn.appendChild(document.createTextNode(' ' + tr('shareLoc')));
    locBtn.addEventListener('click', () => handleUseLocation(wardSelect));
    wardRow.appendChild(wardSelect);
    wardRow.appendChild(locBtn);
    wardField.appendChild(wardRow);
    form.appendChild(wardField);

    // Landmark
    const lmField = el('div', { className: 'field' });
    lmField.appendChild(el('label', { for: 'fLm' }, tr('landmark')));
    const lmInput = el('input', { id: 'fLm', name: 'landmark', type: 'text' });
    lmInput.value = draft.landmark || '';
    lmField.appendChild(lmInput);
    form.appendChild(lmField);

    // Description
    const descField = el('div', { className: 'field' });
    descField.appendChild(el('label', { for: 'fDesc' }, tr('desc')));
    const descArea = el('textarea', { id: 'fDesc', name: 'description', rows: '3', required: '' });
    descArea.value = draft.description || '';
    descField.appendChild(descArea);
    form.appendChild(descField);

    // Severity radio group
    const sevFieldset = el('fieldset');
    sevFieldset.appendChild(el('legend', { className: 'field-legend' }, tr('sev')));
    const segGroup = el('div', {
      id: 'fSev',
      className: 'seg',
      role: 'radiogroup',
      'aria-label': tr('sev'),
    });
    const levels = ['low', 'medium', 'high'];
    const sevButtons = [];
    levels.forEach((level, idx) => {
      const checked = selectedSeverity === level;
      const btn = el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(checked),
          tabindex: checked ? '0' : '-1',
          'data-sev': level,
        },
        tr(level)
      );
      btn.addEventListener('click', () => selectSeverity(level, sevButtons));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = (idx + 1) % levels.length;
          selectSeverity(levels[next], sevButtons);
          sevButtons[next].focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = (idx - 1 + levels.length) % levels.length;
          selectSeverity(levels[prev], sevButtons);
          sevButtons[prev].focus();
        }
      });
      sevButtons.push(btn);
      segGroup.appendChild(btn);
    });
    sevFieldset.appendChild(segGroup);
    form.appendChild(sevFieldset);

    // Sensitivity notice
    if (draft.sensitivity === 'sensitive') {
      const warn = el('div', { className: 'warn', role: 'note' });
      warn.appendChild(el('span', { 'aria-hidden': 'true' }, '🔒 '));
      warn.appendChild(document.createTextNode(tr('sensitiveNote')));
      form.appendChild(warn);
    }

    const submitBtn = el('button', { type: 'submit', className: 'btn full mt' }, tr('fileBtn'));
    form.appendChild(submitBtn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitGrievance(null, false);
    });

    panel.appendChild(form);
    postChatEl.appendChild(panel);
    heading.focus();
  }

  function selectSeverity(level, buttons) {
    selectedSeverity = level;
    buttons.forEach((btn) => {
      const active = btn.dataset.sev === level;
      btn.setAttribute('aria-checked', String(active));
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
  }

  function handleUseLocation(wardSelect) {
    if (!navigator.geolocation) {
      showStatus(tr('locFallback'));
      wardSelect.focus();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        attachedGps = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        if (!wardSelect.value && wards.length > 0) {
          wardSelect.value = wards[0];
        }
        showStatus(tr('locFound'));
      },
      () => {
        showStatus(tr('locFallback'));
        wardSelect.focus();
      },
      { timeout: 6000 }
    );
  }

  async function submitGrievance(supportId, bypassDedup) {
    clearBanners();
    const catEl = document.getElementById('fCat');
    const wardEl = document.getElementById('fWard');
    const descEl = document.getElementById('fDesc');
    const lmEl = document.getElementById('fLm');
    if (!catEl || !wardEl || !descEl || !lmEl) return;

    const cat = catEl.value;
    const ward = wardEl.value;
    const desc = descEl.value.trim();
    const landmark = lmEl.value.trim();

    if (!cat || (!ward && !landmark) || !desc) {
      descEl.setAttribute('aria-invalid', String(!desc));
      showError(tr('need'));
      (!desc ? descEl : wardEl).focus();
      return;
    }

    const payload = {
      session_id: sid,
      ui_language: lang,
      reporter_phone: phone,
      category: cat,
      ward: ward || null,
      landmark: landmark || null,
      description: desc,
      severity: selectedSeverity || 'medium',
      gps: attachedGps,
    };
    if (supportId) payload.add_support_to = supportId;
    if (bypassDedup) payload.bypass_dedup = true;

    try {
      const res = await api('/api/v1/grievances', payload);
      if (res.duplicate) {
        renderDuplicateCard(res);
        return;
      }
      renderSlip(res, Boolean(supportId));
    } catch (err) {
      showError(err.message || tr('networkErr'));
    }
  }

  function renderDuplicateCard(dup) {
    postChatEl.textContent = '';
    const box = el('section', { className: 'warn', 'aria-labelledby': 'dupHeading' });
    const heading = el('h2', { id: 'dupHeading', tabindex: '-1' }, tr('dupTitle'));
    const body = el('p', null, `${tr('dupBody')} (#${dup.existing_id}).`);
    const actions = el('div', { className: 'row mt' });

    const supportBtn = el('button', { type: 'button', className: 'btn row-grow' }, tr('addSupport'));
    supportBtn.addEventListener('click', () => submitGrievance(dup.existing_id, false));

    const sepBtn = el('button', { type: 'button', className: 'btn ghost row-grow' }, tr('fileSep'));
    sepBtn.addEventListener('click', () => submitGrievance(null, true));

    actions.appendChild(supportBtn);
    actions.appendChild(sepBtn);
    box.appendChild(heading);
    box.appendChild(body);
    box.appendChild(actions);
    postChatEl.appendChild(box);
    heading.focus();
  }

  function renderSlip(grievance, isSupport) {
    composerForm.classList.add('hidden');
    postChatEl.textContent = '';

    const slip = el('section', { className: 'slip', 'aria-labelledby': 'slipHeading' });
    const head = el('div', { className: 'slip-head' });
    const idWrap = el('div');
    idWrap.appendChild(
      el('p', { className: 'muted' }, isSupport ? tr('supportAdded') : tr('filedNew'))
    );
    const idHeading = el('h2', { id: 'slipHeading', className: 'grievance-id', tabindex: '-1' }, grievance.id);
    idWrap.appendChild(idHeading);

    const sevClass = { low: 'b-low', medium: 'b-medium', high: 'b-high' }[grievance.severity] || 'b-medium';
    const sevBadge = el('span', { className: 'pill ' + sevClass }, tr(grievance.severity));
    head.appendChild(idWrap);
    head.appendChild(sevBadge);
    slip.appendChild(head);

    const dl = el('dl', { className: 'kv-grid' });
    const catText = grievance.category
      ? `${grievance.category.ta} · ${grievance.category.en}`
      : '—';
    appendKv(dl, tr('type'), catText);
    appendKv(dl, tr('dept'), grievance.dept || '—');
    appendKv(dl, tr('area'), grievance.ward || '—');
    if (grievance.reporter_count > 1) {
      appendKv(dl, tr('reporters'), String(grievance.reporter_count));
    }
    slip.appendChild(dl);

    // Status progress timeline
    const order = ['registered', 'assigned', 'in_progress', 'resolved'];
    const curIndex = Math.max(order.indexOf(grievance.status), 0);
    const timeline = el('ol', { className: 'tl', 'aria-label': tr('progressLabel') });
    order.forEach((stepName, idx) => {
      const li = el('li', {
        className: idx <= curIndex ? 'on' : '',
        'aria-current': idx === curIndex ? 'step' : null,
      });
      li.appendChild(el('span', { className: 'dot', 'aria-hidden': 'true' }));
      li.appendChild(document.createTextNode(stepName.replace('_', ' ')));
      timeline.appendChild(li);
    });
    slip.appendChild(timeline);

    slip.appendChild(el('p', { className: 'muted center mt' }, tr('slaNote')));

    // Accessible 1-5 rating section
    const rateField = el('div', { className: 'field' });
    rateField.appendChild(el('p', { className: 'field-legend', id: 'rateLabel' }, tr('ratePrompt')));
    const rateGroup = el('div', {
      className: 'rating-group',
      role: 'group',
      'aria-labelledby': 'rateLabel',
    });
    [1, 2, 3, 4, 5].forEach((stars) => {
      const rBtn = el(
        'button',
        {
          type: 'button',
          className: 'rating-btn',
          'aria-pressed': 'false',
          'aria-label': `${stars} / 5`,
        },
        `${stars} ★`
      );
      rBtn.addEventListener('click', () => submitRating(grievance.id, stars, rateGroup));
      rateGroup.appendChild(rBtn);
    });
    rateField.appendChild(rateGroup);
    slip.appendChild(rateField);

    // Action buttons
    const actions = el('div', { className: 'row mt' });
    const reopenBtn = el('button', { type: 'button', className: 'btn ghost row-grow' }, tr('reopen'));
    reopenBtn.addEventListener('click', () => handleReopen(grievance.id));
    actions.appendChild(reopenBtn);
    slip.appendChild(actions);

    const anotherBtn = el('button', { type: 'button', className: 'btn full mt' }, tr('another'));
    anotherBtn.addEventListener('click', () => window.location.reload());
    slip.appendChild(anotherBtn);

    postChatEl.appendChild(slip);
    announce(`${tr('filedNew')}: ${grievance.id}`);
    idHeading.focus();
  }

  function appendKv(dl, label, value) {
    dl.appendChild(el('dt', null, label));
    dl.appendChild(el('dd', null, value));
  }

  async function handleReopen(gid) {
    clearBanners();
    try {
      await api(`/api/v1/grievances/${encodeURIComponent(gid)}/reopen`, {});
      showStatus(tr('reopenedMsg'));
    } catch (err) {
      showError(err.message || tr('reopenErr'));
    }
  }

  async function submitRating(gid, stars, groupEl) {
    clearBanners();
    try {
      await api(`/api/v1/grievances/${encodeURIComponent(gid)}/feedback`, {
        rating: stars,
        comment: '',
      });
      groupEl.querySelectorAll('button').forEach((btn, idx) => {
        btn.setAttribute('aria-pressed', String(idx + 1 === stars));
        btn.disabled = true;
      });
      showStatus(tr('thanks'));
    } catch (err) {
      showError(err.message || tr('networkErr'));
    }
  }

  // ---- Step 3: Track grievance ----
  function openTrackView() {
    clearBanners();
    authSection.classList.add('hidden');
    trackSection.classList.remove('hidden');
    tidInput.focus();
  }

  async function handleTrackSubmit(event) {
    event.preventDefault();
    clearBanners();
    trackOutEl.textContent = '';

    const gid = tidInput.value.trim();
    if (!gid) {
      tidInput.setAttribute('aria-invalid', 'true');
      showError(tr('enterTrackId'));
      tidInput.focus();
      return;
    }
    tidInput.setAttribute('aria-invalid', 'false');

    try {
      const res = await api(`/api/v1/grievances/${encodeURIComponent(gid)}`, null, 'GET');
      const card = el('article', { className: 'slip' });
      card.appendChild(el('h3', { className: 'grievance-id' }, res.id));

      const statusLine = el('p', { className: 'mt' });
      statusLine.appendChild(document.createTextNode(`${tr('status')}: `));
      statusLine.appendChild(el('strong', null, res.status));
      card.appendChild(statusLine);

      const meta = [res.category ? res.category.en : '', res.dept || '', res.ward || '']
        .filter(Boolean)
        .join(' · ');
      card.appendChild(el('p', { className: 'muted' }, meta));
      trackOutEl.appendChild(card);
      announce(`${res.id}: ${res.status}`);
    } catch (_err) {
      const warn = el('div', { className: 'warn', role: 'status' }, tr('notFound'));
      trackOutEl.appendChild(warn);
    }
  }

  // ---- Event bindings (CSP-safe, zero inline handlers) ----
  ltaBtn.addEventListener('click', () => setLang('ta'));
  lenBtn.addEventListener('click', () => setLang('en'));
  otpRequestForm.addEventListener('submit', handleOtpRequest);
  otpVerifyForm.addEventListener('submit', handleOtpVerify);
  showTrackBtn.addEventListener('click', openTrackView);
  composerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });
  inpEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  trackForm.addEventListener('submit', handleTrackSubmit);
  backHomeBtn.addEventListener('click', () => window.location.reload());

  // Initialize
  setLang('ta');
  syncMeta();
})();
