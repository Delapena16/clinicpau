const todayDateIso = new Date().toISOString().split('T')[0];

const ROLE_NAVIGATION_MAP = {
  Receptionist: [
    { viewId: 'viewRecQueue', label: 'Front Desk Queue' },
    { viewId: 'viewRecIntake', label: 'New Walk-In Intake' },
    { viewId: 'viewRecFollowUp', label: 'Follow-Up Schedule' }
  ],
  Physician: [
    { viewId: 'viewPhysTriage', label: "Doctor's Triage & Dosing" },
    { viewId: 'viewPhysRecords', label: 'Patient PEP Records' },
    { viewId: 'viewPhysInventory', label: 'Vaccine Stock' }
  ],
  SuperAdmin: [
    { viewId: 'viewAdminOverview', label: 'Clinic Overview' },
    { viewId: 'viewAdminInventory', label: 'Vaccine Stock & Restock' },
    { viewId: 'viewAdminForecast', label: 'Monthly Stock Forecast' },
    { viewId: 'viewAdminRegistry', label: 'Patient Registry' },
    { viewId: 'viewAdminStaff', label: 'Staff Accounts' }
  ]
};

const WHO_CATEGORY_HINTS = {
  'Category I': 'Wash wound thoroughly for 15 minutes; no vaccine required.',
  'Category II': 'Anti-Rabies vaccine schedule (Days 0, 3, 7, 14, 28).',
  'Category III': 'ERIG wound infiltration + Anti-Rabies schedule (Days 0, 3, 7, 14, 28).'
};

const clinicAppState = {
  authenticatedUser: null,
  activeViewId: '',
  pendingLoginEmail: '',
  selectedPatientId: '',
  recQueueFilter: 'All',
  recFollowUpFilter: 'All',
  physQueueFilter: 'All',
  physRecordsFilter: 'All',
  adminRegistryFilter: 'All',
  pendingModalDose: null,
  patients: [],
  inventory: [],
  staffAccounts: [],
  auditLogs: [],
  forecastData: null
};

function showToast(message) {
  const toast = document.getElementById('toastMessage');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4200);
}

function showAuthError(message) {
  const alertEl = document.getElementById('authAlertBanner');
  if (!alertEl) return;
  if (!message) {
    alertEl.classList.add('hidden');
    return;
  }
  alertEl.textContent = message;
  alertEl.classList.remove('hidden');
}

function getCategoryBadgeClass(categoryText) {
  if (categoryText === 'Category III') return 'badge-red';
  if (categoryText === 'Category II') return 'badge-amber';
  if (categoryText === 'Category I') return 'badge-lime';
  return 'badge-amber';
}

function getPatientVisitStatus(patient) {
  if (
    patient.woundCategory === 'Pending' ||
    patient.clinicalStatus === 'Waiting for Doctor' ||
    patient.clinicalStatus === 'Needs Triage'
  ) {
    return { label: 'Needs Triage', badgeClass: 'badge-amber', key: 'Waiting for Doctor' };
  }

  const hasDefaulter = (patient.pepSchedule || []).some((d) => d.status === 'Defaulter');
  if (hasDefaulter || patient.clinicalStatus === 'Missed Dose') {
    return { label: 'Missed / Overdue', badgeClass: 'badge-red', key: 'Missed Dose' };
  }

  const dueToday = (patient.pepSchedule || []).find(
    (d) => String(d.scheduledDate).split('T')[0] === todayDateIso && d.status === 'Pending'
  );
  if (dueToday || patient.clinicalStatus === 'Due Today') {
    const dayName = dueToday ? dueToday.doseDay : 'Follow-Up';
    return { label: `Due Today (${dayName})`, badgeClass: 'badge-purple', key: 'Due Today' };
  }

  const allCompleted =
    (patient.pepSchedule || []).length > 0 &&
    (patient.pepSchedule || []).every((d) => d.status === 'Fulfilled');
  if (allCompleted || patient.clinicalStatus === 'Completed') {
    return { label: 'Completed', badgeClass: 'badge-lime', key: 'Completed' };
  }

  return { label: 'Under Treatment', badgeClass: 'badge-lime', key: 'Under Treatment' };
}

function filterQueueMatch(patient, filterValue, rawSearch) {
  const statusObj = getPatientVisitStatus(patient);

  if (filterValue === 'Waiting for Doctor' && statusObj.key !== 'Waiting for Doctor') {
    return false;
  }
  if (filterValue === 'Due Today' && statusObj.key !== 'Due Today') {
    return false;
  }
  if (filterValue === 'Category III' && patient.woundCategory !== 'Category III') {
    return false;
  }
  if (filterValue === 'Missed Dose' && statusObj.key !== 'Missed Dose') {
    return false;
  }

  const searchVal = (rawSearch || '').toLowerCase().trim();
  if (!searchVal) return true;

  const addr = (patient.purok || patient.barangay || '').toLowerCase();
  const idMatch = (patient.patientId || '').toLowerCase().includes(searchVal);
  const nameMatch = (patient.fullName || '').toLowerCase().includes(searchVal);
  const purokMatch = addr.includes(searchVal);

  return idMatch || nameMatch || purokMatch;
}

function applyCategoryDefaults() {
  const selectEl = document.getElementById('physWoundCategory');
  const hintEl = document.getElementById('physCategoryClinicalHint');
  const vaccineEl = document.getElementById('physVaccineSelect');
  const doseDayEl = document.getElementById('physDoseDaySelect');
  const logDoseBtn = document.getElementById('physAdministerAndTriageBtn');
  const notesOnlyBtn = document.getElementById('physSaveTriageOnlyBtn');
  const cat3Badge = document.getElementById('physCat3ErigBadge');

  if (!selectEl) return;
  const selectedCat = selectEl.value;

  if (hintEl) {
    hintEl.textContent = WHO_CATEGORY_HINTS[selectedCat] || WHO_CATEGORY_HINTS['Category II'];
  }

  if (cat3Badge) {
    cat3Badge.textContent = 'ERIG + Anti-Rabies Required';
    cat3Badge.classList.toggle('hidden', selectedCat !== 'Category III');
  }

  if (selectedCat === 'Category I') {
    if (vaccineEl) vaccineEl.disabled = true;
    if (doseDayEl) doseDayEl.disabled = true;
    if (logDoseBtn) {
      logDoseBtn.disabled = true;
      logDoseBtn.classList.add('hidden');
    }
    if (notesOnlyBtn) {
      notesOnlyBtn.textContent = 'Complete Assessment (No Vaccine Needed)';
      notesOnlyBtn.classList.remove('btn-secondary');
      notesOnlyBtn.classList.add('btn-primary');
    }
  } else {
    if (vaccineEl) vaccineEl.disabled = false;
    if (doseDayEl) doseDayEl.disabled = false;
    if (logDoseBtn) {
      logDoseBtn.disabled = false;
      logDoseBtn.classList.remove('hidden');
    }
    if (notesOnlyBtn) {
      notesOnlyBtn.textContent = 'Save Notes Only';
      notesOnlyBtn.classList.remove('btn-primary');
      notesOnlyBtn.classList.add('btn-secondary');
    }
  }
}

function renderRoleSidebarNavigation(role) {
  const navContainer = document.getElementById('roleSidebarNav');
  const items = ROLE_NAVIGATION_MAP[role] || [];

  document.getElementById('sidebarRoleHeaderLabel').textContent = `${role} Workspace`;

  navContainer.innerHTML = items
    .map(
      (item, idx) => `
      <button
        type="button"
        class="sidebar-nav-item ${idx === 0 ? 'active' : ''}"
        data-nav-target="${item.viewId}"
      >
        <span class="nav-indicator"></span>
        <span class="nav-label">${item.label}</span>
      </button>
    `
    )
    .join('');

  navContainer.querySelectorAll('.sidebar-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchClinicalView(btn.getAttribute('data-nav-target'));
    });
  });

  if (items.length > 0) {
    switchClinicalView(items[0].viewId);
  }
}

function switchClinicalView(targetViewId) {
  clinicAppState.activeViewId = targetViewId;

  document.querySelectorAll('.sidebar-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-nav-target') === targetViewId);
  });

  document.querySelectorAll('.ehr-view').forEach((section) => {
    section.classList.toggle('hidden', section.id !== targetViewId);
  });
}

function buildDoseStripHtml(patient, interactiveForPhysician = false) {
  const schedule = patient.pepSchedule || [];
  return `<div class="dose-strip">${schedule
    .map((dose) => {
      const dateStr = String(dose.scheduledDate).split('T')[0];
      const statusLower = (dose.status || 'Pending').toLowerCase();

      if (dose.status === 'Pending' && interactiveForPhysician) {
        return `
          <button
            type="button"
            class="dose-chip pending"
            data-patient-id="${patient.patientId}"
            data-patient-name="${patient.fullName}"
            data-dose-day="${dose.doseDay}"
          >
            <span>${dose.doseDay}: ${dateStr}</span>
            <span>[Pending]</span>
          </button>
        `;
      }

      const tagLabel =
        dose.status === 'Fulfilled'
          ? 'Completed'
          : dose.status === 'Defaulter'
          ? 'Missed'
          : 'Pending';

      return `
        <span class="dose-chip ${statusLower}">
          <span>${dose.doseDay}: ${dateStr}</span>
          <span>[${tagLabel}]</span>
        </span>
      `;
    })
    .join('')}</div>`;
}

async function openAuthenticatedRoleWorkspace(user) {
  clinicAppState.authenticatedUser = user;

  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('authenticatedAppShell').classList.remove('hidden');

  document.getElementById('headerUserFullName').textContent = user.fullName;
  document.getElementById('headerUserRoleBadge').textContent = user.role;

  renderRoleSidebarNavigation(user.role);
  await loadRoleAuthorizedData();
}

async function loadRoleAuthorizedData() {
  const user = clinicAppState.authenticatedUser;
  if (!user) return;

  try {
    if (user.role === 'Receptionist') {
      const res = await fetch('/api/receptionist/patients');
      if (res.ok) {
        const json = await res.json();
        clinicAppState.patients = (json.data && json.data.patients) || [];
      }
      renderReceptionistViews();
    } else if (user.role === 'Physician') {
      const [patRes, invRes] = await Promise.all([
        fetch('/api/physician/patients'),
        fetch('/api/physician/inventory')
      ]);
      if (patRes.ok) {
        const pJson = await patRes.json();
        clinicAppState.patients = (pJson.data && pJson.data.patients) || [];
      }
      if (invRes.ok) {
        const iJson = await invRes.json();
        clinicAppState.inventory = (iJson.data && iJson.data.inventory) || [];
      }
      renderPhysicianViews();
    } else if (user.role === 'SuperAdmin') {
      const [patRes, summaryRes, usersRes] = await Promise.all([
        fetch('/api/admin/patients'),
        fetch('/api/admin/analytics-summary'),
        fetch('/api/admin/users')
      ]);

      if (patRes.ok) {
        const pJson = await patRes.json();
        clinicAppState.patients = (pJson.data && pJson.data.patients) || [];
      }
      if (summaryRes.ok) {
        const sJson = await summaryRes.json();
        if (sJson.data) {
          clinicAppState.inventory = sJson.data.inventory || [];
          clinicAppState.auditLogs = sJson.data.recentAuditLogs || [];
          clinicAppState.forecastData = sJson.data.pySparkAnalytics || null;
        }
      }
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        clinicAppState.staffAccounts = (uJson.data && uJson.data.staffAccounts) || [];
      }
      renderSuperAdminViews();
    }
  } catch (err) {
    console.warn('Error loading workspace data:', err.message);
  }
}

function renderReceptionistViews() {
  const patients = clinicAppState.patients || [];
  const queueSearchVal = document.getElementById('recQueueSearchInput')?.value || '';
  const followSearchVal = document.getElementById('recFollowUpSearchInput')?.value || '';

  let waitingCount = 0;
  let dueTodayCount = 0;
  let missedCount = 0;

  patients.forEach((p) => {
    const statusObj = getPatientVisitStatus(p);
    if (statusObj.key === 'Waiting for Doctor') waitingCount += 1;
    if (statusObj.key === 'Due Today') dueTodayCount += 1;
    if (statusObj.key === 'Missed Dose') missedCount += 1;
  });

  document.getElementById('recKpiWaitingDoctor').textContent = waitingCount;
  document.getElementById('recKpiDueToday').textContent = dueTodayCount;
  document.getElementById('recKpiTotalPatients').textContent = patients.length;
  document.getElementById('recKpiMissedCount').textContent = missedCount;

  const filteredQueue = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.recQueueFilter, queueSearchVal)
  );

  const frontDeskBody = document.getElementById('recFrontDeskTableBody');
  frontDeskBody.innerHTML = filteredQueue
    .map((p) => {
      const statusObj = getPatientVisitStatus(p);
      const addr = p.purok || p.barangay || 'Brgy. D.S. Garcia';
      const biteDate = String(p.day0WalkInDate).split('T')[0];
      const isAlreadyQueued = p.checkedInForTriage || p.woundCategory === 'Pending';

      const actionHtml = isAlreadyQueued
        ? `<span class="badge badge-lime">Checked In</span>`
        : `<button type="button" class="btn btn-secondary btn-sm btn-checkin-patient" data-patient-id="${p.patientId}">Check In</button>`;

      return `
        <tr data-patient-id="${p.patientId}">
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong> (${p.age}y / ${p.sex})
            <span class="cell-sub">${addr} • <span class="mono-num">${p.contactNumber}</span></span>
          </td>
          <td>
            <strong>${p.animalType}</strong> — ${p.biteSite}
            <span class="cell-sub">${p.biteStatus || 'Bite Exposure'}</span>
          </td>
          <td class="num-col mono-num">${biteDate}</td>
          <td><span class="badge ${statusObj.badgeClass}">${statusObj.label}</span></td>
          <td>${actionHtml}</td>
        </tr>
      `;
    })
    .join('');

  const followPatients = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.recFollowUpFilter, followSearchVal)
  );

  const followBody = document.getElementById('recFollowUpTableBody');
  followBody.innerHTML = followPatients
    .map((p) => {
      const addr = p.purok || p.barangay || 'Brgy. D.S. Garcia';
      const isQueued = p.checkedInForTriage;
      const btnHtml = isQueued
        ? `<span class="badge badge-lime">Checked In</span>`
        : `<button type="button" class="btn btn-primary btn-sm btn-checkin-patient" data-patient-id="${p.patientId}">Check In</button>`;

      return `
        <tr data-patient-id="${p.patientId}">
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong>
            <span class="cell-sub mono-num">${p.contactNumber}</span>
          </td>
          <td>${addr}</td>
          <td>${buildDoseStripHtml(p, false)}</td>
          <td>${btnHtml}</td>
        </tr>
      `;
    })
    .join('');
}

async function checkInPatient(patientId) {
  try {
    const response = await fetch(`/api/receptionist/checkin/${patientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (!response.ok) {
      showToast(result.message || 'Could not check in patient.');
      return;
    }
    showToast(`Checked in ${result.data?.patientRecord?.fullName || patientId}`);
    await loadRoleAuthorizedData();
  } catch (err) {
    showToast('Network error during check-in.');
  }
}

window.checkInPatient = checkInPatient;
window.checkInPatientForDoctor = checkInPatient;

function renderPhysicianViews() {
  const patients = clinicAppState.patients || [];
  const inventory = clinicAppState.inventory || [];

  const waitingCount = patients.filter((p) => p.woundCategory === 'Pending').length;
  const dueTodayCount = patients.filter((p) =>
    (p.pepSchedule || []).some(
      (d) => String(d.scheduledDate).split('T')[0] === todayDateIso && d.status === 'Pending'
    )
  ).length;
  const cat3Count = patients.filter((p) => p.woundCategory === 'Category III').length;
  const rabiesStock = inventory
    .filter((i) => i.vaccineType === 'anti-rabies')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

  document.getElementById('physKpiWaiting').textContent = waitingCount;
  document.getElementById('physKpiDueToday').textContent = dueTodayCount;
  document.getElementById('physKpiCat3').textContent = cat3Count;
  document.getElementById('physKpiRabiesVials').textContent = rabiesStock;

  const queueSearchVal = document.getElementById('physQueueSearchInput')?.value || '';
  const filteredTriageQueue = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.physQueueFilter, queueSearchVal)
  );

  if (!clinicAppState.selectedPatientId && patients.length > 0) {
    clinicAppState.selectedPatientId = patients[0].patientId;
  }

  const triageBody = document.getElementById('physTriageQueueBody');
  triageBody.innerHTML = filteredTriageQueue
    .map((p) => {
      const isSelected = p.patientId === clinicAppState.selectedPatientId;
      const catBadge = getCategoryBadgeClass(p.woundCategory);
      const catText = p.woundCategory === 'Pending' ? 'Needs Triage' : p.woundCategory;
      const addr = p.purok || p.barangay || 'Brgy. D.S. Garcia';
      const nextPending = (p.pepSchedule || []).find((d) => d.status === 'Pending');
      const nextLabel = nextPending
        ? `${nextPending.doseDay} (${String(nextPending.scheduledDate).split('T')[0]})`
        : 'Completed';

      return `
        <tr class="patient-row ${isSelected ? 'active-row' : ''}" data-patient-id="${p.patientId}">
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong> (${p.age}y / ${p.sex})
            <span class="cell-sub">${addr}</span>
          </td>
          <td>
            <strong>${p.animalType}</strong>
            <span class="cell-sub">${p.biteSite}</span>
          </td>
          <td><span class="badge ${catBadge}">${catText}</span></td>
          <td class="mono-num">${nextLabel}</td>
          <td>
            <button
              type="button"
              class="btn btn-secondary btn-sm btn-assess-triage"
              data-patient-id="${p.patientId}"
            >
              Assess / Triage
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  if (clinicAppState.selectedPatientId) {
    selectPatient(clinicAppState.selectedPatientId, false);
  }

  const recordsSearchVal = document.getElementById('physSearchInput')?.value || '';
  const filteredRecords = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.physRecordsFilter, recordsSearchVal)
  );

  const recordsBody = document.getElementById('physRecordsTableBody');
  recordsBody.innerHTML = filteredRecords
    .map((p) => {
      const catBadge = getCategoryBadgeClass(p.woundCategory);
      const catText = p.woundCategory === 'Pending' ? 'Needs Triage' : p.woundCategory;
      const addr = p.purok || p.barangay || 'Brgy. D.S. Garcia';
      return `
        <tr data-patient-id="${p.patientId}">
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong> (${p.age}y, ${p.sex})
            <span class="cell-sub">${addr} • <span class="mono-num">${p.contactNumber}</span></span>
          </td>
          <td>
            <strong>${p.animalType} — ${p.biteSite}</strong>
            <span class="cell-sub">${p.clinicalNotes || 'Awaiting physician notes'}</span>
          </td>
          <td><span class="badge ${catBadge}">${catText}</span></td>
          <td>${buildDoseStripHtml(p, true)}</td>
        </tr>
      `;
    })
    .join('');

  const roBody = document.getElementById('physReadOnlyInventoryBody');
  roBody.innerHTML = inventory
    .map((item) => {
      const threshold = item.lowStockThreshold || 10;
      const isLow = item.currentStock <= threshold;
      const badgeClass = isLow ? 'badge-red' : 'badge-lime';
      const statusText = isLow ? 'Low Stock' : 'In Stock';
      const expStr = String(item.expirationDate).split('T')[0];

      return `
        <tr>
          <td><strong>${item.vaccineType}</strong></td>
          <td>${item.brandName}</td>
          <td class="num-col mono-num"><strong>${item.batchNumber}</strong></td>
          <td class="num-col tabular-num"><strong class="${isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
          <td class="num-col tabular-num">${threshold}</td>
          <td class="num-col mono-num">${expStr}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join('');
}

function selectPatient(patientId, flashCard = true) {
  const patient = (clinicAppState.patients || []).find((p) => p.patientId === patientId);
  if (!patient) return;

  clinicAppState.selectedPatientId = patient.patientId;

  document.querySelectorAll('#physTriageQueueBody tr.patient-row').forEach((row) => {
    row.classList.toggle('active-row', row.getAttribute('data-patient-id') === patient.patientId);
  });

  document.getElementById('physSelectedPatientId').value = patient.patientId;
  document.getElementById('physWoundCategory').value =
    patient.woundCategory === 'Pending' ? 'Category II' : patient.woundCategory;
  document.getElementById('physAllergyNotes').value =
    patient.allergyNotes === 'Pending Physician Assessment'
      ? 'Negative equine skin test; no known drug allergies'
      : patient.allergyNotes || '';
  document.getElementById('physClinicalNotes').value = patient.clinicalNotes || '';

  const nextPending = (patient.pepSchedule || []).find((d) => d.status === 'Pending');
  if (nextPending) {
    document.getElementById('physDoseDaySelect').value = nextPending.doseDay;
  } else {
    document.getElementById('physDoseDaySelect').value = 'Day 0';
  }

  applyCategoryDefaults();

  const statusObj = getPatientVisitStatus(patient);
  const addr = patient.purok || patient.barangay || 'Brgy. D.S. Garcia';
  const nextDoseText = nextPending ? nextPending.doseDay : 'Completed';

  document.getElementById('physActivePatientBanner').innerHTML = `
    <div><strong>${patient.fullName}</strong> (<span class="mono-num">${patient.patientId}</span>) — ${patient.age}y / ${patient.sex}</div>
    <div class="cell-sub">${addr} • Exposure: <strong>${patient.animalType}</strong> on <strong>${patient.biteSite}</strong> (${patient.biteStatus || 'Bite'})</div>
    <div style="margin-top:4px;">Status: <span class="badge ${statusObj.badgeClass}">${statusObj.label}</span> • Next Dose: <strong class="mono-num">${nextDoseText}</strong></div>
  `;

  if (flashCard) {
    const formCard = document.getElementById('physTriageFormCard');
    if (formCard) {
      formCard.classList.add('card-flash-focus');
      clearTimeout(window._cardFlashTimer);
      window._cardFlashTimer = setTimeout(() => {
        formCard.classList.remove('card-flash-focus');
      }, 450);
    }
  }
}

window.selectPatient = selectPatient;
window.selectPatientForTriage = selectPatient;

function renderSuperAdminViews() {
  const patients = clinicAppState.patients || [];
  const inventory = clinicAppState.inventory || [];
  const auditLogs = clinicAppState.auditLogs || [];
  const staff = clinicAppState.staffAccounts || [];
  const forecast = clinicAppState.forecastData;

  const sumByType = (type) =>
    inventory
      .filter((i) => i.vaccineType === type)
      .reduce((acc, i) => acc + Number(i.currentStock || 0), 0);

  document.getElementById('adminKpiPatients').textContent = patients.length;
  document.getElementById('adminKpiRabies').textContent = sumByType('anti-rabies');
  document.getElementById('adminKpiErig').textContent = sumByType('ERIG');
  document.getElementById('adminKpiStaffCount').textContent = staff.length;

  const auditBody = document.getElementById('adminOverviewAuditBody');
  auditBody.innerHTML = auditLogs
    .slice(0, 8)
    .map((log) => {
      const timeStr = new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 16);
      return `
        <tr>
          <td class="num-col mono-num">${timeStr}</td>
          <td><span class="badge badge-purple">${log.actorRole}</span></td>
          <td><strong>${log.actionType}</strong></td>
          <td>${log.description}</td>
        </tr>
      `;
    })
    .join('');

  const overviewStockBody = document.getElementById('adminOverviewStockBody');
  overviewStockBody.innerHTML = inventory
    .map((item) => {
      const threshold = item.lowStockThreshold || 10;
      const isLow = item.currentStock <= threshold;
      const badgeClass = isLow ? 'badge-red' : 'badge-lime';
      const statusText = isLow ? 'Low Stock' : 'In Stock';
      const expStr = String(item.expirationDate).split('T')[0];

      return `
        <tr>
          <td>
            <strong>${item.vaccineType}</strong>
            <span class="cell-sub">${item.brandName} • <span class="mono-num">${item.batchNumber}</span></span>
          </td>
          <td class="num-col tabular-num"><strong class="${isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
          <td class="num-col mono-num">${expStr}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join('');

  const invTableBody = document.getElementById('adminInventoryTableBody');
  invTableBody.innerHTML = inventory
    .map((item) => {
      const threshold = item.lowStockThreshold || 10;
      const isLow = item.currentStock <= threshold;
      const badgeClass = isLow ? 'badge-red' : 'badge-lime';
      const statusText = isLow ? 'Low Stock' : 'In Stock';
      const expStr = String(item.expirationDate).split('T')[0];

      return `
        <tr>
          <td><strong>${item.vaccineType}</strong></td>
          <td>${item.brandName}</td>
          <td class="num-col mono-num"><strong>${item.batchNumber}</strong></td>
          <td class="num-col tabular-num"><strong class="${isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
          <td class="num-col tabular-num">${threshold}</td>
          <td class="num-col mono-num">${expStr}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join('');

  if (forecast) {
    document.getElementById('forecastVialsTableBody').innerHTML = (
      forecast.vialForecasts || []
    )
      .map((vf) => {
        const isCritical = vf.stockStatus === 'CRITICAL RESTOCK';
        const badgeClass = isCritical
          ? 'badge-red'
          : vf.stockStatus === 'REORDER SOON'
          ? 'badge-amber'
          : 'badge-lime';

        return `
          <tr>
            <td>
              <strong>${vf.displayName}</strong>
              <span class="cell-sub">${vf.brandSummary}</span>
            </td>
            <td class="num-col tabular-num"><strong class="${isCritical ? 'text-red' : ''}">${vf.currentStock}</strong></td>
            <td class="num-col tabular-num">${vf.scheduledReturning30d}</td>
            <td class="num-col tabular-num">${vf.projectedNewWalkIn30d}</td>
            <td class="num-col tabular-num"><strong>${vf.projected30DayDemand}</strong></td>
            <td class="num-col tabular-num">${vf.projected90DayDemand}</td>
            <td class="num-col tabular-num"><strong class="${vf.estimatedDaysUntilStockout <= 10 ? 'text-red' : ''}">${vf.estimatedDaysUntilStockout}d</strong></td>
            <td class="num-col tabular-num"><strong>+${vf.recommendedRestockQty}</strong></td>
            <td><span class="badge ${badgeClass}">${vf.stockStatus}</span></td>
          </tr>
        `;
      })
      .join('');

    document.getElementById('forecastPurokTableBody').innerHTML = (
      forecast.purokBreakdown || []
    )
      .map((row) => {
        const badgeClass =
          row.riskLevel === 'HIGH SURGE'
            ? 'badge-red'
            : row.riskLevel === 'MODERATE'
            ? 'badge-amber'
            : 'badge-lime';

        return `
          <tr>
            <td><strong>${row.purok}</strong></td>
            <td class="num-col tabular-num">${row.categoryI}</td>
            <td class="num-col tabular-num">${row.categoryII}</td>
            <td class="num-col tabular-num"><strong class="${row.categoryIII >= 10 ? 'text-red' : ''}">${row.categoryIII}</strong></td>
            <td class="num-col tabular-num"><strong>${row.totalCases}</strong></td>
            <td>${row.primaryVector}</td>
            <td><span class="badge ${badgeClass}">${row.riskLevel}</span></td>
          </tr>
        `;
      })
      .join('');

    document.getElementById('forecastCategoryTableBody').innerHTML = (
      forecast.categoryBreakdown || []
    )
      .map((c) => {
        const badgeClass = getCategoryBadgeClass(c.category);
        return `
          <tr>
            <td><span class="badge ${badgeClass}">${c.category}</span></td>
            <td>
              <strong>${c.protocol}</strong>
              <span class="cell-sub">${c.clinicalDefinition}</span>
            </td>
            <td class="num-col tabular-num"><strong>${c.incidentCount}</strong></td>
            <td class="num-col tabular-num">${c.sharePercent}%</td>
          </tr>
        `;
      })
      .join('');

    document.getElementById('forecastWeeklyTableBody').innerHTML = (
      forecast.weeklyTrends || []
    )
      .map(
        (w) => `
        <tr>
          <td class="mono-num"><strong>${w.week}</strong></td>
          <td class="num-col tabular-num">${w.walkIns}</td>
          <td class="num-col tabular-num"><strong class="text-red">${w.catIIICases}</strong></td>
          <td class="num-col tabular-num"><strong>${w.vialsDispensed}</strong></td>
        </tr>
      `
      )
      .join('');
  }

  const regSearchVal = document.getElementById('adminRegistrySearchInput')?.value || '';
  const filteredRegistry = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.adminRegistryFilter, regSearchVal)
  );

  const regBody = document.getElementById('adminRegistryTableBody');
  regBody.innerHTML = filteredRegistry
    .map((p) => {
      const catBadge = getCategoryBadgeClass(p.woundCategory);
      const catText = p.woundCategory === 'Pending' ? 'Needs Triage' : p.woundCategory;
      const addr = p.purok || p.barangay || 'Brgy. D.S. Garcia';
      return `
        <tr>
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong> (${p.age}y, ${p.sex})
            <span class="cell-sub">${addr} • <span class="mono-num">${p.contactNumber}</span></span>
          </td>
          <td>
            <strong>${p.animalType} — ${p.biteSite}</strong>
            <span class="cell-sub">${p.clinicalNotes || 'Needs Triage'}</span>
          </td>
          <td><span class="badge ${catBadge}">${catText}</span></td>
          <td>${buildDoseStripHtml(p, false)}</td>
        </tr>
      `;
    })
    .join('');

  const staffBody = document.getElementById('adminStaffTableBody');
  const selfId = clinicAppState.authenticatedUser && clinicAppState.authenticatedUser.userId;
  staffBody.innerHTML = staff
    .map(
      (u) => `
      <tr>
        <td><strong>${u.fullName}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge badge-purple">${u.role}</span></td>
        <td><span class="badge badge-lime">Active</span></td>
        <td>
          <div class="staff-actions">
            <button type="button" class="staff-edit" data-staff-id="${u._id}">Edit</button>
            ${
              String(u._id) === String(selfId)
                ? ''
                : `<button type="button" class="staff-delete" data-staff-id="${u._id}">Delete</button>`
            }
          </div>
        </td>
      </tr>
    `
    )
    .join('');
}

function setStaffFormMode(staffMember) {
  const editing = Boolean(staffMember);
  document.getElementById('staffEditId').value = editing ? staffMember._id : '';
  document.getElementById('staffFullName').value = editing ? staffMember.fullName : '';
  document.getElementById('staffEmail').value = editing ? staffMember.email : '';
  document.getElementById('staffRole').value = editing ? staffMember.role : 'Receptionist';
  const pw = document.getElementById('staffPassword');
  pw.value = '';
  pw.required = !editing;
  pw.placeholder = editing ? 'Leave blank to keep current' : 'Minimum 8 characters';
  document.getElementById('staffPasswordLabel').textContent = editing
    ? 'New Password (optional)'
    : 'Password (min 8 chars) *';
  document.getElementById('staffFormHeading').textContent = editing
    ? 'Edit Staff Account'
    : 'Add Staff Account';
  document.getElementById('submitCreateStaffBtn').textContent = editing
    ? 'Save Changes'
    : 'Create Staff Account';
}

function openDoseModal(patientId, fullName, doseDay) {
  clinicAppState.pendingModalDose = { patientId, fullName, doseDay };
  document.getElementById('doseModalTitle').textContent =
    `Log ${doseDay} Dose — ${fullName} (${patientId})`;
  document.getElementById('doseConfirmationModal').classList.remove('hidden');
}

window.openDoseModal = openDoseModal;
window.openDoseConfirmationModal = openDoseModal;

async function submitModalDoseDecision(doseAdministered) {
  const modalContext = clinicAppState.pendingModalDose;
  if (!modalContext) return;

  const vaccineType = document.getElementById('modalVaccineSelect').value;

  if (doseAdministered) {
    const availableVials = (clinicAppState.inventory || [])
      .filter((i) => i.vaccineType === vaccineType)
      .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

    if (availableVials <= 0) {
      document.getElementById('doseConfirmationModal').classList.add('hidden');
      clinicAppState.pendingModalDose = null;
      showToast('Cannot log dose: Selected vaccine batch is out of stock. Please notify Admin.');
      return;
    }
  }

  try {
    const response = await fetch(
      `/api/physician/patients/${modalContext.patientId}/schedule`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doseDay: modalContext.doseDay,
          doseAdministered,
          vaccineType
        })
      }
    );
    const result = await response.json();

    document.getElementById('doseConfirmationModal').classList.add('hidden');
    clinicAppState.pendingModalDose = null;

    if (!response.ok) {
      showToast(result.message || 'Could not process dose.');
      return;
    }

    showToast(result.message);
    await loadRoleAuthorizedData();
  } catch (err) {
    showToast('Network error while recording dose.');
  }
}

function filterQueue(scope, filterValue) {
  if (scope === 'recQueue') {
    clinicAppState.recQueueFilter = filterValue;
    document.querySelectorAll('#recQueueFilterTabs .filter-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-rec-queue-filter') === filterValue);
    });
    document.querySelectorAll('[data-rec-kpi-filter]').forEach((card) => {
      card.classList.toggle('active-kpi', card.getAttribute('data-rec-kpi-filter') === filterValue);
    });
    renderReceptionistViews();
  } else if (scope === 'physQueue') {
    clinicAppState.physQueueFilter = filterValue;
    document.querySelectorAll('#physTriageFilterTabs .filter-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-phys-queue-filter') === filterValue);
    });
    document.querySelectorAll('[data-phys-kpi-filter]').forEach((card) => {
      card.classList.toggle('active-kpi', card.getAttribute('data-phys-kpi-filter') === filterValue);
    });
    renderPhysicianViews();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const regDay0Input = document.getElementById('regDay0Date');
  if (regDay0Input) regDay0Input.value = todayDateIso;

  const invExpInput = document.getElementById('invExpirationDate');
  if (invExpInput) invExpInput.value = '2027-09-30';

  applyCategoryDefaults();

  document.querySelectorAll('[data-jump-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-jump-nav');
      const focusInputId = btn.getAttribute('data-focus-input');
      if (targetView) {
        switchClinicalView(targetView);
      }
      if (focusInputId) {
        const focusEl = document.getElementById(focusInputId);
        if (focusEl) focusEl.focus();
      }
    });
  });

  document.querySelectorAll('[data-rec-kpi-filter]').forEach((card) => {
    card.addEventListener('click', () => {
      const targetFilter = card.getAttribute('data-rec-kpi-filter');
      const nextFilter =
        clinicAppState.recQueueFilter === targetFilter && targetFilter !== 'All'
          ? 'All'
          : targetFilter;
      filterQueue('recQueue', nextFilter);
    });
  });

  document.querySelectorAll('[data-phys-kpi-filter]').forEach((card) => {
    card.addEventListener('click', () => {
      const targetFilter = card.getAttribute('data-phys-kpi-filter');
      const nextFilter =
        clinicAppState.physQueueFilter === targetFilter ? 'All' : targetFilter;
      filterQueue('physQueue', nextFilter);
    });
  });

  document.getElementById('recFrontDeskTableBody').addEventListener('click', (e) => {
    const checkinBtn = e.target.closest('.btn-checkin-patient');
    if (checkinBtn) {
      const pid = checkinBtn.getAttribute('data-patient-id');
      if (pid) checkInPatient(pid);
    }
  });

  document.getElementById('recFollowUpTableBody').addEventListener('click', (e) => {
    const checkinBtn = e.target.closest('.btn-checkin-patient');
    if (checkinBtn) {
      const pid = checkinBtn.getAttribute('data-patient-id');
      if (pid) checkInPatient(pid);
    }
  });

  document.getElementById('physTriageQueueBody').addEventListener('click', (e) => {
    const targetEl = e.target.closest('.btn-assess-triage, tr.patient-row');
    if (!targetEl) return;
    const pid = targetEl.getAttribute('data-patient-id');
    if (pid) selectPatient(pid, true);
  });

  document.getElementById('physRecordsTableBody').addEventListener('click', (e) => {
    const doseBtn = e.target.closest('button.dose-chip.pending');
    if (doseBtn) {
      const pid = doseBtn.getAttribute('data-patient-id');
      const pname = doseBtn.getAttribute('data-patient-name') || pid;
      const dday = doseBtn.getAttribute('data-dose-day');
      if (pid && dday) openDoseModal(pid, pname, dday);
    }
  });

  document.querySelectorAll('[data-fill-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.getAttribute('data-fill-role');
      showAuthError('');
      if (role === 'Receptionist') {
        document.getElementById('loginEmail').value = 'receptionist@drpauclinic.ph';
        document.getElementById('loginPassword').value = 'Reception@12345';
      } else if (role === 'Physician') {
        document.getElementById('loginEmail').value = 'physician@drpauclinic.ph';
        document.getElementById('loginPassword').value = 'Physician@12345';
      } else {
        document.getElementById('loginEmail').value = 'admin@drpauclinic.ph';
        document.getElementById('loginPassword').value = 'Admin@12345';
      }
    });
  });

  document.getElementById('loginStep1Form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showAuthError('');

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();

      if (!response.ok) {
        showAuthError(result.message || 'Invalid clinic email or password.');
        return;
      }

      clinicAppState.pendingLoginEmail = email;
      document.getElementById('mfaTargetEmailDisplay').textContent = email;
      document.getElementById('loginOtpCode').value = '';

      document.getElementById('loginStep1Form').classList.add('hidden');
      document.getElementById('loginStep2Form').classList.remove('hidden');
      document.getElementById('loginOtpCode').focus();
    } catch (err) {
      showAuthError('Unable to reach authentication server.');
    }
  });

  document.getElementById('backToStep1Btn').addEventListener('click', () => {
    showAuthError('');
    clinicAppState.pendingLoginEmail = '';
    document.getElementById('loginOtpCode').value = '';
    document.getElementById('loginStep2Form').classList.add('hidden');
    document.getElementById('loginStep1Form').classList.remove('hidden');
  });

  document.getElementById('loginStep2Form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showAuthError('');

    const email = clinicAppState.pendingLoginEmail;
    const otpCode = document.getElementById('loginOtpCode').value.trim();

    try {
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otpCode })
      });
      const result = await response.json();

      if (!response.ok) {
        showAuthError(result.message || 'Invalid verification code. Please try again.');
        if (result.lockedOut) {
          document.getElementById('loginStep2Form').classList.add('hidden');
          document.getElementById('loginStep1Form').classList.remove('hidden');
        }
        return;
      }

      await openAuthenticatedRoleWorkspace(result.data.user);
      showToast(`Signed in as ${result.data.user.fullName} (${result.data.user.role})`);
    } catch (err) {
      showAuthError('Error verifying security code.');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // ito yung anu pang linis ng data ng dating user para walang matira
    }

    clinicAppState.authenticatedUser = null;
    clinicAppState.pendingLoginEmail = '';
    clinicAppState.selectedPatientId = '';
    document.getElementById('authenticatedAppShell').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('loginStep2Form').classList.add('hidden');
    document.getElementById('loginStep1Form').classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginOtpCode').value = '';
    showAuthError('');
    showToast('Signed out of clinic workspace.');
  });

  document.getElementById('recQueueSearchInput').addEventListener('input', () => {
    renderReceptionistViews();
  });

  document.getElementById('recFollowUpSearchInput').addEventListener('input', () => {
    renderReceptionistViews();
  });

  document.querySelectorAll('#recQueueFilterTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      filterQueue('recQueue', tab.getAttribute('data-rec-queue-filter'));
    });
  });

  document.querySelectorAll('#recFollowUpFilterTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('#recFollowUpFilterTabs .filter-tab')
        .forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      clinicAppState.recFollowUpFilter = tab.getAttribute('data-rec-filter');
      renderReceptionistViews();
    });
  });

  document.getElementById('resetWalkInFormBtn').addEventListener('click', () => {
    document.getElementById('walkInRegistrationForm').reset();
    document.getElementById('regDay0Date').value = todayDateIso;
    document.getElementById('regConsentCheckbox').checked = true;
    showToast('Walk-in form reset.');
  });

  document
    .getElementById('walkInRegistrationForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();

      const ageVal = Number(document.getElementById('regAge').value);
      if (Number.isNaN(ageVal) || ageVal < 0 || ageVal > 120) {
        showToast('Patient age must be between 0 and 120.');
        return;
      }

      const rawPhone = document.getElementById('regContact').value.trim();
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (!/^09\d{9}$/.test(digitsOnly)) {
        showToast('Please enter a valid 11-digit mobile number starting with 09 (e.g., 09171234567).');
        return;
      }

      const purokVal = document.getElementById('regBarangay').value;
      const payload = {
        fullName: document.getElementById('regFullName').value.trim(),
        age: ageVal,
        sex: document.getElementById('regSex').value,
        contactNumber: digitsOnly,
        purok: purokVal,
        barangay: purokVal,
        day0WalkInDate: document.getElementById('regDay0Date').value,
        animalType: document.getElementById('regAnimalType').value,
        biteSite: document.getElementById('regBiteSite').value.trim(),
        consentGiven: document.getElementById('regConsentCheckbox').checked
      };

      const response = await fetch('/api/receptionist/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok) {
        showToast(result.message || 'Could not register walk-in patient.');
        return;
      }

      e.target.reset();
      document.getElementById('regDay0Date').value = todayDateIso;
      document.getElementById('regConsentCheckbox').checked = true;

      await loadRoleAuthorizedData();
      switchClinicalView('viewRecQueue');
      showToast(result.message || `Added ${payload.fullName} to Doctor's Queue`);
    });

  document.getElementById('physQueueSearchInput').addEventListener('input', () => {
    renderPhysicianViews();
  });

  document.getElementById('physSearchInput').addEventListener('input', () => {
    renderPhysicianViews();
  });

  document.querySelectorAll('#physTriageFilterTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      filterQueue('physQueue', tab.getAttribute('data-phys-queue-filter'));
    });
  });

  document.querySelectorAll('#physRecordsFilterTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('#physRecordsFilterTabs .filter-tab')
        .forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      clinicAppState.physRecordsFilter = tab.getAttribute('data-phys-rec-filter');
      renderPhysicianViews();
    });
  });

  document.getElementById('physWoundCategory').addEventListener('change', () => {
    applyCategoryDefaults();
  });

  document.getElementById('resetPhysTriageFormBtn').addEventListener('click', () => {
    document.getElementById('physWoundCategory').value = 'Category II';
    document.getElementById('physDoseDaySelect').value = 'Day 0';
    document.getElementById('physVaccineSelect').value = 'anti-rabies';
    document.getElementById('physAllergyNotes').value = '';
    document.getElementById('physClinicalNotes').value = '';
    applyCategoryDefaults();
    showToast('Triage form reset.');
  });

  async function submitTriage(administerDoseNow) {
    const patientId = document.getElementById('physSelectedPatientId').value;
    if (!patientId) {
      showToast('Select a patient from the queue first.');
      return;
    }

    const woundCategory = document.getElementById('physWoundCategory').value;
    const doseDay = document.getElementById('physDoseDaySelect').value;
    const vaccineType = document.getElementById('physVaccineSelect').value;
    const shouldAdminister = administerDoseNow && woundCategory !== 'Category I';

    if (shouldAdminister) {
      const availableVials = (clinicAppState.inventory || [])
        .filter((i) => i.vaccineType === vaccineType)
        .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

      if (availableVials <= 0) {
        showToast('Cannot log dose: Selected vaccine batch is out of stock. Please notify Admin.');
        return;
      }

      const selectedPatient = (clinicAppState.patients || []).find(
        (p) => p.patientId === patientId
      );
      const selectedDoseObj = (selectedPatient?.pepSchedule || []).find(
        (d) => d.doseDay === doseDay
      );
      if (selectedDoseObj && selectedDoseObj.status === 'Fulfilled') {
        showToast(
          `Cannot log dose: ${doseDay} has already been completed and cannot be deducted twice.`
        );
        return;
      }
    }

    const payload = {
      woundCategory,
      allergyNotes: document.getElementById('physAllergyNotes').value.trim(),
      clinicalNotes: document.getElementById('physClinicalNotes').value.trim(),
      administerDose: shouldAdminister,
      doseDay,
      vaccineType
    };

    const response = await fetch(`/api/physician/triage/${patientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      showToast(result.message || 'Could not save clinical assessment.');
      return;
    }

    showToast(result.message);
    await loadRoleAuthorizedData();
    selectPatient(patientId, false);
  }

  document
    .getElementById('physicianAssessmentForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitTriage(true);
    });

  document
    .getElementById('physSaveTriageOnlyBtn')
    .addEventListener('click', async () => {
      await submitTriage(false);
    });

  document
    .getElementById('confirmFulfillDoseBtn')
    .addEventListener('click', () => submitModalDoseDecision(true));

  document
    .getElementById('confirmDefaulterDoseBtn')
    .addEventListener('click', () => submitModalDoseDecision(false));

  document
    .getElementById('cancelDoseModalBtn')
    .addEventListener('click', () => {
      document.getElementById('doseConfirmationModal').classList.add('hidden');
      clinicAppState.pendingModalDose = null;
    });

  document.getElementById('adminRegistrySearchInput').addEventListener('input', () => {
    renderSuperAdminViews();
  });

  document.querySelectorAll('#adminRegistryFilterTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('#adminRegistryFilterTabs .filter-tab')
        .forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      clinicAppState.adminRegistryFilter = tab.getAttribute('data-admin-reg-filter');
      renderSuperAdminViews();
    });
  });

  document.getElementById('resetRestockFormBtn').addEventListener('click', () => {
    document.getElementById('adminRestockForm').reset();
    document.getElementById('invVialsAdded').value = '25';
    document.getElementById('invThreshold').value = '10';
    document.getElementById('invExpirationDate').value = '2027-09-30';
    showToast('Restock form reset.');
  });

  document
    .getElementById('adminRestockForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        vaccineType: document.getElementById('invVaccineType').value,
        brandName: document.getElementById('invBrandName').value.trim(),
        batchNumber: document.getElementById('invBatchNumber').value.trim(),
        vialsAdded: Number(document.getElementById('invVialsAdded').value),
        lowStockThreshold: Number(document.getElementById('invThreshold').value || 10),
        expirationDate: document.getElementById('invExpirationDate').value
      };

      const response = await fetch('/api/admin/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok) {
        showToast(result.message || 'Could not restock vaccine batch.');
        return;
      }

      e.target.reset();
      document.getElementById('invVialsAdded').value = '25';
      document.getElementById('invExpirationDate').value = '2027-09-30';
      document.getElementById('invThreshold').value = '10';
      showToast(result.message);
      await loadRoleAuthorizedData();
    });

  document.getElementById('refreshForecastBtn').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/admin/forecast/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(result.message || 'Could not update forecast.');
        return;
      }
      clinicAppState.forecastData = result.data || clinicAppState.forecastData;
      renderSuperAdminViews();
      showToast(result.message || 'Forecast updated.');
    } catch (err) {
      showToast('Network error while updating forecast.');
    }
  });

  document.getElementById('resetStaffFormBtn').addEventListener('click', () => {
    setStaffFormMode(null);
  });

  document.getElementById('adminStaffTableBody').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('button.staff-edit');
    const deleteBtn = e.target.closest('button.staff-delete');
    const staffList = clinicAppState.staffAccounts || [];

    if (editBtn) {
      const member = staffList.find((u) => String(u._id) === editBtn.getAttribute('data-staff-id'));
      if (member) {
        setStaffFormMode(member);
        document.getElementById('staffFullName').focus();
      }
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-staff-id');
      const member = staffList.find((u) => String(u._id) === id);
      if (!member) return;
      if (!confirm(`Delete the account for ${member.fullName}? This cannot be undone.`)) return;

      try {
        const response = await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) {
          showToast(result.message || 'Could not delete staff account.');
          return;
        }
        if (document.getElementById('staffEditId').value === id) setStaffFormMode(null);
        showToast(result.message || 'Staff account deleted.');
        await loadRoleAuthorizedData();
      } catch (err) {
        showToast('Network error while deleting staff account.');
      }
    }
  });

  document
    .getElementById('adminOnboardStaffForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('staffEditId').value;
      const payload = {
        fullName: document.getElementById('staffFullName').value.trim(),
        email: document.getElementById('staffEmail').value.trim(),
        password: document.getElementById('staffPassword').value,
        role: document.getElementById('staffRole').value
      };

      try {
        const response = await fetch(editId ? `/api/admin/staff/${editId}` : '/api/admin/staff', {
          method: editId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok) {
          showToast(result.message || 'Could not save staff account.');
          return;
        }

        setStaffFormMode(null);
        showToast(result.message);
        await loadRoleAuthorizedData();
      } catch (err) {
        showToast('Network error while saving staff account.');
      }
    });

  try {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const meJson = await meRes.json();
      if (meJson.data && meJson.data.user) {
        await openAuthenticatedRoleWorkspace(meJson.data.user);
      }
    }
  } catch (err) {
    // dito banda wala pang naka login kaya login screen muna
  }
});


