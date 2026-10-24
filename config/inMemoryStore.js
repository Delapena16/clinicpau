// In-memory data store for when MongoDB is unreachable
// Provides realistic, authentic demo data matching WHO & DOH clinical protocols

function getRelativeDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createSeedPatients() {
  return [
    // -------------------------------------------------------------
    // TRIAGE QUEUE (Waiting for Doctor, Category Pending)
    // Walk-in patients awaiting physician assessment before schedule creation
    // -------------------------------------------------------------
    {
      _id: 'p-001',
      patientId: 'PEP-2026-001',
      fullName: 'Reynaldo Sarmiento',
      age: 29,
      sex: 'Male',
      contactNumber: '09171234501',
      purok: 'Purok 1, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(0),
      animalType: 'Stray Dog',
      biteSite: 'Right Hand (Palm)',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Pending',
      clinicalStatus: 'Waiting for Doctor',
      checkedInForTriage: true,
      allergyNotes: 'Pending Physician Assessment',
      clinicalNotes: 'Deep bleeding puncture on thenar eminence. Unprovoked stray dog bite.',
      pepSchedule: []
    },
    {
      _id: 'p-002',
      patientId: 'PEP-2026-002',
      fullName: 'Clarissa Dizon-Gomez',
      age: 24,
      sex: 'Female',
      contactNumber: '09171234502',
      purok: 'Purok 4, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(0),
      animalType: 'Domestic Cat',
      biteSite: 'Left Wrist',
      biteStatus: 'Scratch - Deep',
      woundCategory: 'Pending',
      clinicalStatus: 'Waiting for Doctor',
      checkedInForTriage: true,
      allergyNotes: 'Pending Physician Assessment',
      clinicalNotes: 'Oozing scratch from household cat while feeding. Cat is healthy and observable.',
      pepSchedule: []
    },
    {
      _id: 'p-011',
      patientId: 'PEP-2026-011',
      fullName: 'Benigno Solis',
      age: 27,
      sex: 'Male',
      contactNumber: '09178823412',
      purok: 'Purok 2, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(0),
      animalType: 'Domestic Dog',
      biteSite: 'Right Hand',
      biteStatus: 'Bite - Provoked',
      woundCategory: 'Pending',
      clinicalStatus: 'Waiting for Doctor',
      checkedInForTriage: true,
      allergyNotes: 'Pending Physician Assessment',
      clinicalNotes: 'Superficial canine tooth scrape. Pet dog with updated anti-rabies tag.',
      pepSchedule: []
    },
    {
      _id: 'p-012',
      patientId: 'PEP-2026-012',
      fullName: 'Marites Navarro',
      age: 38,
      sex: 'Female',
      contactNumber: '09184451293',
      purok: 'Purok 5, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(0),
      animalType: 'Stray Cat',
      biteSite: 'Left Forearm',
      biteStatus: 'Scratch - Deep',
      woundCategory: 'Pending',
      clinicalStatus: 'Waiting for Doctor',
      checkedInForTriage: true,
      allergyNotes: 'Pending Physician Assessment',
      clinicalNotes: 'Deep scratch from community stray cat. Wound washed with soap and clean water.',
      pepSchedule: []
    },

    // -------------------------------------------------------------
    // PATIENTS DUE TODAY (Breakdown across Day 0, 3, 7, 14, 28)
    // -------------------------------------------------------------
    // Day 0 Due Today: Assessed walk-in ready for initial dose
    {
      _id: 'p-004',
      patientId: 'PEP-2026-004',
      fullName: 'Rowena Macapagal-Ramos',
      age: 34,
      sex: 'Female',
      contactNumber: '09171234504',
      purok: 'Purok 2, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(0),
      animalType: 'Domestic Dog',
      biteSite: 'Right Forearm',
      biteStatus: 'Bite - Provoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Due Today',
      checkedInForTriage: true,
      allergyNotes: 'No known drug allergies (NKDA)',
      clinicalNotes: 'Minor bleeding puncture. Day 0 dose scheduled for immediate administration.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(0), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(3), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(7), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(14), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(28), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Day 3 Due Today (Patient 1)
    {
      _id: 'p-003',
      patientId: 'PEP-2026-003',
      fullName: 'Mateo Villanueva',
      age: 19,
      sex: 'Male',
      contactNumber: '09171234503',
      purok: 'Purok 3, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-3),
      animalType: 'Stray Dog',
      biteSite: 'Right Calf',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category III',
      clinicalStatus: 'Due Today',
      checkedInForTriage: true,
      allergyNotes: 'Negative equine skin test; ERIG infiltrated on Day 0',
      clinicalNotes: 'Day 0 anti-rabies + ERIG complete. Arrived for scheduled Day 3 dose.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-3), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-3) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(0), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(4), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(11), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(25), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Day 3 Due Today (Patient 2)
    {
      _id: 'p-005',
      patientId: 'PEP-2026-005',
      fullName: 'Teresita Manalastas',
      age: 48,
      sex: 'Female',
      contactNumber: '09171234505',
      purok: 'Purok 6, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-3),
      animalType: 'Stray Cat',
      biteSite: 'Left Hand',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category III',
      clinicalStatus: 'Due Today',
      checkedInForTriage: true,
      allergyNotes: 'NKDA; ERIG infiltrated at local health center',
      clinicalNotes: 'Day 0 dose verified. Present for Day 3 follow-up booster.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-3), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-3) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(0), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(4), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(11), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(25), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Day 7 Due Today
    {
      _id: 'p-006',
      patientId: 'PEP-2026-006',
      fullName: 'Jocelyn Pineda-Castro',
      age: 28,
      sex: 'Female',
      contactNumber: '09171234506',
      purok: 'Purok 5, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-7),
      animalType: 'Domestic Dog',
      biteSite: 'Left Ankle',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Due Today',
      checkedInForTriage: true,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Day 0 & Day 3 completed without adverse reaction. Reporting for Day 7.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-7), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-7) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-4), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-4) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(0), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(7), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(21), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Day 14 Due Today
    {
      _id: 'p-007',
      patientId: 'PEP-2026-007',
      fullName: 'Danilo Pangilinan Jr.',
      age: 12,
      sex: 'Male',
      contactNumber: '09171234507',
      purok: 'Purok 7, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-14),
      animalType: 'Domestic Dog',
      biteSite: 'Right Leg',
      biteStatus: 'Bite - Provoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Due Today',
      checkedInForTriage: true,
      allergyNotes: 'No known allergies; pediatric guardian present',
      clinicalNotes: 'Day 0, 3, and 7 completed. Reporting for Day 14 dose.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-14), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-14) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-11), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-11) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-7), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-7) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(0), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(14), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Day 28 Due Today
    {
      _id: 'p-008',
      patientId: 'PEP-2026-008',
      fullName: 'Eduardo Lacson',
      age: 55,
      sex: 'Male',
      contactNumber: '09171234508',
      purok: 'Purok 1, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-28),
      animalType: 'Stray Cat',
      biteSite: 'Left Thumb',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Due Today',
      checkedInForTriage: true,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Full compliance on Days 0, 3, 7, 14. Here for final Day 28 booster.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-28), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-28) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-25), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-25) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-21), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-21) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(-14), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-14) },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(0), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },

    // -------------------------------------------------------------
    // ACTIVE PEP PATIENTS (Ongoing Treatment, Future Scheduled Doses)
    // -------------------------------------------------------------
    {
      _id: 'p-009',
      patientId: 'PEP-2026-009',
      fullName: 'Marites Evangelista',
      age: 51,
      sex: 'Female',
      contactNumber: '09171234509',
      purok: 'Purok 4, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-5),
      animalType: 'Stray Dog',
      biteSite: 'Right Knee',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category III',
      clinicalStatus: 'Under Treatment',
      checkedInForTriage: false,
      allergyNotes: 'NKDA; ERIG complete',
      clinicalNotes: 'Day 0 & Day 3 completed. Day 7 scheduled in 2 days.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-5), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-5) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-2), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-2) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(2), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(9), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(23), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    {
      _id: 'p-013',
      patientId: 'PEP-2026-013',
      fullName: 'Gabriel Mendoza',
      age: 33,
      sex: 'Male',
      contactNumber: '09192238475',
      purok: 'Purok 3, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-10),
      animalType: 'Domestic Dog',
      biteSite: 'Left Thigh',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Under Treatment',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Day 0, 3, 7 doses complete. Day 14 due in 4 days.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-10), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-10) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-7), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-7) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-3), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-3) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(4), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(18), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    {
      _id: 'p-014',
      patientId: 'PEP-2026-014',
      fullName: 'Teresa Bautista',
      age: 45,
      sex: 'Female',
      contactNumber: '09201192834',
      purok: 'Purok 1, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-18),
      animalType: 'Domestic Cat',
      biteSite: 'Right Wrist',
      biteStatus: 'Scratch - Deep',
      woundCategory: 'Category II',
      clinicalStatus: 'Under Treatment',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Excellent adherence. Day 28 final dose scheduled in 10 days.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-18), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-18) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-15), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-15) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-11), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-11) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(-4), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-4) },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(10), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    {
      _id: 'p-019',
      patientId: 'PEP-2026-019',
      fullName: 'Fernando Santos',
      age: 22,
      sex: 'Male',
      contactNumber: '09165543218',
      purok: 'Purok 6, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-8),
      animalType: 'Stray Dog',
      biteSite: 'Left Knee',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category III',
      clinicalStatus: 'Under Treatment',
      checkedInForTriage: false,
      allergyNotes: 'NKDA; ERIG infiltrated on Day 0',
      clinicalNotes: 'Day 0, 3, 7 completed. Day 14 due in 6 days.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-8), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-8) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-5), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-5) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-1), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-1) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(6), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(20), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },

    // -------------------------------------------------------------
    // DEFAULTERS / MISSED DOSES (Actionable Recall List)
    // -------------------------------------------------------------
    // Defaulter 1: Missed Day 7 (3 days overdue)
    {
      _id: 'p-010',
      patientId: 'PEP-2026-010',
      fullName: 'Arnel Tolentino',
      age: 42,
      sex: 'Male',
      contactNumber: '09173345821',
      purok: 'Purok 6, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-10),
      animalType: 'Stray Dog',
      biteSite: 'Right Ankle',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category III',
      clinicalStatus: 'Missed Dose',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'URGENT RECALL: Patient failed to appear for Day 7 booster. Contacted via SMS.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-10), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-10) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-7), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-7) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-3), status: 'Defaulter', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(4), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(18), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Defaulter 2: Missed Day 14 (5 days overdue)
    {
      _id: 'p-015',
      patientId: 'PEP-2026-015',
      fullName: 'Rodrigo Castillo',
      age: 41,
      sex: 'Male',
      contactNumber: '09185542190',
      purok: 'Purok 3, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-19),
      animalType: 'Domestic Dog',
      biteSite: 'Left Calf',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Missed Dose',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'ACTION REQUIRED: Day 14 dose missed by 5 days. Barangay health worker notified for home visit.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-19), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-19) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-16), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-16) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-12), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-12) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(-5), status: 'Defaulter', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(9), status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },
    // Defaulter 3: Missed Day 28 (6 days overdue)
    {
      _id: 'p-016',
      patientId: 'PEP-2026-016',
      fullName: 'Carmela Velasquez',
      age: 36,
      sex: 'Female',
      contactNumber: '09204418932',
      purok: 'Purok 7, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-34),
      animalType: 'Stray Dog',
      biteSite: 'Right Shoulder',
      biteStatus: 'Bite - Unprovoked',
      woundCategory: 'Category III',
      clinicalStatus: 'Missed Dose',
      checkedInForTriage: false,
      allergyNotes: 'NKDA; ERIG complete',
      clinicalNotes: 'HIGH RISK: Cat III stray dog exposure missed Day 28 final booster dose. Call placed to 09204418932.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-34), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-34) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-31), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-31) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-27), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-27) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(-20), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-20) },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(-6), status: 'Defaulter', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
      ]
    },

    // -------------------------------------------------------------
    // REGIMEN COMPLETED & CATEGORY I RECORDS
    // -------------------------------------------------------------
    {
      _id: 'p-017',
      patientId: 'PEP-2026-017',
      fullName: 'Antonio Rivera',
      age: 59,
      sex: 'Male',
      contactNumber: '09176654321',
      purok: 'Purok 2, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-40),
      animalType: 'Domestic Dog',
      biteSite: 'Left Forearm',
      biteStatus: 'Bite - Provoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Completed',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Full 5-dose intramuscular Essen regimen successfully completed. Patient discharged.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-40), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-40) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-37), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-37) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-33), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-33) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(-26), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-26) },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(-12), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-12) }
      ]
    },
    {
      _id: 'p-018',
      patientId: 'PEP-2026-018',
      fullName: 'Corazon Aquino-Cruz',
      age: 62,
      sex: 'Female',
      contactNumber: '09228876543',
      purok: 'Purok 4, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-2),
      animalType: 'Domestic Cat',
      biteSite: 'Right Arm',
      biteStatus: 'Exposure - Non-bite',
      woundCategory: 'Category I',
      clinicalStatus: 'Wound Cleansing Only',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Touching/feeding pet cat; intact skin without scratches or lesions. Thorough 15-minute soap-and-water wound cleansing performed. No PEP vaccine required.',
      pepSchedule: []
    },
    {
      _id: 'p-020',
      patientId: 'PEP-2026-020',
      fullName: 'Lourdes Garcia',
      age: 47,
      sex: 'Female',
      contactNumber: '09193321456',
      purok: 'Purok 5, Kapitan Pepe',
      barangay: 'Brgy. Kapitan Pepe',
      consentGiven: true,
      day0WalkInDate: getRelativeDate(-35),
      animalType: 'Domestic Dog',
      biteSite: 'Right Ankle',
      biteStatus: 'Bite - Provoked',
      woundCategory: 'Category II',
      clinicalStatus: 'Completed',
      checkedInForTriage: false,
      allergyNotes: 'NKDA',
      clinicalNotes: 'Completed full PEP course. Follow-up antibody titer recommended if immunosuppressed.',
      pepSchedule: [
        { doseDay: 'Day 0', dayOffset: 0, scheduledDate: getRelativeDate(-35), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-35) },
        { doseDay: 'Day 3', dayOffset: 3, scheduledDate: getRelativeDate(-32), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-32) },
        { doseDay: 'Day 7', dayOffset: 7, scheduledDate: getRelativeDate(-28), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-28) },
        { doseDay: 'Day 14', dayOffset: 14, scheduledDate: getRelativeDate(-21), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-21) },
        { doseDay: 'Day 28', dayOffset: 28, scheduledDate: getRelativeDate(-7), status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies', dateProcessed: getRelativeDate(-7) }
      ]
    }
  ];
}

function createSeedInventory() {
  return [
    {
      _id: '1',
      vaccineType: 'anti-rabies',
      brandName: 'Verorab (Purified Vero Cell Rabies Vaccine)',
      batchNumber: 'VRB-2026-A104',
      currentStock: 84,
      lowStockThreshold: 15,
      expirationDate: getRelativeDate(240)
    },
    {
      _id: '2',
      vaccineType: 'anti-rabies',
      brandName: 'Speeda (Purified Vero Cell Vaccine)',
      batchNumber: 'SPD-2026-C219',
      currentStock: 42,
      lowStockThreshold: 15,
      expirationDate: getRelativeDate(300)
    },
    {
      _id: '3',
      vaccineType: 'anti-rabies',
      brandName: 'Verorab (Purified Vero Cell Rabies Vaccine)',
      batchNumber: 'VRB-2026-N088',
      currentStock: 14,
      lowStockThreshold: 10,
      expirationDate: getRelativeDate(25) // Early warning: approaching expiry (< 30 days)
    },
    {
      _id: '4',
      vaccineType: 'anti-tetanus',
      brandName: 'Tetavax (Adsorbed Tetanus Toxoid 0.5mL)',
      batchNumber: 'TTX-2026-B204',
      currentStock: 36,
      lowStockThreshold: 10,
      expirationDate: getRelativeDate(180)
    },
    {
      _id: '5',
      vaccineType: 'anti-tetanus',
      brandName: 'Tetavax (Adsorbed Tetanus Toxoid 0.5mL)',
      batchNumber: 'TTX-2026-D115',
      currentStock: 18,
      lowStockThreshold: 10,
      expirationDate: getRelativeDate(360)
    },
    {
      _id: '6',
      vaccineType: 'ERIG',
      brandName: 'Equirab (Equine Rabies Immunoglobulin 200 IU/mL)',
      batchNumber: 'EQB-2026-R309',
      currentStock: 7, // Critical restock: stock 7 <= safety threshold 10
      lowStockThreshold: 10,
      expirationDate: getRelativeDate(210)
    },
    {
      _id: '7',
      vaccineType: 'ERIG',
      brandName: 'Equirab (Equine Rabies Immunoglobulin 200 IU/mL)',
      batchNumber: 'EQB-2026-S412',
      currentStock: 25,
      lowStockThreshold: 10,
      expirationDate: getRelativeDate(420)
    }
  ];
}

const inMemoryStore = {
  users: [
    { _id: 'admin@drpauclinic.ph', fullName: 'Dr. Edgar Rivera', email: 'admin@drpauclinic.ph', role: 'SuperAdmin', isActive: true },
    { _id: 'receptionist@drpauclinic.ph', fullName: 'Amen Leaderr', email: 'receptionist@drpauclinic.ph', role: 'Receptionist', isActive: true },
    { _id: 'physician@drpauclinic.ph', fullName: 'Dr. Jose Rizalino Cruz', email: 'physician@drpauclinic.ph', role: 'Physician', isActive: true }
  ],
  patients: createSeedPatients(),
  inventory: createSeedInventory(),
  auditLogs: [],
  staffAccounts: [
    { _id: 'admin@drpauclinic.ph', fullName: 'Dr. Edgar Rivera', email: 'admin@drpauclinic.ph', role: 'SuperAdmin', isActive: true },
    { _id: 'receptionist@drpauclinic.ph', fullName: 'Amen Leaderr', email: 'receptionist@drpauclinic.ph', role: 'Receptionist', isActive: true },
    { _id: 'physician@drpauclinic.ph', fullName: 'Dr. Jose Rizalino Cruz', email: 'physician@drpauclinic.ph', role: 'Physician', isActive: true }
  ],
  isMongoConnected: false
};

// Check if MongoDB is connected
function isMongoAvailable() {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
}

module.exports = {
  inMemoryStore,
  createSeedPatients,
  createSeedInventory,
  getRelativeDate,
  isMongoAvailable
};
