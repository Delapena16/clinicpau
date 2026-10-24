const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { inMemoryStore, createSeedPatients, createSeedInventory, getRelativeDate } = require('../config/inMemoryStore');
const { getDashboardSummary } = require('../controllers/adminController');

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

async function runAdversarialProbes() {
  console.log('================================================================================');
  console.log(' ADVERSARIAL STRESS TEST SUITE: MILESTONE 1 (DATA MODELS & SEED DATA)');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: models/Patient.js animalType enum & schema validation
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 1: models/Patient.js Schema Validation & Enum Stress ---');

  const validVectors = ['Domestic Dog', 'Stray Dog', 'Domestic Cat', 'Stray Cat'];
  for (const vector of validVectors) {
    const doc = new Patient({
      patientId: 'PEP-TEST-001',
      fullName: 'Test Patient',
      age: 25,
      sex: 'Male',
      contactNumber: '09171234567',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      biteSite: 'Right Leg',
      animalType: vector
    });
    const err = doc.validateSync();
    assert(!err || !err.errors['animalType'], `Valid animal vector accepted: '${vector}'`);
  }

  const invalidVectors = [
    'Bird',
    'Rabbit',
    'Reptile',
    'Bat',
    'Other',
    'Dog', // legacy unnormalized
    'Cat', // legacy unnormalized
    'Horse',
    'Monkey',
    'Pig',
    '',
    '   ',
    'domestic dog', // lowercase
    'STRAY DOG',    // uppercase
    'Wolf',
    'Fox'
  ];

  for (const inv of invalidVectors) {
    const doc = new Patient({
      patientId: 'PEP-TEST-002',
      fullName: 'Test Patient',
      age: 30,
      sex: 'Female',
      contactNumber: '09181234567',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      biteSite: 'Left Arm',
      animalType: inv
    });
    const err = doc.validateSync();
    assert(
      err && err.errors && err.errors['animalType'],
      `Invalid animal vector strictly rejected: '${inv}'`,
      err ? err.errors['animalType']?.message : 'Expected validation error'
    );
  }

  // Test default animalType when undefined
  const defaultDoc = new Patient({
    patientId: 'PEP-TEST-003',
    fullName: 'Test Default',
    age: 40,
    sex: 'Male',
    contactNumber: '09191234567',
    barangay: 'Brgy. Kapitan Pepe',
    consentGiven: true,
    biteSite: 'Right Hand'
  });
  const defaultErr = defaultDoc.validateSync();
  assert(
    !defaultErr && defaultDoc.animalType === 'Domestic Dog',
    "Undefined animalType defaults safely to 'Domestic Dog'",
    `Got: ${defaultDoc.animalType}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 2: Receptionist Normalization Stress
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Receptionist Normalization Logic Stress ---');

  function normalizeAnimalReceptionist(animalType) {
    let resolvedAnimal = (animalType || 'Domestic Dog').trim();
    if (resolvedAnimal === 'Dog') resolvedAnimal = 'Domestic Dog';
    if (resolvedAnimal === 'Cat') resolvedAnimal = 'Domestic Cat';
    const validAnimalEnums = ['Domestic Dog', 'Stray Dog', 'Domestic Cat', 'Stray Cat'];
    if (!validAnimalEnums.includes(resolvedAnimal)) {
      resolvedAnimal = 'Domestic Dog';
    }
    return resolvedAnimal;
  }

  const normProbes = [
    { input: 'Dog', expected: 'Domestic Dog' },
    { input: 'Cat', expected: 'Domestic Cat' },
    { input: '  Dog  ', expected: 'Domestic Dog' },
    { input: '  Cat  ', expected: 'Domestic Cat' },
    { input: 'Domestic Dog', expected: 'Domestic Dog' },
    { input: 'Stray Dog', expected: 'Stray Dog' },
    { input: 'Domestic Cat', expected: 'Domestic Cat' },
    { input: 'Stray Cat', expected: 'Stray Cat' },
    { input: 'Bird', expected: 'Domestic Dog' },
    { input: 'Rabbit', expected: 'Domestic Dog' },
    { input: 'Reptile', expected: 'Domestic Dog' },
    { input: 'Bat', expected: 'Domestic Dog' },
    { input: 'Other', expected: 'Domestic Dog' },
    { input: '', expected: 'Domestic Dog' },
    { input: null, expected: 'Domestic Dog' },
    { input: undefined, expected: 'Domestic Dog' },
    { input: 'Unknown Alien', expected: 'Domestic Dog' }
  ];

  for (const probe of normProbes) {
    const output = normalizeAnimalReceptionist(probe.input);
    assert(
      output === probe.expected,
      `Receptionist normalization: '${probe.input}' -> '${output}' (expected: '${probe.expected}')`
    );

    // Verify normalized output passes Patient model validation
    const testDoc = new Patient({
      patientId: 'PEP-NORM-TEST',
      fullName: 'Normalization Check',
      age: 20,
      sex: 'Male',
      contactNumber: '09171234567',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      biteSite: 'Right Leg',
      animalType: output
    });
    const docErr = testDoc.validateSync();
    assert(!docErr || !docErr.errors['animalType'], `Normalized '${output}' validates against Patient model`);
  }

  // ---------------------------------------------------------------------------
  // SUITE 3: In-Memory Seed Dataset Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 3: In-Memory Seed Dataset Integrity ---');

  const seedPatients = createSeedPatients();

  // 1. Uniqueness of IDs
  const idSet = new Set();
  const duplicateIds = [];
  seedPatients.forEach((p) => {
    if (idSet.has(p.patientId)) duplicateIds.push(p.patientId);
    idSet.add(p.patientId);
  });
  assert(duplicateIds.length === 0, `All patientIds are unique (Found duplicates: ${duplicateIds.join(', ') || 'None'})`);
  assert(seedPatients.length === 20, `Seed patients contains exactly 20 records (Actual: ${seedPatients.length})`);

  const internalIdSet = new Set();
  const duplicateInternalIds = [];
  seedPatients.forEach((p) => {
    if (internalIdSet.has(p._id)) duplicateInternalIds.push(p._id);
    internalIdSet.add(p._id);
  });
  assert(duplicateInternalIds.length === 0, `All _id values are unique (Found duplicates: ${duplicateInternalIds.join(', ') || 'None'})`);

  // 2. Duplicate Names & Benigno Solis verification
  const benignoCount = seedPatients.filter((p) => p.fullName === 'Benigno Solis').length;
  assert(benignoCount === 1, `Exactly 1 Benigno Solis record in seed data (Actual: ${benignoCount})`);

  const nameCounts = {};
  seedPatients.forEach((p) => {
    nameCounts[p.fullName] = (nameCounts[p.fullName] || 0) + 1;
  });
  const duplicateNames = Object.entries(nameCounts).filter(([_, c]) => c > 1);
  assert(duplicateNames.length === 0, `No unintended duplicate patient names exist (Duplicates: ${JSON.stringify(duplicateNames)})`);

  // 3. Relative Date Integrity across Day 0, 3, 7, 14, 28
  const todayStr = getRelativeDate(0);
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  let invalidDateCount = 0;
  let dateMathErrors = [];

  seedPatients.forEach((p) => {
    if (!dateRegex.test(p.day0WalkInDate)) invalidDateCount++;
    (p.pepSchedule || []).forEach((dose) => {
      if (!dateRegex.test(dose.scheduledDate)) invalidDateCount++;
      // Verify doseDay matches dayOffset
      const expectedOffsets = { 'Day 0': 0, 'Day 3': 3, 'Day 7': 7, 'Day 14': 14, 'Day 28': 28 };
      if (expectedOffsets[dose.doseDay] !== dose.dayOffset) {
        dateMathErrors.push(`${p.patientId} ${dose.doseDay} has offset ${dose.dayOffset}`);
      }
    });
  });
  assert(invalidDateCount === 0, `All dates formatted as valid YYYY-MM-DD (Invalid: ${invalidDateCount})`);
  assert(dateMathErrors.length === 0, `All doseDay mappings match dayOffset (Errors: ${dateMathErrors.join('; ') || 'None'})`);

  // 4. Due Today Cohort Verification
  const dueTodayPatients = seedPatients.filter((p) =>
    (p.pepSchedule || []).some((d) => d.status === 'Pending' && d.scheduledDate === todayStr)
  );
  assert(dueTodayPatients.length === 6, `Exactly 6 patients due today (Actual: ${dueTodayPatients.length})`);

  const dueByDay = { 'Day 0': 0, 'Day 3': 0, 'Day 7': 0, 'Day 14': 0, 'Day 28': 0 };
  dueTodayPatients.forEach((p) => {
    (p.pepSchedule || []).forEach((d) => {
      if (d.status === 'Pending' && d.scheduledDate === todayStr) {
        dueByDay[d.doseDay] = (dueByDay[d.doseDay] || 0) + 1;
      }
    });
  });
  assert(dueByDay['Day 0'] === 1, `Due today Day 0 count = 1 (Actual: ${dueByDay['Day 0']})`);
  assert(dueByDay['Day 3'] === 2, `Due today Day 3 count = 2 (Actual: ${dueByDay['Day 3']})`);
  assert(dueByDay['Day 7'] === 1, `Due today Day 7 count = 1 (Actual: ${dueByDay['Day 7']})`);
  assert(dueByDay['Day 14'] === 1, `Due today Day 14 count = 1 (Actual: ${dueByDay['Day 14']})`);
  assert(dueByDay['Day 28'] === 1, `Due today Day 28 count = 1 (Actual: ${dueByDay['Day 28']})`);

  // ---------------------------------------------------------------------------
  // SUITE 4: FEFO Expiration Sorting & Inventory Health
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 4: FEFO Expiration Sorting & Inventory Health ---');

  const seedInventory = createSeedInventory();
  assert(seedInventory.length === 7, `Seed inventory has exactly 7 batches (Actual: ${seedInventory.length})`);

  // Test getDashboardSummary in-memory path output
  let summaryResponse = null;
  const mockReq = { query: {} };
  const mockRes = {
    status: () => mockRes,
    json: (body) => {
      summaryResponse = body;
    }
  };

  await getDashboardSummary(mockReq, mockRes);
  assert(summaryResponse && summaryResponse.success === true, 'getDashboardSummary executes successfully in-memory');

  const data = summaryResponse.data;
  assert(data.activePatients === 17, `Decoupled activePatients = 17 (Actual: ${data.activePatients})`);
  assert(data.patientsDueToday === 6, `patientsDueToday = 6 (Actual: ${data.patientsDueToday})`);
  assert(
    data.dueTodayBreakdown.day0 === 1 &&
    data.dueTodayBreakdown.day3 === 2 &&
    data.dueTodayBreakdown.day7 === 1 &&
    data.dueTodayBreakdown.day14 === 1 &&
    data.dueTodayBreakdown.day28 === 1,
    `dueTodayBreakdown exact match: ${JSON.stringify(data.dueTodayBreakdown)}`
  );
  assert(data.triageQueue.length === 4, `triageQueue has 4 patients (Actual: ${data.triageQueue.length})`);
  assert(data.defaulters.length === 3, `defaulters has 3 patients (Actual: ${data.defaulters.length})`);

  // Verify defaulters sorting: descending by daysOverdue
  let defaultersCorrectlySorted = true;
  for (let i = 1; i < data.defaulters.length; i++) {
    if (data.defaulters[i].daysOverdue > data.defaulters[i - 1].daysOverdue) {
      defaultersCorrectlySorted = false;
    }
  }
  assert(defaultersCorrectlySorted, `Defaulters sorted descending by daysOverdue (${data.defaulters.map(d => d.daysOverdue).join(' >= ')})`);

  // Verify FEFO sorting of expiringBatches
  assert(Array.isArray(data.expiringBatches), 'expiringBatches is an array');
  let fefoCorrectlySorted = true;
  for (let i = 1; i < data.expiringBatches.length; i++) {
    if (data.expiringBatches[i].daysUntilExpiry < data.expiringBatches[i - 1].daysUntilExpiry) {
      fefoCorrectlySorted = false;
    }
  }
  assert(fefoCorrectlySorted, `expiringBatches is sorted ascending by daysUntilExpiry (FEFO) (${data.expiringBatches.map(b => b.daysUntilExpiry).join(' <= ')})`);

  // Stress-test FEFO sort with synthetic disordered batches
  const syntheticBatches = [
    { currentStock: 10, expirationDate: getRelativeDate(50), vaccineType: 'anti-rabies', batchNumber: 'B-50' },
    { currentStock: 5, expirationDate: getRelativeDate(10), vaccineType: 'anti-rabies', batchNumber: 'B-10' },
    { currentStock: 20, expirationDate: getRelativeDate(30), vaccineType: 'ERIG', batchNumber: 'B-30' },
    { currentStock: 0, expirationDate: getRelativeDate(5), vaccineType: 'anti-rabies', batchNumber: 'B-0-DEPLETED' }, // Stock 0 should be excluded
    { currentStock: 15, expirationDate: getRelativeDate(90), vaccineType: 'anti-tetanus', batchNumber: 'B-90-FAR' } // >60 days should be excluded
  ];

  const sixtyDaysAhead = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const testedExpiring = [];
  syntheticBatches.forEach((item) => {
    if (item.currentStock > 0 && item.expirationDate) {
      const expDate = new Date(item.expirationDate);
      if (expDate <= sixtyDaysAhead) {
        const daysUntilExpiry = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        testedExpiring.push({
          batchNumber: item.batchNumber,
          daysUntilExpiry
        });
      }
    }
  });
  testedExpiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  assert(testedExpiring.length === 3, `Synthetic FEFO filtered exactly 3 batches within 60 days with stock > 0 (Actual: ${testedExpiring.length})`);
  assert(testedExpiring[0].batchNumber === 'B-10', `First expired batch is B-10 (10 days)`);
  assert(testedExpiring[1].batchNumber === 'B-30', `Second expired batch is B-30 (30 days)`);
  assert(testedExpiring[2].batchNumber === 'B-50', `Third expired batch is B-50 (50 days)`);
  assert(!testedExpiring.some(b => b.batchNumber === 'B-0-DEPLETED'), 'Depleted batch with stock 0 is excluded from FEFO alert');
  assert(!testedExpiring.some(b => b.batchNumber === 'B-90-FAR'), 'Batch expiring in 90 days is excluded from <=60 days alert');

  console.log('\n================================================================================');
  console.log(` ADVERSARIAL STRESS TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAdversarialProbes().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
