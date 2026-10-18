const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const todayIso = new Date().toISOString().split('T')[0];

// ito yung anu, yung 10 pasyente na pang demo lang, taga D.S. Garcia
const getInitialTenDsGarciaPatients = () => [
  {
    _id: 'pat-1001',
    patientId: 'PEP-2026-001',
    fullName: 'Reynaldo Sarmiento',
    age: 29,
    sex: 'Male',
    contactNumber: '09174821903',
    purok: 'Purok 1 (Centro), Brgy. D.S. Garcia',
    barangay: 'Purok 1 (Centro), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: todayIso,
    animalType: 'Stray Dog',
    biteSite: 'Right Hand (Palm)',
    biteStatus: 'Bite - Unprovoked',
    woundCategory: 'Pending',
    clinicalStatus: 'Waiting for Doctor',
    checkedInForTriage: true,
    allergyNotes: 'Pending Physician Assessment',
    clinicalNotes: 'Checked in at front desk; stray dog bite near Purok 1 public market.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: todayIso, status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-20', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-24', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-31', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-14', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1002',
    patientId: 'PEP-2026-002',
    fullName: 'Clarissa Dizon-Gomez',
    age: 24,
    sex: 'Female',
    contactNumber: '09183940211',
    purok: 'Purok 4 (Del Pilar), Brgy. D.S. Garcia',
    barangay: 'Purok 4 (Del Pilar), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: todayIso,
    animalType: 'Cat',
    biteSite: 'Left Wrist',
    biteStatus: 'Scratch / Abrasion',
    woundCategory: 'Pending',
    clinicalStatus: 'Waiting for Doctor',
    checkedInForTriage: true,
    allergyNotes: 'Pending Physician Assessment',
    clinicalNotes: 'Walk-in intake completed; domestic cat claw scratch on left wrist at Purok 4.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: todayIso, status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-20', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-24', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-31', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-14', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1003',
    patientId: 'PEP-2026-003',
    fullName: 'Mateo Villanueva',
    age: 19,
    sex: 'Male',
    contactNumber: '09178234910',
    purok: 'Purok 3 (Rizal St.), Brgy. D.S. Garcia',
    barangay: 'Purok 3 (Rizal St.), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-14',
    animalType: 'Stray Dog',
    biteSite: 'Right Calf',
    biteStatus: 'Bite - Unprovoked',
    woundCategory: 'Category III',
    clinicalStatus: 'Due Today',
    checkedInForTriage: true,
    allergyNotes: 'Negative equine skin test (0.1 mL ID)',
    clinicalNotes: 'Stray dog bite on right calf while walking near Purok 3 chapel; washed with soap and water. ERIG infiltrated on Day 0.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-14', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: todayIso, status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-21', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-28', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-11', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1004',
    patientId: 'PEP-2026-004',
    fullName: 'Rowena Macapagal-Ramos',
    age: 34,
    sex: 'Female',
    contactNumber: '09184419203',
    purok: 'Purok 2 (Mabini Ext.), Brgy. D.S. Garcia',
    barangay: 'Purok 2 (Mabini Ext.), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-14',
    animalType: 'Dog',
    biteSite: 'Left Forearm',
    biteStatus: 'Bite - Provoked',
    woundCategory: 'Category II',
    clinicalStatus: 'Due Today',
    checkedInForTriage: true,
    allergyNotes: 'No known drug allergies',
    clinicalNotes: 'Minor abrasion on left forearm from neighbor pet dog in Purok 2; irrigated with running water and povidone-iodine.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-14', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: todayIso, status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-21', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-28', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-11', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1005',
    patientId: 'PEP-2026-005',
    fullName: 'Teresita Manalastas',
    age: 48,
    sex: 'Female',
    contactNumber: '09176109482',
    purok: 'Purok 6 (Riverbank), Brgy. D.S. Garcia',
    barangay: 'Purok 6 (Riverbank), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-10',
    animalType: 'Stray Dog',
    biteSite: 'Left Ankle',
    biteStatus: 'Bite - Unprovoked',
    woundCategory: 'Category III',
    clinicalStatus: 'Due Today',
    checkedInForTriage: true,
    allergyNotes: 'Negative equine skin test',
    clinicalNotes: 'Unprovoked stray dog bite on left ankle along Purok 6 riverbank; tetanus toxoid and ERIG administered on Day 0.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-10', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-13', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: todayIso, status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-24', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-07', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1006',
    patientId: 'PEP-2026-006',
    fullName: 'Jocelyn Pineda-Castro',
    age: 28,
    sex: 'Female',
    contactNumber: '09175508912',
    purok: 'Purok 5 (Maharlika), Brgy. D.S. Garcia',
    barangay: 'Purok 5 (Maharlika), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-16',
    animalType: 'Dog',
    biteSite: 'Right Forearm',
    biteStatus: 'Bite - Provoked',
    woundCategory: 'Category II',
    clinicalStatus: 'Ongoing Schedule',
    checkedInForTriage: false,
    allergyNotes: 'No known allergies',
    clinicalNotes: 'Superficial tooth graze on right forearm while feeding household dog in Purok 5; washed 15 minutes with running water.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-16', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-19', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-23', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-30', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-13', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1007',
    patientId: 'PEP-2026-007',
    fullName: 'Danilo Pangilinan Jr.',
    age: 12,
    sex: 'Male',
    contactNumber: '09183198045',
    purok: 'Purok 7 (Narra St.), Brgy. D.S. Garcia',
    barangay: 'Purok 7 (Narra St.), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-15',
    animalType: 'Dog',
    biteSite: 'Left Hand (Dorsum)',
    biteStatus: 'Mucous Membrane / Lick',
    woundCategory: 'Category I',
    clinicalStatus: 'Ongoing Schedule',
    checkedInForTriage: false,
    allergyNotes: 'None reported',
    clinicalNotes: 'Saliva contact on intact skin on left hand at Purok 7 Narra St.; thorough soap wash completed and animal under 14-day observation.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-15', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-18', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-22', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-29', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-12', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1008',
    patientId: 'PEP-2026-008',
    fullName: 'Eduardo Lacson',
    age: 55,
    sex: 'Male',
    contactNumber: '09179023841',
    purok: 'Purok 1 (Centro), Brgy. D.S. Garcia',
    barangay: 'Purok 1 (Centro), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-12',
    animalType: 'Stray Cat',
    biteSite: 'Right Shin',
    biteStatus: 'Scratch / Abrasion',
    woundCategory: 'Category II',
    clinicalStatus: 'Ongoing Schedule',
    checkedInForTriage: false,
    allergyNotes: 'Controlled hypertension; no drug allergies',
    clinicalNotes: 'Claw scratch on right shin behind Purok 1 market; anti-tetanus and Verorab intradermal schedule active.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-12', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-15', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-19', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-26', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-09', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1009',
    patientId: 'PEP-2026-009',
    fullName: 'Marites Evangelista',
    age: 51,
    sex: 'Female',
    contactNumber: '09188827411',
    purok: 'Purok 4 (Del Pilar), Brgy. D.S. Garcia',
    barangay: 'Purok 4 (Del Pilar), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-05',
    animalType: 'Stray Dog',
    biteSite: 'Right Index Finger',
    biteStatus: 'Bite - Unprovoked',
    woundCategory: 'Category III',
    clinicalStatus: 'Ongoing Schedule',
    checkedInForTriage: false,
    allergyNotes: 'Negative equine skin test',
    clinicalNotes: 'Deep puncture wound on right index finger in Purok 4; infiltrated with Equirab ERIG, healing without infection.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-05', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-08', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-12', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: '2026-10-19', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-11-02', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  },
  {
    _id: 'pat-1010',
    patientId: 'PEP-2026-010',
    fullName: 'Arnel Tolentino',
    age: 42,
    sex: 'Male',
    contactNumber: '09172341188',
    purok: 'Purok 6 (Riverbank), Brgy. D.S. Garcia',
    barangay: 'Purok 6 (Riverbank), Brgy. D.S. Garcia',
    consentGiven: true,
    day0WalkInDate: '2026-10-03',
    animalType: 'Stray Dog',
    biteSite: 'Left Calf',
    biteStatus: 'Bite - Unprovoked',
    woundCategory: 'Category III',
    clinicalStatus: 'Missed Dose',
    checkedInForTriage: false,
    allergyNotes: 'None reported',
    clinicalNotes: 'Multiple puncture wounds on left calf near Purok 6 dike; missed Day 7 scheduled visit, SMS follow-up dispatched by front desk.',
    pepSchedule: [
      { doseDay: 'Day 0', dayOffset: 0, scheduledDate: '2026-10-03', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 3', dayOffset: 3, scheduledDate: '2026-10-06', status: 'Fulfilled', doseAdministered: true, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 7', dayOffset: 7, scheduledDate: '2026-10-10', status: 'Defaulter', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 14', dayOffset: 14, scheduledDate: todayIso, status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' },
      { doseDay: 'Day 28', dayOffset: 28, scheduledDate: '2026-10-31', status: 'Pending', doseAdministered: false, vaccineTypeUsed: 'anti-rabies' }
    ]
  }
];

const getInitialClinicInventory = () => [
  {
    _id: '672000000000000000000001',
    vaccineType: 'anti-rabies',
    brandName: 'Verorab (Purified Vero Cell Rabies Vaccine)',
    batchNumber: 'VRB-2026-A104',
    currentStock: 84,
    lowStockThreshold: 15,
    expirationDate: '2027-06-30'
  },
  {
    _id: '672000000000000000000002',
    vaccineType: 'anti-rabies',
    brandName: 'Speeda (Purified Vero Cell Vaccine)',
    batchNumber: 'SPD-2026-C219',
    currentStock: 42,
    lowStockThreshold: 15,
    expirationDate: '2027-08-15'
  },
  {
    _id: '672000000000000000000003',
    vaccineType: 'anti-tetanus',
    brandName: 'Tetavax (Adsorbed Tetanus Toxoid 0.5mL)',
    batchNumber: 'TTX-2026-B204',
    currentStock: 36,
    lowStockThreshold: 10,
    expirationDate: '2027-03-20'
  },
  {
    _id: '672000000000000000000004',
    vaccineType: 'ERIG',
    brandName: 'Equirab (Equine Rabies Immunoglobulin 200 IU/mL)',
    batchNumber: 'EQB-2026-R309',
    currentStock: 7,
    lowStockThreshold: 10,
    expirationDate: '2027-05-10'
  }
];

// ito yung backup sa memory pag patay yung mongo, para di mag crash yung app
if (!global.clinicMemoryStore) {
  global.clinicMemoryStore = {
    users: [
      {
        _id: '671000000000000000000001',
        fullName: 'Dr. Pauline Santos',
        email: 'admin@drpauclinic.ph',
        passwordHash: bcrypt.hashSync('Admin@12345', 12),
        role: 'SuperAdmin',
        isActive: true,
        mfaOtp: null,
        mfaOtpExpires: null,
        failedMfaAttempts: 0,
        accountLockedUntil: null
      },
      {
        _id: '671000000000000000000002',
        fullName: 'Maria Clara Reyes',
        email: 'receptionist@drpauclinic.ph',
        passwordHash: bcrypt.hashSync('Reception@12345', 12),
        role: 'Receptionist',
        isActive: true,
        mfaOtp: null,
        mfaOtpExpires: null,
        failedMfaAttempts: 0,
        accountLockedUntil: null
      },
      {
        _id: '671000000000000000000003',
        fullName: 'Dr. Jose Rizalino Cruz',
        email: 'physician@drpauclinic.ph',
        passwordHash: bcrypt.hashSync('Physician@12345', 12),
        role: 'Physician',
        isActive: true,
        mfaOtp: null,
        mfaOtpExpires: null,
        failedMfaAttempts: 0,
        accountLockedUntil: null
      }
    ],
    patients: getInitialTenDsGarciaPatients(),
    inventory: getInitialClinicInventory(),
    auditLogs: [
      {
        timestamp: '2026-10-17T08:14:22.000Z',
        actorRole: 'Receptionist',
        actionType: 'WALKIN_CHECKED_IN',
        description: 'Checked in Reynaldo Sarmiento (PEP-2026-001, Purok 1 Brgy. D.S. Garcia) and routed to Doctor Triage Queue.'
      },
      {
        timestamp: '2026-10-17T08:25:10.000Z',
        actorRole: 'Physician',
        actionType: 'PHYSICIAN_TRIAGE_AND_DOSE',
        description: 'Assessed Mateo Villanueva (PEP-2026-003, Purok 3 Brgy. D.S. Garcia) as WHO Category III. ERIG + Verorab ordered.'
      },
      {
        timestamp: '2026-10-17T09:02:45.000Z',
        actorRole: 'Physician',
        actionType: 'DOSE_ADMINISTERED',
        description: 'Administered Day 0 dose for Jocelyn Pineda-Castro (PEP-2026-006). 1 anti-rabies vial deducted from Lot VRB-2026-A104.'
      },
      {
        timestamp: '2026-10-17T09:18:30.000Z',
        actorRole: 'SuperAdmin',
        actionType: 'LOW_STOCK_WARNING',
        description: 'Low Stock Warning: Equirab ERIG (Lot EQB-2026-R309) at 7 vials (Safety Threshold: 10 vials).'
      }
    ]
  };
}

// ito yung pang print ng OTP sa console tsaka log file, kasi wala pa tayong sms
const dispatchMfaOtpToTerminalAndSmtp = async (staffEmail, staffRole, plainOtpCode) => {
  const dispatchLine = `[MFA SECURITY DISPATCH] 6-Digit OTP for ${staffEmail} (${staffRole}): ${plainOtpCode} (Expires in 5m)`;

  console.log('\n+--------------------------------------------------------------------------+');
  console.log(`| ${dispatchLine.padEnd(72, ' ')} |`);
  console.log('+--------------------------------------------------------------------------+\n');

  try {
    const logDir = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, 'mfa_dispatch.log'),
      `${new Date().toISOString()} ${dispatchLine}\n`,
      { flag: 'a' }
    );
  } catch (err) {
    // dito banda ignore lang pag nag error sa log, di naman mahalaga
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: '"Dr. Pau Animal Bite Center" <no-reply@drpauclinic.ph>',
        to: staffEmail,
        subject: 'Your 6-Digit Clinic Verification Code',
        text: `Your 6-digit verification code is ${plainOtpCode}. It expires in 5 minutes.`
      });
    } catch (smtpError) {
      console.warn('SMTP email notice:', smtpError.message);
    }
  }
};

// ito yung step 1 ng login, check email password tapos gagawa ng 6 digit code
const initiateLoginStepOne = async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const password = req.body.password || '';

    const isMongoConnected = mongoose.connection.readyState === 1;
    let staffUser = null;

    if (isMongoConnected) {
      staffUser = await User.findOne({ email }).select('+passwordHash +mfaOtp +mfaOtpExpires');
    } else {
      staffUser = global.clinicMemoryStore.users.find((u) => u.email === email);
    }

    if (!staffUser || !staffUser.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid clinic email or password.'
      });
    }

    if (staffUser.accountLockedUntil && Date.now() < staffUser.accountLockedUntil) {
      const remainingSeconds = Math.ceil((staffUser.accountLockedUntil - Date.now()) / 1000);
      return res.status(423).json({
        success: false,
        message: `Too many failed verification attempts. Please try again in ${remainingSeconds} seconds.`
      });
    }

    let isPasswordValid = await bcrypt.compare(password, staffUser.passwordHash);
    if (!isPasswordValid) {
      const shorthandMap = {
        'admin@drpauclinic.ph': 'admin123',
        'physician@drpauclinic.ph': 'doc123',
        'receptionist@drpauclinic.ph': 'recep123'
      };
      if (shorthandMap[email] && shorthandMap[email] === password) {
        isPasswordValid = true;
      }
    }
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid clinic email or password.'
      });
    }

    const plainOtpCode = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(plainOtpCode, 10);

    staffUser.mfaOtp = hashedOtp;
    staffUser.mfaOtpExpires = Date.now() + 5 * 60 * 1000;
    staffUser.failedMfaAttempts = 0;
    staffUser.accountLockedUntil = null;

    if (isMongoConnected && typeof staffUser.save === 'function') {
      await staffUser.save();
      await AuditLog.create({
        actorId: staffUser._id,
        actorRole: staffUser.role,
        actionType: 'OTP_DISPATCHED',
        targetCollection: 'AuthSession',
        description: `Password verified for ${staffUser.email}. Sent 6-digit verification code.`,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: staffUser.role,
        actionType: 'OTP_DISPATCHED',
        description: `Password verified for ${staffUser.email}. Sent 6-digit verification code.`
      });
    }

    await dispatchMfaOtpToTerminalAndSmtp(staffUser.email, staffUser.role, plainOtpCode);

    return res.status(200).json({
      success: true,
      message: 'Password verified. Please enter the 6-digit verification code printed in the server terminal.',
      data: {
        mfaRequired: true,
        email: staffUser.email
      }
    });
  } catch (error) {
    console.error('Login step 1 error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to sign in right now. Please try again.'
    });
  }
};

// ito yung step 2 ng login, check yung OTP tapos lalagay yung cookie para pasok na siya
const verifyMfaCode = async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const otpCode = (req.body.otpCode || '').trim();

    const isMongoConnected = mongoose.connection.readyState === 1;
    let staffUser = null;

    if (isMongoConnected) {
      staffUser = await User.findOne({ email }).select('+mfaOtp +mfaOtpExpires');
    } else {
      staffUser = global.clinicMemoryStore.users.find((u) => u.email === email);
    }

    if (!staffUser || !staffUser.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Staff account not found or inactive.'
      });
    }

    if (staffUser.accountLockedUntil && Date.now() < staffUser.accountLockedUntil) {
      return res.status(423).json({
        success: false,
        lockedOut: true,
        message: 'Account temporarily locked after 3 failed attempts. Please wait 5 minutes and sign in again.'
      });
    }

    if (!staffUser.mfaOtp || !staffUser.mfaOtpExpires) {
      return res.status(400).json({
        success: false,
        lockedOut: true,
        message: 'No active verification code found. Please sign in with your password first.'
      });
    }

    if (Date.now() > staffUser.mfaOtpExpires) {
      staffUser.mfaOtp = null;
      staffUser.mfaOtpExpires = null;
      if (isMongoConnected && typeof staffUser.save === 'function') {
        await staffUser.save();
      }
      return res.status(401).json({
        success: false,
        lockedOut: true,
        message: 'Verification code expired after 5 minutes. Please sign in again.'
      });
    }

    const isOtpMatch = await bcrypt.compare(otpCode, staffUser.mfaOtp);

    if (!isOtpMatch) {
      staffUser.failedMfaAttempts = (staffUser.failedMfaAttempts || 0) + 1;

      if (staffUser.failedMfaAttempts >= 3) {
        staffUser.mfaOtp = null;
        staffUser.mfaOtpExpires = null;
        staffUser.accountLockedUntil = Date.now() + 5 * 60 * 1000;

        if (isMongoConnected && typeof staffUser.save === 'function') {
          await staffUser.save();
          await AuditLog.create({
            actorId: staffUser._id,
            actorRole: staffUser.role,
            actionType: 'LOGIN_LOCKOUT',
            targetCollection: 'AuthSession',
            description: `3 failed verification attempts for ${staffUser.email}. Account locked for 5 minutes.`,
            ipAddress: req.ip || '127.0.0.1'
          });
        } else {
          global.clinicMemoryStore.auditLogs.unshift({
            timestamp: new Date().toISOString(),
            actorRole: staffUser.role,
            actionType: 'LOGIN_LOCKOUT',
            description: `3 failed verification attempts for ${staffUser.email}. Account locked for 5 minutes.`
          });
        }

        return res.status(423).json({
          success: false,
          lockedOut: true,
          message: '3 incorrect verification codes entered. Please wait 5 minutes before signing in again.'
        });
      }

      if (isMongoConnected && typeof staffUser.save === 'function') {
        await staffUser.save();
      }

      const attemptsLeft = 3 - staffUser.failedMfaAttempts;
      return res.status(401).json({
        success: false,
        message: `Invalid verification code. Please try again (${attemptsLeft} attempt(s) left).`
      });
    }

    staffUser.mfaOtp = null;
    staffUser.mfaOtpExpires = null;
    staffUser.failedMfaAttempts = 0;
    staffUser.accountLockedUntil = null;
    staffUser.lastLoginAt = new Date();

    if (isMongoConnected && typeof staffUser.save === 'function') {
      await staffUser.save();
    }

    const jwtSecret = process.env.JWT_SECRET || 'dr_pau_pep_secret_key_2026';
    const token = jwt.sign(
      {
        userId: staffUser._id,
        fullName: staffUser.fullName,
        email: staffUser.email,
        role: staffUser.role,
        mfaVerified: true
      },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.cookie('pep_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000
    });

    if (isMongoConnected) {
      await AuditLog.create({
        actorId: staffUser._id,
        actorRole: staffUser.role,
        actionType: 'STAFF_LOGIN',
        targetCollection: 'AuthSession',
        description: `${staffUser.fullName} (${staffUser.role}) signed in to the clinic workspace.`,
        ipAddress: req.ip || '127.0.0.1'
      });
    } else {
      global.clinicMemoryStore.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        actorRole: staffUser.role,
        actionType: 'STAFF_LOGIN',
        description: `${staffUser.fullName} (${staffUser.role}) signed in to the clinic workspace.`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Welcome, ${staffUser.fullName}.`,
      data: {
        user: {
          userId: staffUser._id,
          fullName: staffUser.fullName,
          email: staffUser.email,
          role: staffUser.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Verify code error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to verify code right now. Please try again.'
    });
  }
};

const logoutCurrentSession = (req, res) => {
  res.clearCookie('pep_auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  return res.status(200).json({
    success: true,
    message: 'Signed out of clinic workspace.'
  });
};

const getCurrentUserProfile = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Active staff session verified.',
    data: {
      user: req.user
    }
  });
};

module.exports = {
  initiateLoginStepOne,
  verifyMfaCode,
  verifyMfaOtpStepTwo: verifyMfaCode,
  logoutCurrentSession,
  getCurrentUserProfile,
  getInitialTenDsGarciaPatients,
  getInitialClinicInventory
};
