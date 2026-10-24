/**
 * test_m2_adversarial.js
 * Adversarial Stress Testing Harness for Milestone 2:
 * Regimen Progression Funnel, Multi-Vaccine Health, Restock & FEFO Banners, and DOM Parity
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;
const results = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passCount++;
    results.push({ testName, status: 'PASS', detail });
    console.log(`  [PASS] ${testName}`);
  } else {
    failCount++;
    results.push({ testName, status: 'FAIL', detail });
    console.error(`  [FAIL] ${testName} -> ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Setup Mock Browser Environment
// ---------------------------------------------------------------------------
function createMockEnvironment() {
  const elementsById = {};
  const mockClassList = (el) => {
    const classes = new Set();
    return {
      add: (...cls) => cls.forEach((c) => classes.add(c)),
      remove: (...cls) => cls.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c))
    };
  };

  const createElement = (tag, id = '') => {
    const el = {
      tagName: tag.toUpperCase(),
      id,
      className: '',
      textContent: '',
      innerHTML: '',
      style: {},
      attributes: {},
      listeners: {},
      disabled: false,
      value: id.startsWith('globalFilter') ? 'All' : '',
      classList: null,
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
      getContext: (type) => ({
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        fillText: () => {},
        measureText: () => ({ width: 40 }),
        beginPath: () => {},
        arc: () => {},
        stroke: () => {},
        fill: () => {}
      }),
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      trigger(evt, payload = {}) {
        (this.listeners[evt] || []).forEach((fn) => fn({ target: this, preventDefault: () => {}, ...payload }));
      }
    };
    el.classList = mockClassList(el);
    if (id) elementsById[id] = el;
    return el;
  };

  // Mock Chart.js constructor
  const chartInstances = [];
  function MockChart(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.type = config.type;
    this.data = config.data;
    this.options = config.options;
    this.plugins = config.plugins || [];
    this.destroyed = false;
    this.destroy = () => {
      this.destroyed = true;
    };
    this.getDatasetMeta = (idx) => ({
      data: (this.data.datasets[idx]?.data || []).map((val, i) => ({
        x: 100 + i * 20,
        y: 50 + i * 30
      }))
    });
    chartInstances.push(this);
  }

  const document = {
    getElementById: (id) => elementsById[id] || (elementsById[id] = createElement('div', id)),
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement
  };

  return { document, elementsById, MockChart, chartInstances };
}

function initAppJsSandbox(customSetup = '') {
  const env = createMockEnvironment();
  const appJsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
  const sandbox = {
    window: { requestAnimationFrame: (fn) => fn() },
    document: env.document,
    Chart: env.MockChart,
    todayDateIso: '2026-10-24',
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(
    appJsCode +
      `\n; globalThis._testInterface = {
        setAppState: (updates) => Object.assign(clinicAppState, updates),
        getAppState: () => clinicAppState,
        renderDoseCompletionFunnel,
        renderMasterDashboard,
        computeMultiVaccineHealth,
        horizontalBarLabelPlugin,
        getDoseFunnelChart: () => doseFunnelChart
      };` +
      (customSetup ? `\n; ${customSetup}` : ''),
    sandbox
  );
  return { sandbox, env, testInterface: sandbox._testInterface };
}

// ---------------------------------------------------------------------------
// SUITE 1: doseFunnelChart Regimen Progression & Adherence Funnel Stress Test
// ---------------------------------------------------------------------------
function runSuite1() {
  console.log('\n--- SUITE 1: doseFunnelChart Regimen Progression & Adherence Funnel Stress ---');

  // Test 1.1: Zero adherence cohort [0, 0, 0, 0, 0]
  {
    const { testInterface } = initAppJsSandbox();
    testInterface.setAppState({
      patients: [],
      inventory: [],
      dashboardSummary: { doseCompletion: [0, 0, 0, 0, 0] }
    });

    testInterface.renderDoseCompletionFunnel();
    const chart = testInterface.getDoseFunnelChart();
    assert(chart != null, 'Funnel: Chart initialized with zero cohort [0,0,0,0,0]');
    assert(
      JSON.stringify(chart.data.datasets[0].data) === JSON.stringify([0, 0, 0, 0, 0]),
      'Funnel: Zero cohort dataset exact match [0,0,0,0,0]'
    );
    assert(chart.data.labels.length === 5, 'Funnel: Exactly 5 milestone labels rendered');

    // Run horizontalBarLabelPlugin afterDatasetsDraw to verify no NaN or error
    let textDrawCount = 0;
    let textOutput = [];
    chart.ctx = {
      save: () => {},
      restore: () => {},
      fillText: (str, x, y) => {
        textDrawCount++;
        textOutput.push(str);
      }
    };
    chart.plugins.forEach((p) => {
      if (p.afterDatasetsDraw) p.afterDatasetsDraw(chart);
    });
    assert(textDrawCount === 5, 'Funnel: Value labels drawn for all 5 zero milestone bars');
    assert(
      textOutput.every((t) => t === '0' && !t.includes('NaN') && !t.includes('undefined')),
      'Funnel: All labels render "0" with zero NaN / undefined'
    );

    // Verify Tooltip callback handles 0
    const tooltipLabelCb = chart.options.plugins.tooltip.callbacks.label;
    const ttRes = tooltipLabelCb({ raw: 0 });
    assert(
      ttRes === ' Completed Adherence: 0 patients',
      `Funnel: Tooltip for 0 raw returns correct string: "${ttRes}"`
    );
  }

  // Test 1.2: Extreme drop-off cohort [20, 0, 0, 0, 0]
  {
    const { testInterface } = initAppJsSandbox();
    testInterface.setAppState({
      patients: [],
      inventory: [],
      dashboardSummary: { doseCompletion: [20, 0, 0, 0, 0] }
    });

    testInterface.renderDoseCompletionFunnel();
    const chart = testInterface.getDoseFunnelChart();
    assert(
      JSON.stringify(chart.data.datasets[0].data) === JSON.stringify([20, 0, 0, 0, 0]),
      'Funnel: Extreme drop-off cohort [20,0,0,0,0] preserved'
    );
    let textOutput = [];
    chart.ctx = {
      save: () => {},
      restore: () => {},
      fillText: (str) => textOutput.push(str)
    };
    chart.plugins.forEach((p) => p.afterDatasetsDraw && p.afterDatasetsDraw(chart));
    assert(
      JSON.stringify(textOutput) === JSON.stringify(['20', '0', '0', '0', '0']),
      'Funnel: Extreme drop-off labels exactly ["20", "0", "0", "0", "0"]'
    );
  }

  // Test 1.3: 100% adherence cohort [20, 20, 20, 20, 20]
  {
    const { testInterface } = initAppJsSandbox();
    testInterface.setAppState({
      patients: [],
      inventory: [],
      dashboardSummary: { doseCompletion: [20, 20, 20, 20, 20] }
    });

    testInterface.renderDoseCompletionFunnel();
    const chart = testInterface.getDoseFunnelChart();
    assert(
      chart.data.datasets[0].data.every((v) => v === 20),
      'Funnel: 100% adherence cohort [20,20,20,20,20] preserved'
    );
    let textOutput = [];
    chart.ctx = {
      save: () => {},
      restore: () => {},
      fillText: (str) => textOutput.push(str)
    };
    chart.plugins.forEach((p) => p.afterDatasetsDraw && p.afterDatasetsDraw(chart));
    assert(
      textOutput.every((t) => t === '20'),
      'Funnel: 100% adherence labels all render "20"'
    );
  }

  // Test 1.4: Dynamic in-memory schedule aggregation fallback (filtered view)
  {
    const { testInterface } = initAppJsSandbox();
    testInterface.setAppState({
      patients: [
        {
          patientId: 'P1',
          day0WalkInDate: '2026-10-22',
          pepSchedule: [
            { doseDay: 'Day 0', status: 'Fulfilled' },
            { doseDay: 'Day 3', status: 'Fulfilled' },
            { doseDay: 'Day 7', status: 'Pending' }
          ]
        },
        {
          patientId: 'P2',
          day0WalkInDate: '2026-10-22',
          pepSchedule: [
            { doseDay: 'Day 0', status: 'Fulfilled' },
            { doseDay: 'Day 3', status: 'Pending' }
          ]
        },
        {
          patientId: 'P3',
          day0WalkInDate: '2026-10-22',
          pepSchedule: [
            { doseDay: 'Day 0', status: 'Fulfilled' },
            { doseDay: 'Day 3', status: 'Fulfilled' },
            { doseDay: 'Day 7', status: 'Fulfilled' },
            { doseDay: 'Day 14', status: 'Fulfilled' },
            { doseDay: 'Day 28', status: 'Fulfilled' }
          ]
        }
      ],
      inventory: [],
      dashboardSummary: null // triggers fallback to schedule calculation
    });

    testInterface.renderDoseCompletionFunnel();
    const chart = testInterface.getDoseFunnelChart();
    // P1: Day 0, Day 3 (2)
    // P2: Day 0 (1)
    // P3: Day 0, 3, 7, 14, 28 (1)
    // Total: Day 0 = 3, Day 3 = 2, Day 7 = 1, Day 14 = 1, Day 28 = 1
    assert(
      JSON.stringify(chart.data.datasets[0].data) === JSON.stringify([3, 2, 1, 1, 1]),
      `Funnel: Patient schedule aggregation computes exact fulfilled milestones [3,2,1,1,1]: got ${JSON.stringify(chart.data.datasets[0].data)}`
    );
  }

  // Test 1.5: Layout padding & Anti-Clipping check
  {
    const { testInterface } = initAppJsSandbox();
    testInterface.setAppState({
      patients: [],
      inventory: [],
      dashboardSummary: { doseCompletion: [10, 8, 6, 4, 2] }
    });
    testInterface.renderDoseCompletionFunnel();
    const chart = testInterface.getDoseFunnelChart();
    const leftPad = chart.options?.layout?.padding?.left;
    assert(leftPad >= 24, `Funnel: Layout left padding is >=24px to prevent label clipping (got ${leftPad}px)`);
  }
}

// ---------------------------------------------------------------------------
// SUITE 2: Multi-Vaccine Stock Runway Health Stress Test
// ---------------------------------------------------------------------------
function runSuite2() {
  console.log('\n--- SUITE 2: Multi-Vaccine Stock Runway Health Stress ---');

  const { testInterface, env } = initAppJsSandbox();
  const compute = testInterface.computeMultiVaccineHealth;

  // Test 2.1: 0 Stock for all biologics
  {
    const emptyInv = [
      { vaccineType: 'anti-rabies', currentStock: 0, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 0, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 0, lowStockThreshold: 10 }
    ];
    const res = compute(emptyInv, [], null);

    assert(res.pvrv.stock === 0 && res.pvrv.runwayDays === 0, 'Runway: 0 PVRV stock produces 0 runway days');
    assert(res.pvrv.status === 'Critical Restock' && res.pvrv.isCriticalRestock === true, 'Runway: 0 PVRV stock flagged Critical Restock');
    assert(res.antiTetanus.stock === 0 && res.antiTetanus.runwayDays === 0, 'Runway: 0 TT stock produces 0 runway days');
    assert(res.antiTetanus.status === 'Critical Restock', 'Runway: 0 TT stock flagged Critical Restock');
    assert(res.erig.stock === 0 && res.erig.runwayDays === 0, 'Runway: 0 ERIG stock produces 0 runway days');
    assert(res.erig.status === 'Critical Restock', 'Runway: 0 ERIG stock flagged Critical Restock');

    // Check for zero NaN / undefined
    const allNums = [
      res.pvrv.stock, res.pvrv.runwayDays, res.pvrv.dailyConsumption,
      res.antiTetanus.stock, res.antiTetanus.runwayDays, res.antiTetanus.dailyConsumption,
      res.erig.stock, res.erig.runwayDays, res.erig.dailyConsumption
    ];
    assert(allNums.every((n) => Number.isFinite(n)), 'Runway: Zero NaN / undefined across all 0-stock biologics');
  }

  // Test 2.2: 1 vial left
  {
    const oneVialInv = [
      { vaccineType: 'anti-rabies', currentStock: 1, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 1, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 1, lowStockThreshold: 10 }
    ];
    const res = compute(oneVialInv, [], null);
    // PVRV defaultBurn = 4.2 -> Math.floor(1 / 4.2) = 0 days
    assert(res.pvrv.stock === 1 && res.pvrv.runwayDays === 0, 'Runway: 1 vial PVRV at 4.2/day produces 0 runway days (Math.floor)');
    assert(res.pvrv.isCriticalRestock === true, 'Runway: 1 vial PVRV flagged Critical Restock');
    // ERIG defaultBurn = 0.8 -> Math.floor(1 / 0.8) = 1 day
    assert(res.erig.stock === 1 && res.erig.runwayDays === 1, 'Runway: 1 vial ERIG at 0.8/day produces 1 runway day (Math.floor)');
    assert(res.erig.isCriticalRestock === true, 'Runway: 1 vial ERIG flagged Critical Restock (1 <= 10)');
  }

  // Test 2.3: Zero burn rate / safe 999 divisor test
  {
    const appJsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
    const hasSafe999 = appJsCode.includes('dailyRate > 0 ? Math.max(0, Math.floor(stock / dailyRate)) : 999');
    assert(hasSafe999, 'Runway: Safe 999 fallback prevents division by zero (Infinity / NaN) when dailyRate = 0');
  }

  // Test 2.4: Fractional consumption rate rounding
  {
    const pts = [];
    for (let i = 0; i < 7; i++) {
      pts.push({
        pepSchedule: [{ doseDay: 'Day 0', status: 'Fulfilled', scheduledDate: '2026-10-20', vaccineTypeUsed: 'anti-rabies' }]
      });
    }
    const inv = [{ vaccineType: 'anti-rabies', currentStock: 45, lowStockThreshold: 30 }];
    const res = compute(inv, pts, null);
    assert(Number.isInteger(res.pvrv.runwayDays), `Runway: runwayDays is strictly an integer (${res.pvrv.runwayDays})`);
    assert(res.pvrv.dailyConsumption === 0.2, `Runway: dailyConsumption properly rounded (${res.pvrv.dailyConsumption})`);
  }

  // Test 2.5: DOM card display integration
  {
    const { testInterface: ti2, env: env2 } = initAppJsSandbox();
    ti2.setAppState({
      patients: [],
      inventory: [
        { vaccineType: 'anti-rabies', currentStock: 120, lowStockThreshold: 30 },
        { vaccineType: 'anti-tetanus', currentStock: 45, lowStockThreshold: 15 },
        { vaccineType: 'ERIG', currentStock: 8, lowStockThreshold: 10 }
      ],
      dashboardSummary: null
    });
    ti2.renderMasterDashboard();

    const runwayText = env2.elementsById.adminKpiStockRunway.textContent;
    const runwayMeta = env2.elementsById.adminKpiStockRunwayMeta.textContent;
    const erigRunway = env2.elementsById.adminKpiErigRunway.textContent;
    const ttRunway = env2.elementsById.adminKpiTtRunway.textContent;
    const erigChip = env2.elementsById.adminKpiErigChip;

    assert(runwayText.endsWith(' Days') && !runwayText.includes('NaN'), `DOM: #adminKpiStockRunway displays "${runwayText}"`);
    assert(runwayMeta.includes('vials on hand'), `DOM: #adminKpiStockRunwayMeta displays "${runwayMeta}"`);
    assert(erigRunway.endsWith('d') && !erigRunway.includes('NaN'), `DOM: #adminKpiErigRunway displays "${erigRunway}"`);
    assert(ttRunway.endsWith('d') && !ttRunway.includes('NaN'), `DOM: #adminKpiTtRunway displays "${ttRunway}"`);
    assert(erigChip.classList.contains('chip-alert'), 'DOM: #adminKpiErigChip has "chip-alert" class when ERIG is low (8 <= 10)');
  }
}

// ---------------------------------------------------------------------------
// SUITE 3: Restock Warning Banner Threshold Breaches Stress Test
// ---------------------------------------------------------------------------
function runSuite3() {
  console.log('\n--- SUITE 3: Restock Banner Threshold Breaches Stress ---');

  const testRestockBannerWithInv = (inventory) => {
    const { testInterface, env } = initAppJsSandbox();
    testInterface.setAppState({
      patients: [],
      inventory,
      dashboardSummary: null
    });
    testInterface.renderMasterDashboard();
    return {
      banner: env.elementsById.adminStockAlertsBanner,
      msg: env.elementsById.adminStockAlertMessage,
      badge: env.elementsById.adminStockAlertCountBadge
    };
  };

  // Test 3.1: Zero threshold breaches (All Optimal)
  {
    const inv = [
      { vaccineType: 'anti-rabies', currentStock: 150, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 60, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 30, lowStockThreshold: 10 }
    ];
    const { banner } = testRestockBannerWithInv(inv);
    assert(banner.classList.contains('hidden'), 'Restock Banner: Hidden when all biologics are optimal');
  }

  // Test 3.2: PVRV threshold breach (Stock = 25 <= 30)
  {
    const inv = [
      { vaccineType: 'anti-rabies', currentStock: 25, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 60, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 30, lowStockThreshold: 10 }
    ];
    const { banner, msg, badge } = testRestockBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'Restock Banner: Visible when PVRV breaches safety threshold');
    assert(badge.textContent === '1 Biologic Critical', `Restock Banner: Badge reads "${badge.textContent}"`);
    assert(msg.innerHTML.includes('PVRV Anti-Rabies'), 'Restock Banner: Message specifically names PVRV Anti-Rabies');
    assert(msg.innerHTML.includes('25 vials remaining'), 'Restock Banner: Message shows 25 vials remaining');
  }

  // Test 3.3: Anti-Tetanus threshold breach (Stock = 12 <= 15)
  {
    const inv = [
      { vaccineType: 'anti-rabies', currentStock: 150, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 12, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 30, lowStockThreshold: 10 }
    ];
    const { banner, msg, badge } = testRestockBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'Restock Banner: Visible when Anti-Tetanus breaches threshold');
    assert(badge.textContent === '1 Biologic Critical', `Restock Banner: Badge reads "${badge.textContent}"`);
    assert(msg.innerHTML.includes('Anti-Tetanus (Tetavax)'), 'Restock Banner: Message specifically names Anti-Tetanus (Tetavax)');
  }

  // Test 3.4: ERIG threshold breach (Stock = 7 <= 10)
  {
    const inv = [
      { vaccineType: 'anti-rabies', currentStock: 150, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 60, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 7, lowStockThreshold: 10 }
    ];
    const { banner, msg, badge } = testRestockBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'Restock Banner: Visible when ERIG breaches threshold');
    assert(badge.textContent === '1 Biologic Critical', `Restock Banner: Badge reads "${badge.textContent}"`);
    assert(msg.innerHTML.includes('ERIG (Equirab)'), 'Restock Banner: Message specifically names ERIG (Equirab)');
  }

  // Test 3.5: Multiple / All 3 biologics breached simultaneously
  {
    const inv = [
      { vaccineType: 'anti-rabies', currentStock: 15, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 8, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 4, lowStockThreshold: 10 }
    ];
    const { banner, msg, badge } = testRestockBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'Restock Banner: Visible when all 3 biologics breach thresholds');
    assert(badge.textContent === '3 Biologics Critical', `Restock Banner: Badge reads "${badge.textContent}"`);
    assert(
      msg.innerHTML.includes('PVRV Anti-Rabies') &&
        msg.innerHTML.includes('Anti-Tetanus (Tetavax)') &&
        msg.innerHTML.includes('ERIG (Equirab)'),
      'Restock Banner: Message lists all 3 affected biologics'
    );
  }
}

// ---------------------------------------------------------------------------
// SUITE 4: FEFO Approaching Expiration Early Warning Banner Stress Test
// ---------------------------------------------------------------------------
function runSuite4() {
  console.log('\n--- SUITE 4: FEFO Expiry Banner Stress ---');

  const testFefoBannerWithInv = (inventory, todayIso = '2026-10-24') => {
    const { testInterface, env } = initAppJsSandbox(`todayDateIso = '${todayIso}';`);
    testInterface.setAppState({
      patients: [],
      inventory,
      dashboardSummary: null
    });
    testInterface.renderMasterDashboard();
    return {
      banner: env.elementsById.adminFefoAlertBanner,
      msg: env.elementsById.adminFefoAlertMessage,
      badge: env.elementsById.adminFefoAlertCountBadge
    };
  };

  const offsetDate = (days, base = '2026-10-24') => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Test 4.1: Lot expiring in 15 days
  {
    const inv = [
      {
        vaccineType: 'ERIG',
        brandName: 'Equirab',
        batchNumber: 'ERIG-15D',
        currentStock: 10,
        expirationDate: offsetDate(15)
      }
    ];
    const { banner, msg, badge } = testFefoBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'FEFO Banner: Visible for batch expiring in 15 days');
    assert(badge.textContent === '1 Batch Expiring Soon', `FEFO Banner: Badge reads "${badge.textContent}"`);
    assert(msg.innerHTML.includes('in 15 days'), 'FEFO Banner: Message includes "in 15 days"');
    assert(msg.innerHTML.includes('ERIG-15D'), 'FEFO Banner: Message includes batch number ERIG-15D');
  }

  // Test 4.2: Lot expiring in 30 days
  {
    const inv = [
      {
        vaccineType: 'anti-rabies',
        brandName: 'Verorab',
        batchNumber: 'VRB-30D',
        currentStock: 50,
        expirationDate: offsetDate(30)
      }
    ];
    const { banner, msg } = testFefoBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'FEFO Banner: Visible for batch expiring in 30 days');
    assert(msg.innerHTML.includes('in 30 days'), 'FEFO Banner: Message includes "in 30 days"');
  }

  // Test 4.3: Lot expiring in 60 days (boundary)
  {
    const inv = [
      {
        vaccineType: 'anti-tetanus',
        brandName: 'Tetavax',
        batchNumber: 'TET-60D',
        currentStock: 20,
        expirationDate: offsetDate(60)
      }
    ];
    const { banner, msg } = testFefoBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'FEFO Banner: Visible for batch expiring at 60-day boundary');
    assert(msg.innerHTML.includes('in 60 days'), 'FEFO Banner: Message includes "in 60 days"');
  }

  // Test 4.4: Lot expiring in 61 days (outside 60-day window) & far future (365 days)
  {
    const inv = [
      {
        vaccineType: 'anti-rabies',
        brandName: 'Verorab',
        batchNumber: 'VRB-61D',
        currentStock: 100,
        expirationDate: offsetDate(61)
      },
      {
        vaccineType: 'ERIG',
        brandName: 'Equirab',
        batchNumber: 'ERIG-365D',
        currentStock: 50,
        expirationDate: offsetDate(365)
      }
    ];
    const { banner } = testFefoBannerWithInv(inv);
    assert(banner.classList.contains('hidden'), 'FEFO Banner: Hidden when all lots are beyond 60 days (61d & 365d)');
  }

  // Test 4.5: Expired lot in the past (days < 0) and 0-stock lot
  {
    const inv = [
      {
        vaccineType: 'anti-rabies',
        brandName: 'Speeda',
        batchNumber: 'SPD-EXPIRED',
        currentStock: 10,
        expirationDate: offsetDate(-5) // 5 days ago
      },
      {
        vaccineType: 'ERIG',
        brandName: 'Equirab',
        batchNumber: 'ERIG-ZERO-STOCK',
        currentStock: 0,
        expirationDate: offsetDate(10) // 10 days, but 0 stock
      }
    ];
    const { banner } = testFefoBannerWithInv(inv);
    assert(
      banner.classList.contains('hidden'),
      'FEFO Banner: Excludes past-expired lots and 0-stock lots from early warning'
    );
  }

  // Test 4.6: FEFO Chronological Sort Order
  {
    const inv = [
      { vaccineType: 'anti-tetanus', batchNumber: 'BATCH-45D', currentStock: 10, expirationDate: offsetDate(45) },
      { vaccineType: 'anti-rabies', batchNumber: 'BATCH-10D', currentStock: 15, expirationDate: offsetDate(10) },
      { vaccineType: 'ERIG', batchNumber: 'BATCH-25D', currentStock: 5, expirationDate: offsetDate(25) }
    ];
    const { banner, msg, badge } = testFefoBannerWithInv(inv);
    assert(!banner.classList.contains('hidden'), 'FEFO Banner: Visible for 3 expiring batches');
    assert(badge.textContent === '3 Batches Expiring Soon', `FEFO Banner: Badge reads "${badge.textContent}"`);

    // Verify ordering: BATCH-10D must appear before BATCH-25D before BATCH-45D
    const pos10 = msg.innerHTML.indexOf('BATCH-10D');
    const pos25 = msg.innerHTML.indexOf('BATCH-25D');
    const pos45 = msg.innerHTML.indexOf('BATCH-45D');
    assert(
      pos10 < pos25 && pos25 < pos45,
      `FEFO Banner: Strictly sorted by earliest expiration date first (${pos10} < ${pos25} < ${pos45})`
    );
  }
}

// ---------------------------------------------------------------------------
// SUITE 5: DOM Element ID Parity & HTML Integrity Stress Test
// ---------------------------------------------------------------------------
function runSuite5() {
  console.log('\n--- SUITE 5: DOM Element ID Parity & Markup Audit ---');

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');

  // Extract all HTML IDs
  const htmlIdMatches = html.matchAll(/\bid=["']([^"']+)["']/g);
  const htmlIds = new Set();
  const htmlIdList = [];
  for (const m of htmlIdMatches) {
    htmlIds.add(m[1]);
    htmlIdList.push(m[1]);
  }

  // Check for duplicate HTML IDs
  const duplicates = [];
  const seen = new Set();
  htmlIdList.forEach((id) => {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  });
  assert(duplicates.length === 0, `DOM Integrity: Zero duplicate IDs in index.html (found ${duplicates.length})`, duplicates.join(', '));
  assert(htmlIds.size >= 180, `DOM Integrity: Comprehensive index.html has ${htmlIds.size} unique IDs (>=180)`);

  // Extract all getElementById calls in app.js
  const jsGetByIdMatches = js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g);
  const jsIds = new Set();
  for (const m of jsGetByIdMatches) {
    jsIds.add(m[1]);
  }

  // Verify every single ID in app.js exists in index.html
  const missingIds = [...jsIds].filter((id) => !htmlIds.has(id));
  assert(
    missingIds.length === 0,
    `DOM Parity: 100% of ${jsIds.size} getElementById() calls in app.js exist in index.html (0 missing)`,
    missingIds.join(', ')
  );

  // Explicitly audit Milestone 2 critical operational element IDs
  const m2RequiredIds = [
    'doseFunnelChart',
    'adminDueTodayLiveBadge',
    'adminDueMilestoneBreakdown',
    'adminDueDay0',
    'adminDueDay3',
    'adminDueDay7',
    'adminDueDay14',
    'adminDueDay28',
    'adminKpiStockCard',
    'adminKpiStockStatusBadge',
    'adminKpiStockRunway',
    'adminKpiStockRunwayMeta',
    'adminKpiPvrvBurnRate',
    'adminKpiPvrvRateMeta',
    'adminKpiBiologicStrip',
    'adminKpiTtChip',
    'adminKpiTtRunway',
    'adminKpiTtMeta',
    'adminKpiErigChip',
    'adminKpiErigRunway',
    'adminKpiErigMeta',
    'adminStockAlertsContainer',
    'adminStockAlertsBanner',
    'adminStockAlertCountBadge',
    'adminStockAlertMessage',
    'adminFefoAlertBanner',
    'adminFefoAlertCountBadge',
    'adminFefoAlertMessage',
    'adminOperationalWorkflowRow',
    'adminOverviewTriageCount',
    'adminOverviewTriageBody',
    'adminOverviewDefaulterAlertBadge',
    'adminOverviewDefaulterCount',
    'adminOverviewDefaultersBody'
  ];

  m2RequiredIds.forEach((id) => {
    assert(htmlIds.has(id) && jsIds.has(id), `M2 Key ID Parity: #${id} present in BOTH index.html and app.js`);
  });
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
function main() {
  console.log('================================================================================');
  console.log(' ADVERSARIAL STRESS TEST SUITE: MILESTONE 2 REGIMEN FUNNEL & MULTI-VACCINE UI');
  console.log('================================================================================');

  runSuite1();
  runSuite2();
  runSuite3();
  runSuite4();
  runSuite5();

  console.log('\n================================================================================');
  console.log(` ADVERSARIAL SUITE SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
