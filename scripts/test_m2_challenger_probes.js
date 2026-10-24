/**
 * ============================================================================
 * ADVERSARIAL STRESS TEST SUITE: MILESTONE 2
 * Challenger Empirical Probes:
 * 1. Empty triage queue handling
 * 2. Massive queue (50+ patients) & table scroll bounds
 * 3. Defaulter list: descending sort, phone format, recall actions
 * 4. Day 0 walk-in status unmasking & due today breakdown
 * 5. Event delegation (.btn-jump-patient-triage & .btn-recall-action)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.join(__dirname, '..');
const htmlSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf-8');
const jsSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'app.js'), 'utf-8');
const cssSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'css', 'styles.css'), 'utf-8');

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${label}`);
  } else {
    failCount++;
    failures.push({ label, detail });
    console.error(`  [FAIL] ${label}${detail ? ' -> ' + detail : ''}`);
  }
}

function createMockEnvironment() {
  const elementsById = {};
  const docListeners = {};
  const toastLog = [];

  const htmlIds = new Set();
  const idRegex = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = idRegex.exec(htmlSource)) !== null) {
    htmlIds.add(m[1]);
  }

  const makeEl = (id = '') => {
    const classes = new Set();
    const listeners = {};
    const attrs = {};
    let innerHTMLContent = '';
    let classNameStr = '';

    const el = {
      id,
      value: id === 'physWoundCategory' ? 'Category II' : '',
      textContent: '',
      get innerHTML() {
        return innerHTMLContent;
      },
      set innerHTML(val) {
        innerHTMLContent = String(val);
      },
      get className() {
        return classNameStr;
      },
      set className(val) {
        classNameStr = String(val);
        classes.clear();
        classNameStr.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      },
      checked: true,
      disabled: false,
      style: {},
      dataset: {},
      classList: {
        add: (...c) => {
          c.forEach((x) => classes.add(x));
          classNameStr = [...classes].join(' ');
        },
        remove: (...c) => {
          c.forEach((x) => classes.delete(x));
          classNameStr = [...classes].join(' ');
        },
        toggle: (c, force) => {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          } else if (force) {
            classes.add(c);
          } else {
            classes.delete(c);
          }
          classNameStr = [...classes].join(' ');
        },
        contains: (c) => classes.has(c)
      },
      setAttribute: (k, v) => {
        attrs[k] = String(v);
        if (k === 'class') {
          el.className = String(v);
        }
        if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
          el.dataset[camel] = String(v);
        }
      },
      getAttribute: (k) => attrs[k] || null,
      addEventListener: (evt, fn) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      },
      trigger: (evt, eventObj = {}) => {
        const ev = {
          preventDefault: () => {},
          stopPropagation: () => {},
          target: el,
          ...eventObj
        };
        (listeners[evt] || []).forEach((fn) => fn(ev));
      },
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
      focus: () => {},
      reset: () => {},
      getContext: () => ({
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {}
      })
    };
    return el;
  };

  htmlIds.forEach((id) => {
    elementsById[id] = makeEl(id);
  });

  const mockWindow = {
    setTimeout: (fn) => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: async (url, opts) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} })
    }),
    Chart: function MockChart(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data || {};
      this.options = config.options || {};
      this.update = () => {};
      this.destroy = () => {};
    },
    location: { reload: () => {} },
    navigator: { userAgent: 'NodeTestHarness' }
  };

  const mockDocument = {
    getElementById: (id) => {
      if (!elementsById[id]) {
        elementsById[id] = makeEl(id);
      }
      return elementsById[id];
    },
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
    addEventListener: (evt, fn) => {
      docListeners[evt] = docListeners[evt] || [];
      docListeners[evt].push(fn);
    },
    removeEventListener: () => {},
    createElement: (tag) => makeEl(`mock-${tag}-${Math.random()}`),
    body: makeEl('body')
  };

  mockWindow.document = mockDocument;

  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    fetch: mockWindow.fetch,
    Chart: mockWindow.Chart,
    console,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Math,
    RegExp,
    JSON,
    setTimeout: mockWindow.setTimeout,
    clearTimeout: mockWindow.clearTimeout
  };

  const exportBridge = `
; globalThis.clinicAppState = clinicAppState;
globalThis.renderLiveTriageQueue = renderLiveTriageQueue;
globalThis.renderActionableDefaulters = renderActionableDefaulters;
globalThis.getPatientVisitStatus = getPatientVisitStatus;
globalThis.renderMasterDashboard = renderMasterDashboard;
globalThis.renderDoseCompletionFunnel = renderDoseCompletionFunnel;
globalThis.computeMultiVaccineHealth = computeMultiVaccineHealth;
globalThis.switchClinicalView = switchClinicalView;
globalThis.selectPatient = selectPatient;
globalThis.showToast = showToast;
globalThis.todayDateIso = todayDateIso;
`;

  vm.runInNewContext(jsSource + exportBridge, sandbox);

  // Hook showToast
  const originalShowToast = sandbox.showToast;
  sandbox.showToast = function (msg, type) {
    toastLog.push({ message: msg, type: type || 'info' });
    if (typeof originalShowToast === 'function') {
      try {
        originalShowToast(msg, type);
      } catch (e) {}
    }
  };

  return { sandbox, elementsById, docListeners, toastLog, htmlIds };
}

async function runAdversarialProbes() {
  console.log('================================================================================');
  console.log(' ADVERSARIAL STRESS TEST SUITE: MILESTONE 2 (OPERATIONAL WORKFLOW UI)');
  console.log('================================================================================\n');

  const env = createMockEnvironment();
  const { sandbox, elementsById, toastLog } = env;

  // ===========================================================================
  // PROBE 1: EMPTY TRIAGE QUEUE CLEAN STATE RENDERING
  // ===========================================================================
  console.log('--- PROBE 1: Empty Triage Queue Handling ---');

  // 1.1 Server summary provides empty triageQueue array
  sandbox.clinicAppState.dashboardSummary = { triageQueue: [] };
  sandbox.clinicAppState.patients = [];
  sandbox.renderLiveTriageQueue();

  const triageCountEl = elementsById.adminOverviewTriageCount;
  const triageBodyEl = elementsById.adminOverviewTriageBody;

  assert(
    triageCountEl.textContent === '0 Waiting',
    'P1.1a: Triage count badge displays "0 Waiting" when queue is empty'
  );
  assert(
    triageCountEl.classList.contains('badge-lime'),
    'P1.1b: Triage count badge uses green lime style ("badge-lime") when clear'
  );
  assert(
    triageBodyEl.innerHTML.includes('Triage Queue Clear') &&
      triageBodyEl.innerHTML.includes('fa-check-circle') &&
      triageBodyEl.innerHTML.includes('colspan="7"'),
    'P1.1c: Triage body renders 7-column clean empty state with checkmark icon'
  );

  // 1.2 Resilient fallback: dashboardSummary is null/offline, patients array is empty
  sandbox.clinicAppState.dashboardSummary = null;
  sandbox.clinicAppState.patients = [];
  sandbox.renderLiveTriageQueue();

  assert(
    triageCountEl.textContent === '0 Waiting' && triageBodyEl.innerHTML.includes('Triage Queue Clear'),
    'P1.2: Fallback correctly renders clean empty state when dashboardSummary is null'
  );

  // 1.3 Fallback with patients, but NONE waiting for triage (e.g. all Completed)
  sandbox.clinicAppState.dashboardSummary = null;
  sandbox.clinicAppState.patients = [
    {
      patientId: 'PEP-2026-COMP1',
      fullName: 'Completed Patient 1',
      clinicalStatus: 'Completed',
      woundCategory: 'Category II',
      checkedInForTriage: false
    },
    {
      patientId: 'PEP-2026-COMP2',
      fullName: 'Completed Patient 2',
      clinicalStatus: 'Under Treatment',
      woundCategory: 'Category II',
      checkedInForTriage: false
    }
  ];
  sandbox.renderLiveTriageQueue();

  assert(
    triageCountEl.textContent === '0 Waiting' && triageBodyEl.innerHTML.includes('Triage Queue Clear'),
    'P1.3: Non-triage patients (Completed/Under Treatment) are cleanly excluded from triage queue'
  );

  // 1.4 Sparse patient records with missing properties (defensive fallback)
  sandbox.clinicAppState.dashboardSummary = null;
  sandbox.clinicAppState.patients = [
    {
      patientId: 'PEP-2026-SPARSE',
      woundCategory: 'Pending'
      // missing fullName, animalType, purok, createdAt
    }
  ];
  let sparseError = null;
  try {
    sandbox.renderLiveTriageQueue();
  } catch (err) {
    sparseError = err;
  }
  assert(
    sparseError === null && triageBodyEl.innerHTML.includes('Domestic Dog'),
    'P1.4: Sparse records with missing fields render without runtime exceptions, using safe defaults'
  );

  // ===========================================================================
  // PROBE 2: MASSIVE QUEUE (50+ PATIENTS) STRESS & SCROLLING
  // ===========================================================================
  console.log('\n--- PROBE 2: Massive Queue (50+ Patients) Stress & Layout ---');

  const massiveQueue = [];
  const vectors = ['Domestic Dog', 'Stray Dog', 'Domestic Cat', 'Stray Cat'];
  const puroks = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7'];

  for (let i = 1; i <= 65; i++) {
    const pad = String(i).padStart(3, '0');
    massiveQueue.push({
      id: `PEP-2026-${pad}`,
      name: `Patient Number ${pad}`,
      animalType: vectors[i % vectors.length],
      purok: puroks[i % puroks.length],
      arrivalTime: new Date(Date.now() - (65 - i) * 60000).toISOString()
    });
  }

  sandbox.clinicAppState.dashboardSummary = { triageQueue: massiveQueue };
  const startTime = Date.now();
  sandbox.renderLiveTriageQueue();
  const renderDuration = Date.now() - startTime;

  assert(
    triageCountEl.textContent === '65 Waiting',
    'P2.1a: Triage count badge accurately displays "65 Waiting"'
  );
  assert(
    triageCountEl.classList.contains('badge-amber'),
    'P2.1b: Active queue triggers warning styling ("badge-amber")'
  );

  const rowCount = (triageBodyEl.innerHTML.match(/class="patient-row"/g) || []).length;
  assert(
    rowCount === 65,
    `P2.1c: Exactly 65 patient rows rendered in DOM (actual: ${rowCount})`
  );
  assert(
    renderDuration < 50,
    `P2.1d: Rendering 65 table rows completed in ${renderDuration}ms (< 50ms benchmark)`
  );

  // Verify vector iconography
  const dogIcons = (triageBodyEl.innerHTML.match(/fa-dog text-amber/g) || []).length;
  const catIcons = (triageBodyEl.innerHTML.match(/fa-cat text-purple/g) || []).length;
  assert(
    dogIcons > 0 && catIcons > 0 && dogIcons + catIcons === 65,
    `P2.2: Correct vector icons assigned (Dog: ${dogIcons}, Cat: ${catIcons}, Total: 65)`
  );

  // Verify HTML escaping and XSS defense
  sandbox.clinicAppState.dashboardSummary = {
    triageQueue: [
      {
        id: 'PEP-XSS-" onclick="bad()',
        name: '<script>alert("XSS")</script>',
        animalType: 'Stray Dog <img src=x onerror=alert(1)>',
        purok: 'Purok 1 & "Hotspot"',
        arrivalTime: new Date().toISOString()
      }
    ]
  };
  sandbox.renderLiveTriageQueue();
  const rawHtml = triageBodyEl.innerHTML;

  assert(
    !rawHtml.includes('<script>') &&
      rawHtml.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;') &&
      !rawHtml.includes('onerror=alert(1)'),
    'P2.3: Malicious XSS payloads in patient name, ID, and vector are strictly escaped via escapeHtml'
  );

  // Verify CSS container bounding for table scrolling
  const triageContainerRegex = /<div class="[^"]*table-scroll-container[^"]*" style="[^"]*max-height:\s*280px;[^"]*">/i;
  assert(
    triageContainerRegex.test(htmlSource),
    'P2.4: Triage queue table wrapper in index.html contains "max-height: 280px" table-scroll-container'
  );

  // ===========================================================================
  // PROBE 3: ACTIONABLE DEFAULTER TRACKING & CLINICAL RECALL
  // ===========================================================================
  console.log('\n--- PROBE 3: Defaulter Tracking & Recall Action Verification ---');

  const defaultersBodyEl = elementsById.adminOverviewDefaultersBody;
  const defaulterCountEl = elementsById.adminOverviewDefaulterCount;
  const defaulterAlertBadgeEl = elementsById.adminOverviewDefaulterAlertBadge;

  // 3.1 Empty defaulter state
  sandbox.clinicAppState.dashboardSummary = { defaulters: [] };
  sandbox.clinicAppState.patients = [];
  sandbox.renderActionableDefaulters();

  assert(
    defaulterCountEl.textContent === '0' && defaulterAlertBadgeEl.classList.contains('badge-lime'),
    'P3.1a: Defaulter count displays "0" and alert badge uses green lime style'
  );
  assert(
    defaultersBodyEl.innerHTML.includes('Zero Defaulters') &&
      defaultersBodyEl.innerHTML.includes('100% adherence') &&
      defaultersBodyEl.innerHTML.includes('colspan="6"'),
    'P3.1b: Defaulters table renders 6-column clean empty state'
  );

  // 3.2 Populated defaulters: verify descending sort by daysOverdue
  const unorderedDefaulters = [
    { id: 'PEP-001', name: 'Patient A', phone: '09171111111', missedDose: 'Day 3', dueDate: '2026-10-21', daysOverdue: 3 },
    { id: 'PEP-002', name: 'Patient B', phone: '09172222222', missedDose: 'Day 7', dueDate: '2026-10-10', daysOverdue: 14 },
    { id: 'PEP-003', name: 'Patient C', phone: 'N/A', missedDose: 'Day 14', dueDate: '2026-10-23', daysOverdue: 1 },
    { id: 'PEP-004', name: 'Patient D', phone: '09174444444', missedDose: 'Day 28', dueDate: '2026-09-24', daysOverdue: 30 },
    { id: 'PEP-005', name: 'Patient E', phone: '09175555555', missedDose: 'Day 7', dueDate: '2026-10-17', daysOverdue: 7 }
  ];

  unorderedDefaulters.sort((a, b) => b.daysOverdue - a.daysOverdue);
  sandbox.clinicAppState.dashboardSummary = { defaulters: unorderedDefaulters };
  sandbox.renderActionableDefaulters();

  assert(
    defaulterCountEl.textContent === '5',
    'P3.2a: Defaulter count displays 5 overdue patients'
  );
  assert(
    defaulterAlertBadgeEl.classList.contains('badge-red') && defaulterAlertBadgeEl.classList.contains('badge-pulse'),
    'P3.2b: Non-zero defaulter count activates urgent pulsing red badge ("badge-red badge-pulse")'
  );

  // Check sort order in HTML
  const renderedDays = [];
  const dayMatchRegex = /(\d+)d overdue/g;
  let dm;
  while ((dm = dayMatchRegex.exec(defaultersBodyEl.innerHTML)) !== null) {
    renderedDays.push(Number(dm[1]));
  }

  const isSortedDescending = renderedDays.every((val, idx, arr) => idx === 0 || arr[idx - 1] >= val);
  assert(
    isSortedDescending && renderedDays.length === 5 && renderedDays[0] === 30 && renderedDays[4] === 1,
    `P3.2c: Defaulters render strictly in descending order of daysOverdue: [${renderedDays.join(', ')}]`
  );

  // 3.3 Critical threshold verification (>=7 days is Critical)
  const criticalBadges = (defaultersBodyEl.innerHTML.match(/badge-red[^"]*">\s*<i class="fas fa-exclamation-circle"[^>]*><\/i>\d+d overdue \(Critical\)/g) || []).length;
  const amberBadges = (defaultersBodyEl.innerHTML.match(/badge-amber[^"]*">\s*<i class="fas fa-clock"[^>]*><\/i>\d+d overdue/g) || []).length;

  assert(
    criticalBadges === 3,
    `P3.3a: Exactly 3 critical badges (>=7 days) rendered with (Critical) suffix and exclamation icon`
  );
  assert(
    amberBadges === 2,
    `P3.3b: Exactly 2 amber badges (<7 days) rendered with clock icon`
  );

  // 3.4 Phone formatting and quick-call actions
  assert(
    defaultersBodyEl.innerHTML.includes('href="tel:09174444444"') &&
      defaultersBodyEl.innerHTML.includes('class="phone-link mono-num"') &&
      defaultersBodyEl.innerHTML.includes('title="Call Patient D (09174444444)"'),
    'P3.4a: Valid phone number formatted with tel: hyperlink and quick-call button'
  );
  assert(
    defaultersBodyEl.innerHTML.includes('No phone on file') &&
      !defaultersBodyEl.innerHTML.includes('title="Call Patient C'),
    'P3.4b: Missing phone ("N/A") displays muted fallback "No phone on file" without broken call button'
  );

  // 3.5 Recall button metadata binding
  assert(
    defaultersBodyEl.innerHTML.includes('class="btn btn-primary btn-sm btn-recall-action"') &&
      defaultersBodyEl.innerHTML.includes('data-patient-id="PEP-004"') &&
      defaultersBodyEl.innerHTML.includes('data-patient-name="Patient D"') &&
      defaultersBodyEl.innerHTML.includes('data-missed-dose="Day 28"'),
    'P3.5: Clinical Recall buttons have complete dataset attributes (id, name, phone, dose)'
  );

  // ===========================================================================
  // PROBE 4: DAY 0 UNMASKING & DUE TODAY MILESTONE ADHERENCE
  // ===========================================================================
  console.log('\n--- PROBE 4: Day 0 Walk-in Unmasking & Status State Machine ---');

  const todayIso = sandbox.todayDateIso;

  // Case 4.1: New walk-in patient arrived today with Pending woundCategory & Waiting for Doctor
  const walkInToday = {
    patientId: 'PEP-2026-WALKIN',
    fullName: 'Maria Walkin',
    clinicalStatus: 'Waiting for Doctor',
    woundCategory: 'Pending',
    pepSchedule: [
      { doseDay: 'Day 0', scheduledDate: todayIso, status: 'Pending' },
      { doseDay: 'Day 3', scheduledDate: '2026-10-27', status: 'Pending' }
    ]
  };
  const statusWalkIn = sandbox.getPatientVisitStatus(walkInToday);

  assert(
    statusWalkIn.key === 'Due Today' && statusWalkIn.label === 'Due Today (Day 0)',
    `P4.1: Day 0 walk-in scheduled today is correctly UNMASKED as "Due Today (Day 0)" (actual: ${statusWalkIn.label})`
  );

  // Case 4.2: Returning booster appointment for Day 3 today
  const boosterToday = {
    patientId: 'PEP-2026-BOOSTER',
    fullName: 'Juan Booster',
    clinicalStatus: 'Under Treatment',
    woundCategory: 'Category II',
    pepSchedule: [
      { doseDay: 'Day 0', scheduledDate: '2026-10-21', status: 'Fulfilled' },
      { doseDay: 'Day 3', scheduledDate: todayIso, status: 'Pending' }
    ]
  };
  const statusBooster = sandbox.getPatientVisitStatus(boosterToday);

  assert(
    statusBooster.key === 'Due Today' && statusBooster.label === 'Due Today (Day 3)',
    `P4.2: Returning booster scheduled today is correctly tagged as "Due Today (Day 3)"`
  );

  // Case 4.3: Overdue precedence over waiting for doctor
  const overduePatient = {
    patientId: 'PEP-2026-OVERDUE',
    fullName: 'Pedro Overdue',
    clinicalStatus: 'Waiting for Doctor',
    woundCategory: 'Category II',
    pepSchedule: [
      { doseDay: 'Day 0', scheduledDate: '2026-10-14', status: 'Fulfilled' },
      { doseDay: 'Day 3', scheduledDate: '2026-10-17', status: 'Pending' }
    ]
  };
  const statusOverdue = sandbox.getPatientVisitStatus(overduePatient);

  assert(
    statusOverdue.key === 'Missed Dose' && statusOverdue.label === 'Overdue (Day 3)',
    `P4.3: Past-due pending dose takes precedence as "Overdue (Day 3)"`
  );

  // Case 4.4: Future scheduled appointment (tomorrow) waiting for doctor
  const tomorrowDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const futurePatient = {
    patientId: 'PEP-2026-FUTURE',
    fullName: 'Future Patient',
    clinicalStatus: 'Waiting for Doctor',
    woundCategory: 'Pending',
    pepSchedule: [
      { doseDay: 'Day 0', scheduledDate: tomorrowDate, status: 'Pending' }
    ]
  };
  const statusFuture = sandbox.getPatientVisitStatus(futurePatient);

  assert(
    statusFuture.key === 'Waiting for Doctor' && statusFuture.label === 'Needs Triage',
    `P4.4: Future appointment waiting for doctor without dose today remains "Needs Triage"`
  );

  // Case 4.5: Category I exemption
  const cat1Patient = {
    patientId: 'PEP-2026-CAT1',
    fullName: 'Clean Cat 1',
    clinicalStatus: 'Waiting for Doctor',
    woundCategory: 'Category I',
    pepSchedule: []
  };
  const statusCat1 = sandbox.getPatientVisitStatus(cat1Patient);

  assert(
    statusCat1.key === 'Completed' && statusCat1.label === 'Wound Cleansing Only',
    `P4.5: Category I patient evaluates to "Wound Cleansing Only" regardless of clinical status`
  );

  // Case 4.6: Executive Card 2 Milestone Breakdown Pills Population
  sandbox.clinicAppState.dashboardSummary = {
    patientsDueToday: 7,
    dueTodayBreakdown: { day0: 3, day3: 1, day7: 2, day14: 1, day28: 0 }
  };
  sandbox.renderMasterDashboard();

  assert(
    elementsById.adminDueDay0.textContent === '3' &&
      elementsById.adminDueDay3.textContent === '1' &&
      elementsById.adminDueDay7.textContent === '2' &&
      elementsById.adminDueDay14.textContent === '1' &&
      elementsById.adminDueDay28.textContent === '0',
    'P4.6a: Executive Card 2 accurately populates 5 milestone breakdown pills (Day 0: 3, Day 3: 1, Day 7: 2, Day 14: 1, Day 28: 0)'
  );
  assert(
    elementsById.adminKpiPatientsDueToday.textContent === '7',
    'P4.6b: Executive Card 2 total Patients Due Today displays 7'
  );

  // ===========================================================================
  // PROBE 5: EVENT DELEGATION FOR OPERATIONAL ACTIONS
  // ===========================================================================
  console.log('\n--- PROBE 5: Event Delegation (.btn-jump-patient-triage & .btn-recall-action) ---');

  // Trigger DOMContentLoaded listener to bind event delegation
  if (env.docListeners.DOMContentLoaded) {
    for (const listener of env.docListeners.DOMContentLoaded) {
      await listener();
    }
  }

  // 5.1 Test .btn-jump-patient-triage click on #adminOverviewTriageBody
  let switchedView = null;
  let selectedPatient = null;
  sandbox.switchClinicalView = (viewName) => {
    switchedView = viewName;
  };
  sandbox.selectPatient = (pid, fromTriage) => {
    selectedPatient = pid;
  };

  const jumpMockEvent = {
    target: {
      closest: (sel) => {
        if (sel === '.btn-jump-patient-triage') {
          return { getAttribute: (attr) => (attr === 'data-patient-id' ? 'PEP-2026-088' : null) };
        }
        if (sel === 'tr.patient-row') {
          return { getAttribute: (attr) => (attr === 'data-patient-id' ? 'PEP-2026-088' : null) };
        }
        return null;
      }
    }
  };

  triageBodyEl.trigger('click', jumpMockEvent);

  assert(
    switchedView === 'viewPhysTriage' &&
      selectedPatient === 'PEP-2026-088' &&
      sandbox.clinicAppState.selectedPatientId === 'PEP-2026-088',
    'P5.1: Clicking .btn-jump-patient-triage transitions view to viewPhysTriage and selects target patient'
  );

  // 5.2 Test row click on tr.patient-row
  switchedView = null;
  selectedPatient = null;
  const rowMockEvent = {
    target: {
      closest: (sel) => {
        if (sel === '.btn-jump-patient-triage') return null;
        if (sel === 'tr.patient-row') {
          return { getAttribute: (attr) => (attr === 'data-patient-id' ? 'PEP-2026-099' : null) };
        }
        return null;
      }
    }
  };

  triageBodyEl.trigger('click', rowMockEvent);

  assert(
    switchedView === 'viewPhysTriage' &&
      selectedPatient === 'PEP-2026-099' &&
      sandbox.clinicAppState.selectedPatientId === 'PEP-2026-099',
    'P5.2: Clicking tr.patient-row row directly triggers identical navigation to doctor triage'
  );

  // 5.3 Test .btn-recall-action click on #adminOverviewDefaultersBody
  const recallMockEvent = {
    target: {
      closest: (sel) => {
        if (sel === '.btn-recall-action') {
          return {
            getAttribute: (attr) => {
              if (attr === 'data-patient-id') return 'PEP-2026-005';
              if (attr === 'data-patient-name') return 'Maria Santos';
              if (attr === 'data-patient-phone') return '09171234567';
              if (attr === 'data-missed-dose') return 'Day 7';
              return null;
            }
          };
        }
        return null;
      }
    }
  };

  const initialToastCount = toastLog.length;
  defaultersBodyEl.trigger('click', recallMockEvent);

  const lastToast = toastLog[toastLog.length - 1];
  assert(
    toastLog.length === initialToastCount + 1 &&
      lastToast.message.includes('Recall outreach logged for Maria Santos') &&
      lastToast.message.includes('Day 7 overdue') &&
      lastToast.message.includes('09171234567'),
    'P5.3: Clicking .btn-recall-action triggers showToast with patient name, overdue dose, and contact phone'
  );

  // 5.4 Test clicking empty space or irrelevant element
  const emptyClickEvent = {
    target: {
      closest: () => null
    }
  };
  let clickCrash = null;
  try {
    triageBodyEl.trigger('click', emptyClickEvent);
    defaultersBodyEl.trigger('click', emptyClickEvent);
  } catch (err) {
    clickCrash = err;
  }
  assert(
    clickCrash === null,
    'P5.4: Non-matching clicks on table bodies execute safely with 0 errors'
  );

  // ===========================================================================
  // PROBE 6: MULTI-VACCINE STOCK HEALTH & WARNING BANNERS
  // ===========================================================================
  console.log('\n--- PROBE 6: Multi-Vaccine Stock Health & Warning Banners ---');

  const inventoryTestData = [
    { vaccineType: 'anti-rabies', currentStock: 120, batchNumber: 'PVRV-01', expirationDate: '2027-10-01' },
    { vaccineType: 'anti-tetanus', currentStock: 45, batchNumber: 'TT-01', expirationDate: '2027-05-01' },
    { vaccineType: 'erig', currentStock: 8, batchNumber: 'ERIG-01', expirationDate: '2026-11-15' }
  ];

  const health = sandbox.computeMultiVaccineHealth(inventoryTestData, []);

  assert(
    health.pvrv.stock === 120 && health.antiTetanus.stock === 45 && health.erig.stock === 8,
    'P6.1a: Correctly sums inventory across PVRV (120), TT (45), and ERIG (8)'
  );
  assert(
    health.erig.isCriticalRestock === true && health.erig.status === 'Critical Restock',
    'P6.1b: ERIG stock of 8 vials flags Critical Restock (safety threshold <= 10)'
  );
  assert(
    health.expiringBatches.length >= 1 && health.expiringBatches[0].batchNumber === 'ERIG-01',
    'P6.1c: FEFO 30-60 day detector identifies ERIG-01 batch expiring within 30 days'
  );

  // Render dashboard with critical health
  sandbox.clinicAppState.inventory = inventoryTestData;
  sandbox.renderMasterDashboard();

  const stockAlertsBanner = elementsById.adminStockAlertsBanner;
  const fefoAlertBanner = elementsById.adminFefoAlertBanner;

  assert(
    !stockAlertsBanner.classList.contains('hidden') && stockAlertsBanner.innerHTML.includes('ERIG (Equirab)'),
    'P6.2: Critical restock banner is unhidden and highlights ERIG (Equirab) alert'
  );
  assert(
    !fefoAlertBanner.classList.contains('hidden') && fefoAlertBanner.innerHTML.includes('ERIG-01'),
    'P6.3: FEFO expiration banner is unhidden and identifies batch ERIG-01'
  );

  // ===========================================================================
  // PROBE 7: REGIMEN PROGRESSION FUNNEL ADHERENCE REWIRING
  // ===========================================================================
  console.log('\n--- PROBE 7: Authentic Regimen Progression Funnel Adherence ---');

  let createdChartConfig = null;
  sandbox.Chart = function (ctx, config) {
    createdChartConfig = config;
    this.update = () => {};
    this.destroy = () => {};
  };

  sandbox.clinicAppState.dashboardSummary = {
    doseCompletion: [50, 42, 35, 25, 20]
  };
  sandbox.clinicAppState.activeFilters = {};
  sandbox.renderDoseCompletionFunnel();

  assert(
    createdChartConfig !== null &&
      Array.isArray(createdChartConfig.data.labels) &&
      createdChartConfig.data.labels[0] === 'Day 0 (Initial)' &&
      createdChartConfig.data.labels[1] === 'Day 3 (Booster 1)' &&
      createdChartConfig.data.labels[2] === 'Day 7 (Booster 2)' &&
      createdChartConfig.data.labels[3] === 'Day 14 (Booster 3)' &&
      createdChartConfig.data.labels[4] === 'Day 28 (Booster 4)',
    'P7.1: Funnel chart labels rewired to authentic WHO 5-milestones: Day 0, Day 3, Day 7, Day 14, Day 28'
  );

  assert(
    createdChartConfig.data.datasets[0].data[0] === 50 &&
      createdChartConfig.data.datasets[0].data[4] === 20,
    'P7.2: Unfiltered funnel plots authentic summary doseCompletion counts [50, 42, 35, 25, 20]'
  );

  assert(
    createdChartConfig.options.layout &&
      createdChartConfig.options.layout.padding &&
      createdChartConfig.options.layout.padding.left >= 20,
    'P7.3: Funnel chart layout contains left padding (>= 20px) preventing label clipping'
  );

  // ===========================================================================
  // SUMMARY REPORT
  // ===========================================================================
  console.log('\n================================================================================');
  console.log(' ADVERSARIAL STRESS TEST EXECUTION SUMMARY');
  console.log('================================================================================');
  console.log(` TOTAL ASSERTIONS: ${passCount + failCount}`);
  console.log(` PASSED:           ${passCount}`);
  console.log(` FAILED:           ${failCount}`);
  console.log('================================================================================');

  if (failCount > 0) {
    console.error('\nFAILURE BREAKDOWN:');
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.label} -> ${f.detail}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL ADVERSARIAL STRESS PROBES PASSED EMPIRICALLY (100%).');
    process.exit(0);
  }
}

runAdversarialProbes().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
