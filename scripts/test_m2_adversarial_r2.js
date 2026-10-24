/**
 * scripts/test_m2_adversarial_r2.js
 * Adversarial Stress Testing Harness for Milestone 2:
 * 1. PEP Regimen Progression Funnel (renderDoseCompletionFunnel)
 * 2. Multi-Vaccine Runway Health (computeMultiVaccineHealth)
 * 3. Alert Banners & Threshold Triggers (#adminStockAlertsBanner, #adminFefoAlertBanner)
 * 4. DOM ID Parity Audit (index.html vs app.js)
 * 5. Full E2E Test Suite Regression Execution
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const htmlSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf-8');
const jsSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'app.js'), 'utf-8');
const cssSource = fs.readFileSync(path.join(ROOT_DIR, 'public', 'css', 'styles.css'), 'utf-8');

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failCount++;
    failures.push({ testName, detail });
    console.error(`  [FAIL] ${testName} -> ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Mock Browser Environment for VM Execution
// ---------------------------------------------------------------------------
function createMockEnvironment() {
  const elementsById = {};
  const mockClassList = (el) => {
    const classes = new Set();
    return {
      add: (...cls) => cls.forEach((c) => classes.add(c)),
      remove: (...cls) => cls.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          classes.has(c) ? classes.delete(c) : classes.add(c);
        } else if (force) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
      }
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

function initAppJsSandbox() {
  const env = createMockEnvironment();
  const sandbox = {
    window: { requestAnimationFrame: (fn) => fn() },
    document: env.document,
    Chart: env.MockChart,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console
  };
  vm.createContext(sandbox);

  // Run app.js and expose test harness interface
  vm.runInContext(
    jsSource +
      `\n; globalThis._testHarness = {
        setAppState: (updates) => Object.assign(clinicAppState, updates),
        getAppState: () => clinicAppState,
        renderDoseCompletionFunnel,
        renderMasterDashboard,
        computeMultiVaccineHealth,
        horizontalBarLabelPlugin,
        getDoseFunnelChart: () => doseFunnelChart,
        getTodayDateIso: () => todayDateIso
      };`,
    sandbox
  );

  return { sandbox, env, harness: sandbox._testHarness };
}

// ===========================================================================
// SUITE 1: DOM ID PARITY & AUDIT
// ===========================================================================
function runSuite1DomIdParity() {
  console.log('\n================================================================================');
  console.log(' SUITE 1: DOM ID PARITY & AUDIT (index.html vs app.js)');
  console.log('================================================================================');

  // 1.1 Find all ID definitions in public/index.html
  const idRegex = /\bid=["']([^"']+)["']/g;
  const idCounts = {};
  const allIds = [];
  let m;
  while ((m = idRegex.exec(htmlSource)) !== null) {
    const id = m[1];
    idCounts[id] = (idCounts[id] || 0) + 1;
    allIds.push(id);
  }

  const duplicates = Object.entries(idCounts).filter(([id, count]) => count > 1);
  assert(
    duplicates.length === 0,
    `index.html: 0 duplicate DOM IDs (Total IDs: ${allIds.length}, Unique IDs: ${Object.keys(idCounts).length})`,
    duplicates.map(([id, c]) => `${id} (${c}x)`).join(', ')
  );

  // 1.2 Find all getElementById calls in public/js/app.js
  const getByIdRegex = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  const jsQueriedIds = new Set();
  while ((m = getByIdRegex.exec(jsSource)) !== null) {
    jsQueriedIds.add(m[1]);
  }

  const missingFromHtml = [...jsQueriedIds].filter((id) => !idCounts[id]);
  assert(
    missingFromHtml.length === 0,
    `app.js: 100% of getElementById references match index.html (${jsQueriedIds.size}/${jsQueriedIds.size} matched, 0 missing)`,
    missingFromHtml.join(', ')
  );

  // 1.3 Verify critical Milestone 2 elements are present in both HTML and JS
  const criticalM2Ids = [
    'doseFunnelChart',
    'adminStockAlertsContainer',
    'adminStockAlertsBanner',
    'adminStockAlertCountBadge',
    'adminStockAlertMessage',
    'adminBannerRestockBtn',
    'adminFefoAlertBanner',
    'adminFefoAlertCountBadge',
    'adminFefoAlertMessage',
    'adminDueTodayLiveBadge',
    'adminDueMilestoneBreakdown',
    'adminDueDay0',
    'adminDueDay3',
    'adminDueDay7',
    'adminDueDay14',
    'adminDueDay28',
    'adminKpiDueToday',
    'adminKpiMissedDoses',
    'adminKpiStockRunway',
    'adminKpiStockRunwayMeta',
    'adminKpiStockStatusBadge',
    'adminKpiPvrvBurnRate',
    'adminKpiPvrvRateMeta',
    'adminKpiBiologicStrip',
    'adminKpiTtChip',
    'adminKpiTtRunway',
    'adminKpiTtMeta',
    'adminKpiErigChip',
    'adminKpiErigRunway',
    'adminKpiErigMeta',
    'adminOperationalWorkflowRow',
    'adminOverviewTriageCount',
    'adminOverviewTriageBody',
    'adminOverviewDefaulterAlertBadge',
    'adminOverviewDefaulterCount',
    'adminOverviewDefaultersBody'
  ];

  let allM2Present = true;
  criticalM2Ids.forEach((id) => {
    if (!idCounts[id]) {
      allM2Present = false;
      console.error(`  Missing M2 ID in index.html: ${id}`);
    }
  });
  assert(allM2Present, `All ${criticalM2Ids.length} Milestone 2 specific DOM IDs exist in index.html`);
}

// ===========================================================================
// SUITE 2: PEP REGIMEN PROGRESSION FUNNEL (renderDoseCompletionFunnel)
// ===========================================================================
function runSuite2Funnel() {
  console.log('\n================================================================================');
  console.log(' SUITE 2: PEP REGIMEN PROGRESSION FUNNEL (renderDoseCompletionFunnel)');
  console.log('================================================================================');

  const { harness } = initAppJsSandbox();

  // 2.1 Authentic 5 WHO milestone labels
  harness.setAppState({
    patients: [],
    inventory: [],
    dashboardSummary: { doseCompletion: [45, 38, 30, 22, 18] }
  });
  harness.renderDoseCompletionFunnel();
  const chart = harness.getDoseFunnelChart();

  assert(chart !== null, 'Funnel: Chart object instantiated successfully');
  assert(chart.type === 'bar', 'Funnel: Chart type is bar');
  assert(chart.options.indexAxis === 'y', 'Funnel: Horizontal bar chart (indexAxis = "y")');

  const expectedLabels = [
    'Day 0 (Initial)',
    'Day 3 (Booster 1)',
    'Day 7 (Booster 2)',
    'Day 14 (Booster 3)',
    'Day 28 (Booster 4)'
  ];
  assert(
    JSON.stringify(chart.data.labels) === JSON.stringify(expectedLabels),
    'Funnel: Exactly 5 authentic WHO milestone labels rendered [Day 0, Day 3, Day 7, Day 14, Day 28]'
  );

  // 2.2 Padding preventing label clipping
  const padding = chart.options.layout?.padding;
  assert(
    padding && padding.left >= 24 && padding.right >= 24,
    `Funnel: Layout padding prevents label clipping (left: ${padding?.left}px, right: ${padding?.right}px)`
  );

  // 2.3 Unfiltered data source: consumes dashboardSummary.doseCompletion directly
  assert(
    JSON.stringify(chart.data.datasets[0].data) === JSON.stringify([45, 38, 30, 22, 18]),
    'Funnel: Unfiltered source consumes dashboardSummary.doseCompletion directly [45, 38, 30, 22, 18]'
  );

  // 2.4 Edge Case: Zero patients / zero completion
  harness.setAppState({
    patients: [],
    inventory: [],
    dashboardSummary: { doseCompletion: [0, 0, 0, 0, 0] }
  });
  harness.renderDoseCompletionFunnel();
  const zeroChart = harness.getDoseFunnelChart();
  assert(
    JSON.stringify(zeroChart.data.datasets[0].data) === JSON.stringify([0, 0, 0, 0, 0]),
    'Funnel: Zero completion cohort [0, 0, 0, 0, 0] rendered safely'
  );

  // Test label plugin with zero values (no NaN, no undefined)
  let labelDrawSuccess = true;
  let textOutputs = [];
  zeroChart.ctx = {
    save: () => {},
    restore: () => {},
    fillText: (str) => {
      textOutputs.push(str);
      if (str === 'NaN' || str === 'undefined') labelDrawSuccess = false;
    }
  };
  zeroChart.plugins.forEach((p) => {
    if (p.afterDatasetsDraw) p.afterDatasetsDraw(zeroChart);
  });
  assert(
    labelDrawSuccess && textOutputs.length === 5 && textOutputs.every((t) => t === '0'),
    'Funnel: horizontalBarLabelPlugin draws "0" for all 5 bars with zero NaN/undefined'
  );

  // 2.5 Edge Case: Non-monotonic progression (e.g. drop-off anomaly or booster re-entry)
  harness.setAppState({
    patients: [],
    inventory: [],
    dashboardSummary: { doseCompletion: [15, 8, 12, 4, 1] }
  });
  harness.renderDoseCompletionFunnel();
  const nonMonotonicChart = harness.getDoseFunnelChart();
  assert(
    JSON.stringify(nonMonotonicChart.data.datasets[0].data) === JSON.stringify([15, 8, 12, 4, 1]),
    'Funnel: Non-monotonic cohort [15, 8, 12, 4, 1] preserved without sorting mutation'
  );

  // 2.6 Filtered data source: computes completed doses strictly from patient PEP schedules
  const testPatients = [
    {
      patientId: 'P1',
      pepSchedule: [
        { doseDay: 'Day 0', status: 'Fulfilled' },
        { doseDay: 'Day 3', status: 'Fulfilled' },
        { doseDay: 'Day 7', status: 'Fulfilled' },
        { doseDay: 'Day 14', status: 'Fulfilled' },
        { doseDay: 'Day 28', status: 'Fulfilled' }
      ]
    },
    {
      patientId: 'P2',
      pepSchedule: [
        { doseDay: 'Day 0', status: 'Fulfilled' },
        { doseDay: 'Day 3', status: 'Fulfilled' },
        { doseDay: 'Day 7', status: 'Pending' }
      ]
    },
    {
      patientId: 'P3',
      pepSchedule: [
        { doseDay: 'Day 0', status: 'Fulfilled' },
        { doseDay: 'Day 3', status: 'Cancelled' }
      ]
    },
    {
      patientId: 'P4', // Patient with missing/null pepSchedule
      pepSchedule: null
    }
  ];

  // Set global filter to simulate active filtering
  const { env: filteredEnv, harness: filteredHarness } = initAppJsSandbox();
  filteredEnv.document.getElementById('globalFilterAnimal').value = 'Domestic Dog';
  testPatients.forEach((p) => (p.animalType = 'Domestic Dog'));

  filteredHarness.setAppState({
    patients: testPatients,
    inventory: [],
    dashboardSummary: { doseCompletion: [99, 99, 99, 99, 99] } // Should NOT be used when filtered!
  });

  filteredHarness.renderDoseCompletionFunnel();
  const filteredChart = filteredHarness.getDoseFunnelChart();
  // P1 has 0,3,7,14,28. P2 has 0,3. P3 has 0.
  // Totals: Day 0 = 3, Day 3 = 2, Day 7 = 1, Day 14 = 1, Day 28 = 1.
  assert(
    JSON.stringify(filteredChart.data.datasets[0].data) === JSON.stringify([3, 2, 1, 1, 1]),
    'Funnel: Filtered mode computes exact fulfilled schedules [3, 2, 1, 1, 1], ignoring summary [99, 99, 99, 99, 99]'
  );

  // 2.7 Tooltip callback test
  const tooltipCallback = filteredChart.options.plugins?.tooltip?.callbacks?.label;
  const tooltipResult = tooltipCallback({ raw: 3 });
  assert(
    tooltipResult === ' Completed Adherence: 3 patients',
    `Funnel: Tooltip formatter returns formatted adherence string ("${tooltipResult}")`
  );
}

// ===========================================================================
// SUITE 3: MULTI-VACCINE RUNWAY & STOCK HEALTH (computeMultiVaccineHealth)
// ===========================================================================
function runSuite3MultiVaccineHealth() {
  console.log('\n================================================================================');
  console.log(' SUITE 3: MULTI-VACCINE RUNWAY HEALTH (computeMultiVaccineHealth)');
  console.log('================================================================================');

  const { harness } = initAppJsSandbox();
  const computeHealth = harness.computeMultiVaccineHealth;

  // 3.1 Zero stock edge case: division-by-zero guard, sets runwayDays to 0, flags Critical Restock
  const zeroInventory = [
    { vaccineType: 'anti-rabies', currentStock: 0, lowStockThreshold: 30 },
    { vaccineType: 'anti-tetanus', currentStock: 0, lowStockThreshold: 15 },
    { vaccineType: 'ERIG', currentStock: 0, lowStockThreshold: 10 }
  ];
  const zeroStockHealth = computeHealth(zeroInventory, [], null);

  assert(
    zeroStockHealth.pvrv.stock === 0 && zeroStockHealth.pvrv.runwayDays === 0 && zeroStockHealth.pvrv.isCriticalRestock === true,
    'Runway: Zero PVRV stock -> runwayDays: 0, isCriticalRestock: true, status: Critical Restock'
  );
  assert(
    zeroStockHealth.antiTetanus.stock === 0 && zeroStockHealth.antiTetanus.runwayDays === 0 && zeroStockHealth.antiTetanus.isCriticalRestock === true,
    'Runway: Zero TT stock -> runwayDays: 0, isCriticalRestock: true, status: Critical Restock'
  );
  assert(
    zeroStockHealth.erig.stock === 0 && zeroStockHealth.erig.runwayDays === 0 && zeroStockHealth.erig.isCriticalRestock === true,
    'Runway: Zero ERIG stock -> runwayDays: 0, isCriticalRestock: true, status: Critical Restock'
  );
  assert(
    !isNaN(zeroStockHealth.pvrv.runwayDays) && !isNaN(zeroStockHealth.erig.runwayDays) && isFinite(zeroStockHealth.pvrv.runwayDays),
    'Runway: Zero division guards produce clean finite numbers (no NaN, no Infinity)'
  );

  // 3.2 Zero daily consumption edge case: safe division-by-zero guard sets runwayDays to 999
  // To trigger dailyRate <= 0, we simulate a custom inventory where default burn rate is 0
  // In computeMultiVaccineHealth: const runwayDays = dailyRate > 0 ? Math.max(0, Math.floor(stock / dailyRate)) : 999;
  // Let's test with empty patients and verify default burns (4.2, 1.5, 0.8) are applied:
  const baselineInv = [
    { vaccineType: 'anti-rabies', currentStock: 84 },
    { vaccineType: 'anti-tetanus', currentStock: 30 },
    { vaccineType: 'ERIG', currentStock: 16 }
  ];
  const defaultBurnHealth = computeHealth(baselineInv, [], null);
  assert(
    defaultBurnHealth.pvrv.dailyConsumption === 4.2 && defaultBurnHealth.pvrv.runwayDays === 20,
    `Runway: Default PVRV burn rate applied (4.2 v/d -> ${defaultBurnHealth.pvrv.runwayDays} days)`
  );
  assert(
    defaultBurnHealth.antiTetanus.dailyConsumption === 1.5 && defaultBurnHealth.antiTetanus.runwayDays === 20,
    `Runway: Default TT burn rate applied (1.5 v/d -> ${defaultBurnHealth.antiTetanus.runwayDays} days)`
  );
  assert(
    defaultBurnHealth.erig.dailyConsumption === 0.8 && defaultBurnHealth.erig.runwayDays === 20,
    `Runway: Default ERIG burn rate applied (0.8 v/d -> ${defaultBurnHealth.erig.runwayDays} days)`
  );

  // 3.3 Safety thresholds: ERIG <= 10 or runway <= 10 flags isCriticalRestock
  const erigThreshold10 = [
    { vaccineType: 'anti-rabies', currentStock: 100 },
    { vaccineType: 'anti-tetanus', currentStock: 50 },
    { vaccineType: 'ERIG', currentStock: 10 } // Exactly threshold (10)
  ];
  const hThreshold10 = computeHealth(erigThreshold10, [], null);
  assert(
    hThreshold10.erig.isCriticalRestock === true && hThreshold10.erig.status === 'Critical Restock',
    'Safety Threshold: ERIG stock = 10 (<= 10) flags isCriticalRestock: true'
  );

  const erigStock8 = [
    { vaccineType: 'anti-rabies', currentStock: 100 },
    { vaccineType: 'anti-tetanus', currentStock: 50 },
    { vaccineType: 'ERIG', currentStock: 8 } // Breached threshold (8 <= 10)
  ];
  const hStock8 = computeHealth(erigStock8, [], null);
  assert(
    hStock8.erig.isCriticalRestock === true && hStock8.erig.runwayDays === 10,
    'Safety Threshold: ERIG stock = 8 produces runwayDays = 10, isCriticalRestock: true'
  );

  const erigStock12 = [
    { vaccineType: 'anti-rabies', currentStock: 100 },
    { vaccineType: 'anti-tetanus', currentStock: 50 },
    { vaccineType: 'ERIG', currentStock: 12 } // Above threshold
  ];
  const hStock12 = computeHealth(erigStock12, [], null);
  assert(
    hStock12.erig.isCriticalRestock === false,
    'Safety Threshold: ERIG stock = 12 (> 10) is NOT Critical Restock'
  );

  // Runway <= 10 days triggers Critical Restock even if stock is above safetyThreshold
  // E.g. PVRV stock = 35 (> 30), but consumption is 4.0/d -> runway is 8 days (<= 10)
  const heavyPvrvUsePatients = Array.from({ length: 120 }, (_, idx) => ({
    patientId: `PVRV-USE-${idx}`,
    pepSchedule: [{ status: 'Fulfilled', vaccineTypeUsed: 'anti-rabies', scheduledDate: '2026-10-20' }]
  }));
  const pvrvHeavyHealth = computeHealth(
    [{ vaccineType: 'anti-rabies', currentStock: 35 }],
    heavyPvrvUsePatients,
    null
  );
  // 120 consumed in 30 days = 4.0/day. Stock = 35. Runway = floor(35 / 4.0) = 8 days.
  assert(
    pvrvHeavyHealth.pvrv.runwayDays <= 10 && pvrvHeavyHealth.pvrv.isCriticalRestock === true,
    `Safety Threshold: Runway <= 10 days (${pvrvHeavyHealth.pvrv.runwayDays}d) triggers Critical Restock despite stock (35) > 30`
  );

  // 3.4 FEFO Expiration: filters lots expiring in 0-60 days
  const todayIso = harness.getTodayDateIso();
  const addDays = (d) => {
    const dt = new Date(todayIso);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().split('T')[0];
  };

  const fefoInventory = [
    {
      vaccineType: 'ERIG',
      brandName: 'Equirab',
      batchNumber: 'LOT-20D',
      currentStock: 10,
      expirationDate: addDays(20) // in 20 days: valid FEFO alert
    },
    {
      vaccineType: 'anti-rabies',
      brandName: 'Verorab',
      batchNumber: 'LOT-55D',
      currentStock: 25,
      expirationDate: addDays(55) // in 55 days: valid FEFO alert
    },
    {
      vaccineType: 'anti-tetanus',
      brandName: 'Tetavax',
      batchNumber: 'LOT-80D',
      currentStock: 40,
      expirationDate: addDays(80) // in 80 days: OUTSIDE 60-day window
    },
    {
      vaccineType: 'ERIG',
      brandName: 'Equirab',
      batchNumber: 'LOT-EXPIRED',
      currentStock: 5,
      expirationDate: addDays(-5) // expired 5 days ago: days <= 0, excluded from approaching expiry
    },
    {
      vaccineType: 'anti-rabies',
      brandName: 'Speeda',
      batchNumber: 'LOT-ZERO-STOCK',
      currentStock: 0, // Depleted stock: excluded
      expirationDate: addDays(10)
    }
  ];

  const fefoHealth = computeHealth(fefoInventory, [], null);
  const expiring = fefoHealth.expiringBatches;

  assert(
    expiring.length === 2,
    `FEFO: Exactly 2 lots within 0-60 days window identified (actual: ${expiring.length})`
  );
  assert(
    expiring[0].batchNumber === 'LOT-20D' && expiring[0].daysUntilExpiry === 20,
    `FEFO: Earliest expiry batch sorted first (LOT-20D in ${expiring[0].daysUntilExpiry} days)`
  );
  assert(
    expiring[1].batchNumber === 'LOT-55D' && expiring[1].daysUntilExpiry === 55,
    `FEFO: Second batch sorted next (LOT-55D in ${expiring[1].daysUntilExpiry} days)`
  );
  assert(
    !expiring.some((b) => b.batchNumber === 'LOT-80D'),
    'FEFO: Batch expiring in 80 days correctly excluded (> 60 days)'
  );
  assert(
    !expiring.some((b) => b.batchNumber === 'LOT-EXPIRED'),
    'FEFO: Already-expired batch correctly excluded (days <= 0)'
  );
  assert(
    !expiring.some((b) => b.batchNumber === 'LOT-ZERO-STOCK'),
    'FEFO: Zero-stock batch correctly excluded (currentStock <= 0)'
  );
}

// ===========================================================================
// SUITE 4: ALERT BANNERS & DASHBOARD RENDERING (renderMasterDashboard)
// ===========================================================================
function runSuite4AlertBanners() {
  console.log('\n================================================================================');
  console.log(' SUITE 4: ALERT BANNERS & DASHBOARD RENDERING (renderMasterDashboard)');
  console.log('================================================================================');

  const { env, harness } = initAppJsSandbox();
  const todayIso = harness.getTodayDateIso();
  const addDays = (d) => {
    const dt = new Date(todayIso);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().split('T')[0];
  };

  // 4.1 Scenario A: Critical Restock triggered (ERIG <= 10)
  harness.setAppState({
    patients: [],
    inventory: [
      { vaccineType: 'anti-rabies', currentStock: 100, lowStockThreshold: 30 },
      { vaccineType: 'anti-tetanus', currentStock: 40, lowStockThreshold: 15 },
      { vaccineType: 'ERIG', currentStock: 8, lowStockThreshold: 10 } // Critical!
    ],
    dashboardSummary: null
  });
  harness.renderMasterDashboard();

  const restockBanner = env.elementsById.adminStockAlertsBanner;
  const restockBadge = env.elementsById.adminStockAlertCountBadge;
  const restockMsg = env.elementsById.adminStockAlertMessage;
  const erigChip = env.elementsById.adminKpiErigChip;

  assert(!restockBanner.classList.contains('hidden'), 'Restock Banner: #adminStockAlertsBanner is VISIBLE when ERIG <= 10');
  assert(restockBadge.textContent === '1 Biologic Critical', `Restock Banner: Badge reads "${restockBadge.textContent}"`);
  assert(restockMsg.innerHTML.includes('ERIG (Equirab)'), 'Restock Banner: Message explicitly names "ERIG (Equirab)"');
  assert(restockMsg.innerHTML.includes('8 vials remaining'), 'Restock Banner: Message states 8 vials remaining');
  assert(erigChip.classList.contains('chip-alert'), 'Executive Card 4: #adminKpiErigChip has "chip-alert" class');

  // 4.2 Scenario B: FEFO Alert Banner triggered (Batch expiring in 25 days)
  harness.setAppState({
    patients: [],
    inventory: [
      {
        vaccineType: 'ERIG',
        brandName: 'Equirab',
        batchNumber: 'ERIG-FEFO-25',
        currentStock: 12,
        expirationDate: addDays(25)
      }
    ],
    dashboardSummary: null
  });
  harness.renderMasterDashboard();

  const fefoBanner = env.elementsById.adminFefoAlertBanner;
  const fefoBadge = env.elementsById.adminFefoAlertCountBadge;
  const fefoMsg = env.elementsById.adminFefoAlertMessage;

  assert(!fefoBanner.classList.contains('hidden'), 'FEFO Banner: #adminFefoAlertBanner is VISIBLE for batch expiring in 25 days');
  assert(fefoBadge.textContent === '1 Batch Expiring Soon', `FEFO Banner: Badge reads "${fefoBadge.textContent}"`);
  assert(fefoMsg.innerHTML.includes('ERIG-FEFO-25'), 'FEFO Banner: Message includes batch number');
  assert(fefoMsg.innerHTML.includes('25 days'), 'FEFO Banner: Message includes 25 days countdown');
  assert(fefoMsg.innerHTML.includes('FEFO'), 'FEFO Banner: Message enforces First-Expiry, First-Out (FEFO)');

  // 4.3 Scenario C: All optimal & zero expiring batches -> Both banners hidden
  harness.setAppState({
    patients: [],
    inventory: [
      { vaccineType: 'anti-rabies', currentStock: 150, lowStockThreshold: 30, expirationDate: addDays(180) },
      { vaccineType: 'anti-tetanus', currentStock: 60, lowStockThreshold: 15, expirationDate: addDays(180) },
      { vaccineType: 'ERIG', currentStock: 30, lowStockThreshold: 10, expirationDate: addDays(180) }
    ],
    dashboardSummary: null
  });
  harness.renderMasterDashboard();

  assert(
    restockBanner.classList.contains('hidden'),
    'Restock Banner: Hidden when all biologics are above safety thresholds'
  );
  assert(
    fefoBanner.classList.contains('hidden'),
    'FEFO Banner: Hidden when zero batches are expiring within 60 days'
  );
  assert(
    !erigChip.classList.contains('chip-alert'),
    'Executive Card 4: #adminKpiErigChip does NOT have "chip-alert" when optimal'
  );

  // 4.4 Multi-Vaccine KPI Card 4 values
  const runwayEl = env.elementsById.adminKpiStockRunway;
  const runwayMetaEl = env.elementsById.adminKpiStockRunwayMeta;
  const pvrvBurnEl = env.elementsById.adminKpiPvrvBurnRate;
  const ttRunwayEl = env.elementsById.adminKpiTtRunway;
  const erigRunwayEl = env.elementsById.adminKpiErigRunway;

  assert(runwayEl.textContent.includes('Days'), `Card 4: Runway displays "${runwayEl.textContent}"`);
  assert(runwayMetaEl.textContent.includes('150 vials on hand'), `Card 4: Meta displays "${runwayMetaEl.textContent}"`);
  assert(pvrvBurnEl.textContent.includes('/day'), `Card 4: Burn rate displays "${pvrvBurnEl.textContent}"`);
  assert(ttRunwayEl.textContent.includes('d'), `Card 4: TT runway displays "${ttRunwayEl.textContent}"`);
  assert(erigRunwayEl.textContent.includes('d'), `Card 4: ERIG runway displays "${erigRunwayEl.textContent}"`);
}

// ===========================================================================
// SUITE 5: REGRESSION TEST SUITE EXECUTION
// ===========================================================================
function runSuite5Regression() {
  console.log('\n================================================================================');
  console.log(' SUITE 5: REGRESSION TEST SUITE EXECUTION (scripts/e2e_test_suite.js)');
  console.log('================================================================================');

  let output = '';
  let exitCode = 0;
  try {
    output = execSync('node scripts/e2e_test_suite.js', { cwd: ROOT_DIR, encoding: 'utf-8' });
    exitCode = 0;
  } catch (err) {
    output = err.stdout + '\n' + err.stderr;
    exitCode = err.status || 1;
  }

  const passedMatch = output.match(/PASSED:\s*(\d+)/);
  const failedMatch = output.match(/FAILED:\s*(\d+)/);
  const totalMatch = output.match(/TOTAL ASSERTIONS:\s*(\d+)/);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : -1;
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  assert(exitCode === 0, `e2e_test_suite.js exited with clean code 0 (actual: ${exitCode})`);
  assert(passed === 212, `e2e_test_suite.js passed all 212 assertions (actual: ${passed}/212)`);
  assert(failed === 0, `e2e_test_suite.js 0 failed assertions (actual: ${failed})`);
}

// ===========================================================================
// MAIN RUNNER
// ===========================================================================
function main() {
  console.log('================================================================================');
  console.log(' ADVERSARIAL STRESS TEST SUITE — MILESTONE 2 (CHALLENGER 2 R2)');
  console.log(' Target: Funnel, Multi-Vaccine Health, Alert Banners, DOM Parity, E2E Suite');
  console.log('================================================================================');

  runSuite1DomIdParity();
  runSuite2Funnel();
  runSuite3MultiVaccineHealth();
  runSuite4AlertBanners();
  runSuite5Regression();

  console.log('\n================================================================================');
  console.log(` SUMMARY: ${passCount} PASSED | ${failCount} FAILED | TOTAL: ${passCount + failCount}`);
  console.log('================================================================================');

  if (failCount > 0) {
    console.error('FAILURES:');
    failures.forEach((f) => console.error(` - ${f.testName}: ${f.detail}`));
    process.exit(1);
  } else {
    console.log('All empirical challenger assertions PASSED.');
    process.exit(0);
  }
}

main();
