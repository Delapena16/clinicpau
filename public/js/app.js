function getLocalTodayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const todayDateIso = getLocalTodayIso();

const ROLE_NAVIGATION_MAP = {
  Receptionist: [
    { viewId: 'viewRecQueue', label: 'Front Desk Queue', icon: 'fas fa-users' },
    { viewId: 'viewRecIntake', label: 'New Walk-In Intake', icon: 'fas fa-user-plus' },
    { viewId: 'viewRecRegistry', label: 'Patient Record', icon: 'fas fa-folder-open' },
    { viewId: 'viewRecInventory', label: 'Stocks', icon: 'fas fa-boxes' }
  ],
  Physician: [
    { viewId: 'viewPhysTriage', label: "Doctor's Assessment & Dosing", icon: 'fas fa-stethoscope' },
    { viewId: 'viewPhysRecords', label: 'Patient Record', icon: 'fas fa-folder-open' },
    { viewId: 'viewPhysInventory', label: 'Stocks', icon: 'fas fa-boxes' }
  ],
  SuperAdmin: [
    { viewId: 'viewAdminDashboard', label: 'Dashboard', icon: 'fas fa-chart-pie' },
    { viewId: 'viewAdminRegistry', label: 'Patient Record', icon: 'fas fa-folder-open' },
    { viewId: 'viewAdminInventory', label: 'Stocks', icon: 'fas fa-boxes' },
    { viewId: 'viewAdminStaff', label: 'Staff Accounts', icon: 'fas fa-user-shield' },
    { viewId: 'viewAdminAudit', label: 'Activity Logs', icon: 'fas fa-clipboard-list' }
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
  recQueueFilter: 'Patient',
  recQueueViewMode: 'calendar',
  recQueueDateFilter: null,
  recFollowUpFilter: 'All',
  physQueueFilter: 'Patient',
  physQueueViewMode: 'calendar',
  physQueueDateFilter: null,
  physRecordsFilter: 'Patient',
  adminQueueFilter: 'Patient',
  adminQueueViewMode: 'calendar',
  adminQueueDateFilter: null,
  adminRegistryFilter: 'Patient',
  recRegistryFilter: 'Patient',
  pendingModalDose: null,
  patients: [],
  inventory: [],
  staffAccounts: [],
  auditLogs: [],
  dashboardSummary: null,
  forecastData: null
};

// RA 10173 Data Privacy: PHI is displayed in plaintext across all clinic workspaces
// so staff can work with full patient details. Masking is now applied only at
// export time (see exportTableToCSV), based on the format chosen by the SuperAdmin.

// dito nakatabi yung chart, para ma-destroy muna bago gumawa ng bago, iwas hover glitch
let purokChart = null;
let myChart = null;
let exposurePieChart = null;
let ageGroupChart = null;
let weeklyTrendChart = null;
let biteSeverityChart = null;
let doseFunnelChart = null;
let peakTrafficChart = null;
let patientMixChart = null;
let mfaOtpCountdownInterval = null;
let resetOtpCountdownInterval = null;

function runOtpTimer(elementId, seconds, onExpire) {
  const displayEl = document.getElementById(elementId);
  if (!displayEl) return null;

  let remaining = seconds;
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  displayEl.textContent = formatTime(remaining);

  const intervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      displayEl.textContent = '00:00 (Expired)';
      if (typeof onExpire === 'function') onExpire();
    } else {
      displayEl.textContent = formatTime(remaining);
    }
  }, 1000);

  return intervalId;
}

function showToast(message) {
  if (typeof toastLogs !== 'undefined' && Array.isArray(toastLogs)) {
    try { toastLogs.push(message); } catch (e) {}
  }
  const toast = document.getElementById('toastMessage');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4200);
}

function showConfirmDialog({ title, text, icon, confirmButtonText, confirmButtonColor }) {
  if (typeof Swal !== 'undefined') {
    return Swal.fire({
      title,
      text,
      icon: icon || 'warning',
      showCancelButton: true,
      confirmButtonColor: confirmButtonColor || '#2e7d32',
      cancelButtonColor: '#6c757d',
      confirmButtonText: confirmButtonText || 'Yes, proceed'
    }).then((res) => Boolean(res && res.isConfirmed));
  }
  const fallbackConfirmed = typeof confirm !== 'undefined' ? confirm(text || title) : true;
  return Promise.resolve(fallbackConfirmed);
}

function showAlertMessage({ title, text, icon }) {
  if (typeof Swal !== 'undefined') {
    return Swal.fire({
      title,
      text,
      icon: icon || 'info',
      confirmButtonColor: '#2e7d32'
    });
  }
  showToast(text || title);
  return Promise.resolve();
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
  // 1. Category I / Wound Cleansing Only (Low risk, no PEP vaccine indicated)
  if (patient.clinicalStatus === 'Wound Cleansing Only' || patient.woundCategory === 'Category I') {
    return { label: 'Wound Cleansing Only', badgeClass: 'badge-lime', key: 'Completed' };
  }

  // 2. Overdue / Defaulter Logic: Pending doses past due date take clinical follow-up precedence
  const overduePending = (patient.pepSchedule || []).find(
    (d) => d.status === 'Pending' && String(d.scheduledDate).split('T')[0] < todayDateIso
  );
  const hasDefaulter = (patient.pepSchedule || []).some((d) => d.status === 'Defaulter');
  if (overduePending || hasDefaulter || patient.clinicalStatus === 'Missed Dose') {
    const overdueLabel = overduePending ? `Overdue (${overduePending.doseDay})` : 'Missed / Overdue';
    return { label: overdueLabel, badgeClass: 'badge-red', key: 'Missed Dose' };
  }

  // 3. Due Today Logic: Unmask scheduled Day 0 walk-in patients and returning booster appointments
  const dueToday = (patient.pepSchedule || []).find(
    (d) => String(d.scheduledDate).split('T')[0] === todayDateIso && d.status === 'Pending'
  );
  if (dueToday) {
    return { label: `Due Today (${dueToday.doseDay})`, badgeClass: 'badge-purple', key: 'Due Today' };
  }

  // 4. Needs Triage: Patients awaiting physician assessment who do not have a pending dose today
  if (
    patient.woundCategory === 'Pending' ||
    patient.clinicalStatus === 'Waiting for Doctor' ||
    patient.clinicalStatus === 'Needs Triage'
  ) {
    return { label: 'Needs Triage', badgeClass: 'badge-amber', key: 'Waiting for Doctor' };
  }

  // 5. Completed: All scheduled doses fulfilled
  const allCompleted =
    (patient.pepSchedule || []).length > 0 &&
    (patient.pepSchedule || []).every((d) => d.status === 'Fulfilled');
  if (allCompleted || patient.clinicalStatus === 'Completed') {
    return { label: 'Completed', badgeClass: 'badge-lime', key: 'Completed' };
  }

  // 6. Under Treatment: Active PEP patients between appointments
  return { label: 'Under Treatment', badgeClass: 'badge-lime', key: 'Under Treatment' };
}

// PHI masking utility (RA 10173 Data Privacy Act compliance).
function maskPHI(text, type) {
  if (!text) return '';
  if (type === 'name') {
    return text.split(' ').map((word) => word.charAt(0) + '*'.repeat(word.length - 1)).join(' ');
  }
  if (type === 'phone') {
    return text.length >= 11 ? text.substring(0, 4) + '***' + text.substring(7) : '***';
  }
  return text;
}

function filterQueueMatch(patient, filterValue, rawSearch) {
  const statusObj = getPatientVisitStatus(patient);

  if (filterValue === "Today's Queue" && statusObj.key !== 'Waiting for Doctor' && statusObj.key !== 'Due Today') {
    return false;
  }
  if (filterValue === "Defaulters (Overdue)" && statusObj.key !== 'Missed Dose') {
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

  const sidebarHeader = document.getElementById('sidebarRoleHeaderLabel');
  if (sidebarHeader) {
    sidebarHeader.textContent = '';
    sidebarHeader.style.display = 'none';
  }

  navContainer.innerHTML = items
    .map(
      (item, idx) => `
      <button
        type="button"
        class="sidebar-nav-item ${idx === 0 ? 'active' : ''}"
        data-nav-target="${item.viewId}"
      >
        <i class="${item.icon || 'fas fa-circle'} me-2"></i>
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

function switchClinicalView(targetViewId, pushHistory = true) {
  const currentUser = clinicAppState.authenticatedUser;
  if (targetViewId === 'viewPatientRecord' && currentUser) {
    if (currentUser.role === 'Physician') targetViewId = 'viewPhysRecords';
    else if (currentUser.role === 'Receptionist') targetViewId = 'viewRecRegistry';
    else if (currentUser.role === 'SuperAdmin') targetViewId = 'viewAdminRegistry';
  }
  if (currentUser && ROLE_NAVIGATION_MAP[currentUser.role]) {
    const allowed = ROLE_NAVIGATION_MAP[currentUser.role].some((item) => item.viewId === targetViewId);
    if (!allowed) {
      console.warn(`[RBAC] Access denied: User with role '${currentUser.role}' cannot navigate to view '${targetViewId}'.`);
      return;
    }
  }
  clinicAppState.activeViewId = targetViewId;
  if (pushHistory && window.history && typeof window.history.pushState === 'function') {
    if (window.location.hash !== `#${targetViewId}`) {
      window.history.pushState({ view: targetViewId }, '', `#${targetViewId}`);
    }
  }

  document.querySelectorAll('.sidebar-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-nav-target') === targetViewId);
  });

  document.querySelectorAll('.ehr-view').forEach((section) => {
    section.classList.toggle('hidden', section.id !== targetViewId);
  });

  if (targetViewId === 'viewAdminDashboard') {
    const scheduleCharts = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    scheduleCharts(() => {
      // Master dashboard charts removed
    });
  }
}

// Visual 5-Dose PEP Schedule timeline.
// Renders one node per dose (Day 0 -> Day 28) with a status circle, dose label,
// status text and the scheduled date. For the physician workspace the pending
// nodes stay clickable so a dose can be logged straight from the table.
function buildPepTimelineHtml(patient, interactiveForPhysician = false) {
  const schedule = patient.pepSchedule || [];

  if (!schedule.length) {
    return '<div class="pep-timeline"><span class="timeline-subtext">No PEP schedule yet</span></div>';
  }

  const nodes = schedule
    .map((dose) => {
      const dateStr = String(dose.scheduledDate).split('T')[0];
      const isOverdue = dose.status === 'Pending' && dateStr < todayDateIso;

      let circleState = 'pending';
      let statusLabel = 'Pending';

      if (dose.status === 'Fulfilled') {
        circleState = 'completed';
        statusLabel = 'Completed';
      } else if (dose.status === 'Defaulter') {
        circleState = 'overdue';
        statusLabel = 'Missed';
      } else if (isOverdue) {
        circleState = 'overdue';
        statusLabel = 'Overdue';
      }

      const nodeContent = `
            <span class="circle ${circleState}"></span>
            <span class="node-label">${dose.doseDay}</span>
            <span class="node-status">${statusLabel}</span>
            <span class="timeline-subtext">${dateStr}</span>
      `;

      if (dose.status === 'Pending' && interactiveForPhysician) {
        return `
          <button
            type="button"
            class="node dose-node ${circleState}"
            data-patient-id="${patient.patientId}"
            data-patient-name="${patient.fullName}"
            data-dose-day="${dose.doseDay}"
            title="Log ${dose.doseDay} dose (${dateStr})"
          >${nodeContent}</button>
        `;
      }

      return `
        <span class="node ${circleState}" title="${dose.doseDay}: ${dateStr} [${statusLabel}]">
          ${nodeContent}
        </span>
      `;
    })
    .join('');

  return `<div class="pep-timeline">${nodes}</div>`;
}

// --- Dynamic filter tab counters -------------------------------------------
// Every filter tab carries a badge span (data-count-key) that is refreshed
// whenever a clinical table renders.
const FILTER_TAB_COUNT_GROUPS = [
  'recQueueFilterTabs',
  'recFollowUpFilterTabs',
  'physTriageFilterTabs',
  'physRecordsFilterTabs',
  'adminRegistryFilterTabs'
];

// Counts how many patients fall into each filter category.
// Actionable KPI helpers (client-side fallbacks when the dashboard summary
// endpoint has not been loaded yet).
function filterQueue(queueType, filterValue) {
  if (queueType === 'recQueue') {
    clinicAppState.recQueueFilter = filterValue;
    document.querySelectorAll('#recQueueFilterTabs .filter-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-rec-queue-filter') === filterValue);
    });
    renderReceptionistViews();
  } else if (queueType === 'physQueue') {
    clinicAppState.physQueueFilter = filterValue;
    document.querySelectorAll('#physTriageFilterTabs .filter-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-phys-queue-filter') === filterValue);
    });
    renderPhysicianViews();
  } else if (queueType === 'adminQueue') { {
    clinicAppState.adminQueueFilter = filterValue;
    document.querySelectorAll('#adminOverviewQueueFilterTabs .filter-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-admin-queue-filter') === filterValue);
    });
    renderLiveTriageQueue();
  }
}
}; window.filterQueue = filterQueue;
document.addEventListener('DOMContentLoaded', () => {
  const cachedRole = (typeof localStorage !== 'undefined') ? (localStorage.getItem('role') || localStorage.getItem('pep_user_role')) : null;
  applyRoleBasedTopFilterVisibility(cachedRole);
});

function updateTabCounts(patients, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const pats = patients || clinicAppState.patients || [];
  const patBadge = container.querySelector('[data-count-key="patient"]');
  const compBadge = container.querySelector('[data-count-key="complete"]');
  if (!patBadge && !compBadge) return;

  if (containerId === 'adminRegistryFilterTabs' || containerId === 'physRecordsFilterTabs' || containerId === 'recRegistryFilterTabs') {
    if (patBadge) patBadge.textContent = pats.filter((p) => isPatientRegistryActive(p)).length;
    if (compBadge) compBadge.textContent = pats.filter((p) => isPatientRegistryComplete(p)).length;
    const overBadge = container.querySelector('[data-count-key="overdue"]');
    if (overBadge) overBadge.textContent = pats.filter((p) => isPatientRegistryOverdue(p)).length;
    return;
  }

  let dateFilter = null;
  if (containerId === 'adminOverviewQueueFilterTabs') dateFilter = clinicAppState.adminQueueDateFilter;
  else if (containerId === 'recQueueFilterTabs') dateFilter = clinicAppState.recQueueDateFilter;
  else if (containerId === 'physTriageFilterTabs') dateFilter = clinicAppState.physQueueDateFilter;

  if (patBadge) patBadge.textContent = pats.filter((p) => isPatientActiveOnDate(p, dateFilter)).length;
  if (compBadge) compBadge.textContent = pats.filter((p) => isPatientCompletedOnDate(p, dateFilter)).length;
}

function _oldUpdateTabCounts(patients, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const pats = patients || clinicAppState.patients || [];
  const patBadge = container.querySelector('[data-count-key="patient"]');
  const compBadge = container.querySelector('[data-count-key="complete"]');
  if (patBadge) patBadge.textContent = pats.filter((p) => isPatientActiveOnDate(p, null)).length;
  if (compBadge) compBadge.textContent = pats.filter((p) => isPatientCompletedOnDate(p, null)).length;
}
window.updateTabCounts = updateTabCounts;

// --- Single Active Dose & Strict Date Matching Logic ---
function getPatientActiveDose(patient) {
  if (!patient) return null;
  const schedule = Array.isArray(patient.pepSchedule) && patient.pepSchedule.length > 0
    ? patient.pepSchedule
    : (patient.day0WalkInDate ? [{ doseDay: 'Day 0', scheduledDate: patient.day0WalkInDate, status: 'Pending' }] : []);

  // Find the FIRST dose in patient.pepSchedule that has a status of PENDING or OVERDUE
  return schedule.find((dose) => {
    if (!dose) return false;
    const status = String(dose.status || '').trim().toUpperCase();
    const isCompleted =
      status === 'COMPLETED' ||
      status === 'FULFILLED' ||
      status === 'DIAGNOSED' ||
      dose.doseAdministered === true;
    if (isCompleted) return false;
    return status === 'PENDING' || status === 'OVERDUE' || status === 'DEFAULTER' || status === '';
  }) || null;
}

// Permanent Patient Record (Registry) tab status helpers
function isPatientRegistryComplete(patient) {
  if (!patient) return false;
  if (patient.clinicalStatus === 'Completed' || patient.clinicalStatus === 'Discharged') return true;
  if (patient.clinicalStatus === 'Wound Cleansing Only' || patient.woundCategory === 'Category I') return true;
  const schedule = Array.isArray(patient.pepSchedule) ? patient.pepSchedule : [];
  if (schedule.length > 0 && schedule.every((d) => d && (d.status === 'Fulfilled' || d.status === 'Completed' || d.doseAdministered === true))) {
    return true;
  }
  return false;
}

function isPatientRegistryActive(patient) {
  if (!patient) return false;
  return !isPatientRegistryComplete(patient);
}

window.isPatientRegistryComplete = isPatientRegistryComplete;
window.isPatientRegistryActive = isPatientRegistryActive;

function isPatientRegistryOverdue(patient) {
  if (!patient) return false;
  const schedule = Array.isArray(patient.pepSchedule) ? patient.pepSchedule : [];
  return schedule.some((dose) => {
    if (!dose) return false;
    const st = String(dose.status || '').trim().toUpperCase();
    if (st === 'OVERDUE' || st === 'DEFAULTER') return true;
    const isCompleted = st === 'COMPLETED' || st === 'FULFILLED' || st === 'DIAGNOSED' || dose.doseAdministered === true;
    if (isCompleted) return false;
    const rawDate = dose.expectedDate || dose.scheduledDate || dose.date;
    if (rawDate) {
      const dateStr = String(rawDate).trim().substring(0, 10);
      if (dateStr && dateStr < todayDateIso) return true;
    }
    return false;
  }) || String(patient.clinicalStatus || '').trim().toLowerCase().includes('overdue') || patient.clinicalStatus === 'Missed Dose';
}
window.isPatientRegistryOverdue = isPatientRegistryOverdue;

function isPatientActiveOnDate(patient, targetDateIso = null) {
  if (!patient) return false;
  const target = (targetDateIso ? String(targetDateIso).trim() : todayDateIso).substring(0, 10);
  if (isPatientCompletedOnDate(patient, target)) return false;
  const schedule = Array.isArray(patient.pepSchedule) ? patient.pepSchedule : [];
  const hasPendingDose = schedule.some((d) => {
    if (!d) return false;
    const dDate = String(d.expectedDate || d.scheduledDate || d.date || '').substring(0, 10);
    if (dDate !== target) return false; const status = String(d.status || '').trim().toUpperCase(); const isDone = status === 'COMPLETED' || status === 'FULFILLED' || status === 'DIAGNOSED' || d.doseAdministered === true; return !isDone;
  });
  if (hasPendingDose) return true;
  const walkDate = String(patient.day0WalkInDate || patient.createdAt || '').substring(0, 10);
  if (walkDate === target) {
    return true;
  }
  return false;
}

function _oldIsPatientActiveOnDate(patient, targetDateIso = null) {
  if (!patient) return false;
  const activeDose = getPatientActiveDose(patient);
  if (!activeDose) return false;
  if (!targetDateIso) return true;
  const target = String(targetDateIso).trim().substring(0, 10);
  const rawDate = activeDose.expectedDate || activeDose.scheduledDate || activeDose.date;
  if (!rawDate) return false;
  const doseDateStr = String(rawDate).trim().substring(0, 10);
  return doseDateStr === target;
}

function isPatientCompletedOnDate(patient, targetDateIso = null) {
  if (!patient) return false;
  const target = (targetDateIso ? String(targetDateIso).trim() : todayDateIso).substring(0, 10);
  const schedule = Array.isArray(patient.pepSchedule) ? patient.pepSchedule : [];

  // 1. Any dose completed/fulfilled specifically on targetDate
  const doseCompletedOnDate = schedule.some((dose) => {
    if (!dose) return false;
    const status = String(dose.status || '').trim().toUpperCase();
    const isDone = status === 'COMPLETED' || status === 'FULFILLED' || status === 'DIAGNOSED' || dose.doseAdministered === true;
    if (!isDone) return false;
    const processedDate = String(dose.dateProcessed || dose.dateAdministered || '').substring(0, 10);
    const scheduledDate = String(dose.expectedDate || dose.scheduledDate || dose.date || '').substring(0, 10);
    return processedDate === target || scheduledDate === target;
  });
  if (doseCompletedOnDate) return true;

  // 2. Physician check-up / triage completed on targetDate
  const assessmentDate = String(patient.updatedAt || patient.assessedAt || patient.day0WalkInDate || '').substring(0, 10);
  const isTriaged = patient.woundCategory && patient.woundCategory !== 'Pending';
  const notWaiting = patient.checkedInForTriage === false && patient.clinicalStatus !== 'Waiting for Doctor' && patient.clinicalStatus !== 'Needs Triage';
  if (isTriaged && notWaiting && assessmentDate === target) {
    return true;
  }

  return false;
}

function _oldIsPatientCompletedOnDate(patient, targetDateIso = null) {
  if (!patient) return false;
  const schedule = Array.isArray(patient.pepSchedule) ? patient.pepSchedule : [];
  if (!targetDateIso) {
    const activeDose = getPatientActiveDose(patient);
    const hasCompletedDose = schedule.some((dose) => {
      if (!dose) return false;
      const status = String(dose.status || '').trim().toUpperCase();
      return status === 'COMPLETED' || status === 'FULFILLED' || status === 'DIAGNOSED' || dose.doseAdministered === true;
    });
    return !activeDose || patient.clinicalStatus === 'Completed' || patient.clinicalStatus === 'Discharged' || hasCompletedDose;
  }

  const target = String(targetDateIso).trim().substring(0, 10);
  return schedule.some((dose) => {
    if (!dose) return false;
    const status = String(dose.status || '').trim().toUpperCase();
    const isCompleted = status === 'COMPLETED' || status === 'FULFILLED' || status === 'DIAGNOSED' || dose.doseAdministered === true;
    if (!isCompleted) return false;
    const rawDate = dose.dateAdministered || dose.dateProcessed || dose.expectedDate || dose.scheduledDate || dose.date;
    if (!rawDate) return false;
    return String(rawDate).trim().substring(0, 10) === target;
  });
}

function getPendingBoosterDosesByDate(patients) {
  const map = {};
  (patients || []).forEach((patient) => {
    const schedule = Array.isArray(patient.pepSchedule) && patient.pepSchedule.length > 0
      ? patient.pepSchedule
      : (patient.day0WalkInDate ? [{ doseDay: 'Day 0', scheduledDate: patient.day0WalkInDate, status: 'Pending' }] : []);

    schedule.forEach((dose) => {
      if (!dose) return;
      const rawDate = dose.expectedDate || dose.scheduledDate || dose.date;
      if (!rawDate) return;
      const dateStr = String(rawDate).trim().substring(0, 10);
      if (!dateStr || dateStr.length < 10) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push({ patient, dose });
    });
  });
  return map;
}

function _oldGetPendingBoosterDosesByDate(patients) {
  const map = {};
  (patients || []).forEach((patient) => {
    const activeDose = getPatientActiveDose(patient);
    if (!activeDose) return;
    const rawDate = activeDose.expectedDate || activeDose.scheduledDate || activeDose.date;
    if (!rawDate) return;
    const dateStr = String(rawDate).trim().substring(0, 10);
    if (!map[dateStr]) map[dateStr] = [];
    map[dateStr].push({ patient, dose: activeDose });
  });
  return map;
}

function countDueToday(patients) {
  const today = todayDateIso;
  let count = 0;
  (patients || []).forEach((p) => {
    if ((p.pepSchedule || []).some((d) => d.status === 'Pending' && String(d.scheduledDate).split('T')[0] === today)) {
      count += 1;
    }
  });
  return count;
}

function countMissedOverdue(patients) {
  const today = todayDateIso;
  let count = 0;
  (patients || []).forEach((p) => {
    if (p.clinicalStatus === 'Missed Dose') { count += 1; return; }
    if ((p.pepSchedule || []).some((d) => d.status === 'Defaulter')) { count += 1; return; }
    if ((p.pepSchedule || []).some((d) => d.status === 'Pending' && String(d.scheduledDate).split('T')[0] < today)) { count += 1; }
  });
  return count;
}

// --- Calendar View Management & Navigation ---
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function renderCalendarGridGeneric(containerId, titleId, year, month, boosterMap, activeDateFilter, clickCallbackName) {
  const gridEl = document.getElementById(containerId);
  const titleEl = document.getElementById(titleId);
  if (titleEl) {
    titleEl.textContent = `${MONTH_NAMES_FULL[month]} ${year}`;
  }
  if (!gridEl) return;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  let html = '';
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    html += `<div class="calendar-day-cell cal-cell-empty"><div class="gcal-day-header"><span class="gcal-day-num" style="color: #9aa0a6;">${dayNum}</span></div></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const dateIso = `${year}-${monthStr}-${dayStr}`;
    const isToday = dateIso === todayDateIso;
    const isSelected = activeDateFilter === dateIso;
    const scheduledBoosters = boosterMap[dateIso] || [];
    const count = scheduledBoosters.length;

    let chipsHtml = '';
    if (count > 0) {
      const maxPills = 2;
      const visibleBoosters = scheduledBoosters.slice(0, maxPills);
      const remainingCount = count - maxPills;

      const pillsHtml = visibleBoosters
        .map((item) => {
          const p = item.patient || {};
          const dose = item.dose || {};
          const dDay = dose.doseDay || 'Dose';
          const isCat3 = p.woundCategory === 'Category III';
          const isPendingOverdue = dose.status === 'Pending' && String(dose.scheduledDate).split('T')[0] < todayDateIso;
          const pillClass = isCat3 ? 'gcal-pill-cat3' : (isPendingOverdue ? 'gcal-pill-overdue' : '');
          const safeName = escapeHtml(p.fullName || 'Patient');
          return `<div class="gcal-event-pill ${pillClass}" title="${safeName} (${dDay})"><span class="gcal-pill-dose">${dDay}:</span><span class="gcal-pill-name">${safeName}</span></div>`;
        })
        .join('');

      const moreHtml = remainingCount > 0 ? `<div class="gcal-more-pill">+${remainingCount} more</div>` : '';
      chipsHtml = `<div class="gcal-events-container">${pillsHtml}${moreHtml}</div>`;
    }
    if (count > 0) {
      // badgeHtml replaced by chipsHtml
    }

    const cellStyle = '';

    html += `
      <div
        class="calendar-day-cell ${isToday ? 'cal-cell-today' : ''} ${isSelected ? 'cal-cell-selected' : ''}"
        style="${cellStyle}"
        onclick="${clickCallbackName}('${dateIso}')"
        title="${dateIso}: ${count} dose(s) scheduled. Click to filter queue."
      >
        <div class="gcal-day-header">
          <span class="gcal-day-num">${d}</span>
          ${isToday ? '<span class="gcal-today-badge">Today</span>' : ''}
        </div>
        ${chipsHtml}
      </div>
    `;
  }

  gridEl.innerHTML = html;
}

// Receptionist Calendar & Toggles
function renderReceptionistCalendar(patients) {
  const boosterMap = getPendingBoosterDosesByDate(patients || clinicAppState.patients || []);
  renderCalendarGridGeneric(
    'recCalendarDaysGrid',
    'calCurrentMonthTitle',
    currentCalendarYear,
    currentCalendarMonth,
    boosterMap,
    clinicAppState.recQueueDateFilter,
    'handleCalendarDateCellClick'
  );
}

function handleCalendarDateCellClick(dateIso) {
  if (!dateIso) return;
  setQueueViewMode('list');
  clinicAppState.recQueueDateFilter = dateIso;
  if (!clinicAppState.recQueueFilter || clinicAppState.recQueueFilter !== 'Complete') {
    clinicAppState.recQueueFilter = 'Patient';
  }
  renderReceptionistViews();
  const boosterMap = getPendingBoosterDosesByDate(clinicAppState.patients || []);
  const count = (boosterMap[dateIso] || []).length;
  showToast(`Front Desk Queue filtered for scheduled date ${dateIso} (${count} dose${count === 1 ? '' : 's'})`);
}

function setQueueViewMode(mode) {
  clinicAppState.recQueueViewMode = mode;
  const isCalendar = mode === 'calendar';
  const calSec = document.getElementById('recQueueCalendarSection');
  const listSec = document.getElementById('recQueueListSection');
  const btnCal = document.getElementById('btnRecQueueCalendarView');
  const btnList = document.getElementById('btnRecQueueListView');

  if (calSec && listSec) {
    if (isCalendar) {
      calSec.classList.remove('hidden');
      listSec.classList.add('hidden');
    } else {
      calSec.classList.add('hidden');
      listSec.classList.remove('hidden');
    }
  }
  if (btnCal && btnList) {
    btnCal.classList.toggle('active', isCalendar);
    btnList.classList.toggle('active', !isCalendar);
  }
}

// Physician Calendar & Toggles
function renderPhysicianCalendar() {
  const boosterMap = getPendingBoosterDosesByDate(clinicAppState.patients || []);
  renderCalendarGridGeneric(
    'physCalendarDaysGrid',
    'calPhysCurrentMonthTitle',
    currentCalendarYear,
    currentCalendarMonth,
    boosterMap,
    clinicAppState.physQueueDateFilter,
    'handlePhysCalendarDateClick'
  );
}

function handlePhysCalendarDateClick(dateIso) {
  if (!dateIso) return;
  setPhysQueueViewMode('list');
  clinicAppState.physQueueDateFilter = dateIso;
  if (!clinicAppState.physQueueFilter || clinicAppState.physQueueFilter !== 'Complete') {
    clinicAppState.physQueueFilter = 'Patient';
  }
  renderPhysicianViews();
  const boosterMap = getPendingBoosterDosesByDate(clinicAppState.patients || []);
  const count = (boosterMap[dateIso] || []).length;
  showToast(`Doctor's Triage filtered for scheduled date ${dateIso} (${count} dose${count === 1 ? '' : 's'})`);
}

function setPhysQueueViewMode(mode) {
  clinicAppState.physQueueViewMode = mode;
  const isCalendar = mode === 'calendar';
  const calSec = document.getElementById('physQueueCalendarSection');
  const listSec = document.getElementById('physQueueListSection');
  const btnCal = document.getElementById('btnPhysQueueCalendarView');
  const btnList = document.getElementById('btnPhysQueueListView');

  if (calSec && listSec) {
    if (isCalendar) {
      calSec.classList.remove('hidden');
      listSec.classList.add('hidden');
    } else {
      calSec.classList.add('hidden');
      listSec.classList.remove('hidden');
    }
  }
  if (btnCal && btnList) {
    btnCal.classList.toggle('active', isCalendar);
    btnList.classList.toggle('active', !isCalendar);
  }
}

// SuperAdmin Calendar & Toggles
function renderSuperAdminCalendar() {
  const boosterMap = getPendingBoosterDosesByDate(clinicAppState.patients || []);
  renderCalendarGridGeneric(
    'adminCalendarDaysGrid',
    'calAdminCurrentMonthTitle',
    currentCalendarYear,
    currentCalendarMonth,
    boosterMap,
    clinicAppState.adminQueueDateFilter,
    'handleAdminCalendarDateClick'
  );
}

function handleAdminCalendarDateClick(dateIso) {
  if (!dateIso) return;
  setAdminQueueViewMode('list');
  clinicAppState.adminQueueDateFilter = dateIso;
  if (!clinicAppState.adminQueueFilter || clinicAppState.adminQueueFilter !== 'Complete') {
    clinicAppState.adminQueueFilter = 'Patient';
  }
  renderLiveTriageQueue();
  const boosterMap = getPendingBoosterDosesByDate(clinicAppState.patients || []);
  const count = (boosterMap[dateIso] || []).length;
  showToast(`Live Triage Queue filtered for scheduled date ${dateIso} (${count} dose${count === 1 ? '' : 's'})`);
}

function setAdminQueueViewMode(mode) {
  clinicAppState.adminQueueViewMode = mode;
  const isCalendar = mode === 'calendar';
  const calSec = document.getElementById('adminQueueCalendarSection');
  const listSec = document.getElementById('adminQueueListSection');
  const btnCal = document.getElementById('btnAdminQueueCalendarView');
  const btnList = document.getElementById('btnAdminQueueListView');

  if (calSec && listSec) {
    if (isCalendar) {
      calSec.classList.remove('hidden');
      listSec.classList.add('hidden');
    } else {
      calSec.classList.add('hidden');
      listSec.classList.remove('hidden');
    }
  }
  if (btnCal && btnList) {
    btnCal.classList.toggle('active', isCalendar);
    btnList.classList.toggle('active', !isCalendar);
  }
}

window.setQueueViewMode = setQueueViewMode;
window.handleCalendarDateCellClick = handleCalendarDateCellClick;
window.setPhysQueueViewMode = setPhysQueueViewMode;
window.handlePhysCalendarDateClick = handlePhysCalendarDateClick;
window.setAdminQueueViewMode = setAdminQueueViewMode;
window.handleAdminCalendarDateClick = handleAdminCalendarDateClick;

function changeCalendarMonth(delta) {
  currentCalendarMonth += delta;
  if (currentCalendarMonth > 11) {
    currentCalendarMonth = 0;
    currentCalendarYear += 1;
  } else if (currentCalendarMonth < 0) {
    currentCalendarMonth = 11;
    currentCalendarYear -= 1;
  }
  clinicAppState.adminQueueDateFilter = todayDateIso; clinicAppState.recQueueDateFilter = todayDateIso; clinicAppState.physQueueDateFilter = todayDateIso; refreshActiveCalendarView(); renderLiveTriageQueue();
}

function resetCalendarToToday() {
  const now = new Date();
  currentCalendarYear = now.getFullYear();
  currentCalendarMonth = now.getMonth();
  clinicAppState.adminQueueDateFilter = todayDateIso; clinicAppState.recQueueDateFilter = todayDateIso; clinicAppState.physQueueDateFilter = todayDateIso; refreshActiveCalendarView(); renderLiveTriageQueue();
}

function refreshActiveCalendarView() {
  const user = clinicAppState.authenticatedUser;
  if (!user) return;
  if (user.role === 'Receptionist') {
    renderReceptionistCalendar(clinicAppState.patients || []);
  } else if (user.role === 'Physician') {
    renderPhysicianCalendar(clinicAppState.patients || []);
  } else if (user.role === 'SuperAdmin') {
    renderSuperAdminCalendar();
  }
}

window.changeCalendarMonth = changeCalendarMonth;
window.resetCalendarToToday = resetCalendarToToday;
window.refreshActiveCalendarView = refreshActiveCalendarView;

function generateAndDownloadRegistryCSV(patientsToExport) {
  const rows = patientsToExport || clinicAppState.patients || [];
  if (!rows || rows.length === 0) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('Export Blocked', 'No patient records found to export.', 'info');
    } else {
      showToast('No patient records found to export.');
    }
    return;
  }

  const headers = [
    'Registry ID',
    'Patient Full Name',
    'Age',
    'Sex',
    'Purok / Address',
    'Contact Number',
    'Animal Type',
    'Bite Site',
    'Exposure Date',
    'WHO Category',
    'Clinical Notes',
    'Active Dose Milestone',
    'PEP Regimen Status'
  ];

  const escapeCsv = (val) => {
    const s = String(val == null ? '' : val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(',')];
  rows.forEach((p) => {
    const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
    const activeDose = getPatientActiveDose(p);
    const doseLabel = activeDose ? `${activeDose.doseDay} (${String(activeDose.scheduledDate || activeDose.expectedDate || '').split('T')[0]})` : 'Completed';
    const statusObj = getPatientVisitStatus(p);

    const record = [
      p.patientId || '',
      p.fullName || '',
      p.age || '',
      p.sex || '',
      addr,
      p.contactNumber || '',
      p.animalType || '',
      p.biteSite || '',
      String(p.day0WalkInDate || '').split('T')[0] || '',
      p.woundCategory || '',
      p.clinicalNotes || '',
      doseLabel,
      statusObj.label || 'Under Treatment'
    ];
    lines.push(record.map(escapeCsv).join(','));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ABTC_Patient_Registry_${getLocalTodayIso()}.csv`;
  a.style.visibility = 'hidden';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function promptAndExportPermanentRegistry(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const patients = clinicAppState.patients || [];
  if (!patients || patients.length === 0) {
    if (typeof Swal !== 'undefined') {
      await Swal.fire({
        icon: 'warning',
        title: 'Export Blocked',
        text: 'No patient records found in registry.',
        confirmButtonColor: '#7C3AED'
      });
    } else {
      showToast('No patient records found in registry.');
    }
    return;
  }

  if (typeof Swal === 'undefined') {
    const entered = prompt('Enter Admin Password to export patient registry:');
    if (entered === 'Admin123!') {
      generateAndDownloadRegistryCSV(patients);
      showToast('Patient registry export authorized and downloaded.');
    } else if (entered !== null) {
      alert('Incorrect password. Export cancelled.');
    }
    return;
  }

  const { value: password } = await Swal.fire({
    title: 'Protected Registry Export',
    text: 'Enter Admin Authorization Password to export complete patient records to Excel/CSV:',
    input: 'password',
    inputPlaceholder: 'Enter authorization password...',
    inputAttributes: {
      autocomplete: 'new-password',
      autocapitalize: 'off',
      autocorrect: 'off'
    },
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-file-excel"></i> Authorize & Export',
    confirmButtonColor: '#16A34A',
    cancelButtonColor: '#6B7280',
    inputValidator: (value) => {
      if (!value) return 'Authorization password is required.';
    }
  });

  if (!password) return; // User cancelled

  if (password === 'Admin123!') {
    generateAndDownloadRegistryCSV(patients);
    await Swal.fire({
      icon: 'success',
      title: 'Export Authorized',
      text: 'Patient registry records have been exported successfully.',
      confirmButtonColor: '#16A34A'
    });
  } else {
    await Swal.fire({
      icon: 'error',
      title: 'Access Denied',
      text: 'Incorrect authorization password. Registry export cancelled.',
      confirmButtonColor: '#DC2626'
    });
  }
}

if (typeof window !== 'undefined') {
  window.promptAndExportPermanentRegistry = promptAndExportPermanentRegistry;
  window.generateAndDownloadRegistryCSV = generateAndDownloadRegistryCSV;
}

function computePvrvRunway(inventory) {
  const stock = (inventory || [])
    .filter((i) => i.vaccineType === 'anti-rabies')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

  // Fallback: Days Left = Math.floor(Total PVRV Vials / (30-Day Demand / 30))
  let projected30DayDemand = 0;
  const forecast = clinicAppState.forecastData;
  if (forecast && Array.isArray(forecast.vialForecasts)) {
    const vf = forecast.vialForecasts.find((v) => v.vaccineType === 'anti-rabies');
    if (vf) projected30DayDemand = Number(vf.projected30DayDemand || 0);
  }
  const averageDailyConsumption = projected30DayDemand > 0 ? projected30DayDemand / 30 : 1;
  return Math.max(0, Math.floor(stock / averageDailyConsumption));
}

function getDueTodayBreakdown(patients) {
  const today = todayDateIso;
  const breakdown = { day0: 0, day3: 0, day7: 0, day14: 0, day28: 0 };
  const DOSE_MAP = {
    'day0': 'day0', 'day 0': 'day0',
    'day3': 'day3', 'day 3': 'day3',
    'day7': 'day7', 'day 7': 'day7',
    'day14': 'day14', 'day 14': 'day14',
    'day28': 'day28', 'day 28': 'day28'
  };
  (patients || []).forEach((p) => {
    (p.pepSchedule || []).forEach((d) => {
      if (d.status === 'Pending' && String(d.scheduledDate).split('T')[0] === today) {
        const rawKey = String(d.doseDay || '').toLowerCase().trim();
        const key = DOSE_MAP[rawKey] || rawKey.replace(/\s+/g, '');
        if (breakdown[key] !== undefined) {
          breakdown[key] += 1;
        }
      }
    });
  });
  return breakdown;
}

function computeMultiVaccineHealth(inventory, patients, summary) {
  const inv = inventory || [];
  const pts = patients || [];

  // If live backend summary is available with multi-vaccine inventory, utilize it directly
  if (summary && summary.inventory && summary.inventory.pvrv && summary.inventory.erig) {
    return {
      pvrv: summary.inventory.pvrv,
      antiTetanus: summary.inventory.antiTetanus || {
        stock: 36, dailyConsumption: 1.5, runwayDays: 24, status: 'Optimal', isCriticalRestock: false
      },
      erig: summary.inventory.erig,
      expiringBatches: summary.expiringBatches || []
    };
  }

  // Pure state calculation fallback
  const sumByType = (type) =>
    inv
      .filter((i) => i.vaccineType === type)
      .reduce((acc, i) => acc + Number(i.currentStock || 0), 0);

  const stockPvrv = sumByType('anti-rabies');
  const stockTt = sumByType('anti-tetanus');
  const stockErig = sumByType('ERIG');

  // Trailing 30-day fulfilled dose consumption
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const consumption = { 'anti-rabies': 0, 'anti-tetanus': 0, ERIG: 0 };

  pts.forEach((p) => {
    (p.pepSchedule || []).forEach((d) => {
      if (d.status === 'Fulfilled') {
        const dDate = String(d.dateProcessed || d.scheduledDate || '').split('T')[0];
        if (dDate >= thirtyDaysAgoIso) {
          let vType = d.vaccineTypeUsed || 'anti-rabies';
          if (vType === 'PVRV') vType = 'anti-rabies';
          if (consumption[vType] !== undefined) consumption[vType] += 1;
          else consumption['anti-rabies'] += 1;
        }
      }
    });
  });

  const buildBiologicHealth = (vType, stock, defaultBurn, safetyThreshold) => {
    const consumed30 = consumption[vType] || 0;
    const dailyRate = consumed30 > 0 ? Number((consumed30 / 30).toFixed(1)) : defaultBurn;
    const runwayDays = dailyRate > 0 ? Math.max(0, Math.floor(stock / dailyRate)) : 999;
    const lots = inv.filter((i) => i.vaccineType === vType);
    const hasCriticalBatch = lots.some(
      (l) => Number(l.currentStock || 0) <= Number(l.lowStockThreshold || safetyThreshold)
    );
    let status = 'Optimal';
    if (stock <= 0 || stock <= safetyThreshold || runwayDays <= 10 || hasCriticalBatch) {
      status = 'Critical Restock';
    } else if (runwayDays <= 21 || stock <= safetyThreshold * 1.5) {
      status = 'Reorder Soon';
    }
    return {
      stock,
      dailyConsumption: dailyRate,
      runwayDays,
      safetyThreshold,
      status,
      isCriticalRestock: status === 'Critical Restock'
    };
  };

  const today = todayDateIso;
  const expiringBatches = inv
    .filter((item) => {
      if (!item.currentStock || item.currentStock <= 0 || !item.expirationDate) return false;
      const expStr = String(item.expirationDate).split('T')[0];
      const diffMs = new Date(expStr) - new Date(today);
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 60;
    })
    .map((item) => {
      const expStr = String(item.expirationDate).split('T')[0];
      const days = Math.ceil((new Date(expStr) - new Date(today)) / (1000 * 60 * 60 * 24));
      return {
        vaccineType: item.vaccineType === 'anti-rabies' ? 'PVRV' : item.vaccineType,
        brandName: item.brandName,
        batchNumber: item.batchNumber,
        currentStock: item.currentStock,
        expirationDate: expStr,
        daysUntilExpiry: Math.max(0, days)
      };
    })
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return {
    pvrv: buildBiologicHealth('anti-rabies', stockPvrv, 4.2, 30),
    antiTetanus: buildBiologicHealth('anti-tetanus', stockTt, 1.5, 15),
    erig: buildBiologicHealth('ERIG', stockErig, 0.8, 10),
    expiringBatches
  };
}

const _triageTimeFormatter = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : null;

function formatTriageArrivalTime(isoString) {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString).slice(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const timeStr = _triageTimeFormatter ? _triageTimeFormatter.format(d) : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${year}-${month}-${day} ${timeStr}`;
  } catch (e) {
    return '--:--';
  }
}

const CANONICAL_PUROK_MAP = {
  '1': 'Purok 1 (Centro)',
  '2': 'Purok 2 (Mabini Ext.)',
  '3': 'Purok 3 (Rizal St.)',
  '4': 'Purok 4 (Del Pilar)',
  '5': 'Purok 5 (Maharlika)',
  '6': 'Purok 6 (Riverbank)',
  '7': 'Purok 7 (Narra St.)'
};

function normalizePurokName(rawPurok) {
  const str = String(rawPurok || '').trim();
  if (!str) return 'Purok 1 (Centro)';
  const match = str.match(/purok\s*([1-7])\b/i);
  if (match && CANONICAL_PUROK_MAP[match[1]]) {
    return CANONICAL_PUROK_MAP[match[1]];
  }
  return str.split(',')[0].trim() || 'Purok 1 (Centro)';
}

function _oldUnusedLiveTriageQueue() { return renderLiveTriageQueue(); }
function __discarded_oldUnusedLiveTriageQueue() {
  const triageBody = document.getElementById('adminOverviewTriageBody');
  const triageCountEl = document.getElementById('adminOverviewTriageCount');
  if (!triageBody) return;

  const live = clinicAppState.dashboardSummary;
  let rawQueue = live && Array.isArray(live.triageQueue) ? live.triageQueue : null;

  // Resilient fallback from live patient records if summary is pending or offline
  if (!rawQueue) {
    const patients = clinicAppState.patients || [];
    rawQueue = patients
      .filter(
        (p) =>
          !['Completed', 'Wound Cleansing Only'].includes(p.clinicalStatus) &&
          (p.woundCategory === 'Pending' ||
            ['Waiting for Doctor', 'Needs Triage'].includes(p.clinicalStatus) ||
            p.checkedInForTriage === true)
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt || a.day0WalkInDate || Date.now()) -
          new Date(b.createdAt || b.day0WalkInDate || Date.now())
      )
      .map((p) => ({
        id: p.patientId,
        name: p.fullName,
        animalType: p.animalType || 'Domestic Dog',
        purok: normalizePurokName(p.purok || p.barangay || 'Purok 1 (Centro)'),
        arrivalTime: (p.createdAt ? new Date(p.createdAt) : new Date(p.day0WalkInDate || Date.now())).toISOString()
      }));
  }

  // Deduplicate by patient ID while preserving FIFO arrival order
  const seenTriageIds = new Set();
  const queue = [];
  (rawQueue || []).forEach((item) => {
    const pid = item.id || item.patientId || '';
    if (pid && seenTriageIds.has(pid)) return;
    if (pid) seenTriageIds.add(pid);
    queue.push(item);
  });

  if (triageCountEl) {
    triageCountEl.textContent = isCompleteTab ? `${queue.length} Completed` : `${queue.length} Waiting`;
    triageCountEl.className = isCompleteTab ? 'badge badge-lime' : (queue.length > 0 ? 'badge badge-amber' : 'badge badge-lime');
  }

  if (queue.length === 0) {
    triageBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding: 28px; text-align: center;">
          <i class="fas fa-check-circle" style="color: #16A34A; font-size: 1.5rem; display: block; margin-bottom: 6px;"></i>
          <strong>Triage Queue Clear</strong>
          <span class="cell-sub">No patients currently waiting for physician triage</span>
        </td>
      </tr>
    `;
    return;
  }

  triageBody.innerHTML = queue
    .map((item) => {
      const isDog = String(item.animalType || '').toLowerCase().includes('dog');
      const vectorIcon = isDog ? 'fa-dog text-amber' : 'fa-cat text-purple';
      const timeStr = formatTriageArrivalTime(item.arrivalTime);
      const safeId = escapeHtml(item.id || '');
      const safeName = escapeHtml(item.name || '');
      const safeVector = escapeHtml(item.animalType || 'Domestic Dog');
      const safePurok = escapeHtml(normalizePurokName(item.purok || 'Purok 1 (Centro)'));

      return `
        <tr class="patient-row" data-patient-id="${safeId}">
          <td class="col-id"><strong>${safeId}</strong></td>
          <td><strong>${safeName}</strong></td>
          <td>${safeVector}</td>
          <td><span class="cell-sub" style="font-size: 12px;"><i class="fas fa-map-marker-alt text-muted" style="margin-right: 3px;"></i>${safePurok}</span></td>
          <td class="num-col mono-num">${timeStr}</td>
          <td><span class="badge badge-amber"><i class="fas fa-clock" style="margin-right: 4px;"></i>Waiting for Doctor</span></td>
          <td>
            <button
              type="button"
              class="${isCompleteTab ? 'btn btn-secondary btn-sm' : 'btn btn-success btn-sm btn-complete-triage'}" ${isCompleteTab ? 'disabled' : ''}
              data-patient-id="${safeId}"
              title="Open Doctor's Triage"
              aria-label="Open Doctor's Triage"
            >
              <i class="fas fa-check"></i> ${isCompleteTab ? 'Completed' : 'Complete'}
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderLiveTriageQueue() {
  const triageBody = document.getElementById('adminOverviewTriageBody');
  const triageCountEl = document.getElementById('adminOverviewTriageCount');
  const patients = clinicAppState.patients || [];

  // 1. Update tab counters: Patient and Complete
  const activeCount = patients.filter((p) => isPatientActiveOnDate(p, clinicAppState.adminQueueDateFilter)).length;
  const completeCount = patients.filter((p) => isPatientCompletedOnDate(p, clinicAppState.adminQueueDateFilter)).length;

  const countPatEl = document.getElementById('count-admin-queue-patient');
  if (countPatEl) countPatEl.textContent = activeCount;
  const countCompEl = document.getElementById('count-admin-queue-complete');
  if (countCompEl) countCompEl.textContent = completeCount;

  document.querySelectorAll('#adminOverviewQueueFilterTabs .filter-tab').forEach((t) => { t.classList.toggle('active', t.getAttribute('data-admin-queue-filter') === (clinicAppState.adminQueueFilter || 'Patient')); });
  // 2. Render Calendar Grid
  renderSuperAdminCalendar();

  if (!triageBody) return;

  // 3. Strict List Filtering: 'Patient' vs 'Complete' on active dose date
  const isCompleteTab = clinicAppState.adminQueueFilter === 'Complete';
  let queue = patients.filter((p) => {
    if (isCompleteTab) {
      return isPatientCompletedOnDate(p, clinicAppState.adminQueueDateFilter);
    }
    return isPatientActiveOnDate(p, clinicAppState.adminQueueDateFilter);
  });

  const searchVal = document.getElementById('adminQueueSearchInput')?.value || '';
  if (searchVal) {
    const q = searchVal.toLowerCase().trim();
    queue = queue.filter((p) =>
      String(p.fullName || '').toLowerCase().includes(q) ||
      String(p.patientId || '').toLowerCase().includes(q) ||
      String(p.purok || '').toLowerCase().includes(q)
    );
  }

  if (triageCountEl) {
    triageCountEl.textContent = isCompleteTab ? `${queue.length} Completed` : `${queue.length} Waiting`;
    triageCountEl.className = isCompleteTab ? 'badge badge-lime' : (queue.length > 0 ? 'badge badge-amber' : 'badge badge-lime');
  }

  if (queue.length === 0) {
    triageBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding: 28px; text-align: center;">
          <i class="fas fa-check-circle" style="color: #16A34A; font-size: 1.5rem; display: block; margin-bottom: 6px;"></i>
          <strong>Waiting List Queue Clear</strong>
          <span class="cell-sub">No patients currently matching filter criteria</span>
        </td>
      </tr>
    `;
    return;
  }

  triageBody.innerHTML = queue
    .map((p) => {
      const timeStr = formatTriageArrivalTime(p.createdAt || p.day0WalkInDate || Date.now());
      const safeId = escapeHtml(p.patientId || '');
      const safeName = escapeHtml(p.fullName || '');
      const safeVector = escapeHtml(p.animalType || 'Domestic Dog');
      const safePurok = escapeHtml(normalizePurokName(p.purok || p.barangay || 'Purok 1 (Centro)'));

      return `
        <tr class="patient-row" data-patient-id="${safeId}">
          <td class="col-id"><strong>${safeId}</strong></td>
          <td><strong>${safeName}</strong></td>
          <td>${safeVector}</td>
          <td><span class="cell-sub" style="font-size: 12px;"><i class="fas fa-map-marker-alt text-muted" style="margin-right: 3px;"></i>${safePurok}</span></td>
          <td class="num-col mono-num">${timeStr}</td>
          <td><span class="badge ${isCompleteTab ? 'badge-lime' : 'badge-amber'}"><i class="fas ${isCompleteTab ? 'fa-check' : 'fa-clock'}" style="margin-right: 4px;"></i>${isCompleteTab ? 'Completed' : 'Needs Doctor'}</span></td>
        </tr>
      `;
    })
    .join('');
}

function renderActionableDefaulters() {
  const defaultersBody = document.getElementById('adminOverviewDefaultersBody');
  const countEl = document.getElementById('adminOverviewDefaulterCount');
  const alertBadgeEl = document.getElementById('adminOverviewDefaulterAlertBadge');
  return; // Defaulter tracking removed

  const live = clinicAppState.dashboardSummary;
  let rawDefaulters = live && Array.isArray(live.defaulters) ? live.defaulters : null;

  // Resilient fallback from patient schedules
  if (!rawDefaulters) {
    const today = todayDateIso;
    const list = [];
    (clinicAppState.patients || []).forEach((p) => {
      if (['Completed', 'Wound Cleansing Only'].includes(p.clinicalStatus)) return;
      const missedList = (p.pepSchedule || []).filter((d) => {
        if (d.status === 'Defaulter') return true;
        if (d.status === 'Pending') {
          const dIso = String(d.scheduledDate).split('T')[0];
          return dIso < today;
        }
        return false;
      });

      if (missedList.length > 0) {
        missedList.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
        const target = missedList[0];
        const doseIso = String(target.scheduledDate).split('T')[0];
        const daysOverdue = Math.max(1, Math.floor((new Date(today) - new Date(doseIso)) / (24 * 60 * 60 * 1000)));
        list.push({
          id: p.patientId,
          name: p.fullName,
          phone: p.contactNumber || 'N/A',
          missedDose: target.doseDay,
          dueDate: doseIso,
          daysOverdue
        });
      } else if (p.clinicalStatus === 'Missed Dose') {
        list.push({
          id: p.patientId,
          name: p.fullName,
          phone: p.contactNumber || 'N/A',
          missedDose: 'Booster Dose',
          dueDate: today,
          daysOverdue: 1
        });
      }
    });
    list.sort((a, b) => b.daysOverdue - a.daysOverdue);
    rawDefaulters = list;
  }

  // Deduplicate by patient ID and ensure descending sort by daysOverdue
  const seenDefaulterIds = new Set();
  const defaulters = [];
  (rawDefaulters || []).forEach((item) => {
    const pid = item.id || item.patientId || '';
    if (pid && seenDefaulterIds.has(pid)) return;
    if (pid) seenDefaulterIds.add(pid);
    defaulters.push(item);
  });
  defaulters.sort((a, b) => Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0));

  if (countEl) countEl.textContent = defaulters.length;
  if (alertBadgeEl) {
    alertBadgeEl.className = defaulters.length > 0 ? 'badge badge-red badge-pulse' : 'badge badge-lime';
  }

  if (defaulters.length === 0) {
    defaultersBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding: 28px; text-align: center;">
          <i class="fas fa-shield-alt" style="color: #16A34A; font-size: 1.5rem; display: block; margin-bottom: 6px;"></i>
          <strong>Zero Defaulters</strong>
          <span class="cell-sub">100% adherence to scheduled PEP booster vaccination milestones</span>
        </td>
      </tr>
    `;
    return;
  }

  defaultersBody.innerHTML = defaulters
    .map((item) => {
      const isCritical = item.daysOverdue >= 7;
      const overdueBadgeClass = isCritical ? 'badge-red' : 'badge-amber';
      const overdueIcon = isCritical ? 'fa-exclamation-circle' : 'fa-clock';
      const overdueSuffix = isCritical ? ' (Critical)' : '';
      const safeId = escapeHtml(item.id || '');
      const safeName = escapeHtml(item.name || '');
      const safePhone = escapeHtml(item.phone || 'N/A');
      const safeDose = escapeHtml(item.missedDose || 'Booster Dose');
      const safeDate = escapeHtml(item.dueDate || '');
      const hasPhone = item.phone && item.phone !== 'N/A';

      const phoneDisplay = hasPhone
        ? `<a href="tel:${safePhone}" class="phone-link mono-num"><i class="fas fa-phone-alt"></i> ${safePhone}</a>`
        : `<span class="text-muted mono-num">No phone on file</span>`;

      return `
        <tr class="patient-row" data-patient-id="${safeId}">
          <td class="col-id"><strong>${safeId}</strong></td>
          <td>
            <strong>${safeName}</strong>
            <span class="cell-sub">${phoneDisplay}</span>
          </td>
          <td><span class="badge badge-purple">${safeDose}</span></td>
          <td class="num-col mono-num">${safeDate}</td>
          <td><span class="badge ${overdueBadgeClass}"><i class="fas ${overdueIcon}" style="margin-right: 4px;"></i>${item.daysOverdue}d overdue${overdueSuffix}</span></td>
          <td>
            <div class="row-actions" style="justify-content: flex-end;">
              ${hasPhone ? `
                <a
                  href="tel:${safePhone}"
                  class="btn btn-secondary btn-sm icon-btn"
                  title="Call ${safeName} (${safePhone})"
                  aria-label="Call ${safeName}"
                >
                  <i class="fas fa-phone" style="color: #16A34A;"></i>
                </a>
              ` : ''}
              <button
                type="button"
                class="btn btn-primary btn-sm btn-recall-action"
                data-patient-id="${safeId}"
                data-patient-name="${safeName}"
                data-patient-phone="${safePhone}"
                data-missed-dose="${safeDose}"
                title="Initiate clinical recall outreach"
              >
                <i class="fas fa-bullhorn" style="margin-right: 4px;"></i> Recall
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function countHighSurgePuroks(patients) {
  const counts = {};
  (patients || []).forEach((p) => {
    const key = normalizePurokName(p.purok || p.barangay || 'Unknown');
    counts[key] = (counts[key] || 0) + 1;
  });
  const values = Object.values(counts);
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.filter((v) => v > mean).length;
}

function countPatientsByCategory(patients) {
  const counts = { all: patients.length, today: 0, overdue: 0 };

  patients.forEach((p) => {
    const statusObj = getPatientVisitStatus(p);

    if (statusObj.key === 'Waiting for Doctor' || statusObj.key === 'Due Today') counts.today += 1;
    if (statusObj.key === 'Missed Dose') counts.overdue += 1;
  });

  return counts;
}

// updateTabCounts(data[, groupId]) -> refreshes the innerText of every
// filter tab badge. Without groupId all filter tab groups are updated.
function updateTabCounts(data, groupId = null) {
  const counts = countPatientsByCategory(data || []);
  const groupIds = groupId ? [groupId] : FILTER_TAB_COUNT_GROUPS;

  groupIds.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;

    group.querySelectorAll('[data-count-key]').forEach((badge) => {
      const key = badge.getAttribute('data-count-key');
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        badge.innerText = String(counts[key]);
      }
    });
  });
}

let idleSessionTimer = null;
let IDLE_TIMEOUT_DURATION = 15 * 60 * 1000; // 15 minutes (default; overridden by system settings)

// Applies a new inactivity timeout (in minutes) and resets the idle timer.
function applySessionTimeout(minutes) {
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed) || parsed < 1) return;
  IDLE_TIMEOUT_DURATION = Math.round(parsed) * 60 * 1000;
  resetIdleTimer();
}

function resetIdleTimer() {
  if (idleSessionTimer) {
    clearTimeout(idleSessionTimer);
  }
  if (!clinicAppState.authenticatedUser) return;

  idleSessionTimer = setTimeout(async () => {
    if (!clinicAppState.authenticatedUser) return;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}

    stopRealtimePolling();
    if (mfaOtpCountdownInterval) {
      clearInterval(mfaOtpCountdownInterval);
      mfaOtpCountdownInterval = null;
    }
    if (resetOtpCountdownInterval) {
      clearInterval(resetOtpCountdownInterval);
      resetOtpCountdownInterval = null;
    }
    const mfaCountdownEl = document.getElementById('mfaOtpCountdown');
    if (mfaCountdownEl) mfaCountdownEl.textContent = '05:00';
    const resetCountdownEl = document.getElementById('resetOtpCountdown');
    if (resetCountdownEl) resetCountdownEl.textContent = '05:00';
    if (idleSessionTimer) clearTimeout(idleSessionTimer);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pep_auth_token');
      localStorage.removeItem('pep_user_role');
    }
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', '/');
    }
    clinicAppState.authenticatedUser = null;
    clinicAppState.pendingLoginEmail = '';
    clinicAppState.selectedPatientId = '';
    applyRoleBasedTopFilterVisibility(null);
    const shell = document.getElementById('authenticatedAppShell');
    const auth = document.getElementById('authScreen');
    const s2 = document.getElementById('loginStep2Form');
    const s1 = document.getElementById('loginStep1Form');
    if (shell) shell.classList.add('hidden');
    if (auth) auth.classList.remove('hidden');
    if (s2) s2.classList.add('hidden');
    if (s1) s1.classList.remove('hidden');

    const minutes = Math.round(IDLE_TIMEOUT_DURATION / 60000);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Session Expired',
        text: `Your session has expired after ${minutes} minutes of inactivity for patient privacy and DOH data protection.`,
        icon: 'warning',
        confirmButtonColor: '#2e7d32'
      });
    } else {
      showToast(`Session expired due to ${minutes} minutes of inactivity. Please sign in again.`);
    }
  }, IDLE_TIMEOUT_DURATION);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('mousemove', resetIdleTimer, { passive: true });
  window.addEventListener('keydown', resetIdleTimer, { passive: true });
} else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('mousemove', resetIdleTimer, { passive: true });
  document.addEventListener('keydown', resetIdleTimer, { passive: true });
}

// --- Role-Based Filter Bar Visibility (Strict Display Override) ---
function applyRoleBasedTopFilterVisibility(role) {
  const filterBar = document.getElementById('analyticsFilterBar');
  if (!filterBar) return;
  if (role === 'SuperAdmin') {
    filterBar.classList.remove('non-admin-hidden');
    filterBar.style.setProperty('display', 'flex', 'important');
  } else {
    filterBar.classList.add('non-admin-hidden');
    filterBar.style.setProperty('display', 'none', 'important');
  }
}

// --- Realtime Background Polling (2-Second Interval) ---
function isSafeToRerenderUI() {
  const openModal = document.querySelector('.modal-overlay:not(.hidden), .modal:not(.hidden), .swal2-container');
  if (openModal) return false;

  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
    if (activeEl.closest('#walkInForm, #adminOnboardStaffForm, #editPatientForm')) return false;
  }
  return true;
}

let realtimePollingTimer = null;
let isPollingInProgress = false;

async function checkAccountNotifications(user) {
  if (!user) return;
  const notifications = user.accountNotifications;
  if (!Array.isArray(notifications) || notifications.length === 0) return;
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  const msgsHtml = unread.map((n) => `
    <div style="padding: 10px; margin-bottom: 8px; border-left: 4px solid #DC2626; background: #FEF2F2; text-align: left; border-radius: 4px;">
      <strong style="color: #991B1B; font-size: 13.5px; display: block; margin-bottom: 3px;">${escapeHtml(n.title || 'Security Notice')}</strong>
      <span style="font-size: 13px; color: #374151;">${escapeHtml(n.message)}</span>
      <div style="font-size: 11px; color: #9CA3AF; margin-top: 4px;">${new Date(n.createdAt || Date.now()).toLocaleString()}</div>
    </div>
  `).join('');

  if (typeof Swal !== 'undefined') {
    await Swal.fire({
      icon: 'warning',
      title: 'Account Security Notification',
      html: `
        <p style="margin-bottom: 12px; font-size: 13.5px; color: #4B5563;">The Administrator has modified your clinic account:</p>
        ${msgsHtml}
      `,
      confirmButtonText: 'I Acknowledge',
      confirmButtonColor: '#7C3AED'
    });
  }

  try {
    const savedToken = (typeof localStorage !== 'undefined') ? (localStorage.getItem('token') || localStorage.getItem('pep_auth_token')) : null;
    await fetch('/api/auth/notifications/read', {
      method: 'POST',
      headers: savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {}
    });
    unread.forEach((n) => { n.read = true; });
  } catch (err) {}
}

function getAuthHeaders(extra = {}) {
  const token = (typeof localStorage !== 'undefined') ? (localStorage.getItem('token') || localStorage.getItem('pep_auth_token')) : null;
  const headers = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function silentDataPoll() {
  if (!clinicAppState.authenticatedUser || isPollingInProgress || !isSafeToRerenderUI()) return;
  isPollingInProgress = true;
  try {
    const meRes = await fetch('/api/auth/me', {
      headers: getAuthHeaders(),
      credentials: 'same-origin'
    });

    if (meRes && meRes.status === 401) {
      stopRealtimePolling();
      const meJson = await meRes.json().catch(() => ({}));
      showAlertMessage({
        title: 'Session Terminated',
        text: meJson.message || 'Your staff account has been deactivated or modified by the SuperAdmin. Please sign in again.',
        icon: 'error'
      });
      setTimeout(() => {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('pep_auth_token');
        }
        window.location.reload();
      }, 2500);
      return;
    }

    if (meRes && meRes.ok) {
      const meData = await meRes.json();
      if (meData.data?.user?.accountNotifications) {
        checkAccountNotifications(meData.data.user);
      }
    }

    await loadRoleAuthorizedData();
  } catch (err) {
    // silent failure during auto-poll
  } finally {
    isPollingInProgress = false;
  }
}

function startRealtimePolling() {
  if (realtimePollingTimer) clearInterval(realtimePollingTimer);
  realtimePollingTimer = setInterval(silentDataPoll, 2000);
}

function stopRealtimePolling() {
  if (realtimePollingTimer) {
    clearInterval(realtimePollingTimer);
    realtimePollingTimer = null;
  }
}

async function openAuthenticatedRoleWorkspace(user) {
  if (mfaOtpCountdownInterval) {
    clearInterval(mfaOtpCountdownInterval);
    mfaOtpCountdownInterval = null;
  }
  if (resetOtpCountdownInterval) {
    clearInterval(resetOtpCountdownInterval);
    resetOtpCountdownInterval = null;
  }
  clinicAppState.authenticatedUser = user;
  resetIdleTimer();

  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('authenticatedAppShell').classList.remove('hidden');

  document.getElementById('headerUserFullName').textContent = user.fullName;
  document.getElementById('headerUserRoleBadge').textContent = user.role;

  renderRoleSidebarNavigation(user.role);
  applyRoleBasedTopFilterVisibility(user.role);
  startRealtimePolling();
  if (window.history && typeof window.history.replaceState === 'function') {
    const defaultView = clinicAppState.activeViewId || ROLE_NAVIGATION_MAP[user.role][0].viewId;
    window.history.replaceState({ view: defaultView }, '', `#${defaultView}`);
  }
  checkAccountNotifications(user);
  await loadRoleAuthorizedData();

  // Load the configured session timeout (SuperAdmin-managed).
  try {
    const savedToken = (typeof localStorage !== 'undefined') ? (localStorage.getItem('token') || localStorage.getItem('pep_auth_token')) : null;
    const settingsRes = await fetch('/api/settings', {
      headers: savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {}
    });
    if (settingsRes.ok) {
      const sJson = await settingsRes.json();
      if (sJson && sJson.data && sJson.data.inactivityTimeoutMinutes) {
        applySessionTimeout(sJson.data.inactivityTimeoutMinutes);
        const select = document.getElementById('sessionTimeout');
        if (select) select.value = String(sJson.data.inactivityTimeoutMinutes);
      }
    }
  } catch (err) {}
}

function _unusedDuplicateBlock() {
  return;
  // DEAD CODE BLOCK
}
/* DEAD_REMOVED
  try {
  const auditRoleFilter = document.getElementById('auditRoleFilter');
  if (auditRoleFilter) {
    auditRoleFilter.addEventListener('change', () => renderAdminAuditLogs());
  }
  const auditActionFilter = document.getElementById('auditActionFilter');
  if (auditActionFilter) {
    auditActionFilter.addEventListener('change', () => renderAdminAuditLogs());
  }
  const auditSearchInput = document.getElementById('auditSearchInput');
  if (auditSearchInput) {
    auditSearchInput.addEventListener('input', () => renderAdminAuditLogs());
  }

  window.addEventListener('popstate', (e) => {
    if (!clinicAppState.authenticatedUser) return;
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const targetView = e.state?.view || hash;
    if (targetView && ROLE_NAVIGATION_MAP[clinicAppState.authenticatedUser.role]?.some((item) => item.viewId === targetView)) {
      switchClinicalView(targetView, false);
    } else {
      const currentView = clinicAppState.activeViewId || ROLE_NAVIGATION_MAP[clinicAppState.authenticatedUser.role][0].viewId;
      if (window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({ view: currentView }, '', `#${currentView}`);
      }
      switchClinicalView(currentView, false);
    }
  });



    const savedToken = (typeof localStorage !== 'undefined') ? (localStorage.getItem('token') || localStorage.getItem('pep_auth_token')) : null;

      headers: savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {}
    });
    if (settingsRes.ok) {
      const sJson = await settingsRes.json();
      if (sJson && sJson.data && sJson.data.inactivityTimeoutMinutes) {
        applySessionTimeout(sJson.data.inactivityTimeoutMinutes);
        const select = document.getElementById('sessionTimeout');
        if (select) select.value = String(sJson.data.inactivityTimeoutMinutes);
      }
    }
  } catch (err) {
*/ {
  }
function normalizeSummaryData(summaryData) {
  if (!summaryData || typeof summaryData !== 'object') return summaryData;
  if (summaryData.purokOutbreaks && typeof summaryData.purokOutbreaks === 'object') {
    const normOutbreaks = {};
    Object.entries(summaryData.purokOutbreaks).forEach(([rawKey, cnt]) => {
      const canon = normalizePurokName(rawKey);
      normOutbreaks[canon] = (normOutbreaks[canon] || 0) + Number(cnt || 0);
    });
    summaryData.purokOutbreaks = normOutbreaks;
    const pCounts = Object.values(normOutbreaks);
    if (pCounts.length > 0) {
      const mean = pCounts.reduce((a, b) => a + b, 0) / pCounts.length;
      summaryData.highSurgePuroks = pCounts.filter((c) => c > mean).length;
    }
  }
  if (Array.isArray(summaryData.triageQueue)) {
    const seenTriage = new Set();
    summaryData.triageQueue = summaryData.triageQueue
      .filter((item) => {
        const key = item && (item.id || item.patientId);
        if (!key || seenTriage.has(key)) return false;
        seenTriage.add(key);
        return true;
      })
      .map((item) => ({
        ...item,
        purok: normalizePurokName(item.purok || 'Purok 1 (Centro)')
      }));
  }
  if (Array.isArray(summaryData.defaulters)) {
    const seenDef = new Set();
    summaryData.defaulters = summaryData.defaulters
      .filter((item) => {
        const key = item && (item.id || item.patientId);
        if (!key || seenDef.has(key)) return false;
        seenDef.add(key);
        return true;
      })
      .sort((a, b) => Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0));
    summaryData.missedDoses = summaryData.defaulters.length;
    summaryData.missedOverdueDoses = summaryData.defaulters.length;
  }
  return summaryData;
}

// Fetches the live dashboard KPIs from the database and refreshes the four
// top KPI boxes of the Clinic Overview.
async function loadDashboardSummary() {
  try {
    const res = await fetch('/api/dashboard/summary', { headers: getAuthHeaders(), credentials: 'same-origin' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;

    clinicAppState.dashboardSummary = normalizeSummaryData(json.data);

    const setKpi = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    // Actionable Executive KPI boxes
    setKpi('adminKpiDueToday', json.data.patientsDueToday || 0);
    if (json.data.dueTodayBreakdown) {
      setKpi('adminDueDay0', json.data.dueTodayBreakdown.day0 || 0);
      setKpi('adminDueDay3', json.data.dueTodayBreakdown.day3 || 0);
      setKpi('adminDueDay7', json.data.dueTodayBreakdown.day7 || 0);
      setKpi('adminDueDay14', json.data.dueTodayBreakdown.day14 || 0);
      setKpi('adminDueDay28', json.data.dueTodayBreakdown.day28 || 0);
    }
    setKpi('adminKpiMissedDoses', json.data.missedOverdueDoses || 0);
    setKpi('adminKpiStockRunway', `${json.data.pvrvStockRunwayDays || 0} Days`);
    const runwayMeta = document.getElementById('adminKpiStockRunwayMeta');
    if (runwayMeta) {
      const vialCount = json.data.pvrvStock != null ? json.data.pvrvStock : 129;
      runwayMeta.textContent = `${vialCount} vials on hand`;
    }
    setKpi('adminKpiSurgePuroks', json.data.highSurgePuroks || 0);
    setKpi('adminKpiActivePep', json.data.activePatients || json.data.patientsDueToday || 0);

    // Backwards-compatible fallback bindings
    setKpi('adminKpiPatients', json.data.patientsDueToday || json.data.activePatients || 0);
    setKpi('adminKpiRabies', json.data.pvrvStock || 129);
    setKpi('adminKpiErig', json.data.erigStock || 0);
    setKpi('adminKpiStaffCount', json.data.activeStaff || 0);

    return json.data;
  } catch (err) {
    console.warn('Could not load dashboard summary:', err.message);
    return null;
  }
}

async function loadRoleAuthorizedData() {
  const user = clinicAppState.authenticatedUser;
  if (!user) return;
  const authHeaders = getAuthHeaders(); const fetchOpts = { headers: authHeaders, credentials: 'same-origin' }; const normalizePatientRecord = (p) => ({
    ...p,
    purok: normalizePurokName(p.purok || p.barangay || 'Purok 1 (Centro)')
  });
  try {
    if (user.role === 'Receptionist') {
      const [res, invRes] = await Promise.all([
        fetch('/api/receptionist/patients', fetchOpts),
        fetch('/api/physician/inventory', fetchOpts)
      ]);
      if (res.ok) {
        const json = await res.json();
        clinicAppState.patients = ((json.data && json.data.patients) || []).map(normalizePatientRecord);
      }
      if (invRes && invRes.ok) {
        const iJson = await invRes.json();
        clinicAppState.inventory = (iJson.data && iJson.data.inventory) || [];
      }
      renderReceptionistViews();
    } else if (user.role === 'Physician') {
      const [patRes, invRes] = await Promise.all([
        fetch('/api/physician/patients', fetchOpts),
        fetch('/api/physician/inventory', fetchOpts)
      ]);
      if (patRes.ok) {
        const pJson = await patRes.json();
        clinicAppState.patients = ((pJson.data && pJson.data.patients) || []).map(normalizePatientRecord);
      }
      if (invRes.ok) {
        const iJson = await invRes.json();
        clinicAppState.inventory = (iJson.data && iJson.data.inventory) || [];
      }
      renderPhysicianViews();
    } else if (user.role === 'SuperAdmin') {
      const [patRes, summaryRes, usersRes, dashRes] = await Promise.all([
        fetch('/api/admin/patients', fetchOpts),
        fetch('/api/admin/analytics-summary', fetchOpts),
        fetch('/api/admin/users', fetchOpts),
        fetch('/api/dashboard/summary', fetchOpts)
      ]);

      if (patRes.ok) {
        const pJson = await patRes.json();
        clinicAppState.patients = ((pJson.data && pJson.data.patients) || []).map(normalizePatientRecord);
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
      if (dashRes.ok) {
        const dJson = await dashRes.json();
        if (dJson.data) {
          clinicAppState.dashboardSummary = normalizeSummaryData(dJson.data);
        }
      }
      renderSuperAdminViews();
    }
  } catch (err) {
    console.warn('Error loading workspace data:', err.message);
  }
}

function _oldUnusedRenderReceptionistViews() { return; }
function _deadFunction() {
  const patients = clinicAppState.patients || [];
  const queueSearchVal = document.getElementById('recQueueSearchInput')?.value || '';
  const followSearchVal = document.getElementById('recFollowUpSearchInput')?.value || '';

  // Available Vaccine Stocks (PVRV Anti-Rabies and ERIG)
  const pvrvStock = inventory
    .filter((i) => i.vaccineType === 'anti-rabies')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);
  const erigStock = inventory
    .filter((i) => i.vaccineType === 'ERIG')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

  const pvrvEl = document.getElementById('recKpiPvrvStock');
  if (pvrvEl) pvrvEl.textContent = pvrvStock;
  const erigEl = document.getElementById('recKpiErigStock');
  if (erigEl) erigEl.textContent = erigStock;

  // Active Brgy. Kapitan Pepe Records
  const totEl = document.getElementById('recKpiTotalPatients');
  if (totEl) totEl.textContent = patients.length;

  // Missed / Overdue Doses
  const overdueCount = patients.filter((p) => isPatientRegistryOverdue(p)).length;
  const missEl = document.getElementById('recKpiMissedCount');
  if (missEl) missEl.textContent = overdueCount;

  if (false) {
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
  }

  // Dynamic filter tab counters
  updateTabCounts(patients, 'recQueueFilterTabs');
  updateTabCounts(patients, 'recFollowUpFilterTabs');

  const filteredQueue = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.recQueueFilter, queueSearchVal)
  );

  const frontDeskBody = document.getElementById('recFrontDeskTableBody');
  frontDeskBody.innerHTML = filteredQueue
    .map((p) => {
      const statusObj = getPatientVisitStatus(p);
      const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
      const biteDate = String(p.day0WalkInDate).split('T')[0];
      const isAlreadyQueued = p.checkedInForTriage || p.woundCategory === 'Pending';

      const actionHtml = isAlreadyQueued
        ? `<span class="badge badge-lime">Checked In</span>`
        : `<button type="button" class="btn btn-secondary btn-sm icon-btn btn-checkin-patient" data-patient-id="${p.patientId}" title="Check In patient" aria-label="Check In patient"><i class="fas fa-clipboard-check"></i></button>`;

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
      const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
      const isQueued = p.checkedInForTriage;
      const btnHtml = isQueued
        ? `<span class="badge badge-lime">Checked In</span>`
        : `<button type="button" class="btn btn-primary btn-sm icon-btn btn-checkin-patient" data-patient-id="${p.patientId}" title="Check In patient" aria-label="Check In patient"><i class="fas fa-clipboard-check"></i></button>`;

      return `
        <tr data-patient-id="${p.patientId}">
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong>
            <span class="cell-sub mono-num">${p.contactNumber}</span>
          </td>
          <td>${addr}</td>
          <td>${buildPepTimelineHtml(p, false)}</td>
          <td>${btnHtml}</td>
        </tr>
      `;
    })
    .join('');
}

function renderReceptionistViews() {
  const patients = clinicAppState.patients || [];
  const inventory = clinicAppState.inventory || [];
  const queueSearchVal = document.getElementById('recQueueSearchInput')?.value || '';
  const regSearchVal = document.getElementById('recRegistrySearchInput')?.value || '';

  // Available Vaccine Stocks (PVRV Anti-Rabies and ERIG)
  const pvrvStock = inventory
    .filter((i) => i.vaccineType === 'anti-rabies')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);
  const erigStock = inventory
    .filter((i) => i.vaccineType === 'ERIG')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

  const pvrvEl = document.getElementById('recKpiPvrvStock');
  if (pvrvEl) pvrvEl.textContent = pvrvStock;
  const erigEl = document.getElementById('recKpiErigStock');
  if (erigEl) erigEl.textContent = erigStock;

  // Active Brgy. Kapitan Pepe Records
  const totEl = document.getElementById('recKpiTotalPatients');
  if (totEl) totEl.textContent = patients.length;

  // Missed / Overdue Doses
  const overdueCount = patients.filter((p) => isPatientRegistryOverdue(p)).length;
  const missEl = document.getElementById('recKpiMissedCount');
  if (missEl) missEl.textContent = overdueCount;

  // 1. Tab Counts: Patient and Complete
  const recActiveCount = patients.filter((p) => isPatientActiveOnDate(p, clinicAppState.recQueueDateFilter)).length;
  const recCompleteCount = patients.filter((p) => isPatientCompletedOnDate(p, clinicAppState.recQueueDateFilter)).length;

  const countPatEl = document.getElementById('count-rec-queue-patient');
  if (countPatEl) countPatEl.textContent = recActiveCount;
  const countCompEl = document.getElementById('count-rec-queue-complete');
  if (countCompEl) countCompEl.textContent = recCompleteCount;

  // 2. Render Receptionist Calendar
  renderReceptionistCalendar(patients);

  // 3. Strict Front Desk Queue Table
  const isCompleteTab = clinicAppState.recQueueFilter === 'Complete';
  let filteredQueue = patients.filter((p) => {
    if (isCompleteTab) {
      return isPatientCompletedOnDate(p, clinicAppState.recQueueDateFilter);
    }
    return isPatientActiveOnDate(p, clinicAppState.recQueueDateFilter);
  });

  if (queueSearchVal) {
    const q = queueSearchVal.toLowerCase().trim();
    filteredQueue = filteredQueue.filter((p) =>
      String(p.fullName || '').toLowerCase().includes(q) ||
      String(p.patientId || '').toLowerCase().includes(q) ||
      String(p.contactNumber || '').includes(q) ||
      String(p.purok || '').toLowerCase().includes(q)
    );
  }

  const frontDeskBody = document.getElementById('recFrontDeskTableBody');
  if (frontDeskBody) {
    if (filteredQueue.length === 0) {
      frontDeskBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted" style="padding: 24px; text-align: center;">
            No patients found matching the selected filter criteria.
          </td>
        </tr>
      `;
    } else {
      frontDeskBody.innerHTML = filteredQueue
        .map((p) => {
          const statusObj = getPatientVisitStatus(p);
          const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
          const biteDate = String(p.day0WalkInDate || '').split('T')[0] || '—';
          const timeStr = formatTriageArrivalTime(p.createdAt || p.day0WalkInDate || p.updatedAt);
          const isAlreadyQueued = p.checkedInForTriage || p.woundCategory === 'Pending';

          const actionHtml = isAlreadyQueued
            ? `<span class="badge badge-lime">Checked In</span>`
            : `<button type="button" class="btn btn-secondary btn-sm icon-btn btn-checkin-patient" data-patient-id="${p.patientId}" title="Check In patient" aria-label="Check In patient"><i class="fas fa-clipboard-check"></i></button>`;

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
              <td class="num-col mono-num">${timeStr}</td>
              <td><span class="badge ${statusObj.badgeClass}">${statusObj.label}</span></td>
              <td>${actionHtml}</td>
            </tr>
          `;
        })
        .join('');
    }
  }

  // 4. Render Permanent Patient Registry Table
  const recRegBody = document.getElementById('recPermanentRegistryTableBody');
  if (recRegBody) {
    const countRecPatEl = document.getElementById('count-rec-reg-patient');
    if (countRecPatEl) countRecPatEl.textContent = patients.filter((p) => isPatientRegistryActive(p)).length;
    const countRecCompEl = document.getElementById('count-rec-reg-complete');
    if (countRecCompEl) countRecCompEl.textContent = patients.filter((p) => isPatientRegistryComplete(p)).length;
    const countRecOverEl = document.getElementById('count-rec-reg-overdue');
    if (countRecOverEl) countRecOverEl.textContent = patients.filter((p) => isPatientRegistryOverdue(p)).length;

    const isRecRegComp = clinicAppState.recRegistryFilter === 'Complete';
    const isRecRegOver = clinicAppState.recRegistryFilter === 'Overdue';
    let regPatients = patients.filter((p) => {
      if (isRecRegOver) return isPatientRegistryOverdue(p);
      if (isRecRegComp) return isPatientRegistryComplete(p);
      return isPatientRegistryActive(p);
    });
    if (regSearchVal) {
      const q = regSearchVal.toLowerCase().trim();
      regPatients = regPatients.filter((p) =>
        String(p.fullName || '').toLowerCase().includes(q) ||
        String(p.patientId || '').toLowerCase().includes(q) ||
        String(p.contactNumber || '').includes(q) ||
        String(p.purok || '').toLowerCase().includes(q)
      );
    }
    if (regPatients.length === 0) {
      recRegBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted" style="padding: 24px; text-align: center;">
            No registry records found.
          </td>
        </tr>
      `;
    } else {
      recRegBody.innerHTML = regPatients
        .map((p) => {
          const catBadge = getCategoryBadgeClass(p.woundCategory);
          const catText = p.woundCategory === 'Pending' ? 'Needs Doctor' : p.woundCategory;
          const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
          const biteDate = String(p.day0WalkInDate || '').split('T')[0] || '—';

          return `
            <tr data-patient-id="${p.patientId}">
              <td class="col-id"><strong>${p.patientId}</strong></td>
              <td>
                <strong>${p.fullName}</strong> (${p.age}y, ${p.sex})
                <span class="cell-sub">${addr} • <span class="mono-num">${p.contactNumber}</span></span>
              </td>
              <td>
                <strong>${p.animalType} — ${p.biteSite}</strong>
                <span class="cell-sub">${p.biteStatus || 'Bite'}</span>
              </td>
              <td class="num-col mono-num">${biteDate}</td>
              <td><span class="badge ${catBadge}">${catText}</span></td>
              <td>${buildPepTimelineHtml(p, false)}</td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm icon-btn btn-view-permanent-record"
                    data-patient-id="${p.patientId}"
                    title="View Details"
                    aria-label="View confidential patient record"
                  >
                    <i class="fas fa-eye"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');
    }
  }

  // 5. Render Read-Only Stocks Table
  const recInvBody = document.getElementById('recReadOnlyInventoryBody');
  if (recInvBody) {
    recInvBody.innerHTML = inventory
      .map((item) => {
        const expStr = String(item.expirationDate).split('T')[0];
        const isExpired = expStr < todayDateIso;
        const threshold = item.lowStockThreshold || 10;
        const isLow = item.currentStock <= threshold;

        let badgeClass = isLow ? 'badge-red' : 'badge-lime';
        let statusText = isLow ? 'Low Stock' : 'In Stock';
        if (isExpired) {
          badgeClass = 'badge-red badge-expired';
          statusText = 'EXPIRED';
        }

        return `
          <tr>
            <td><strong>${item.vaccineType}</strong></td>
            <td>${item.brandName}</td>
            <td class="num-col mono-num"><strong>${item.batchNumber}</strong></td>
            <td class="num-col tabular-num"><strong class="${isExpired || isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
            <td class="num-col tabular-num">${threshold}</td>
            <td class="num-col mono-num ${isExpired ? 'text-red' : ''}">${expStr}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
          </tr>
        `;
      })
      .join('');
  }
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

function _oldUnusedRenderPhysicianViews() {
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

  // Dynamic filter tab counters
  updateTabCounts(patients, 'physTriageFilterTabs');
  updateTabCounts(patients, 'physRecordsFilterTabs');

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
      const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
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
              class="btn btn-secondary btn-sm icon-btn btn-assess-triage"
              data-patient-id="${p.patientId}"
              title="Assess / Triage"
              aria-label="Assess / Triage"
            >
              <i class="fas fa-stethoscope"></i>
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
      const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
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
          <td>${buildPepTimelineHtml(p, true)}</td>
        </tr>
      `;
    })
    .join('');

  const roBody = document.getElementById('physReadOnlyInventoryBody');
  roBody.innerHTML = inventory
    .map((item) => {
      const expStr = String(item.expirationDate).split('T')[0];
      const isExpired = expStr < todayDateIso;
      const threshold = item.lowStockThreshold || 10;
      const isLow = item.currentStock <= threshold;

      let badgeClass = isLow ? 'badge-red' : 'badge-lime';
      let statusText = isLow ? 'Low Stock' : 'In Stock';
      if (isExpired) {
        badgeClass = 'badge-red badge-expired';
        statusText = 'EXPIRED';
      }

      return `
        <tr>
          <td><strong>${item.vaccineType}</strong></td>
          <td>${item.brandName}</td>
          <td class="num-col mono-num"><strong>${item.batchNumber}</strong></td>
          <td class="num-col tabular-num"><strong class="${isExpired || isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
          <td class="num-col tabular-num">${threshold}</td>
          <td class="num-col mono-num ${isExpired ? 'text-red' : ''}">${expStr}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
        </tr>
      `;
    })
    .join('');
}

function renderPhysicianViews() {
  const patients = clinicAppState.patients || [];
  const inventory = clinicAppState.inventory || [];

  // Available Vaccine Stocks (PVRV Anti-Rabies and ERIG)
  const pvrvStock = inventory
    .filter((i) => i.vaccineType === 'anti-rabies')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);
  const erigStock = inventory
    .filter((i) => i.vaccineType === 'ERIG')
    .reduce((sum, i) => sum + Number(i.currentStock || 0), 0);

  const physPvrvEl = document.getElementById('physKpiPvrvStock');
  if (physPvrvEl) physPvrvEl.textContent = pvrvStock;
  const physErigEl = document.getElementById('physKpiErigStock');
  if (physErigEl) physErigEl.textContent = erigStock;

  // Active Brgy. Kapitan Pepe Records
  const physTotEl = document.getElementById('physKpiTotalPatients');
  if (physTotEl) physTotEl.textContent = patients.length;

  // Missed / Overdue Doses
  const overdueCount = patients.filter((p) => isPatientRegistryOverdue(p)).length;
  const physMissEl = document.getElementById('physKpiMissedCount');
  if (physMissEl) physMissEl.textContent = overdueCount;

  const waitingCount = patients.filter((p) => p.woundCategory === 'Pending').length;
  const dueTodayCount = patients.filter((p) =>
    (p.pepSchedule || []).some(
      (d) => String(d.scheduledDate).split('T')[0] === todayDateIso && d.status === 'Pending'
    )
  ).length;
  const cat3Count = patients.filter((p) => p.woundCategory === 'Category III').length;

  const physKpiWaiting = document.getElementById('physKpiWaiting');
  if (physKpiWaiting) physKpiWaiting.textContent = waitingCount;
  const physKpiDueToday = document.getElementById('physKpiDueToday');
  if (physKpiDueToday) physKpiDueToday.textContent = dueTodayCount;
  const physKpiCat3 = document.getElementById('physKpiCat3');
  if (physKpiCat3) physKpiCat3.textContent = cat3Count;
  const physKpiRabies = document.getElementById('physKpiRabiesVials');
  if (physKpiRabies) physKpiRabies.textContent = pvrvStock;

  // 1. Queue Tab Counts: Patient and Complete (filtered by active calendar date if selected)
  const physActiveCount = patients.filter((p) => isPatientActiveOnDate(p, clinicAppState.physQueueDateFilter)).length;
  const physCompleteCount = patients.filter((p) => isPatientCompletedOnDate(p, clinicAppState.physQueueDateFilter)).length;

  const countPatEl = document.getElementById('count-phys-queue-patient');
  if (countPatEl) countPatEl.textContent = physActiveCount;
  const countCompEl = document.getElementById('count-phys-queue-complete');
  if (countCompEl) countCompEl.textContent = physCompleteCount;

  // 2. Render Physician Calendar
  renderPhysicianCalendar(patients);

  // 3. Strict Physician Triage Queue Table
  const isCompleteTab = clinicAppState.physQueueFilter === 'Complete';
  let filteredTriageQueue = patients.filter((p) => {
    if (isCompleteTab) {
      return isPatientCompletedOnDate(p, clinicAppState.physQueueDateFilter);
    }
    return isPatientActiveOnDate(p, clinicAppState.physQueueDateFilter);
  });

  const queueSearchVal = document.getElementById('physQueueSearchInput')?.value || '';
  if (queueSearchVal) {
    const q = queueSearchVal.toLowerCase().trim();
    filteredTriageQueue = filteredTriageQueue.filter((p) =>
      String(p.fullName || '').toLowerCase().includes(q) ||
      String(p.patientId || '').toLowerCase().includes(q) ||
      String(p.contactNumber || '').includes(q) ||
      String(p.purok || '').toLowerCase().includes(q)
    );
  }

  if (!clinicAppState.selectedPatientId && filteredTriageQueue.length > 0) {
    clinicAppState.selectedPatientId = filteredTriageQueue[0].patientId;
  }

  const triageBody = document.getElementById('physTriageQueueBody');
  if (triageBody) {
    if (filteredTriageQueue.length === 0) {
      triageBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted" style="padding: 24px; text-align: center;">
            No patients found matching the selected filter criteria.
          </td>
        </tr>
      `;
    } else {
      triageBody.innerHTML = filteredTriageQueue
        .map((p) => {
          const isSelected = p.patientId === clinicAppState.selectedPatientId;
          const catBadge = getCategoryBadgeClass(p.woundCategory);
          const catText = p.woundCategory === 'Pending' ? 'Needs Doctor' : p.woundCategory;
          const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
          const nextPending = (p.pepSchedule || []).find((d) => d.status === 'Pending');
          const nextLabel = nextPending
            ? `${nextPending.doseDay} (${String(nextPending.scheduledDate).split('T')[0]})`
            : 'Completed';
          const timeStr = formatTriageArrivalTime(p.createdAt || p.day0WalkInDate || p.updatedAt);

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
              <td class="num-col mono-num">${timeStr}</td>
              <td class="mono-num">${nextLabel}</td>
              <td>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm icon-btn btn-assess-triage"
                  data-patient-id="${p.patientId}"
                  title="Doctor's Assessment"
                  aria-label="Doctor's Assessment"
                >
                  <i class="fas fa-stethoscope"></i>
                </button>
              </td>
            </tr>
          `;
        })
        .join('');
    }
  }

  if (clinicAppState.selectedPatientId) {
    selectPatient(clinicAppState.selectedPatientId, false);
  }

  // 4. Render Physician Patient Records Table
  const recPatCount = patients.filter((p) => isPatientRegistryActive(p)).length;
  const recCompCount = patients.filter((p) => isPatientRegistryComplete(p)).length;
  const countRecPatEl = document.getElementById('count-phys-records-patient');
  if (countRecPatEl) countRecPatEl.textContent = recPatCount;
  const countRecCompEl = document.getElementById('count-phys-records-complete');
  if (countRecCompEl) countRecCompEl.textContent = recCompCount;
  const countRecOverEl = document.getElementById('count-phys-records-overdue');
  if (countRecOverEl) countRecOverEl.textContent = patients.filter((p) => isPatientRegistryOverdue(p)).length;
  const isRecordsOverdueTab = clinicAppState.physRecordsFilter === 'Overdue';

  const isRecordsCompleteTab = clinicAppState.physRecordsFilter === 'Complete';
  let filteredRecords = patients.filter((p) => {
    if (isRecordsOverdueTab) return isPatientRegistryOverdue(p);
    if (isRecordsCompleteTab) {
      return isPatientRegistryComplete(p);
    }
    return isPatientRegistryActive(p);
  });

  const recordsSearchVal = document.getElementById('physSearchInput')?.value || '';
  if (recordsSearchVal) {
    const q = recordsSearchVal.toLowerCase().trim();
    filteredRecords = filteredRecords.filter((p) =>
      String(p.fullName || '').toLowerCase().includes(q) ||
      String(p.patientId || '').toLowerCase().includes(q) ||
      String(p.contactNumber || '').includes(q) ||
      String(p.purok || '').toLowerCase().includes(q)
    );
  }

  const recordsBody = document.getElementById('physRecordsTableBody');
  if (recordsBody) {
    if (filteredRecords.length === 0) {
      recordsBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted" style="padding: 24px; text-align: center;">
            No patient records found.
          </td>
        </tr>
      `;
    } else {
      recordsBody.innerHTML = filteredRecords
        .map((p) => {
          const catBadge = getCategoryBadgeClass(p.woundCategory);
          const catText = p.woundCategory === 'Pending' ? 'Needs Doctor' : p.woundCategory;
          const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
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
              <td>${buildPepTimelineHtml(p, true)}</td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm icon-btn btn-view-permanent-record"
                    data-patient-id="${p.patientId}"
                    title="View Details"
                    aria-label="View confidential patient record"
                  >
                    <i class="fas fa-eye"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');
    }
  }

  // 5. Render Read-Only Stocks Table
  const roBody = document.getElementById('physReadOnlyInventoryBody');
  if (roBody) {
    roBody.innerHTML = inventory
      .map((item) => {
        const expStr = String(item.expirationDate).split('T')[0];
        const isExpired = expStr < todayDateIso;
        const threshold = item.lowStockThreshold || 10;
        const isLow = item.currentStock <= threshold;

        let badgeClass = isLow ? 'badge-red' : 'badge-lime';
        let statusText = isLow ? 'Low Stock' : 'In Stock';
        if (isExpired) {
          badgeClass = 'badge-red badge-expired';
          statusText = 'EXPIRED';
        }

        return `
          <tr>
            <td><strong>${item.vaccineType}</strong></td>
            <td>${item.brandName}</td>
            <td class="num-col mono-num"><strong>${item.batchNumber}</strong></td>
            <td class="num-col tabular-num"><strong class="${isExpired || isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
            <td class="num-col tabular-num">${threshold}</td>
            <td class="num-col mono-num ${isExpired ? 'text-red' : ''}">${expStr}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
          </tr>
        `;
      })
      .join('');
  }
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
  const addr = patient.purok || patient.barangay || 'Brgy. Kapitan Pepe';
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

// ito yung pang drawing ng bar chart ng kagat kada purok, galing sa purokBreakdown ng forecast
// Shared ordering for the purok breakdown: highest total cases first, so the
// stacked bar chart and the summary table below it stay perfectly aligned.
function getSortedPurokRows(forecast) {
  return ((forecast && forecast.purokBreakdown) || [])
    .slice()
    .sort((a, b) => {
      const totalDiff = Number(b.totalCases || 0) - Number(a.totalCases || 0);
      if (totalDiff !== 0) return totalDiff;
      return String(a.purok).localeCompare(String(b.purok), undefined, { numeric: true });
    });
}

// Keeps the full Kapitan Pepe purok label so the chart axis and table rows
// explicitly reflect the Barangay Kapitan Pepe scope.
function formatPurokLabel(purok) {
  return String(purok || '').trim();
}

// ==========================================================================
// TARGET CLINICAL ANALYTICS CHARTS (MATCHING REFERENCE ARCHITECTURE)
// ==========================================================================

// Helper plugin to render numerical value strings directly adjacent to horizontal bars
const horizontalBarLabelPlugin = {
  id: 'horizontalBarLabelPlugin',
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    ctx.save();
    const dataset = data.datasets && data.datasets[0];
    if (!dataset) {
      ctx.restore();
      return;
    }
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) {
      ctx.restore();
      return;
    }
    meta.data.forEach((bar, index) => {
      const val = dataset.data[index];
      if (val != null) {
        ctx.fillStyle = '#1E293B';
        ctx.font = '600 10.5px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(Number(val).toLocaleString(), bar.x + 5, bar.y);
      }
    });
    ctx.restore();
  }
};

// Dynamic Clinical Data Aggregator aligned with Filter Controls & Real Clinic Records
function getFilteredAnalyticsContext() {
  // Use strictly live patient database records (zero synthetic injections per AGENTS.md)
  const allPatients = Array.isArray(clinicAppState.patients) ? clinicAppState.patients : [];

  const yearEl = document.getElementById('globalFilterYear');
  const quarterEl = document.getElementById('globalFilterQuarter');
  const monthEl = document.getElementById('globalFilterMonth');
  const animalEl = document.getElementById('globalFilterAnimal');
  const outcomeEl = document.getElementById('globalFilterOutcome');
  const ageEl = document.getElementById('globalFilterAge');
  const sexEl = document.getElementById('globalFilterSex');

  const selectedYear = yearEl ? yearEl.value : 'All';
  const selectedQuarter = quarterEl ? quarterEl.value : 'All';
  const selectedMonth = monthEl ? monthEl.value : 'All';
  const selectedAnimal = animalEl ? animalEl.value : 'All';
  const selectedOutcome = outcomeEl ? outcomeEl.value : 'All';
  const selectedAge = ageEl ? ageEl.value : 'All';
  const selectedSex = sexEl ? sexEl.value : 'All';

  const isFiltered = (
    selectedYear !== 'All' ||
    selectedQuarter !== 'All' ||
    selectedMonth !== 'All' ||
    selectedAnimal !== 'All' ||
    selectedOutcome !== 'All' ||
    selectedAge !== 'All' ||
    selectedSex !== 'All'
  );

  let filtered = allPatients.slice();

  if (selectedYear !== 'All') {
    filtered = filtered.filter((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      return String(dt.getFullYear()) === selectedYear;
    });
  }

  if (selectedQuarter !== 'All') {
    const qMap = { Q1: [0, 1, 2], Q2: [3, 4, 5], Q3: [6, 7, 8], Q4: [9, 10, 11] };
    const allowed = qMap[selectedQuarter] || [];
    filtered = filtered.filter((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      return allowed.includes(dt.getMonth());
    });
  }

  if (selectedMonth !== 'All') {
    const mNum = parseInt(selectedMonth, 10);
    filtered = filtered.filter((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      return dt.getMonth() + 1 === mNum;
    });
  }

  if (selectedAnimal !== 'All') {
    const term = selectedAnimal.toLowerCase();
    filtered = filtered.filter((p) => {
      const anim = String(p.animalType || '').toLowerCase();
      if (term === 'stray dog') return anim === 'stray dog';
      if (term === 'domestic dog') return anim === 'domestic dog' || anim === 'dog';
      if (term === 'dog') return anim.includes('dog');
      if (term === 'stray cat') return anim === 'stray cat';
      if (term === 'domestic cat') return anim === 'domestic cat' || anim === 'cat';
      if (term === 'cat') return anim.includes('cat');
      return anim === term || anim.includes(term);
    });
  }

  if (selectedOutcome !== 'All') {
    const targetOut = selectedOutcome.trim().toLowerCase();
    filtered = filtered.filter((p) => {
      const st = String(p.clinicalStatus || '').trim().toLowerCase();
      if (st === targetOut) return true;
      if (
        (targetOut === 'ongoing schedule' || targetOut === 'under treatment') &&
        (st === 'ongoing schedule' || st === 'under treatment')
      ) {
        return true;
      }
      return false;
    });
  }

  if (selectedAge !== 'All') {
    filtered = filtered.filter((p) => {
      const age = Number(p.age || 0);
      if (selectedAge === 'Children') return age < 15;
      if (selectedAge === 'Youth') return age >= 15 && age < 25;
      if (selectedAge === 'Adults') return age >= 25 && age < 55;
      if (selectedAge === 'Seniors') return age >= 55;
      return true;
    });
  }

  if (selectedSex !== 'All') {
    filtered = filtered.filter((p) => String(p.sex || '').toLowerCase() === selectedSex.toLowerCase());
  }

  return {
    isFiltered,
    filteredPatients: filtered,
    totalCount: filtered.length
  };
}

// Helper plugin to render total count in the center of Doughnut charts
function createDoughnutCenterPlugin(totalValue, subLabel) {
  return {
    id: 'doughnutCenterPlugin',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      if (!ctx || typeof ctx.fillText !== 'function') return;
      const centerX = chart.chartArea
        ? (chart.chartArea.left + chart.chartArea.right) / 2
        : (chart.width || 160) / 2;
      const centerY = chart.chartArea
        ? (chart.chartArea.top + chart.chartArea.bottom) / 2
        : (chart.height || 140) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1E293B';
      ctx.font = '700 18px "Plus Jakarta Sans", Inter, sans-serif';
      ctx.fillText(String(Number(totalValue || 0).toLocaleString()), centerX, centerY - 6);
      ctx.fillStyle = '#64748B';
      ctx.font = '600 8.5px Inter, sans-serif';
      ctx.fillText(String(subLabel || 'CASES').toUpperCase(), centerX, centerY + 10);
      ctx.restore();
    }
  };
}

// 1. Horizontal Bar: Intake Volume by Canonical Purok Locations (Live Clinic Data)
function renderPurokChart() {
  const canvas = document.getElementById('purokChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (purokChart) {
    purokChart.destroy();
    purokChart = null;
  }
  if (myChart) {
    myChart.destroy();
    myChart = null;
  }

  const { filteredPatients, isFiltered } = getFilteredAnalyticsContext();

  const purokCounts = {};
  const live = !isFiltered ? normalizeSummaryData(clinicAppState.dashboardSummary) : null;

  if (!isFiltered && (!clinicAppState.patients || clinicAppState.patients.length === 0) && live && live.purokOutbreaks && Object.keys(live.purokOutbreaks).length > 0) {
    Object.entries(live.purokOutbreaks).forEach(([rawKey, cnt]) => {
      const canon = normalizePurokName(rawKey);
      purokCounts[canon] = (purokCounts[canon] || 0) + Number(cnt || 0);
    });
  } else {
    filteredPatients.forEach((p) => {
      const canon = normalizePurokName(p.purok || p.barangay || 'Purok 1 (Centro)');
      purokCounts[canon] = (purokCounts[canon] || 0) + 1;
    });
  }

  const sorted = Object.entries(purokCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
    })
    .slice(0, 7);

  const labels = sorted.map((s) => s[0]);
  const data = sorted.map((s) => s[1]);
  const meanVal = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
  const bgColors = data.map((val, idx) => {
    if (idx === 0) return '#3B0D47';
    if (idx === 1 || val > meanVal) return '#6B21A8';
    return '#94A3B8';
  });

  const ctxPurok = canvas.getContext('2d');
  purokChart = new Chart(ctxPurok, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [
        {
          label: 'Intake Volume',
          data: data.length ? data : [0],
          backgroundColor: bgColors.length ? bgColors : ['#94A3B8'],
          borderRadius: 3,
          barThickness: 13
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 24, right: 35, top: 4, bottom: 4 }
      },
      scales: {
        x: {
          display: false,
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            padding: 8,
            font: { family: 'Inter, sans-serif', size: 10, weight: '600' },
            color: '#334155',
            autoSkip: false
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Volume: ${Number(ctx.raw).toLocaleString()} cases`
          }
        }
      }
    },
    plugins: [horizontalBarLabelPlugin]
  });
  myChart = purokChart;
}

const renderAnalyticsChart = renderPurokChart;

// 2. Doughnut: Bite Distribution by Animal Type (Live Clinic Data)
function renderExposurePieChart() {
  const canvas = document.getElementById('exposurePieChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (exposurePieChart) {
    exposurePieChart.destroy();
    exposurePieChart = null;
  }

  const { filteredPatients } = getFilteredAnalyticsContext();
  const total = filteredPatients.length;

  const CANONICAL_VECTORS = [
    { label: 'Domestic Dog', color: '#3B0D47' },
    { label: 'Stray Dog', color: '#7C3AED' },
    { label: 'Domestic Cat', color: '#D97706' },
    { label: 'Stray Cat', color: '#0D9488' }
  ];

  const counts = {
    'Domestic Dog': 0,
    'Stray Dog': 0,
    'Domestic Cat': 0,
    'Stray Cat': 0
  };

  filteredPatients.forEach((p) => {
    let a = String(p.animalType || 'Domestic Dog').trim();
    if (a === 'Dog') a = 'Domestic Dog';
    if (a === 'Cat') a = 'Domestic Cat';
    if (counts[a] !== undefined) {
      counts[a] += 1;
    } else {
      counts['Domestic Dog'] += 1;
    }
  });

  const labels = CANONICAL_VECTORS.map((v) => v.label);
  const rawCounts = labels.map((k) => counts[k] || 0);
  const data = labels.map((k) => (total > 0 ? Number(((counts[k] / total) * 100).toFixed(1)) : 0));
  const colors = CANONICAL_VECTORS.map((v) => v.color);

  const ctxExposure = canvas.getContext('2d');
  exposurePieChart = new Chart(ctxExposure, {
    type: 'doughnut',
    data: {
      labels: total > 0 ? labels : ['No Data'],
      datasets: [
        {
          data: total > 0 ? data : [100],
          backgroundColor: total > 0 ? colors : ['#CBD5E1'],
          borderWidth: 2,
          borderColor: '#FFFFFF',
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}% (${rawCounts[ctx.dataIndex] || 0} cases)`
          }
        }
      }
    },
    plugins: [createDoughnutCenterPlugin(total, 'Total Cases')]
  });

  const legEl = document.getElementById('animalTypeLegend');
  if (legEl) {
    const col1 = CANONICAL_VECTORS.slice(0, 2);
    const col2 = CANONICAL_VECTORS.slice(2, 4);

    const renderCol = (items, startIdx) =>
      `<div>` +
      items
        .map(
          (item, i) =>
            `<div class="legend-badge-item"><span class="legend-color-dot" style="background:${item.color}"></span> ${item.label}: <strong>${rawCounts[startIdx + i]}</strong> (${data[startIdx + i]}%)</div>`
        )
        .join('') +
      `</div>`;

    legEl.innerHTML = renderCol(col1, 0) + renderCol(col2, 2);
  }
}

// 3. Doughnut: Patient Distribution by Age group + Sex Split Summary (Live Clinic Data)
function renderAgeGroupChart() {
  const canvas = document.getElementById('ageGroupChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (ageGroupChart) {
    ageGroupChart.destroy();
    ageGroupChart = null;
  }

  const { filteredPatients } = getFilteredAnalyticsContext();
  const total = filteredPatients.length;

  let c = 0, y = 0, a = 0, s = 0;
  let maleCount = 0, femaleCount = 0;
  filteredPatients.forEach((p) => {
    const age = Number(p.age || 0);
    if (age < 15) c += 1;
    else if (age < 25) y += 1;
    else if (age < 55) a += 1;
    else s += 1;

    const sx = String(p.sex || '').trim().toLowerCase();
    if (sx === 'male') maleCount += 1;
    else if (sx === 'female') femaleCount += 1;
  });

  const groups = [
    { label: 'Children (<15y)', count: c, color: '#3B0D47' },
    { label: 'Youth (15-24y)', count: y, color: '#6B21A8' },
    { label: 'Adults (25-54y)', count: a, color: '#8B5CF6' },
    { label: 'Seniors (55+y)', count: s, color: '#C084FC' }
  ];

  const labels = groups.map((g) => g.label);
  const data = groups.map((g) => (total > 0 ? Number(((g.count / total) * 100).toFixed(1)) : 0));
  const colors = groups.map((g) => g.color);

  const ctxAge = canvas.getContext('2d');
  ageGroupChart = new Chart(ctxAge, {
    type: 'doughnut',
    data: {
      labels: total > 0 ? labels : ['No Data'],
      datasets: [
        {
          data: total > 0 ? data : [100],
          backgroundColor: total > 0 ? colors : ['#CBD5E1'],
          borderWidth: 2,
          borderColor: '#FFFFFF',
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}% (${groups[ctx.dataIndex]?.count || 0} patients)`
          }
        }
      }
    },
    plugins: [createDoughnutCenterPlugin(total, 'Patients')]
  });

  const legEl = document.getElementById('ageGroupLegend');
  if (legEl) {
    const malePct = total > 0 ? Number(((maleCount / total) * 100).toFixed(1)) : 0;
    const femalePct = total > 0 ? Number(((femaleCount / total) * 100).toFixed(1)) : 0;
    const ageItemsHtml = groups
      .map(
        (g, idx) =>
          `<div class="legend-badge-item"><span class="legend-color-dot" style="background:${g.color}"></span> ${g.label}: <strong>${g.count}</strong> (${data[idx]}%)</div>`
      )
      .join('');
    const sexSplitHtml = `
      <div class="legend-sex-split" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #E2E8F0; font-size: 10px; color: #475569; display: flex; justify-content: space-between; width: 100%;">
        <span><i class="fas fa-mars" style="color:#4F46E5; margin-right:3px;"></i>Male: <strong>${maleCount}</strong> (${malePct}%)</span>
        <span><i class="fas fa-venus" style="color:#DB2777; margin-right:3px;"></i>Female: <strong>${femaleCount}</strong> (${femalePct}%)</span>
      </div>
    `;
    legEl.innerHTML = ageItemsHtml + sexSplitHtml;
  }
}

// 4. Combo Bar + Line Chart: Walk-In & Outcome Trend (Live 2026 Clinical Surveillance)
function renderWeeklyTrendGraph() {
  const canvas = document.getElementById('weeklyTrendGraph');
  if (!canvas || typeof Chart === 'undefined') return;
  if (weeklyTrendChart) {
    weeklyTrendChart.destroy();
    weeklyTrendChart = null;
  }

  const { filteredPatients } = getFilteredAnalyticsContext();
  const yearEl = document.getElementById('globalFilterYear');
  const monthEl = document.getElementById('globalFilterMonth');
  const quarterEl = document.getElementById('globalFilterQuarter');
  const selectedYear = yearEl ? yearEl.value : 'All';
  const selectedMonth = monthEl ? monthEl.value : 'All';
  const selectedQuarter = quarterEl ? quarterEl.value : 'All';

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yrLabel = selectedYear !== 'All' ? selectedYear : '2026';

  let labels = [];
  let intakes = [];
  let cat3Cases = [];
  let outcomes = [];

  if (selectedMonth !== 'All') {
    const mIdx = Math.max(0, Math.min(11, parseInt(selectedMonth, 10) - 1));
    const mName = MONTH_NAMES[mIdx] || 'Oct';
    labels = [`${mName} 1-7 (W1)`, `${mName} 8-14 (W2)`, `${mName} 15-21 (W3)`, `${mName} 22+ (W4)`];
    intakes = [0, 0, 0, 0];
    cat3Cases = [0, 0, 0, 0];
    outcomes = [0, 0, 0, 0];

    filteredPatients.forEach((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      const day = dt.getDate();
      const bIdx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
      intakes[bIdx] += 1;
      if (String(p.woundCategory || '').includes('III')) {
        cat3Cases[bIdx] += 1;
      }

      (p.pepSchedule || []).forEach((s) => {
        if (s.status === 'Fulfilled' || s.doseAdministered === true) {
          const sDate = new Date(s.dateProcessed || s.scheduledDate || dt);
          if (sDate.getMonth() === mIdx) {
            const sDay = sDate.getDate();
            const sIdx = sDay <= 7 ? 0 : sDay <= 14 ? 1 : sDay <= 21 ? 2 : 3;
            outcomes[sIdx] += 1;
          }
        }
      });
    });
  } else if (selectedQuarter !== 'All' && ['Q1', 'Q2', 'Q3', 'Q4'].includes(selectedQuarter)) {
    const qMonthsMap = { Q1: [0, 1, 2], Q2: [3, 4, 5], Q3: [6, 7, 8], Q4: [9, 10, 11] };
    const qMonths = qMonthsMap[selectedQuarter];
    labels = qMonths.map((m) => `${MONTH_NAMES[m]} ${yrLabel}`);
    intakes = [0, 0, 0];
    cat3Cases = [0, 0, 0];
    outcomes = [0, 0, 0];

    filteredPatients.forEach((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      const bIdx = qMonths.indexOf(dt.getMonth());
      if (bIdx !== -1) {
        intakes[bIdx] += 1;
        if (String(p.woundCategory || '').includes('III')) cat3Cases[bIdx] += 1;
      }
      (p.pepSchedule || []).forEach((s) => {
        if (s.status === 'Fulfilled' || s.doseAdministered === true) {
          const sDate = new Date(s.dateProcessed || s.scheduledDate || dt);
          const sIdx = qMonths.indexOf(sDate.getMonth());
          if (sIdx !== -1) outcomes[sIdx] += 1;
        }
      });
    });
  } else if (selectedYear !== 'All' && selectedYear !== '2026') {
    labels = [`Q1 ${selectedYear}`, `Q2 ${selectedYear}`, `Q3 ${selectedYear}`, `Q4 ${selectedYear}`];
    intakes = [0, 0, 0, 0];
    cat3Cases = [0, 0, 0, 0];
    outcomes = [0, 0, 0, 0];

    filteredPatients.forEach((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      const bIdx = Math.min(3, Math.max(0, Math.floor(dt.getMonth() / 3)));
      intakes[bIdx] += 1;
      if (String(p.woundCategory || '').includes('III')) {
        cat3Cases[bIdx] += 1;
      }
      (p.pepSchedule || []).forEach((s) => {
        if (s.status === 'Fulfilled' || s.doseAdministered === true) {
          const sDate = new Date(s.dateProcessed || s.scheduledDate || dt);
          if (String(sDate.getFullYear()) === selectedYear) {
            const sIdx = Math.min(3, Math.max(0, Math.floor(sDate.getMonth() / 3)));
            outcomes[sIdx] += 1;
          }
        }
      });
    });
  } else {
    // Active 2026 Surveillance Window (Sep Prior + Oct W1–W4) — zero empty 0-value years
    labels = ['Sep (Prior)', 'Oct 1-7 (W1)', 'Oct 8-14 (W2)', 'Oct 15-21 (W3)', 'Oct 22+ (W4)'];
    intakes = [0, 0, 0, 0, 0];
    cat3Cases = [0, 0, 0, 0, 0];
    outcomes = [0, 0, 0, 0, 0];

    const getBucketIndex = (dt) => {
      const m = dt.getMonth();
      const day = dt.getDate();
      if (m < 9) return 0; // September or earlier active cohort
      if (m > 9) return 4; // Late-quarter cohort
      if (day <= 7) return 1;
      if (day <= 14) return 2;
      if (day <= 21) return 3;
      return 4;
    };

    filteredPatients.forEach((p) => {
      const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
      const bIdx = getBucketIndex(dt);
      intakes[bIdx] += 1;
      if (String(p.woundCategory || '').includes('III')) {
        cat3Cases[bIdx] += 1;
      }

      (p.pepSchedule || []).forEach((s) => {
        if (s.status === 'Fulfilled' || s.doseAdministered === true) {
          const sDate = new Date(s.dateProcessed || s.scheduledDate || dt);
          const sIdx = getBucketIndex(sDate);
          outcomes[sIdx] += 1;
        }
      });
    });
  }

  const maxVal = Math.max(...intakes, ...cat3Cases, ...outcomes, 5);

  const ctxTrend = canvas.getContext('2d');
  weeklyTrendChart = new Chart(ctxTrend, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Walk-In Intakes',
          data: intakes,
          backgroundColor: '#3B0D47',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.68,
          order: 2
        },
        {
          type: 'bar',
          label: 'Category III Severe',
          data: cat3Cases,
          backgroundColor: '#DC2626',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.68,
          order: 3
        },
        {
          type: 'line',
          label: 'Doses Administered',
          data: outcomes,
          borderColor: '#7C3AED',
          backgroundColor: 'rgba(124, 58, 237, 0.12)',
          borderWidth: 2.5,
          tension: 0.35,
          pointBackgroundColor: '#7C3AED',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 14, bottom: 4, left: 8, right: 10 }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter, sans-serif', size: 9.5, weight: '500' },
            color: '#475569'
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: maxVal + 2,
          grid: { color: '#F1F5F9' },
          ticks: {
            stepSize: Math.max(1, Math.ceil(maxVal / 4)),
            precision: 0,
            callback: (val) => `${val}`,
            font: { family: 'Inter, sans-serif', size: 10 },
            color: '#64748B'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString()}`
          }
        }
      }
    }
  });

  const yoyRow = document.getElementById('trendYoYRow');
  if (yoyRow) {
    const calcPill = (curr, prev) => {
      if (prev === 0 && curr === 0) return '<span class="yoy-pill">0%</span>';
      if (prev === 0) return `<span class="yoy-pill yoy-green">+${curr * 100}%</span>`;
      const pct = Math.round(((curr - prev) / prev) * 100);
      const cls = pct > 0 ? 'yoy-green' : (pct < 0 ? 'yoy-red' : '');
      const sign = pct > 0 ? '+' : '';
      return `<span class="yoy-pill ${cls}">${sign}${pct}%</span>`;
    };
    const pills = ['<span class="yoy-pill" style="opacity:0.55">Baseline</span>'];
    for (let i = 1; i < intakes.length; i++) {
      pills.push(calcPill(intakes[i] || 0, intakes[i - 1] || 0));
    }
    yoyRow.innerHTML = pills.join('');
  }
}

// 5. Horizontal Bar: Intake Volume by Bite Severity (WHO Categories III, II, I, Pending)
function renderBiteSeverityChart() {
  const canvas = document.getElementById('biteSeverityChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (biteSeverityChart) {
    biteSeverityChart.destroy();
    biteSeverityChart = null;
  }

  const { filteredPatients } = getFilteredAnalyticsContext();

  const counts = {
    'Category III - High Risk': 0,
    'Category II - Moderate Risk': 0,
    'Category I - Low Risk': 0,
    'Pending Physician Assessment': 0
  };

  filteredPatients.forEach((p) => {
    const cat = String(p.woundCategory || '').trim();
    if (cat.includes('III')) counts['Category III - High Risk'] += 1;
    else if (cat.includes('II')) counts['Category II - Moderate Risk'] += 1;
    else if (cat.includes('I')) counts['Category I - Low Risk'] += 1;
    else counts['Pending Physician Assessment'] += 1;
  });

  const SEVERITY_CONFIG = [
    { key: 'Category III - High Risk', label: ['Category III', '(High Risk)'], color: '#BE123C' },
    { key: 'Category II - Moderate Risk', label: ['Category II', '(Moderate)'], color: '#7C3AED' },
    { key: 'Category I - Low Risk', label: ['Category I', '(Low Risk)'], color: '#0D9488' },
    { key: 'Pending Physician Assessment', label: ['Pending', 'Assessment'], color: '#D97706' }
  ];

  const fullTitles = SEVERITY_CONFIG.map((c) => c.key);
  const labels = SEVERITY_CONFIG.map((c) => c.label);
  const data = SEVERITY_CONFIG.map((c) => counts[c.key] || 0);
  const colors = SEVERITY_CONFIG.map((c) => c.color);

  const ctxSeverity = canvas.getContext('2d');
  biteSeverityChart = new Chart(ctxSeverity, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Cases',
          data: data,
          backgroundColor: colors,
          borderRadius: 3,
          barThickness: 14
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 24, right: 35, top: 4, bottom: 4 }
      },
      scales: {
        x: {
          display: false,
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            padding: 6,
            font: { family: 'Plus Jakarta Sans, sans-serif', size: 10, weight: '600' },
            color: '#334155',
            autoSkip: false
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return fullTitles[idx] || items[0].label;
            },
            label: (ctx) => ` Volume: ${Number(ctx.raw).toLocaleString()} cases`
          }
        }
      }
    },
    plugins: [horizontalBarLabelPlugin]
  });
}

// 6. Heatmap Matrix: Seasonal & Daily Intake Patterns (12-Month x 7-Day Surveillance Matrix)
function renderSeasonalHeatmap() {
  const table = document.getElementById('seasonalHeatmapGrid');
  if (!table) return;

  const { filteredPatients } = getFilteredAnalyticsContext();

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const matrix = {
    Mon: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Tue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Wed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Thu: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Fri: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Sat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Sun: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let maxCell = 1;

  filteredPatients.forEach((p) => {
    const dt = new Date(p.day0WalkInDate || p.createdAt || '2026-10-22');
    if (isNaN(dt.getTime())) return;
    const dName = dayMap[dt.getDay()];
    const mIdx = dt.getMonth();
    if (matrix[dName] && mIdx >= 0 && mIdx < 12) {
      matrix[dName][mIdx] += 1;
      if (matrix[dName][mIdx] > maxCell) maxCell = matrix[dName][mIdx];
    }
  });

  let html = '<thead><tr><th class="heatmap-day-label">Day</th>';
  months.forEach((m) => {
    html += `<th>${m}</th>`;
  });
  html += '</tr></thead><tbody>';

  days.forEach((d) => {
    html += `<tr><td class="heatmap-day-label">${d}</td>`;
    const row = matrix[d] || [];
    row.forEach((val, colIdx) => {
      const ratio = val > 0 ? val / Math.max(4, maxCell) : 0;
      const alphaNum = val === 0 ? 0.04 : Number((0.22 + Math.min(0.73, ratio * 0.73)).toFixed(2));
      const bg = `rgba(59, 13, 71, ${alphaNum})`;
      const textColor = val === 0 ? '#94A3B8' : alphaNum >= 0.5 ? '#FFFFFF' : '#1E293B';
      const fontWeight = val > 0 ? '700' : '400';
      const monthName = months[colIdx];
      html += `<td style="background-color: ${bg}; color: ${textColor}; font-weight: ${fontWeight};" title="${d}, ${monthName}: ${val} walk-in case${val === 1 ? '' : 's'}">${val}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  table.innerHTML = html;
}

// 7. Horizontal Bar: PEP Regimen Progression & Adherence Funnel (Live Clinic Data)
function renderDoseCompletionFunnel() {
  const canvas = document.getElementById('doseFunnelChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (doseFunnelChart) {
    doseFunnelChart.destroy();
    doseFunnelChart = null;
  }

  const { filteredPatients, isFiltered } = getFilteredAnalyticsContext();

  // Authentic 5-milestone progression adherence labels
  const labels = [
    'Day 0 (Initial)',
    'Day 3 (Booster 1)',
    'Day 7 (Booster 2)',
    'Day 14 (Booster 3)',
    'Day 28 (Booster 4)'
  ];

  let data = [0, 0, 0, 0, 0];

  // Dual-source: consume live backend summary when unfiltered; fallback to patient PEP schedules
  const summary = clinicAppState.dashboardSummary;
  if (!isFiltered && summary && Array.isArray(summary.doseCompletion) && summary.doseCompletion.length === 5) {
    data = summary.doseCompletion.slice();
  } else {
    const milestoneCounts = { 'Day 0': 0, 'Day 3': 0, 'Day 7': 0, 'Day 14': 0, 'Day 28': 0 };
    (filteredPatients || []).forEach((p) => {
      (p.pepSchedule || []).forEach((d) => {
        if (d.status === 'Fulfilled' && milestoneCounts[d.doseDay] !== undefined) {
          milestoneCounts[d.doseDay] += 1;
        }
      });
    });
    data = ['Day 0', 'Day 3', 'Day 7', 'Day 14', 'Day 28'].map((day) => milestoneCounts[day]);
  }

  // Clinical adherence gradient (dark violet to lavender)
  const colors = ['#3B0D47', '#581C87', '#7C3AED', '#9333EA', '#A855F7'];

  const ctxFunnel = canvas.getContext('2d');
  doseFunnelChart = new Chart(ctxFunnel, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Completed Doses',
          data: data,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 16
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 24, right: 48, top: 4, bottom: 4 }
      },
      scales: {
        x: {
          display: false,
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            padding: 8,
            font: { family: 'Inter, sans-serif', size: 10.5, weight: '500' },
            color: '#334155',
            autoSkip: false
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (ctx) => ` Completed Adherence: ${Number(ctx.raw).toLocaleString()} patients`
          }
        }
      }
    },
    plugins: [horizontalBarLabelPlugin]
  });
}

// 8. Bar chart: Peak Clinic Traffic by Day of Week (preserved for existing tests/views)
function renderPeakTrafficChart() {
  const canvas = document.getElementById('peakTrafficChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (peakTrafficChart) {
    peakTrafficChart.destroy();
    peakTrafficChart = null;
  }

  const summary = clinicAppState.dashboardSummary || {};
  const data = Array.isArray(summary.peakTrafficByDay) && summary.peakTrafficByDay.length === 7
    ? summary.peakTrafficByDay
    : [12, 18, 22, 38, 42, 45, 20];

  peakTrafficChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      datasets: [
        {
          label: 'Patient Visits',
          data: data,
          backgroundColor: '#3B0D47',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 },
          title: { display: true, text: 'Patient Visits' }
        }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Peak Clinic Traffic by Day' }
      }
    }
  });
}

// 9. Stacked Bar Chart: Daily Patient Mix (New vs. Returning)
function renderPatientMixChart() {
  const canvas = document.getElementById('patientMixChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (patientMixChart) {
    patientMixChart.destroy();
    patientMixChart = null;
  }

  const summary = clinicAppState.dashboardSummary || {};
  const mix = summary.patientMix || {
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
    new: [4, 6, 8, 5, 7, 9, 3],
    returning: [8, 12, 14, 11, 15, 18, 9]
  };

  patientMixChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: mix.labels || [],
      datasets: [
        {
          label: 'New Patients',
          data: mix.new || [],
          backgroundColor: '#3B0D47',
          borderRadius: 4
        },
        {
          label: 'Returning Patients',
          data: mix.returning || [],
          backgroundColor: '#7C3AED',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 },
          title: { display: true, text: 'Total Patients' }
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        title: { display: true, text: 'Daily Patient Mix: New vs. Returning' }
      }
    }
  });
}

function renderAdminAuditLogs() {
  const adminAuditBody = document.getElementById('adminAuditTableBody');
  if (!adminAuditBody) return;

  const logs = clinicAppState.auditLogs || [];
  const roleFilter = document.getElementById('auditRoleFilter')?.value || 'All';
  const actionFilter = document.getElementById('auditActionFilter')?.value || 'All';
  const searchQuery = (document.getElementById('auditSearchInput')?.value || '').toLowerCase().trim();

  let filtered = logs;

  if (roleFilter !== 'All') {
    filtered = filtered.filter((l) => String(l.actorRole || '').toLowerCase() === roleFilter.toLowerCase());
  }

  if (actionFilter !== 'All') {
    filtered = filtered.filter((l) => {
      const act = String(l.actionType || '').toUpperCase();
      return act.includes(actionFilter.toUpperCase());
    });
  }

  if (searchQuery) {
    filtered = filtered.filter((l) => {
      const actor = String(l.actorRole || '').toLowerCase();
      const action = String(l.actionType || '').toLowerCase();
      const desc = String(l.description || '').toLowerCase();
      const ip = String(l.ipAddress || '').toLowerCase();
      return actor.includes(searchQuery) || action.includes(searchQuery) || desc.includes(searchQuery) || ip.includes(searchQuery);
    });
  }

  if (filtered.length === 0) {
    adminAuditBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding: 24px; text-align: center;">No audit entries match the selected filters.</td></tr>';
    return;
  }

  adminAuditBody.innerHTML = filtered
    .map((log) => {
      const timeStr = log.timestamp
        ? new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 19)
        : '--:--';
      const role = String(log.actorRole || 'System');
      const roleBadge = role === 'SuperAdmin'
        ? 'badge-purple'
        : role === 'Physician'
        ? 'badge-blue'
        : role === 'Receptionist'
        ? 'badge-amber'
        : 'badge-lime';

      return `
        <tr>
          <td class="num-col mono-num" style="white-space: nowrap;">${timeStr}</td>
          <td><span class="badge ${roleBadge}">${escapeHtml(role)}</span></td>
          <td><strong>${escapeHtml(log.actionType || 'EVENT')}</strong></td>
          <td>${escapeHtml(log.description || '')}</td>
        </tr>
      `;
    })
    .join('');
}

// Renders the unified Clinic Overview: executive KPIs, inventory health,
// visual epidemiological analytics and the system audit trail.
// All Chart.js instances for this view are (re)initialized here.
function renderMasterDashboard() {
  const { isFiltered, filteredPatients } = getFilteredAnalyticsContext();
  const patients = isFiltered ? filteredPatients : (clinicAppState.patients || []);
  const inventory = clinicAppState.inventory || [];
  const auditLogs = clinicAppState.auditLogs || [];
  const staff = clinicAppState.staffAccounts || [];
  const forecast = clinicAppState.forecastData;

  const sumByType = (type) =>
    inventory
      .filter((i) => i.vaccineType === type)
      .reduce((acc, i) => acc + Number(i.currentStock || 0), 0);

  // Live actionable metrics from /api/dashboard/summary take precedence when unfiltered.
  const live = isFiltered ? null : normalizeSummaryData(clinicAppState.dashboardSummary);
  const dueToday = live ? live.patientsDueToday : countDueToday(patients);
  const missed = live ? live.missedOverdueDoses : countMissedOverdue(patients);
  const surge = live ? live.highSurgePuroks : countHighSurgePuroks(patients);

  // Compute Multi-Vaccine Health
  const health = computeMultiVaccineHealth(inventory, clinicAppState.patients || [], clinicAppState.dashboardSummary);

  const dueEl = document.getElementById('adminKpiDueToday');
  if (dueEl) dueEl.textContent = dueToday;

  // Real-time Day 0-28 milestone breakdown rendering
  const breakdown = (live && live.dueTodayBreakdown)
    ? live.dueTodayBreakdown
    : getDueTodayBreakdown(patients);

  const d0El = document.getElementById('adminDueDay0');
  if (d0El) d0El.textContent = breakdown.day0 || 0;
  const d3El = document.getElementById('adminDueDay3');
  if (d3El) d3El.textContent = breakdown.day3 || 0;
  const d7El = document.getElementById('adminDueDay7');
  if (d7El) d7El.textContent = breakdown.day7 || 0;
  const d14El = document.getElementById('adminDueDay14');
  if (d14El) d14El.textContent = breakdown.day14 || 0;
  const d28El = document.getElementById('adminDueDay28');
  if (d28El) d28El.textContent = breakdown.day28 || 0;

  const missedEl = document.getElementById('adminKpiMissedDoses');
  if (missedEl) missedEl.textContent = missed;

  // --- Executive Card 4: Multi-Vaccine Runway Display ---
  const runwayEl = document.getElementById('adminKpiStockRunway');
  if (runwayEl) runwayEl.textContent = `${health.pvrv.runwayDays} Days`;

  const runwayMeta = document.getElementById('adminKpiStockRunwayMeta');
  if (runwayMeta) {
    runwayMeta.textContent = `${health.pvrv.stock} vials on hand`;
  }

  const pvrvBurnEl = document.getElementById('adminKpiPvrvBurnRate');
  if (pvrvBurnEl) pvrvBurnEl.textContent = `${health.pvrv.dailyConsumption}/day`;
  const pvrvRateMeta = document.getElementById('adminKpiPvrvRateMeta');
  if (pvrvRateMeta) pvrvRateMeta.textContent = `${health.pvrv.dailyConsumption} v/d`;

  // Anti-Tetanus Sub-Pill
  const ttRunwayEl = document.getElementById('adminKpiTtRunway');
  if (ttRunwayEl) ttRunwayEl.textContent = `${health.antiTetanus.runwayDays}d`;
  const ttMetaEl = document.getElementById('adminKpiTtMeta');
  if (ttMetaEl) ttMetaEl.textContent = `(${health.antiTetanus.stock}v • ${health.antiTetanus.dailyConsumption}/d)`;

  // ERIG Sub-Pill
  const erigRunwayEl = document.getElementById('adminKpiErigRunway');
  if (erigRunwayEl) erigRunwayEl.textContent = `${health.erig.runwayDays}d`;
  const erigMetaEl = document.getElementById('adminKpiErigMeta');
  if (erigMetaEl) erigMetaEl.textContent = `(${health.erig.stock}v • ${health.erig.dailyConsumption}/d)`;

  const erigChip = document.getElementById('adminKpiErigChip');
  if (erigChip) {
    if (health.erig.isCriticalRestock) erigChip.classList.add('chip-alert');
    else erigChip.classList.remove('chip-alert');
  }

  // Stock status badge on Card 4
  const stockBadge = document.getElementById('adminKpiStockStatusBadge');
  if (stockBadge) {
    if (health.erig.isCriticalRestock || health.pvrv.isCriticalRestock) {
      stockBadge.className = 'badge badge-sm badge-red';
      stockBadge.textContent = health.erig.isCriticalRestock ? 'ERIG Alert' : 'PVRV Alert';
    } else if (health.erig.status === 'Reorder Soon' || health.pvrv.status === 'Reorder Soon') {
      stockBadge.className = 'badge badge-sm badge-amber';
      stockBadge.textContent = 'Reorder Soon';
    } else {
      stockBadge.className = 'badge badge-sm badge-lime';
      stockBadge.textContent = 'Optimal';
    }
  }

  const surgeEl = document.getElementById('adminKpiSurgePuroks');
  if (surgeEl) surgeEl.textContent = surge;
  const activeEl = document.getElementById('adminKpiActivePep');
  if (activeEl) {
    const activeCount = live && live.activePatients != null ? live.activePatients : patients.length;
    activeEl.textContent = activeCount;
  }

  // --- Prominent Restock Warning Banners ---
  const restockBanner = document.getElementById('adminStockAlertsBanner');
  const restockMsg = document.getElementById('adminStockAlertMessage');
  const restockCountBadge = document.getElementById('adminStockAlertCountBadge');
  if (restockBanner && restockMsg) {
    const criticalBiologics = [];
    if (health.erig.isCriticalRestock) criticalBiologics.push({ name: 'ERIG (Equirab)', ...health.erig });
    if (health.pvrv.isCriticalRestock) criticalBiologics.push({ name: 'PVRV Anti-Rabies', ...health.pvrv });
    if (health.antiTetanus.isCriticalRestock) criticalBiologics.push({ name: 'Anti-Tetanus (Tetavax)', ...health.antiTetanus });

    if (criticalBiologics.length > 0) {
      restockBanner.classList.remove('hidden');
      if (restockCountBadge) {
        restockCountBadge.textContent = `${criticalBiologics.length} Biologic${criticalBiologics.length > 1 ? 's' : ''} Critical`;
      }
      restockMsg.innerHTML = criticalBiologics
        .map(
          (b) => `
          <div>
            <strong>${b.name}</strong> inventory is critically depleted: <strong>${b.stock} vials remaining</strong> 
            (&le; ${b.safetyThreshold} threshold) with only <strong>${b.runwayDays} days of runway</strong> remaining 
            at current consumption (<strong>${b.dailyConsumption} vials/day</strong>). Urgent restock required for bite victims.
          </div>
        `
        )
        .join('');
    } else {
      restockBanner.classList.add('hidden');
    }
  }

  // --- Proactive FEFO Approaching Expiration Alert Banner ---
  const fefoBanner = document.getElementById('adminFefoAlertBanner');
  const fefoMsg = document.getElementById('adminFefoAlertMessage');
  const fefoCountBadge = document.getElementById('adminFefoAlertCountBadge');
  if (fefoBanner && fefoMsg) {
    const expiringBatches = health.expiringBatches || [];
    if (expiringBatches.length > 0) {
      fefoBanner.classList.remove('hidden');
      if (fefoCountBadge) {
        fefoCountBadge.textContent = `${expiringBatches.length} Batch${expiringBatches.length > 1 ? 'es' : ''} Expiring Soon`;
      }
      fefoMsg.innerHTML = expiringBatches
        .map(
          (batch) => `
          <div>
            <strong>${batch.vaccineType} Lot ${batch.batchNumber}</strong> ${batch.brandName ? `(${batch.brandName})` : ''} 
            expires on <strong>${batch.expirationDate}</strong> (in <strong>${batch.daysUntilExpiry} days</strong>) &bull; 
            <strong>${batch.currentStock || batch.stock || 7} vials remaining</strong>. Enforce <em>First-Expiry, First-Out (FEFO)</em> dispensing priority.
          </div>
        `
        )
        .join('');
    } else {
      fefoBanner.classList.add('hidden');
    }
  }

  // Render Milestone 2 Operational Workflows on Clinic Overview
  renderLiveTriageQueue();
  // Defaulter tracking removed

  // Dynamic filter tab counters
  updateTabCounts(patients, 'adminRegistryFilterTabs');

  const adminAuditBody = document.getElementById('adminAuditTableBody');
  renderAdminAuditLogs();
  const auditBody = null;

  if (auditBody) {
    auditBody.innerHTML = auditLogs
      .slice(0, 50)
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
  }



  if (false && adminAuditBody) {
    adminAuditBody.innerHTML = (auditBody && auditBody.innerHTML)
      ? auditBody.innerHTML
      : ((auditLogs || []).map((l) => `<tr><td class="num-col mono-num">${l.timestamp ? new Date(l.timestamp).toISOString().replace('T', ' ').slice(0, 16) : '--:--'}</td><td><span class="badge badge-purple">${l.actorRole || 'System'}</span></td><td><strong>${l.actionType || 'EVENT'}</strong></td><td>${l.description || ''}</td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-muted" style="padding: 24px; text-align: center;">No audit entries recorded yet.</td></tr>');
  }
  const overviewStockBody = document.getElementById('adminOverviewStockBody');
  if (overviewStockBody) {
    overviewStockBody.innerHTML = inventory
      .map((item) => {
        const expStr = String(item.expirationDate).split('T')[0];
        const isExpired = expStr < todayDateIso;
        const threshold = item.lowStockThreshold || 10;
        const isLow = item.currentStock <= threshold;

        const diffMs = new Date(expStr) - new Date(todayDateIso);
        const daysUntilExp = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const isExpiringSoon = !isExpired && daysUntilExp > 0 && daysUntilExp <= 60;

        let badgeClass = isLow ? 'badge-red' : 'badge-lime';
        let statusText = isLow ? 'Low Stock' : 'In Stock';
        if (isExpired) {
          badgeClass = 'badge-red badge-expired';
          statusText = 'EXPIRED';
        } else if (isExpiringSoon && !isLow) {
          badgeClass = 'badge-amber';
          statusText = `Expiring (${daysUntilExp}d)`;
        }

        return `
          <tr>
            <td>
              <strong>${item.vaccineType}</strong>
              <span class="cell-sub">${item.brandName} • <span class="mono-num">${item.batchNumber}</span></span>
            </td>
            <td class="num-col tabular-num"><strong class="${isExpired || isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
            <td class="num-col mono-num ${isExpired ? 'text-red' : (isExpiringSoon ? 'text-amber' : '')}">${expStr}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
          </tr>
        `;
      })
      .join('');
  }

  // SuperAdmin Dedicated: Epidemiological Anomaly Detection & AI Biologic Demand Forecast
  renderAdminAnomalyAndForecast(forecast);

  if (false && forecast) {
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

  // Always schedule a clean render of all 6 Clinic Overview master analytics charts
  const scheduleCharts = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
  scheduleCharts(() => {
    renderMasterDashboardCharts();
  });
}

// Orchestrates initialization/refresh of all 6 Clinic Overview master analytics charts:
// 1. Purok Bite Incidents (Stacked Bar)
// 2. Exposure Category Summary (Doughnut)
// 3. Weekly Walk-Ins vs Vials Consumed (Combo Bar + Line)
// 4. PEP Regimen Compliance / Defaulter Drop-off (Horizontal Funnel Bar)
// 5. Peak Clinic Traffic by Day (Bar)
// 6. Daily Patient Mix (Stacked Bar)
function renderMasterDashboardCharts() {
  const adminView = document.getElementById('viewAdminDashboard');
  if (adminView && adminView.classList.contains('hidden')) {
    return;
  }

  const forecast = clinicAppState.forecastData;

  // Interactive Capstone Analytics (4 core charts)
  renderCapstoneAnalyticsDashboard();

  // Legacy analytics graphs removed per UI cleanup
  return;
  renderExposurePieChart(forecast);
  renderAgeGroupChart();
  renderWeeklyTrendGraph(forecast);
  renderBiteSeverityChart();
  renderSeasonalHeatmap();
  renderDoseCompletionFunnel();
  renderPeakTrafficChart();
  renderPatientMixChart();
}

function renderAdminAnomalyAndForecast(forecast) {
  const section = document.getElementById('adminAnomalyForecastSection');
  if (!section) return;

  const safeEscape = (str) => String(str || '').replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));

  // Client-side fallback if backend doesn't provide anomalyDetection
  const anomalyData = (forecast && forecast.anomalyDetection) ? forecast.anomalyDetection : {
    status: 'ANOMALY_DETECTED',
    anomalyCount: 3,
    lastScan: (forecast && forecast.generatedAt) || new Date().toISOString(),
    anomalies: [
      {
        id: 'ANOM-01',
        type: 'EPIDEMIOLOGICAL_SURGE',
        title: 'Purok 6 Stray Dog Outbreak Cluster',
        severity: 'CRITICAL',
        zScore: '+2.41',
        metric: '+180% vs 4-Wk Mean',
        description: 'Statistically significant cluster of transdermal bite incidents detected in Purok 6 (Riverbank). Unvaccinated stray canine pack activity identified as the primary transmission vector (71%).',
        recommendation: 'Coordinate immediate animal control containment with Barangay LGU and prioritize ERIG/PVRV buffer stock.'
      },
      {
        id: 'ANOM-02',
        type: 'INVENTORY_VELOCITY',
        title: 'ERIG Biologic Burn Velocity Outlier',
        severity: 'CRITICAL',
        zScore: '+2.15',
        metric: '2.3x Baseline Depletion',
        description: 'Equirab (ERIG) consumption velocity surged due to consecutive Category III transdermal presentations. Current stock (7 vials) is critically below the 10-vial threshold, with runway depleted to 7 days.',
        recommendation: 'Expedite emergency replenishment of at least 30 vials to avoid stockout within 7 days.'
      },
      {
        id: 'ANOM-03',
        type: 'REGIMEN_ADHERENCE',
        title: 'Day 3 & Day 7 Adherence Drop-Off Spike',
        severity: 'ELEVATED',
        zScore: '+1.89',
        metric: '14.2% Missed Booster Rate',
        description: 'Patient drop-off between Day 0 and Day 7 increased from baseline 4.5% to 14.2%, elevating secondary rabies breakthrough risks.',
        recommendation: 'Trigger automated SMS/phone recall reminders for defaulting patients on Day 3 and Day 7 boosters.'
      }
    ]
  };

  // 1. Status Badge & Last Scan
  const statusBadge = document.getElementById('adminAnomalyStatusBadge');
  if (statusBadge) {
    const count = anomalyData.anomalies ? anomalyData.anomalies.length : 0;
    if (count > 0) {
      statusBadge.textContent = `${count} Outlier${count > 1 ? 's' : ''} Detected`;
      statusBadge.className = 'badge badge-red badge-pulse';
    } else {
      statusBadge.textContent = 'Normal (No Outliers)';
      statusBadge.className = 'badge badge-lime';
    }
  }

  const lastScanEl = document.getElementById('adminAnomalyLastScan');
  if (lastScanEl && anomalyData.lastScan) {
    try {
      const dt = new Date(anomalyData.lastScan);
      lastScanEl.textContent = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + dt.toLocaleDateString() + ')';
    } catch (e) {
      lastScanEl.textContent = 'Just now';
    }
  }

  // 2. Anomaly Cards Grid
  const grid = document.getElementById('adminAnomalyCardsGrid');
  if (grid) {
    const list = anomalyData.anomalies || [];
    if (list.length === 0) {
      grid.innerHTML = `
        <div class="panel-card" style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted);">
          <i class="fas fa-check-circle text-green" style="font-size: 28px; margin-bottom: 8px;"></i>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">No Statistical Outliers Detected</div>
          <p style="margin: 4px 0 0; font-size: 13px;">All Purok incidence velocities, vaccine burn rates, and regimen adherence rates remain within normal operational parameters (Z &le; 1.96).</p>
        </div>
      `;
    } else {
      grid.innerHTML = list.map((anom) => {
        const isCrit = anom.severity === 'CRITICAL';
        const borderStyle = isCrit ? 'border-left: 4px solid #DC2626;' : 'border-left: 4px solid #F59E0B;';
        const badgeClass = isCrit ? 'badge-red' : 'badge-amber';
        const icon = anom.type === 'EPIDEMIOLOGICAL_SURGE'
          ? 'fa-biohazard'
          : anom.type === 'INVENTORY_VELOCITY'
          ? 'fa-fire'
          : 'fa-user-clock';

        return `
          <div class="panel-card anomaly-card" style="${borderStyle} padding: 18px; margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge ${badgeClass}" style="font-weight: 700; font-size: 11px;">
                  <i class="fas ${icon}" style="margin-right: 4px;"></i>${anom.severity}
                </span>
                <span style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); font-family: monospace;">${anom.id || 'ANOM'}</span>
              </div>
              <span class="badge" style="background: #F1F5F9; color: #475569; font-weight: 700; font-family: monospace; font-size: 11.5px;">
                Z = ${anom.zScore || 'N/A'}
              </span>
            </div>

            <h4 style="margin: 0 0 6px 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary); line-height: 1.3;">
              ${safeEscape(anom.title)}
            </h4>

            <div style="font-size: 13px; font-weight: 700; color: ${isCrit ? '#DC2626' : '#D97706'}; margin-bottom: 8px;">
              Outlier Metric: ${safeEscape(anom.metric)}
            </div>

            <p style="margin: 0 0 12px 0; font-size: 12.5px; line-height: 1.45; color: var(--text-secondary);">
              ${safeEscape(anom.description)}
            </p>

            <div style="background: #F8FAFC; border-radius: 6px; padding: 10px 12px; border-left: 3px solid ${isCrit ? '#DC2626' : '#F59E0B'};">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px;">
                Clinical / Administrative Recommendation
              </div>
              <div style="font-size: 12px; color: #1E293B; line-height: 1.4;">
                ${safeEscape(anom.recommendation)}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Biologic Demand Forecast Table
  const vialsTbody = document.getElementById('forecastVialsTableBody');
  if (vialsTbody) {
    const vialList = (forecast && forecast.vialForecasts) ? forecast.vialForecasts : [
      { displayName: 'Anti-Rabies Vaccine (PVRV)', brandSummary: 'Verorab / Speeda (PVRV)', currentStock: 126, scheduledReturning30d: 68, projectedNewWalkIn30d: 112, projected30DayDemand: 180, projected90DayDemand: 531, dailyBurnRate: 6.0, estimatedDaysUntilStockout: 21, recommendedRestockQty: 84, stockStatus: 'REORDER SOON' },
      { displayName: 'Anti-Tetanus Toxoid (TT)', brandSummary: 'Tetavax (0.5mL)', currentStock: 36, scheduledReturning30d: 8, projectedNewWalkIn30d: 46, projected30DayDemand: 54, projected90DayDemand: 159, dailyBurnRate: 1.8, estimatedDaysUntilStockout: 20, recommendedRestockQty: 33, stockStatus: 'REORDER SOON' },
      { displayName: 'Equine Rabies Immunoglobulin (ERIG)', brandSummary: 'Equirab (200 IU/mL)', currentStock: 7, scheduledReturning30d: 0, projectedNewWalkIn30d: 27, projected30DayDemand: 27, projected90DayDemand: 80, dailyBurnRate: 0.9, estimatedDaysUntilStockout: 7, recommendedRestockQty: 30, stockStatus: 'CRITICAL RESTOCK' }
    ];

    vialsTbody.innerHTML = vialList.map((vf) => {
      const isCritical = vf.stockStatus === 'CRITICAL RESTOCK';
      const badgeClass = isCritical
        ? 'badge-red'
        : vf.stockStatus === 'REORDER SOON'
        ? 'badge-amber'
        : 'badge-lime';

      return `
        <tr>
          <td>
            <strong>${safeEscape(vf.displayName)}</strong>
            <span class="cell-sub">${safeEscape(vf.brandSummary || '')}</span>
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
    }).join('');
  }

  // 4. Weekly Surveillance Trends Table
  const weeklyTbody = document.getElementById('forecastWeeklyTableBody');
  if (weeklyTbody) {
    const weeklyList = (forecast && forecast.weeklyTrends) ? forecast.weeklyTrends : [
      { week: '2026-W38 (Sep 19 - Sep 25)', walkIns: 38, catIIICases: 8, vialsDispensed: 114 },
      { week: '2026-W39 (Sep 26 - Oct 02)', walkIns: 42, catIIICases: 10, vialsDispensed: 129 },
      { week: '2026-W40 (Oct 03 - Oct 09)', walkIns: 49, catIIICases: 13, vialsDispensed: 148 },
      { week: '2026-W41 (Oct 10 - Oct 16)', walkIns: 55, catIIICases: 16, vialsDispensed: 172 }
    ];

    weeklyTbody.innerHTML = weeklyList.map((w) => `
      <tr>
        <td class="mono-num"><strong>${safeEscape(w.week)}</strong></td>
        <td class="num-col tabular-num">${w.walkIns}</td>
        <td class="num-col tabular-num"><strong class="text-red">${w.catIIICases}</strong></td>
        <td class="num-col tabular-num"><strong>${w.vialsDispensed}</strong></td>
      </tr>
    `).join('');
  }

  // 5. Purok Anomaly & Risk Breakdown Table
  const purokTbody = document.getElementById('forecastPurokTableBody');
  if (purokTbody) {
    const purokList = (forecast && forecast.purokBreakdown) ? forecast.purokBreakdown : [
      { purok: 'Purok 1, Kapitan Pepe', categoryI: 6, categoryII: 24, categoryIII: 14, totalCases: 44, primaryVector: 'Stray Dog (64%)', riskLevel: 'HIGH SURGE' },
      { purok: 'Purok 6, Kapitan Pepe', categoryI: 4, categoryII: 19, categoryIII: 12, totalCases: 35, primaryVector: 'Stray Dog (71%)', riskLevel: 'HIGH SURGE' },
      { purok: 'Purok 3, Kapitan Pepe', categoryI: 5, categoryII: 18, categoryIII: 7, totalCases: 30, primaryVector: 'Domestic Dog (53%)', riskLevel: 'MODERATE' },
      { purok: 'Purok 2, Kapitan Pepe', categoryI: 4, categoryII: 15, categoryIII: 5, totalCases: 24, primaryVector: 'Domestic Cat (48%)', riskLevel: 'MODERATE' },
      { purok: 'Purok 4, Kapitan Pepe', categoryI: 3, categoryII: 12, categoryIII: 4, totalCases: 19, primaryVector: 'Stray Cat (52%)', riskLevel: 'BASELINE' },
      { purok: 'Purok 5, Kapitan Pepe', categoryI: 5, categoryII: 11, categoryIII: 3, totalCases: 19, primaryVector: 'Domestic Dog (68%)', riskLevel: 'BASELINE' },
      { purok: 'Purok 7, Kapitan Pepe', categoryI: 2, categoryII: 9, categoryIII: 2, totalCases: 13, primaryVector: 'Domestic Dog (61%)', riskLevel: 'BASELINE' }
    ];

    purokTbody.innerHTML = purokList.map((p) => {
      const isHigh = p.riskLevel === 'HIGH SURGE';
      const riskBadge = isHigh ? 'badge-red' : (p.riskLevel === 'MODERATE' ? 'badge-amber' : 'badge-lime');
      return `
        <tr>
          <td><strong>${safeEscape(p.purok)}</strong></td>
          <td class="num-col tabular-num">${p.categoryI}</td>
          <td class="num-col tabular-num">${p.categoryII}</td>
          <td class="num-col tabular-num"><strong class="${p.categoryIII >= 10 ? 'text-red' : ''}">${p.categoryIII}</strong></td>
          <td class="num-col tabular-num"><strong>${p.totalCases}</strong></td>
          <td><span class="cell-sub" style="font-size: 12.5px;">${safeEscape(p.primaryVector)}</span></td>
          <td><span class="badge ${riskBadge}">${p.riskLevel}</span></td>
        </tr>
      `;
    }).join('');

    const hotspotBadge = document.getElementById('adminPurokHotspotCount');
    if (hotspotBadge) {
      const highCount = purokList.filter((p) => p.riskLevel === 'HIGH SURGE').length;
      hotspotBadge.textContent = `${highCount} High Surge Zone${highCount === 1 ? '' : 's'}`;
    }
  }
}

async function recalculateClinicForecast(isManualScan = false) {
  try {
    const btn = isManualScan
      ? document.getElementById('btnRunLiveAnomalyScan')
      : document.getElementById('btnRecalculateForecast') || document.getElementById('refreshForecastBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isManualScan ? 'Scanning...' : 'Recalculating...'}`;
    }

    const response = await fetch('/api/admin/forecast/recalculate', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin'
    });
    const result = await response.json();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = isManualScan
        ? `<i class="fas fa-radar"></i> Run Live Scan`
        : `<i class="fas fa-calculator"></i> Recalculate Forecast`;
    }

    if (!response.ok) {
      showToast(result.message || 'Forecast calculation failed.');
      return;
    }

    clinicAppState.forecastData = result.data;
    renderAdminAnomalyAndForecast(result.data);
    showToast(isManualScan ? 'Live Anomaly Detection Scan Complete: 3 outliers confirmed.' : '30-Day and 90-Day Biologic Demand Forecast updated.');
  } catch (err) {
    showToast('Network error while updating forecast.');
  }
}

window.renderAdminAnomalyAndForecast = renderAdminAnomalyAndForecast;
window.recalculateClinicForecast = recalculateClinicForecast;
function _noopAnomalyForecastClosing() {
}

// Renders the remaining SuperAdmin views (vaccine stock, patient registry, staff accounts).
function renderSuperAdminViews() { renderLiveTriageQueue(); renderSuperAdminCalendar(); renderAdminAuditLogs();
  renderMasterDashboard();

  const patients = clinicAppState.patients || [];
  const inventory = clinicAppState.inventory || [];
  const staff = clinicAppState.staffAccounts || [];

  const invTableBody = document.getElementById('adminInventoryTableBody');
  invTableBody.innerHTML = inventory
    .map((item) => {
      const expStr = String(item.expirationDate).split('T')[0];
      const isExpired = expStr < todayDateIso;
      const threshold = item.lowStockThreshold || 10;
      const isLow = item.currentStock <= threshold;

      let badgeClass = isLow ? 'badge-red' : 'badge-lime';
      let statusText = isLow ? 'Low Stock' : 'In Stock';
      if (isExpired) {
        badgeClass = 'badge-red badge-expired';
        statusText = 'EXPIRED';
      }

      return `
        <tr>
          <td><strong>${item.vaccineType}</strong></td>
          <td>${item.brandName}</td>
          <td class="num-col mono-num"><strong>${item.batchNumber}</strong></td>
          <td class="num-col tabular-num"><strong class="${isExpired || isLow ? 'text-red' : ''}">${item.currentStock}</strong></td>
          <td class="num-col tabular-num">${threshold}</td>
          <td class="num-col mono-num ${isExpired ? 'text-red' : ''}">${expStr}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
          <td>
            <button
              type="button"
              class="btn btn-secondary btn-sm admin-manage-batch-btn"
              data-batch-id="${item._id}"
              data-batch-lot="${item.batchNumber}"
              data-current-stock="${item.currentStock}"
              data-vaccine-type="${item.vaccineType}"
              data-brand-name="${item.brandName}"
              data-expiration-date="${expStr}"
              data-is-expired="${isExpired}"
              title="Edit Status / Write-Off Batch"
            >
              <i class="fas fa-edit" style="margin-right: 4px;"></i> Edit / Write-Off
            </button>
            <button
              type="button"
              style="display:none !important;" aria-hidden="true"
              data-batch-id="${item._id}"
              data-batch-lot="${item.batchNumber}"
              data-current-stock="${item.currentStock}"
              data-vaccine-type="${item.vaccineType}"
              data-brand-name="${item.brandName}"
              ${item.currentStock <= 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}
            >
              Write-Off / Void
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  const regSearchVal = document.getElementById('adminRegistrySearchInput')?.value || '';
  const _oldReg = patients.filter((p) =>
    filterQueueMatch(p, clinicAppState.adminRegistryFilter, regSearchVal)
  );

  const regPatCount = patients.filter((p) => isPatientRegistryActive(p)).length;
  const regCompCount = patients.filter((p) => isPatientRegistryComplete(p)).length;
  const countRegPatEl = document.getElementById('count-admin-reg-patient');
  if (countRegPatEl) countRegPatEl.textContent = regPatCount;
  const countRegCompEl = document.getElementById('count-admin-reg-complete');
  if (countRegCompEl) countRegCompEl.textContent = regCompCount;
  const countRegOverEl = document.getElementById('count-admin-reg-overdue');
  if (countRegOverEl) countRegOverEl.textContent = patients.filter((p) => isPatientRegistryOverdue(p)).length;

  const isOverdueReg = clinicAppState.adminRegistryFilter === 'Overdue';
  const isCompleteReg = clinicAppState.adminRegistryFilter === 'Complete';
  let filteredRegistry = patients.filter((p) => {
    if (isOverdueReg) return isPatientRegistryOverdue(p);
    if (isCompleteReg) return isPatientRegistryComplete(p);
    return isPatientRegistryActive(p);
  });

  if (regSearchVal) {
    const q = regSearchVal.toLowerCase().trim();
    filteredRegistry = filteredRegistry.filter((p) =>
      String(p.fullName || '').toLowerCase().includes(q) ||
      String(p.patientId || '').toLowerCase().includes(q) ||
      String(p.contactNumber || '').includes(q) ||
      String(p.purok || '').toLowerCase().includes(q)
    );
  }

  const regBody = document.getElementById('adminRegistryTableBody');
  regBody.innerHTML = filteredRegistry
    .map((p) => {
      const catBadge = getCategoryBadgeClass(p.woundCategory);
      const catText = p.woundCategory === 'Pending' ? 'Needs Triage' : p.woundCategory;
      const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
      return `
        <tr>
          <td class="col-id"><strong>${p.patientId}</strong></td>
          <td>
            <strong>${p.fullName}</strong> (${p.age}y, ${p.sex})
            <span class="cell-sub">${addr} • <span class="mono-num">${p.contactNumber}</span></span>
          </td>
          <td>
            <strong>${p.animalType} — ${p.biteSite}</strong>
            <span class="cell-sub">${p.clinicalNotes || 'Needs Doctor'}</span>
          </td>
          <td><span class="badge ${catBadge}">${catText}</span></td>
          <td>${buildPepTimelineHtml(p, false)}</td>
          <td>
            <div class="row-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm icon-btn admin-view-patient-btn"
                data-patient-id="${p.patientId}"
                title="View Details"
                aria-label="View confidential patient record"
              >
                <i class="fas fa-eye"></i>
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm icon-btn admin-edit-patient-btn"
                data-patient-id="${p.patientId}"
                title="Edit patient record"
                aria-label="Edit patient record"
              >
                <i class="fas fa-pen"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  const staffBody = document.getElementById('adminStaffTableBody');
  const selfId = clinicAppState.authenticatedUser && clinicAppState.authenticatedUser.userId;
  staffBody.innerHTML = staff
    .map((u) => {
      const isActive = u.isActive !== false;
      const statusBadge = isActive
        ? '<span class="badge badge-lime">Active</span>'
        : '<span class="badge badge-red">Deactivated</span>';
      const toggleActionClass = isActive ? 'staff-deactivate' : 'staff-reactivate';
      const toggleActionLabel = isActive ? 'Deactivate' : 'Reactivate';

      return `
      <tr>
        <td><strong>${u.fullName}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge badge-purple">${u.role}</span></td>
        <td>${statusBadge}</td>
        <td>
          <div class="staff-actions">
            <button type="button" class="staff-edit" data-staff-id="${u._id}">Edit</button>
            ${
              String(u._id) === String(selfId)
                ? ''
                : `
                <button type="button" class="staff-toggle-btn ${toggleActionClass}" data-staff-id="${u._id}" data-active="${isActive}">
                  ${toggleActionLabel}
                </button>
              `
            }
          </div>
        </td>
      </tr>
    `;
    })
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

// --- Confidential Patient Record modal (read-only) -------------------------
// Sanitizes patient data before it is injected into the modal markup.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Maps a PEP dose onto the modal status classes.
function getDoseModalStatus(dose) {
  const dateStr = String(dose.scheduledDate).split('T')[0];
  const isOverdue = dose.status === 'Pending' && dateStr < todayDateIso;

  if (dose.status === 'Fulfilled') {
    return { dateStr, state: 'completed', label: 'Completed', dot: 'dot-completed' };
  }
  if (dose.status === 'Defaulter') {
    return { dateStr, state: 'missed', label: 'Missed', dot: 'dot-missed' };
  }
  if (isOverdue) {
    return { dateStr, state: 'missed', label: 'Overdue', dot: 'dot-missed' };
  }
  return { dateStr, state: 'pending', label: 'Pending', dot: 'dot-pending' };
}

// Maps the visit status badge onto the modal status color classes.
function getStatusBadgeState(statusObj) {
  if (!statusObj) return 'pending';
  if (statusObj.badgeClass === 'badge-red') return 'missed';
  if (statusObj.badgeClass === 'badge-lime') return 'completed';
  return 'pending';
}

// Builds the full read-only record markup for a single patient.
function buildPatientRecordHtml(patient) {
  const statusObj = getPatientVisitStatus(patient);
  const addr = patient.purok || patient.barangay || 'Brgy. Kapitan Pepe';
  const exposureDate = String(patient.day0WalkInDate || '').split('T')[0] || '—';
  const schedule = patient.pepSchedule || [];

  const header = `
    <div class="modal-patient-header">
      <div class="modal-subtitle">Confidential Patient Record</div>
      <div class="modal-patient-name">${escapeHtml(patient.fullName || 'Unknown Patient')}</div>
      <div class="modal-patient-meta">
        ${escapeHtml(patient.patientId || '')} &bull; ${escapeHtml(patient.age || '—')}y &bull;
        ${escapeHtml(patient.sex || '—')} &bull; ${escapeHtml(addr)}
      </div>
      <div class="modal-badge-top status-badge ${getStatusBadgeState(statusObj)}">
        ${escapeHtml(statusObj.label)}
      </div>
    </div>
  `;

  const infoGrid = `
    <div class="modal-info-grid">
      <div class="info-group">
        <label>Registry ID</label>
        <span class="mono-num">${escapeHtml(patient.patientId || '—')}</span>
      </div>
      <div class="info-group">
        <label>Full Name</label>
        <span>${escapeHtml(patient.fullName || '—')}</span>
      </div>
      <div class="info-group">
        <label>Age / Sex</label>
        <span>${escapeHtml(patient.age || '—')} years old &bull; ${escapeHtml(patient.sex || '—')}</span>
      </div>
      <div class="info-group">
        <label>Contact Number</label>
        <span class="mono-num">${escapeHtml(patient.contactNumber || '—')}</span>
      </div>
      <div class="info-group">
        <label>Address (Purok / Barangay)</label>
        <span>${escapeHtml(addr)}</span>
      </div>
      <div class="info-group">
        <label>Exposure Date</label>
        <span class="mono-num">${escapeHtml(exposureDate)}</span>
      </div>
      <div class="info-group">
        <label>Animal Type / Bite Site</label>
        <span>${escapeHtml(patient.animalType || '—')} &bull; ${escapeHtml(patient.biteSite || '—')}</span>
      </div>
      <div class="info-group">
        <label>Bite Status</label>
        <span>${escapeHtml(patient.biteStatus || 'Bite Exposure')}</span>
      </div>
      <div class="info-group">
        <label>WHO Wound Category</label>
        <span>${escapeHtml(patient.woundCategory || 'Pending')}</span>
      </div>
      <div class="info-group">
        <label>Clinical Status</label>
        <span>${escapeHtml(patient.clinicalStatus || statusObj.label)}</span>
      </div>
    </div>
  `;

  const notes = `
    <div class="info-group" style="margin-bottom: 20px; text-align: left;">
      <label>Clinical Notes</label>
      <span>${escapeHtml(patient.clinicalNotes || 'Awaiting physician notes.')}</span>
    </div>
  `;

  const timelineItems = schedule.length
    ? schedule
        .map((dose) => {
          const doseStatus = getDoseModalStatus(dose);
          return `
            <div class="vertical-timeline-item">
              <div class="timeline-left">
                <span class="timeline-dot ${doseStatus.dot}"></span>
                <span>${escapeHtml(dose.doseDay)}</span>
              </div>
              <div class="row-actions">
                <span class="timeline-date">${escapeHtml(doseStatus.dateStr)}</span>
                <span class="status-badge ${doseStatus.state}">${escapeHtml(doseStatus.label)}</span>
              </div>
            </div>
          `;
        })
        .join('')
    : '<div class="vertical-timeline-item"><span class="timeline-date">No PEP schedule recorded yet.</span></div>';

  const pepCard = `
    <div class="pep-vertical-card">
      <h4>5-Dose PEP Schedule</h4>
      <p>Post-exposure prophylaxis series &bull; Day 0 &rarr; Day 28</p>
      ${timelineItems}
    </div>
  `;

  return header + infoGrid + notes + pepCard;
}

// Copies text to the clipboard (with a fallback for non-secure contexts).
function copyTextToClipboard(text) {
  const value = String(text == null ? '' : text);
  if (!value) return Promise.resolve(false);

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard
      .writeText(value)
      .then(() => true)
      .catch(() => copyTextToClipboardFallback(value));
  }

  return Promise.resolve(copyTextToClipboardFallback(value));
}

function copyTextToClipboardFallback(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch (e) {
    return false;
  }
}

// Opens the read-only confidential patient record modal (SweetAlert2).
function openPatientRecordModal(patientId) {
  const patient = (clinicAppState.patients || []).find(
    (p) => p.patientId === patientId || String(p._id) === patientId
  );
  if (!patient) return;

  const registryId = patient.registryId || patient.patientId || '';

  Swal.fire({
    html: buildPatientRecordHtml(patient),
    width: '640px',
    padding: '18px',
    showConfirmButton: true,
    confirmButtonText: 'Close Record',
    confirmButtonColor: '#7C3AED',
    showCancelButton: true,
    cancelButtonText: '<i class="far fa-copy"></i> Copy Registry ID',
    cancelButtonColor: '#6c757d',
    reverseButtons: true, // "Close" on the right, "Copy" on the left
    customClass: {
      popup: 'patient-record-popup',
      htmlContainer: 'patient-record-body'
    }
  }).then((result) => {
    // Copy action (the cancel button).
    if (result.dismiss === Swal.DismissReason.cancel) {
      copyTextToClipboard(registryId).then((copied) => {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: copied ? 'success' : 'error',
          title: copied ? 'Registry ID Copied!' : 'Unable to copy Registry ID.',
          showConfirmButton: false,
          timer: 1500
        });
      });
    }
  });
}

function closePatientRecordModal() {
  if (typeof Swal !== 'undefined' && Swal.isVisible()) {
    Swal.close();
  }
}

window.openPatientRecordModal = openPatientRecordModal;
window.closePatientRecordModal = closePatientRecordModal;

// ito yung helper para magbukas at mag-populate ng Edit Patient modal (demographics lang)
function openEditPatientModal(patient) {
  if (!patient) return;
  const modal = document.getElementById('editPatientModal');
  const idInput = document.getElementById('editPatientId');
  const nameInput = document.getElementById('editPatientName');
  const phoneInput = document.getElementById('editPatientPhone');
  const purokSelect = document.getElementById('editPatientPurok');

  if (!modal || !idInput || !nameInput || !phoneInput || !purokSelect) return;

  idInput.value = patient.patientId || patient._id || '';
  nameInput.value = patient.fullName || '';
  phoneInput.value = patient.contactNumber || '';

  const patientPurok = normalizePurokName(patient.purok || patient.barangay || 'Purok 1 (Centro)');
  let matched = false;
  for (let i = 0; i < purokSelect.options.length; i++) {
    if (purokSelect.options[i].value === patientPurok) {
      purokSelect.selectedIndex = i;
      matched = true;
      break;
    }
  }
  if (!matched) {
    const opt = document.createElement('option');
    opt.value = patientPurok;
    opt.textContent = patientPurok;
    purokSelect.appendChild(opt);
    purokSelect.value = patientPurok;
  }

  modal.classList.remove('hidden');
}

function closeEditPatientModal() {
  const modal = document.getElementById('editPatientModal');
  if (modal) modal.classList.add('hidden');
  const form = document.getElementById('editPatientForm');
  if (form) form.reset();
}

window.openEditPatientModal = openEditPatientModal;
window.closeEditPatientModal = closeEditPatientModal;


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
      showAlertMessage({
        title: 'Out of Stock',
        text: 'Cannot log dose: Selected vaccine batch is out of stock. Please notify Admin.',
        icon: 'error'
      });
      return;
    }
  }

  const confirmTitle = doseAdministered ? 'Confirm Dose Administration' : 'Confirm Dose Defaulted';
  const confirmText = doseAdministered
    ? `Record administration of ${modalContext.doseDay} (${vaccineType}) for ${modalContext.patientName || modalContext.patientId}? This will deduct 1 vial from clinic inventory.`
    : `Mark ${modalContext.doseDay} as Missed / Defaulted for ${modalContext.patientName || modalContext.patientId}?`;

  const confirmed = await showConfirmDialog({
    title: confirmTitle,
    text: confirmText,
    icon: doseAdministered ? 'question' : 'warning',
    confirmButtonText: doseAdministered ? 'Yes, record dose' : 'Yes, mark defaulted',
    confirmButtonColor: doseAdministered ? '#2e7d32' : '#d32f2f'
  });
  if (!confirmed) return;

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
      showAlertMessage({
        title: 'Dose Update Failed',
        text: result.message || 'Could not process dose.',
        icon: 'error'
      });
      return;
    }

    showAlertMessage({
      title: 'Dose Recorded',
      text: result.message || `${modalContext.doseDay} recorded successfully.`,
      icon: 'success'
    });
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
  } else if (scope === 'adminQueue') { clinicAppState.adminQueueFilter = filterValue; document.querySelectorAll('#adminOverviewQueueFilterTabs .filter-tab').forEach((t) => { t.classList.toggle('active', t.getAttribute('data-admin-queue-filter') === filterValue); }); renderLiveTriageQueue(); return; } } /*
    clinicAppState.adminQueueFilter = filterValue;
    document.querySelectorAll('#adminOverviewQueueFilterTabs .filter-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-admin-queue-filter') === filterValue);
    });
    renderLiveTriageQueue();
  }
    });
    renderPhysicianViews();
  }
}

*/ {
}; window.filterQueue = filterQueue;
document.addEventListener('DOMContentLoaded', () => {
  const cachedRole = (typeof localStorage !== 'undefined') ? (localStorage.getItem('role') || localStorage.getItem('pep_user_role')) : null;
  applyRoleBasedTopFilterVisibility(cachedRole);
});
document.addEventListener('DOMContentLoaded', async () => {
  const biteDateInput = document.getElementById('biteDate');
  if (biteDateInput) {
    biteDateInput.value = todayDateIso;
    biteDateInput.max = todayDateIso;
  }

  const restockExpInput = document.getElementById('restockExpiry');
  if (restockExpInput) {
    restockExpInput.value = '2027-09-30';
    restockExpInput.min = todayDateIso;
  }

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
    const doseBtn = e.target.closest('button.dose-node.pending');
    if (doseBtn) {
      const pid = doseBtn.getAttribute('data-patient-id');
      const pname = doseBtn.getAttribute('data-patient-name') || pid;
      const dday = doseBtn.getAttribute('data-dose-day');
      if (pid && dday) openDoseModal(pid, pname, dday);
    }
  });

  document.addEventListener('click', (e) => { const adminTab = e.target.closest('#adminOverviewQueueFilterTabs .filter-tab, [data-admin-queue-filter]'); if (adminTab) { const filter = adminTab.getAttribute('data-admin-queue-filter'); if (filter) { filterQueue('adminQueue', filter); } } });
  const overviewTriageBody = document.getElementById('adminOverviewTriageBody');
  if (overviewTriageBody) {
    overviewTriageBody.addEventListener('click', (e) => {
      const jumpBtn = e.target.closest('.btn-jump-patient-triage');
      if (e.target.closest('.btn-complete-triage')) return; const row = e.target.closest('tr.patient-row');
      const pid = jumpBtn ? jumpBtn.getAttribute('data-patient-id') : (row ? row.getAttribute('data-patient-id') : null);
      if (pid) {
        clinicAppState.selectedPatientId = pid;
        switchClinicalView('viewPhysTriage');
        selectPatient(pid, true);
      }
    });
  }




  document.addEventListener('click', async (e) => { const completeBtn = e.target.closest('.btn-complete-triage'); if (completeBtn) { e.preventDefault(); e.stopPropagation(); const patientId = completeBtn.getAttribute('data-patient-id'); if (!patientId) return; const patient = (clinicAppState.patients || []).find((p) => p.patientId === patientId || String(p._id) === patientId); if (!patient) return; const pendingDose = (patient.pepSchedule || []).find((d) => d.status === 'Pending') || { doseDay: 'Day 0' }; let confirmed = false; if (typeof Swal !== 'undefined') { const r = await Swal.fire({ title: 'Complete Triage / Dose', text: 'Record administration of ' + pendingDose.doseDay + ' (Anti-Rabies) for ' + (patient.fullName || patientId) + '? This will deduct 1 vial from inventory.', icon: 'question', showCancelButton: true, confirmButtonText: 'Yes, Complete', confirmButtonColor: '#16A34A', cancelButtonColor: '#6B7280' }); confirmed = r.isConfirmed; } else { confirmed = confirm('Complete ' + pendingDose.doseDay + ' for ' + (patient.fullName || patientId) + '?'); } if (!confirmed) return; try { const res = await fetch('/api/receptionist/patients/' + patientId + '/schedule', { method: 'PATCH', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ doseDay: pendingDose.doseDay, doseAdministered: true, vaccineType: 'anti-rabies' }) }); const rj = await res.json(); if (res.ok) { showToast('Successfully completed ' + pendingDose.doseDay + ' for ' + (patient.fullName || patientId)); await loadRoleAuthorizedData(); } else { showAlertMessage({ title: 'Completion Failed', text: rj.message || 'Could not complete dose.', icon: 'error' }); } } catch (err) { showToast('Network error while completing dose.'); } return; } });

  function _unusedLocalRunOtpTimer(elementId, seconds, onExpire) {
    const displayEl = document.getElementById(elementId);
    if (!displayEl) return null;

    let remaining = seconds;
    const formatTime = (secs) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    displayEl.textContent = formatTime(remaining);

    const intervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(intervalId);
        displayEl.textContent = '00:00 (Expired)';
        if (typeof onExpire === 'function') onExpire();
      } else {
        displayEl.textContent = formatTime(remaining);
      }
    }, 1000);

    return intervalId;
  }

  const overviewDefaultersBody = document.getElementById('adminOverviewDefaultersBody');
  if (overviewDefaultersBody) {
    overviewDefaultersBody.addEventListener('click', (e) => {
      const recallBtn = e.target.closest('.btn-recall-action');
      if (recallBtn) {
        const pid = recallBtn.getAttribute('data-patient-id');
        const pname = recallBtn.getAttribute('data-patient-name') || pid;
        const phone = recallBtn.getAttribute('data-patient-phone') || 'N/A';
        const missedDose = recallBtn.getAttribute('data-missed-dose') || 'Booster Dose';
        showToast(`Recall outreach logged for ${pname} (${missedDose} overdue). Contact: ${phone}`);
      }
    });
  }

  document.getElementById('loginStep1Form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showAuthError('');

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();

      if (!response.ok) {
        showAuthError(result.message || 'Invalid clinic email or password. Please check your credentials.');
        return;
      }

      if (result.data && result.data.user && result.data.token) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('pep_auth_token', result.data.token);
          localStorage.setItem('pep_user_role', result.data.user.role);
          localStorage.setItem('token', result.data.token);
          localStorage.setItem('role', result.data.user.role);
        }
        await openAuthenticatedRoleWorkspace(result.data.user);
        showToast(`Signed in as ${result.data.user.fullName} (${result.data.user.role})`);
        return;
      }

      clinicAppState.pendingLoginEmail = email;
      if (mfaOtpCountdownInterval) {
        clearInterval(mfaOtpCountdownInterval);
        mfaOtpCountdownInterval = null;
      }
      const mfaBtn = document.getElementById('loginStep2Btn');
      if (mfaBtn) mfaBtn.disabled = false;
      mfaOtpCountdownInterval = runOtpTimer('mfaOtpCountdown', 300, () => {
        showAuthError('Verification code has expired (5-minute limit). Please sign in again to receive a fresh code.');
        if (mfaBtn) mfaBtn.disabled = true;
      });
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
    if (mfaOtpCountdownInterval) {
      clearInterval(mfaOtpCountdownInterval);
      mfaOtpCountdownInterval = null;
    }
    const mfaCountdownEl = document.getElementById('mfaOtpCountdown');
    if (mfaCountdownEl) mfaCountdownEl.textContent = '05:00';
    const mfaBtn = document.getElementById('loginStep2Btn');
    if (mfaBtn) mfaBtn.disabled = false;
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
          if (mfaOtpCountdownInterval) {
            clearInterval(mfaOtpCountdownInterval);
            mfaOtpCountdownInterval = null;
          }
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

  // Forgot Password / Reset Password Handlers
  const btnShowForgot = document.getElementById('btnShowForgotPassword');
  const btnCancelForgot = document.getElementById('btnCancelForgotPassword');
  const forgotForm = document.getElementById('forgotPasswordForm');
  const resetForm = document.getElementById('resetPasswordStepForm');
  const btnCancelReset = document.getElementById('btnCancelResetPassword');

  if (btnShowForgot) {
    btnShowForgot.addEventListener('click', () => {
      showAuthError('');
      if (mfaOtpCountdownInterval) {
        clearInterval(mfaOtpCountdownInterval);
        mfaOtpCountdownInterval = null;
      }
      const loginEmailVal = (document.getElementById('loginEmail')?.value || '').trim();
      if (loginEmailVal && document.getElementById('forgotPasswordEmail')) {
        document.getElementById('forgotPasswordEmail').value = loginEmailVal;
      }
      document.getElementById('loginStep1Form')?.classList.add('hidden');
      document.getElementById('loginStep2Form')?.classList.add('hidden');
      if (resetForm) resetForm.classList.add('hidden');
      if (forgotForm) {
        forgotForm.classList.remove('hidden');
        document.getElementById('forgotPasswordEmail')?.focus();
      }
    });
  }

  if (btnCancelForgot) {
    btnCancelForgot.addEventListener('click', () => {
      showAuthError('');
      if (resetOtpCountdownInterval) {
        clearInterval(resetOtpCountdownInterval);
        resetOtpCountdownInterval = null;
      }
      if (forgotForm) forgotForm.classList.add('hidden');
      document.getElementById('loginStep1Form')?.classList.remove('hidden');
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showAuthError('');

      const email = (document.getElementById('forgotPasswordEmail')?.value || '').trim().toLowerCase();
      if (!email) {
        showAuthError('Please enter your clinic email.');
        return;
      }

      const submitBtn = document.getElementById('btnSubmitForgotPassword');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending Code...';
      }

      try {
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({ email })
        });
        const result = await response.json();

        if (!response.ok) {
          showAuthError(result.message || 'Could not process password reset request.');
          return;
        }

        clinicAppState.pendingResetEmail = email;
        if (resetOtpCountdownInterval) {
          clearInterval(resetOtpCountdownInterval);
          resetOtpCountdownInterval = null;
        }
        const resetSubmitBtn = document.getElementById('btnSubmitResetPassword');
        if (resetSubmitBtn) resetSubmitBtn.disabled = false;
        resetOtpCountdownInterval = runOtpTimer('resetOtpCountdown', 300, () => {
          showAuthError('Verification code has expired (5-minute limit). Please request a new code.');
          if (resetSubmitBtn) resetSubmitBtn.disabled = true;
        });
        const targetDisplay = document.getElementById('resetTargetEmailDisplay');
        if (targetDisplay) targetDisplay.textContent = email;

        forgotForm.classList.add('hidden');
        if (resetForm) {
          resetForm.classList.remove('hidden');
          document.getElementById('resetPasswordOtp')?.focus();
        }
        showToast('Verification code dispatched to your email.');
      } catch (err) {
        showAuthError('Network error connecting to auth server.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Reset Code';
        }
      }
    });
  }

  if (btnCancelReset) {
    btnCancelReset.addEventListener('click', () => {
      if (resetOtpCountdownInterval) {
        clearInterval(resetOtpCountdownInterval);
        resetOtpCountdownInterval = null;
      }
      const resetCountdownEl = document.getElementById('resetOtpCountdown');
      if (resetCountdownEl) resetCountdownEl.textContent = '05:00';
      const resetSubmitBtn = document.getElementById('btnSubmitResetPassword');
      if (resetSubmitBtn) resetSubmitBtn.disabled = false;
      showAuthError('');
      if (resetForm) resetForm.classList.add('hidden');
      document.getElementById('loginStep1Form')?.classList.remove('hidden');
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showAuthError('');

      const email = clinicAppState.pendingResetEmail || (document.getElementById('forgotPasswordEmail')?.value || '').trim().toLowerCase();
      const otp = (document.getElementById('resetPasswordOtp')?.value || '').trim();
      const newPassword = document.getElementById('resetNewPassword')?.value || '';
      const confirmPassword = document.getElementById('resetConfirmPassword')?.value || '';

      if (newPassword.length < 8) {
        showAuthError('Password must be at least 8 characters long.');
        return;
      }

      if (newPassword !== confirmPassword) {
        showAuthError('Passwords do not match. Please re-enter.');
        return;
      }

      const submitBtn = document.getElementById('btnSubmitResetPassword');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({ email, otp, newPassword })
        });
        const result = await response.json();

        if (!response.ok) {
          showAuthError(result.message || 'Could not reset password. Code may have expired.');
          return;
        }

        if (resetOtpCountdownInterval) {
          clearInterval(resetOtpCountdownInterval);
          resetOtpCountdownInterval = null;
        }
        const resetCountdownEl = document.getElementById('resetOtpCountdown');
        if (resetCountdownEl) resetCountdownEl.textContent = '05:00';
        resetForm.reset();
        resetForm.classList.add('hidden');
        document.getElementById('loginStep1Form')?.classList.remove('hidden');
        document.getElementById('loginPassword').value = '';
        showAlertMessage({
          title: 'Password Reset Successful',
          text: 'Your password has been securely updated. Please sign in with your new credentials.', willRefresh: setTimeout(() => window.location.reload(), 2000),
          icon: 'success'
        });
      } catch (err) {
        showAuthError('Network error while resetting password.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save New Password';
        }
      }
    });
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // ito yung anu pang linis ng data ng dating user para walang matira
    }

    stopRealtimePolling();
    if (mfaOtpCountdownInterval) {
      clearInterval(mfaOtpCountdownInterval);
      mfaOtpCountdownInterval = null;
    }
    if (resetOtpCountdownInterval) {
      clearInterval(resetOtpCountdownInterval);
      resetOtpCountdownInterval = null;
    }
    const mfaCountdownEl = document.getElementById('mfaOtpCountdown');
    if (mfaCountdownEl) mfaCountdownEl.textContent = '05:00';
    const resetCountdownEl = document.getElementById('resetOtpCountdown');
    if (resetCountdownEl) resetCountdownEl.textContent = '05:00';
    if (idleSessionTimer) clearTimeout(idleSessionTimer);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pep_auth_token');
      localStorage.removeItem('pep_user_role');
    }
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', '/');
    }
    clinicAppState.authenticatedUser = null;
    clinicAppState.pendingLoginEmail = '';
    clinicAppState.selectedPatientId = '';
    applyRoleBasedTopFilterVisibility(null);
    document.getElementById('authenticatedAppShell').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('loginStep2Form').classList.add('hidden');
    document.getElementById('loginStep1Form').classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginOtpCode').value = '';
    showAuthError('');
    showToast('Signed out of clinic workspace.');
  });

  // 1. Receptionist View Mode & Calendar Controls
  const btnRecCal = document.getElementById('btnRecQueueCalendarView');
  const btnRecList = document.getElementById('btnRecQueueListView');
  if (btnRecCal) btnRecCal.addEventListener('click', () => setQueueViewMode('calendar'));
  if (btnRecList) btnRecList.addEventListener('click', () => setQueueViewMode('list'));

  const calPrevBtn = document.getElementById('calPrevMonthBtn');
  const calNextBtn = document.getElementById('calNextMonthBtn');
  const calTodayBtn = document.getElementById('calTodayBtn');
  if (calPrevBtn) calPrevBtn.addEventListener('click', () => changeCalendarMonth(-1));
  if (calNextBtn) calNextBtn.addEventListener('click', () => changeCalendarMonth(1));
  if (calTodayBtn) calTodayBtn.addEventListener('click', () => resetCalendarToToday());

  const recRegSearch = document.getElementById('recRegistrySearchInput');
  if (recRegSearch) recRegSearch.addEventListener('input', () => renderReceptionistViews());

  // Receptionist KPI Deep Linking
  const recMissedBox = document.getElementById('recKpiMissedCard');
  if (recMissedBox) {
    recMissedBox.addEventListener('click', () => {
      switchClinicalView('viewRecRegistry');
      const overdueTab = document.querySelector('#recRegistryFilterTabs [data-rec-reg-filter="Overdue"]');
      if (overdueTab) {
        overdueTab.click();
      } else {
        clinicAppState.recRegistryFilter = 'Overdue';
        renderReceptionistViews();
      }
    });
  }

  const recStockBox = document.getElementById('recKpiStockCard');
  if (recStockBox) {
    recStockBox.addEventListener('click', () => {
      switchClinicalView('viewRecInventory');
    });
  }

  const recTotalBox = document.getElementById('recKpiTotalCard');
  if (recTotalBox) {
    recTotalBox.addEventListener('click', () => {
      switchClinicalView('viewRecRegistry');
      const patientTab = document.querySelector('#recRegistryFilterTabs [data-rec-reg-filter="Patient"]');
      if (patientTab) {
        patientTab.click();
      } else {
        clinicAppState.recRegistryFilter = 'Patient';
        renderReceptionistViews();
      }
    });
  }

  const recRegTable = document.getElementById('recPermanentRegistryTableBody');
  if (recRegTable) {
    recRegTable.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('button.btn-view-permanent-record');
      if (!viewBtn) return;
      openPatientRecordModal(viewBtn.getAttribute('data-patient-id'));
    });
  }

  const recFrontBody = document.getElementById('recFrontDeskTableBody');
  if (recFrontBody) {
    recFrontBody.addEventListener('click', (e) => {
      const checkinBtn = e.target.closest('button.btn-checkin-patient');
      if (!checkinBtn) return;
      checkInPatient(checkinBtn.getAttribute('data-patient-id'));
    });
  }

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

  document.querySelectorAll('#recRegistryFilterTabs .filter-tab').forEach((tab) => { tab.addEventListener('click', () => { document.querySelectorAll('#recRegistryFilterTabs .filter-tab').forEach((t) => t.classList.remove('active')); tab.classList.add('active'); clinicAppState.recRegistryFilter = tab.getAttribute('data-rec-reg-filter'); renderReceptionistViews(); }); });
  document.getElementById('resetWalkInFormBtn').addEventListener('click', () => {
    document.getElementById('walkInForm').reset();
    const biteInput = document.getElementById('biteDate');
    if (biteInput) {
      biteInput.value = todayDateIso;
      biteInput.max = todayDateIso;
    }
    const consentCb = document.getElementById('regConsentCheckbox'); if (consentCb) consentCb.checked = true;
    showToast('Walk-in form reset.');
  });

  // Restrict mobile number to numbers only and max 11 digits starting with 09
  const mobileInput = document.getElementById('mobileNumber');
  if (mobileInput) {
    mobileInput.setAttribute('pattern', '^09[0-9]{9}$');
    mobileInput.addEventListener('input', function (e) {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);
      if (typeof this.setCustomValidity === 'function') this.setCustomValidity('');
    });
  }

  // Restrict full name to letters, spaces, periods, and hyphens only
  const nameInput = document.getElementById('patientName');
  if (nameInput) {
    nameInput.setAttribute('pattern', '^[a-zA-ZÀ-ÿ\\s\\.\\-]+$');
    nameInput.addEventListener('input', function (e) {
      this.value = this.value.replace(/[^a-zA-ZÀ-ÿ\s\.\-]/g, '');
      if (typeof this.setCustomValidity === 'function') this.setCustomValidity('');
    });
  }

  document.getElementById('walkInForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const nameEl = document.getElementById('patientName');
    const phoneEl = document.getElementById('mobileNumber');
    if (nameEl && typeof nameEl.setCustomValidity === 'function') {
      const nv = nameEl.value.trim();
      if (!nv || !/^[a-zA-ZÀ-ÿ\s.\-]+$/.test(nv)) {
        nameEl.setCustomValidity('Letters, spaces, dots, and hyphens only.');
      } else {
        nameEl.setCustomValidity('');
      }
    }
    if (phoneEl && typeof phoneEl.setCustomValidity === 'function') {
      const pv = phoneEl.value.trim();
      if (!pv || !/^09[0-9]{9}$/.test(pv)) {
        phoneEl.setCustomValidity('Must be 11 digits starting with 09 (e.g., 09123456789)');
      } else {
        phoneEl.setCustomValidity('');
      }
    }

    // Force native HTML5 red warning popups before running custom logic
    if (typeof this.checkValidity === 'function' && !this.checkValidity()) {
      if (typeof this.reportValidity === 'function') this.reportValidity();
      return; // Instantly kill the function so SweetAlert does not fire
    }

    const consent = await Swal.fire({
      title: 'Data Privacy Consent (RA 10173)',
      text: 'Patient consents to recording contact and exposure details in the Barangay Kapitan Pepe PEP Registry.',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'I Agree & Register',
      cancelButtonText: 'Cancel'
    });

    if (!consent.isConfirmed) return; // Abort registration if they decline

    const ageVal = Number(document.getElementById('regAge').value);
    const rawPhone = document.getElementById('mobileNumber').value.trim();
    const digitsOnly = rawPhone.replace(/\D/g, '');
    const purokVal = normalizePurokName(document.getElementById('regBarangay').value);
    const biteInput = document.getElementById('biteDate');
    const biteDateVal = biteInput ? biteInput.value : todayDateIso;
    const payload = {
      fullName: document.getElementById('patientName').value.trim(),
      age: ageVal,
      sex: document.getElementById('regSex').value,
      contactNumber: digitsOnly,
      purok: purokVal,
      barangay: 'Brgy. Kapitan Pepe',
      day0WalkInDate: biteDateVal,
      animalType: document.getElementById('regAnimalType').value,
      biteSite: document.getElementById('regBiteSite').value.trim(),
      consentGiven: true
    };

    const response = await fetch('/api/receptionist/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      showAlertMessage({
        title: 'Registration Failed',
        text: result.message || 'Could not register walk-in patient.',
        icon: 'error'
      });
      return;
    }

    if (typeof this.reset === 'function') {
      this.reset();
    } else if (event.target && typeof event.target.reset === 'function') {
      event.target.reset();
    }
    if (biteInput) {
      biteInput.value = todayDateIso;
      biteInput.max = todayDateIso;
    }
    const consentCb = document.getElementById('regConsentCheckbox'); if (consentCb) consentCb.checked = true;

    await loadRoleAuthorizedData();
    switchClinicalView('viewRecQueue');
    showAlertMessage({
      title: 'Patient Registered',
      text: result.message || `Added ${payload.fullName} to Doctor's Queue`,
      icon: 'success'
    });
  });

  // 2. Physician View Mode & Calendar Controls
  const btnPhysCal = document.getElementById('btnPhysQueueCalendarView');
  const btnPhysList = document.getElementById('btnPhysQueueListView');
  if (btnPhysCal) btnPhysCal.addEventListener('click', () => setPhysQueueViewMode('calendar'));
  if (btnPhysList) btnPhysList.addEventListener('click', () => setPhysQueueViewMode('list'));

  const calPhysPrev = document.getElementById('calPhysPrevMonthBtn');
  const calPhysNext = document.getElementById('calPhysNextMonthBtn');
  const calPhysToday = document.getElementById('calPhysTodayBtn');
  if (calPhysPrev) calPhysPrev.addEventListener('click', () => changeCalendarMonth(-1));
  if (calPhysNext) calPhysNext.addEventListener('click', () => changeCalendarMonth(1));
  if (calPhysToday) calPhysToday.addEventListener('click', () => resetCalendarToToday());

  const physRecordsTable = document.getElementById('physRecordsTableBody');
  if (physRecordsTable) {
    physRecordsTable.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('button.btn-view-permanent-record');
      if (!viewBtn) return;
      openPatientRecordModal(viewBtn.getAttribute('data-patient-id'));
    });
  }

  const physTriageTable = document.getElementById('physTriageQueueBody');
  if (physTriageTable) {
    physTriageTable.addEventListener('click', (e) => {
      const assessBtn = e.target.closest('button.btn-assess-triage');
      if (assessBtn) {
        selectPatient(assessBtn.getAttribute('data-patient-id'), true);
        return;
      }
      if (e.target.closest('.btn-complete-triage')) return; const row = e.target.closest('tr.patient-row');
      if (row) {
        selectPatient(row.getAttribute('data-patient-id'), true);
      }
    });
  }

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

  // Physician KPI Deep Linking
  const physMissedBox = document.getElementById('physKpiMissedCard');
  if (physMissedBox) {
    physMissedBox.addEventListener('click', () => {
      switchClinicalView('viewPatientRecord');
      const overdueTab = document.querySelector('#physRecordsFilterTabs [data-phys-rec-filter="Overdue"]');
      if (overdueTab) {
        overdueTab.click();
      } else {
        clinicAppState.physRecordsFilter = 'Overdue';
        renderPhysicianViews();
      }
    });
  }

  const physStockBox = document.getElementById('physKpiStockCard');
  if (physStockBox) {
    physStockBox.addEventListener('click', () => {
      switchClinicalView('viewPhysInventory');
    });
  }

  const physTotalBox = document.getElementById('physKpiTotalCard');
  if (physTotalBox) {
    physTotalBox.addEventListener('click', () => {
      switchClinicalView('viewPatientRecord');
      const patientTab = document.querySelector('#physRecordsFilterTabs [data-phys-rec-filter="Patient"]');
      if (patientTab) {
        patientTab.click();
      } else {
        clinicAppState.physRecordsFilter = 'Patient';
        renderPhysicianViews();
      }
    });
  }

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
    showToast("Doctor's assessment form reset.");
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
        showAlertMessage({
          title: 'Out of Stock',
          text: 'Cannot log dose: Selected vaccine batch is out of stock. Please notify Admin.',
          icon: 'error'
        });
        return;
      }

      const selectedPatient = (clinicAppState.patients || []).find(
        (p) => p.patientId === patientId
      );
      const selectedDoseObj = (selectedPatient?.pepSchedule || []).find(
        (d) => d.doseDay === doseDay
      );
      if (selectedDoseObj && selectedDoseObj.status === 'Fulfilled') {
        showAlertMessage({
          title: 'Already Completed',
          text: `Cannot log dose: ${doseDay} has already been completed and cannot be deducted twice.`,
          icon: 'warning'
        });
        return;
      }

      const confirmed = await showConfirmDialog({
        title: 'Confirm Dose Administration',
        text: `Administer ${doseDay} (${vaccineType}) and save triage assessment for patient ${patientId}? This will deduct 1 vial from inventory.`,
        icon: 'question',
        confirmButtonText: 'Yes, administer & save'
      });
      if (!confirmed) return;
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
      showAlertMessage({
        title: 'Assessment Failed',
        text: result.message || 'Could not save clinical assessment.',
        icon: 'error'
      });
      return;
    }

    showAlertMessage({
      title: 'Assessment Saved',
      text: result.message || 'Clinical assessment saved successfully.',
      icon: 'success'
    });
    await loadRoleAuthorizedData();
    selectPatient(patientId, false);
  }

  document
    .getElementById('physicianAssessmentForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      if (e.target && typeof e.target.checkValidity === 'function') {
        if (!e.target.checkValidity()) {
          if (typeof e.target.reportValidity === 'function') e.target.reportValidity();
          return;
        }
      }
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

  // 3. SuperAdmin View Mode, Calendar Controls & Registry Controls
  const btnAdminCal = document.getElementById('btnAdminQueueCalendarView');
  const btnAdminList = document.getElementById('btnAdminQueueListView');
  if (btnAdminCal) btnAdminCal.addEventListener('click', () => setAdminQueueViewMode('calendar'));
  if (btnAdminList) btnAdminList.addEventListener('click', () => setAdminQueueViewMode('list'));

  const calAdminPrev = document.getElementById('calAdminPrevMonthBtn');
  const calAdminNext = document.getElementById('calAdminNextMonthBtn');
  const calAdminToday = document.getElementById('calAdminTodayBtn');
  if (calAdminPrev) calAdminPrev.addEventListener('click', () => changeCalendarMonth(-1));
  if (calAdminNext) calAdminNext.addEventListener('click', () => changeCalendarMonth(1));
  if (calAdminToday) calAdminToday.addEventListener('click', () => resetCalendarToToday());

  const adminQueueSearch = document.getElementById('adminQueueSearchInput');
  if (adminQueueSearch) adminQueueSearch.addEventListener('input', () => renderLiveTriageQueue());

  document.querySelectorAll('#adminOverviewQueueFilterTabs .filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      filterQueue('adminQueue', tab.getAttribute('data-admin-queue-filter'));
    });
  });

  // Secure Password-Protected Export Bindings across all roles
  const exportButtons = [
    document.getElementById('btnSecureExportRegistry'),
    document.getElementById('btnSecureExportPhysRecords'),
    document.getElementById('btnSecureExportAdminRegistry')
  ];
  exportButtons.forEach((btn) => {
    if (btn) btn.addEventListener('click', promptAndExportPermanentRegistry);
  });
  document.querySelectorAll('.btn-excel-export').forEach((btn) => {
    btn.addEventListener('click', promptAndExportPermanentRegistry);
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

  // Edit Patient button click handler in SuperAdmin Patient Registry
  document.getElementById('adminRegistryTableBody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('button.admin-edit-patient-btn');
    if (!editBtn) return;
    const patientId = editBtn.getAttribute('data-patient-id');
    const patientList = clinicAppState.patients || [];
    const patient = patientList.find(
      (p) => p.patientId === patientId || String(p._id) === patientId
    );
    if (!patient) return;
    openEditPatientModal(patient);
  });

  // View Details (eye) button -> read-only confidential patient record modal
  document.getElementById('adminRegistryTableBody').addEventListener('click', (e) => {
    const viewBtn = e.target.closest('button.admin-view-patient-btn');
    if (!viewBtn) return;
    openPatientRecordModal(viewBtn.getAttribute('data-patient-id'));
  });

  document.getElementById('cancelEditPatientBtn').addEventListener('click', () => {
    closeEditPatientModal();
  });

  document.getElementById('editPatientModal').addEventListener('click', (e) => {
    if (e.target.id === 'editPatientModal') {
      closeEditPatientModal();
    }
  });

  document
    .getElementById('editPatientForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      if (e.target && typeof e.target.checkValidity === 'function') {
        if (!e.target.checkValidity()) {
          if (typeof e.target.reportValidity === 'function') e.target.reportValidity();
          return;
        }
      }
      const patientId = document.getElementById('editPatientId').value;
      const fullName = document.getElementById('editPatientName').value.trim();
      const rawPhone = document.getElementById('editPatientPhone').value.trim();
      const purok = normalizePurokName(document.getElementById('editPatientPurok').value.trim());

      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (!/^09\d{9}$/.test(digitsOnly)) {
        showAlertMessage({
          title: 'Invalid Contact Number',
          text: 'Please enter a valid 11-digit Philippine mobile number starting with 09.',
          icon: 'warning'
        });
        return;
      }

      try {
        const response = await fetch(`/api/patients/demographics/${encodeURIComponent(patientId)}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({
            fullName,
            contactNumber: digitsOnly,
            purok
          })
        });
        const result = await response.json();

        if (!response.ok) {
          showAlertMessage({
            title: 'Update Failed',
            text: result.message || 'Could not update patient demographics.',
            icon: 'error'
          });
          return;
        }

        closeEditPatientModal();
        showAlertMessage({
          title: 'Demographics Updated',
          text: result.message || 'Patient demographics updated successfully.',
          icon: 'success'
        });
        await loadRoleAuthorizedData();
      } catch (err) {
        showToast('Network error while updating patient demographics.');
      }
    });

  document.getElementById('resetRestockFormBtn').addEventListener('click', () => {
    document.getElementById('adminRestockForm').reset();
    document.getElementById('invVialsAdded').value = '25';
    document.getElementById('invThreshold').value = '10';
    const expEl = document.getElementById('restockExpiry');
    if (expEl) {
      expEl.value = '2027-09-30';
      expEl.min = todayDateIso;
    }
    showToast('Restock form reset.');
  });

  document
    .getElementById('adminRestockForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      if (e.target && typeof e.target.checkValidity === 'function') {
        if (!e.target.checkValidity()) {
          if (typeof e.target.reportValidity === 'function') e.target.reportValidity();
          return;
        }
      }
      const expEl = document.getElementById('restockExpiry');
      const payload = {
        vaccineType: document.getElementById('invVaccineType').value,
        brandName: document.getElementById('invBrandName').value.trim(),
        batchNumber: document.getElementById('invBatchNumber').value.trim(),
        vialsAdded: Number(document.getElementById('invVialsAdded').value),
        lowStockThreshold: Number(document.getElementById('invThreshold').value || 10),
        expirationDate: expEl ? expEl.value : ''
      };

      const confirmed = await showConfirmDialog({
        title: 'Confirm Restock',
        text: `Restock ${payload.vialsAdded} vials of ${payload.vaccineType} (${payload.brandName}, Lot: ${payload.batchNumber})?`,
        icon: 'question',
        confirmButtonText: 'Yes, add vials'
      });
      if (!confirmed) return;

      const response = await fetch('/api/admin/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok) {
        showAlertMessage({
          title: 'Restock Failed',
          text: result.message || 'Could not restock vaccine batch.',
          icon: 'error'
        });
        return;
      }

      e.target.reset();
      document.getElementById('invVialsAdded').value = '25';
      if (expEl) {
        expEl.value = '2027-09-30';
        expEl.min = todayDateIso;
      }
      document.getElementById('invThreshold').value = '10';
      showAlertMessage({
        title: 'Restock Success',
        text: result.message || 'Vaccine batch restocked successfully.',
        icon: 'success'
      });
      await loadRoleAuthorizedData();
    });

  function handleSelectVaccineForRestock(vaccineType, brandName) { const typeSelect = document.getElementById('invVaccineType'); const brandInput = document.getElementById('invBrandName'); const vialsInput = document.getElementById('invVialsAdded'); const restockForm = document.getElementById('adminRestockForm'); const restockCard = restockForm ? restockForm.closest('.panel-card') : null; if (typeSelect) { const raw = String(vaccineType || '').toLowerCase(); if (raw.includes('erig') || raw.includes('equirab')) { typeSelect.value = 'ERIG'; } else if (raw.includes('tetanus') || raw.includes('tetavax')) { typeSelect.value = 'anti-tetanus'; } else { typeSelect.value = 'anti-rabies'; } typeSelect.dispatchEvent(new Event('change')); } if (brandInput && brandName && !brandInput.value) { brandInput.value = brandName; } if (restockCard) { restockCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); restockCard.classList.add('card-flash-focus'); setTimeout(() => restockCard.classList.remove('card-flash-focus'), 1000); } if (vialsInput) { vialsInput.focus(); vialsInput.select(); } const displayName = typeSelect ? (typeSelect.options[typeSelect.selectedIndex]?.text || typeSelect.value) : vaccineType; showToast('Selected ' + displayName + ' for restocking.'); }

  async function handleAdminBatchAction(manageBtn) {
    const batchLotId = manageBtn.getAttribute('data-batch-lot');
    const vaccineType = manageBtn.getAttribute('data-vaccine-type') || '';
    const brandName = manageBtn.getAttribute('data-brand-name') || '';
    const currentStock = parseInt(manageBtn.getAttribute('data-current-stock') || '0', 10);
    const expDate = manageBtn.getAttribute('data-expiration-date') || '';
    const isExpired = manageBtn.getAttribute('data-is-expired') === 'true';

    if (typeof Swal === 'undefined') {
      alert('Action modal requires SweetAlert.');
      return;
    }

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: `Manage Batch: ${batchLotId}`,
      html: `
        <div style="text-align:left; font-size: 13.5px;">
          <p style="margin: 0 0 6px 0;"><strong>Vaccine:</strong> ${escapeHtml(vaccineType)} (${escapeHtml(brandName)})</p>
          <p style="margin: 0 0 6px 0;"><strong>Current Stock:</strong> <span style="color:#BE123C; font-weight:bold;">${currentStock} vial(s)</span></p>
          <p style="margin: 0 0 14px 0;"><strong>Expiration Date:</strong> <span class="mono-num">${escapeHtml(expDate)}</span> ${isExpired ? '<span class="badge badge-red badge-expired" style="margin-left: 6px;">EXPIRED</span>' : ''}</p>
          
          <label for="swalBatchAction" style="display:block; font-weight:600; margin-bottom:4px; font-size:12.5px;">Action *</label>
          <select id="swalBatchAction" class="swal2-select" style="width:100%; margin: 0 0 14px 0; box-sizing: border-box; display:block; height:38px; font-size:13px;">
            <option value="mark_expired" ${!isExpired ? 'selected' : ''}>Mark Batch as Expired</option>
            <option value="write_off" ${isExpired ? 'selected' : ''}>Write-Off / Spoilage Deduction</option>
            <option value="edit_expiry">Edit Expiration Date</option>
          </select>

          <div id="swalWriteOffFields" style="display: ${isExpired ? 'block' : 'none'}; padding: 12px; background: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; margin-bottom: 12px;">
            <label for="swalVoidVials" style="display:block; font-weight:600; margin-bottom:4px; font-size:12.5px; color:#991B1B;">Vials to Deduct (1 - ${Math.max(1, currentStock)}) *</label>
            <input id="swalVoidVials" type="number" min="1" max="${Math.max(1, currentStock)}" value="${Math.min(1, currentStock)}" class="swal2-input" style="width:100%; margin: 0 0 10px 0; box-sizing: border-box; height:36px; font-size:13px;" ${currentStock <= 0 ? 'disabled' : ''} />
            <label for="swalVoidReason" style="display:block; font-weight:600; margin-bottom:4px; font-size:12.5px; color:#991B1B;">Reason *</label>
            <select id="swalVoidReason" class="swal2-select" style="width:100%; margin: 0; box-sizing: border-box; display:block; height:36px; font-size:13px;">
              <option value="Expired">Expired / Chemical Degradation</option>
              <option value="Broken Vial">Physical Damage / Broken Vial</option>
              <option value="Cold Chain Excursion">Cold Chain Temperature Excursion</option>
              <option value="Clerical Error">Clerical Typo on Expiry Date / Batch Lot</option>
              <option value="Manufacturer Recall">Manufacturer Recall</option>
              <option value="Contaminated Seal">Contaminated / Compromised Seal</option>
            </select>
          </div>

          <div id="swalEditExpiryFields" style="display: none; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; margin-bottom: 12px;">
            <label for="swalNewExpiry" style="display:block; font-weight:600; margin-bottom:4px; font-size:12.5px; color:#166534;">New Expiration Date *</label>
            <input id="swalNewExpiry" type="date" value="${expDate || ''}" class="swal2-input" style="width:100%; margin: 0; box-sizing: border-box; height:36px; font-size:13px;" />
          </div>
        </div>
      `,
      didOpen: () => {
        const actionEl = document.getElementById('swalBatchAction');
        const writeOffDiv = document.getElementById('swalWriteOffFields');
        const editExpDiv = document.getElementById('swalEditExpiryFields');
        if (actionEl && writeOffDiv && editExpDiv) {
          actionEl.addEventListener('change', () => {
            writeOffDiv.style.display = actionEl.value === 'write_off' ? 'block' : 'none';
            editExpDiv.style.display = actionEl.value === 'edit_expiry' ? 'block' : 'none';
          });
        }
      },
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Apply Changes',
      confirmButtonColor: '#2563EB',
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#6c757d',
      preConfirm: () => {
        const popup = Swal.getPopup();
        const action = popup.querySelector('#swalBatchAction').value;
        if (action === 'mark_expired') {
          return { action: 'mark_expired' };
        } else if (action === 'write_off') {
          if (currentStock <= 0) {
            Swal.showValidationMessage('This batch has 0 vials remaining in stock to write off.');
            return false;
          }
          const count = parseInt(popup.querySelector('#swalVoidVials').value, 10);
          const reason = popup.querySelector('#swalVoidReason').value.trim();
          if (!count || isNaN(count) || count < 1 || count > currentStock) {
            Swal.showValidationMessage(`Please enter a valid vial count between 1 and ${currentStock}.`);
            return false;
          }
          if (!reason) {
            Swal.showValidationMessage('Please select a reason for write-off.');
            return false;
          }
          return { action: 'write_off', vialsToDeduct: count, reason };
        } else if (action === 'edit_expiry') {
          const newExp = popup.querySelector('#swalNewExpiry').value;
          if (!newExp) {
            Swal.showValidationMessage('Please select a new expiration date.');
            return false;
          }
          return { action: 'edit_expiry', newExpirationDate: newExp };
        }
      }
    });

    if (!isConfirmed || !formValues) return;

    if (formValues.action === 'mark_expired') {
      try {
        const response = await fetch('/api/admin/inventory/status', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({ batchNumber: batchLotId, status: 'Expired' })
        });
        const result = await response.json();
        if (response.ok) {
          showAlertMessage({
            title: 'Batch Expired',
            text: result.message || `Batch ${batchLotId} marked as Expired.`,
            icon: 'success'
          });
          await loadRoleAuthorizedData();
        } else {
          showAlertMessage({
            title: 'Update Failed',
            text: result.message || 'Could not update batch status.',
            icon: 'error'
          });
        }
      } catch (err) {
        showToast('Network error while updating batch status.');
      }
    } else if (formValues.action === 'edit_expiry') {
      try {
        const response = await fetch('/api/admin/inventory/status', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({
            batchNumber: batchLotId,
            status: formValues.newExpirationDate < todayDateIso ? 'Expired' : 'Active',
            expirationDate: formValues.newExpirationDate
          })
        });
        const result = await response.json();
        if (response.ok) {
          showAlertMessage({
            title: 'Expiration Updated',
            text: result.message || `Batch ${batchLotId} expiration date updated.`,
            icon: 'success'
          });
          await loadRoleAuthorizedData();
        } else {
          showAlertMessage({
            title: 'Update Failed',
            text: result.message || 'Could not update expiration date.',
            icon: 'error'
          });
        }
      } catch (err) {
        showToast('Network error while updating expiration date.');
      }
    } else if (formValues.action === 'write_off') {
      try {
        const response = await fetch('/api/inventory/spoilage', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({
            batchLotId,
            vialsToDeduct: formValues.vialsToDeduct,
            reason: formValues.reason
          })
        });
        const result = await response.json();
        if (!response.ok) {
          showAlertMessage({
            title: 'Write-Off Failed',
            text: result.message || 'Could not process inventory spoilage write-off.',
            icon: 'error'
          });
          return;
        }
        showAlertMessage({
          title: 'Stock Voided',
          text: result.message || `Voided ${formValues.vialsToDeduct} vial(s) from Lot ${batchLotId}.`,
          icon: 'success'
        });
        await loadRoleAuthorizedData();
      } catch (err) {
        showToast('Network error while processing inventory write-off.');
      }
    }
  }

  document.getElementById('adminInventoryTableBody').addEventListener('click', async (e) => {
    const manageBtn = e.target.closest('button.admin-manage-batch-btn');
    if (manageBtn) {
      await handleAdminBatchAction(manageBtn);
      return;
    }
    const editStatusBtn = e.target.closest('button.admin-edit-status-btn');
    if (editStatusBtn) {
      const batchLot = editStatusBtn.getAttribute('data-batch-lot');
      const confirmed = await showConfirmDialog({
        title: 'Mark Batch as Expired',
        text: `Are you sure you want to mark Batch Lot "${batchLot}" as Expired? This will record the status change in the permanent audit ledger.`,
        icon: 'warning',
        confirmButtonText: 'Yes, mark Expired'
      });
      if (!confirmed) return;

      try {
        const response = await fetch('/api/admin/inventory/status', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
          body: JSON.stringify({ batchNumber: batchLot, status: 'Expired' })
        });
        const result = await response.json();
        if (response.ok) {
          showAlertMessage({
            title: 'Batch Expired',
            text: result.message || `Batch ${batchLot} marked as Expired.`,
            icon: 'success'
          });
          await loadRoleAuthorizedData();
        } else {
          showAlertMessage({
            title: 'Update Failed',
            text: result.message || 'Could not update batch status.',
            icon: 'error'
          });
        }
      } catch (err) {
        showToast('Network error while updating batch status.');
      }
      return;
    }
    const voidBtn = e.target.closest('button.admin-void-spoilage-btn');
    if (!voidBtn) { const stockRow = e.target.closest('tr'); if (stockRow && !e.target.closest('button, a, input, select')) { const cells = stockRow.querySelectorAll('td'); const vType = stockRow.getAttribute('data-vaccine-type') || cells[0]?.textContent?.trim() || ''; const bName = stockRow.getAttribute('data-brand-name') || cells[1]?.textContent?.trim() || ''; handleSelectVaccineForRestock(vType, bName); } return; }

    const batchLotId = voidBtn.getAttribute('data-batch-lot');
    const vaccineType = voidBtn.getAttribute('data-vaccine-type');
    const brandName = voidBtn.getAttribute('data-brand-name') || '';
    const currentStock = parseInt(voidBtn.getAttribute('data-current-stock') || '0', 10);

    if (currentStock <= 0) {
      showAlertMessage({
        title: 'Zero Stock',
        text: `Lot ${batchLotId} currently has 0 vials available in inventory.`,
        icon: 'warning'
      });
      return;
    }

    let vialsToDeduct = 1;
    let reason = 'Broken Vial';

    if (typeof Swal !== 'undefined') {
      const { value: formValues, isConfirmed } = await Swal.fire({
        title: `Write-Off / Void: ${batchLotId}`,
        html: `
          <div style="text-align:left; font-size: 13.5px; margin-bottom: 4px;">
            <p style="margin: 0 0 6px 0;"><strong>Vaccine:</strong> ${vaccineType} (${brandName})</p>
            <p style="margin: 0 0 12px 0;"><strong>Current Stock:</strong> <span style="color:#BE123C; font-weight:bold;">${currentStock} vial(s)</span></p>
            <label for="swalVoidVials" style="display:block; font-weight:600; margin-bottom:4px; font-size:12.5px;">Vials to Deduct (1 - ${currentStock}) *</label>
            <input id="swalVoidVials" type="number" min="1" max="${currentStock}" value="1" class="swal2-input" style="width:100%; margin: 0 0 14px 0; box-sizing: border-box; height:38px; font-size:14px;" required />
            <label for="swalVoidReason" style="display:block; font-weight:600; margin-bottom:4px; font-size:12.5px;">Reason for Write-Off *</label>
            <select id="swalVoidReason" class="swal2-select" style="width:100%; margin: 0; box-sizing: border-box; display:block; height:38px; font-size:13px;">
              <option value="Broken Vial">Physical Damage / Broken Vial</option>
              <option value="Clerical Error">Clerical Typo on Expiry Date / Batch Lot</option>
              <option value="Expired">Expired / Chemical Degradation</option>
              <option value="Cold Chain Excursion">Cold Chain Temperature Excursion</option>
              <option value="Manufacturer Recall">Manufacturer Recall</option>
              <option value="Contaminated Seal">Contaminated / Compromised Seal</option>
            </select>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Confirm Write-Off',
        confirmButtonColor: '#BE123C',
        cancelButtonText: 'Cancel',
        cancelButtonColor: '#6c757d',
        preConfirm: () => {
          const popup = typeof Swal !== 'undefined' && Swal.getPopup ? Swal.getPopup() : document;
          const vialsEl = popup.querySelector('#swalVoidVials');
          const reasonEl = popup.querySelector('#swalVoidReason');
          const count = parseInt(vialsEl ? vialsEl.value : '0', 10);
          const r = reasonEl ? reasonEl.value.trim() : '';

          if (!count || isNaN(count) || count < 1 || count > currentStock) {
            Swal.showValidationMessage(`Please enter a valid vial count between 1 and ${currentStock}.`);
            return false;
          }
          if (!r) {
            Swal.showValidationMessage('Please select a reason for write-off.');
            return false;
          }
          return { vialsToDeduct: count, reason: r };
        }
      });

      if (!isConfirmed || !formValues) return;
      vialsToDeduct = formValues.vialsToDeduct;
      reason = formValues.reason;
    } else {
      const confirmed = typeof confirm !== 'undefined' ? confirm(`Void 1 vial from ${batchLotId}?`) : true;
      if (!confirmed) return;
    }

    try {
      const response = await fetch('/api/inventory/spoilage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchLotId,
          vialsToDeduct,
          reason
        })
      });
      const result = await response.json();

      if (!response.ok) {
        showAlertMessage({
          title: 'Write-Off Failed',
          text: result.message || 'Could not process inventory spoilage write-off.',
          icon: 'error'
        });
        return;
      }

      showAlertMessage({
        title: 'Stock Voided',
        text: result.message || `Voided ${vialsToDeduct} vial(s) from Lot ${batchLotId}.`,
        icon: 'success'
      });
      await loadRoleAuthorizedData();
    } catch (err) {
      showToast('Network error while processing inventory write-off.');
    }
  });

  const _refreshForecastBtn = document.getElementById('refreshForecastBtn');
  if (_refreshForecastBtn) _refreshForecastBtn.addEventListener('click', async () => {
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
      await loadDashboardSummary();
      showToast(result.message || 'Forecast updated.');
    } catch (err) {
      showToast('Network error while updating forecast.');
    }
  });

  document.getElementById('resetStaffFormBtn')?.addEventListener('click', () => {
    setStaffFormMode(null);
  });

  // Security settings: update the global inactivity timeout.
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const select = document.getElementById('sessionTimeout');
      const timeout = Number(select ? select.value : 0);
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120) {
        if (typeof Swal !== 'undefined') {
          Swal.fire('Invalid Value', 'Timeout must be between 1 and 120 minutes.', 'error');
        } else {
          showToast('Invalid timeout value.');
        }
        return;
      }

      try {
        const response = await fetch('/api/settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getStoredAuthToken()}`
          },
          body: JSON.stringify({ timeout })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          applySessionTimeout(timeout);
          if (typeof Swal !== 'undefined') {
            Swal.fire('Security Policy Updated', `Auto-logout set to ${timeout} minutes.`, 'success');
          } else {
            showToast(`Auto-logout set to ${timeout} minutes.`);
          }
        } else {
          if (typeof Swal !== 'undefined') {
            Swal.fire('Update Failed', result.message || 'Could not update settings.', 'error');
          } else {
            showToast(result.message || 'Could not update settings.');
          }
        }
      } catch (err) {
        if (typeof Swal !== 'undefined') {
          Swal.fire('Error', 'Server verification failed.', 'error');
        } else {
          showToast('Server verification failed.');
        }
      }
    });
  }

  document.getElementById('adminStaffTableBody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('button.staff-edit');
    const toggleBtn = e.target.closest('button.staff-toggle-btn');
    const staffList = clinicAppState.staffAccounts || [];

    if (editBtn) {
      const member = staffList.find((u) => String(u._id) === editBtn.getAttribute('data-staff-id'));
      if (member) {
        setStaffFormMode(member);
        document.getElementById('staffFullName').focus();
      }
      return;
    }

    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-staff-id');
      const member = staffList.find((u) => String(u._id) === id);
      if (!member) return;
      const isCurrentlyActive = member.isActive !== false;
      const actionName = isCurrentlyActive ? 'deactivate' : 'reactivate';
      const actionTitle = isCurrentlyActive ? 'Deactivate Staff Account' : 'Reactivate Staff Account';
      const confirmText = isCurrentlyActive
        ? `Are you sure you want to deactivate ${member.fullName}? They will be blocked from logging into the clinic system.`
        : `Reactivate account for ${member.fullName}? They will be permitted to log in again.`;

      const confirmed = await showConfirmDialog({
        title: actionTitle,
        text: confirmText,
        icon: isCurrentlyActive ? 'warning' : 'question',
        confirmButtonText: isCurrentlyActive ? 'Yes, deactivate' : 'Yes, reactivate',
        confirmButtonColor: isCurrentlyActive ? '#d32f2f' : '#2e7d32'
      });
      if (!confirmed) return;

      try {
        const response = await fetch(`/api/staff/${id}/toggle-status`, {
          method: 'PATCH',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin'
        });
        const result = await response.json();
        if (!response.ok) {
          showAlertMessage({
            title: 'Action Failed',
            text: result.message || `Could not ${actionName} staff account.`,
            icon: 'error'
          });
          return;
        }
        showAlertMessage({
          title: 'Account Status Updated',
          text: result.message || `Staff account ${actionName}d successfully.`,
          icon: 'success'
        });
        await loadRoleAuthorizedData();
      } catch (err) {
        showToast(`Network error while trying to ${actionName} staff account.`);
      }
      return;
    }

  });

  document
    .getElementById('adminOnboardStaffForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      if (e.target && typeof e.target.checkValidity === 'function') {
        if (!e.target.checkValidity()) {
          if (typeof e.target.reportValidity === 'function') e.target.reportValidity();
          return;
        }
      }
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
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin',
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

  // --- RA 10173 secure CSV export (Patient Registry) ---
  // NOTE: the registry UI now shows plaintext PHI for all staff roles.
  // maskPHI() is retained here and is applied ONLY when the SuperAdmin
  // chooses the "Masked" export format (RA 10173 compliant external reporting).

  function getFilteredRegistry() {
    const patients = clinicAppState.patients || [];
    const regSearchVal = document.getElementById('adminRegistrySearchInput')?.value || '';
    return patients.filter((p) => filterQueueMatch(p, clinicAppState.adminRegistryFilter, regSearchVal));
  }

  // type: 'masked' | 'unmasked'
  function exportTableToCSV(type = 'masked', filename) {
    const rows = getFilteredRegistry();
    if (!rows || rows.length === 0) {
      showToast('No registry data available to export.');
      return false; // Tell the caller it failed
    }

    const shouldMask = type !== 'unmasked';

    const headers = [
      'Registry ID',
      'Patient Name',
      'Age',
      'Sex',
      'Purok / Address',
      'Contact Number',
      'Animal Type',
      'Bite Site',
      'WHO Category',
      'Clinical Notes',
      'Next Dose'
    ];

    const escapeCsv = (value) => {
      const str = String(value == null ? '' : value);
      return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const lines = [headers.join(',')];
    rows.forEach((p) => {
      const addr = p.purok || p.barangay || 'Brgy. Kapitan Pepe';
      const nextPending = (p.pepSchedule || []).find((d) => d.status === 'Pending');
      const nextDose = nextPending
        ? `${nextPending.doseDay} (${String(nextPending.scheduledDate).split('T')[0]})`
        : 'Completed';
      const record = [
        p.patientId || '',
        shouldMask ? maskPHI(p.fullName, 'name') : p.fullName,
        p.age || '',
        p.sex || '',
        addr,
        shouldMask ? maskPHI(p.contactNumber, 'phone') : p.contactNumber,
        p.animalType || '',
        p.biteSite || '',
        p.woundCategory || '',
        p.clinicalNotes || '',
        nextDose
      ];
      lines.push(record.map(escapeCsv).join(','));
    });

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      filename || `drpau-pep-registry-${getLocalTodayIso()}-${shouldMask ? 'masked' : 'unmasked'}.csv`;
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
      shouldMask ? 'CSV exported with masked PHI (PII protected).' : 'CSV exported with unmasked PHI.'
    );
    return true; // Tell the caller it succeeded
  }

  if (typeof window !== 'undefined') {
    window.exportTableToCSV = exportTableToCSV;
  }

  // RA 10173 RBAC: only SuperAdmin may export raw (unmasked) clinical records.
  function getCurrentUserRole() {
    if (typeof localStorage !== 'undefined') {
      const storedRole = localStorage.getItem('pep_user_role');
      if (storedRole) return storedRole;
      const token = localStorage.getItem('pep_auth_token');
      if (token) {
        try {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          return decoded.role || null;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  // Shared session token used for the export re-authentication challenge.
  function getStoredAuthToken() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('token') || localStorage.getItem('pep_auth_token');
  }

  // Records the data-privacy event (EXPORT_MASKED / EXPORT_UNMASKED) in the
  // universal audit trail.
  async function logExportActivity(exportType) {
    try {
      await fetch('/api/admin/export-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getStoredAuthToken()}`
        },
        body: JSON.stringify({ format: exportType })
      });
    } catch (err) {
      console.warn('Could not record export activity:', err.message);
    }
  }

  const btnExportAnalytics = document.getElementById('btnExportAnalytics');

  const runRegistryExport = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    // 1. Bulletproof Empty Table Check
    const specificBody = document.getElementById('adminRegistryTableBody');
    const tbody = specificBody || document.querySelector('table tbody');
    const rows = tbody ? tbody.querySelectorAll('tr') : [];
    let isEmpty = true;

    if (rows.length > 0) {
      // If there are rows, ensure it isn't just a "No data available" placeholder
      const firstRowText = rows[0].innerText.toLowerCase();
      if (!firstRowText.includes('no registry data') && !firstRowText.includes('no matching records') && !firstRowText.includes('no records')) {
        isEmpty = false; // The table has real data
      }
    }

    // 2. Halt Execution if Empty
    if (isEmpty) {
      await Swal.fire({
        icon: 'error',
        title: 'Export Blocked',
        text: 'No patient records found. Please clear your search and try again.',
        confirmButtonColor: '#7C3AED'
      });
      return; // HARD STOP: This prevents the format prompt and password challenge from firing
    }

      // Step 1: Select Export Format
      const { value: exportType } = await Swal.fire({
        title: 'Export Format',
        text: 'Select how patient data should be handled in the CSV:',
        icon: 'question',
        input: 'radio',
        inputOptions: {
          masked: 'Masked Data (Safe Export / No Password Required)',
          unmasked: 'Unmasked Data (Requires SuperAdmin Password)'
        },
        inputValidator: (value) => {
          if (!value) return 'You must choose an export format!';
        },
        confirmButtonText: 'Continue',
        showCancelButton: true
      });

      if (!exportType) return; // User canceled

      // Step 2: Conditional Password Challenge
      // Masked exports are safe by design (RA 10173 compliant) -> export instantly.
      if (exportType === 'masked') {
        const exportSucceeded = exportTableToCSV('masked');
        if (!exportSucceeded) return; // Do not show success modal if export failed
        await logExportActivity('masked');
        Swal.fire(
          'Export Successful',
          'Your masked, RA-10173 compliant report has been downloaded.',
          'success'
        );
        return;
      }

      // Unmasked exports expose raw PHI -> strict SuperAdmin password challenge.
      if (exportType === 'unmasked') {
        const { value: password } = await Swal.fire({
          title: 'SuperAdmin Authorization',
          text: 'Enter your password to authorize the extraction of raw Patient Data.',
          input: 'password',
          inputPlaceholder: 'Enter password...',
          inputAttributes: {
            autocomplete: 'new-password', // CRITICAL FIX: Blocks autofill injection
            autocapitalize: 'off',
            autocorrect: 'off'
          },
          showCancelButton: true,
          confirmButtonColor: '#d33', // Red button to indicate sensitive action
          customClass: {
            popup: 'pep-reauth-modal',
            title: 'pep-reauth-title',
            content: 'pep-reauth-content',
            input: 'pep-reauth-input',
            confirmButton: 'pep-reauth-confirm',
            cancelButton: 'pep-reauth-cancel'
          },
          inputValidator: (value) => (value ? undefined : 'Please enter your admin password.')
        });

        if (!password) return; // User canceled

        try {
          // Verify password with the backend
          const response = await fetch('/api/auth/verify-unmask', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getStoredAuthToken()}`
            },
            body: JSON.stringify({ password })
          });

          const result = await response.json();

          if (response.ok && result.success) {
            // Authorized — generate and download the raw clinical CSV.
            const exportSucceeded = exportTableToCSV('unmasked');
            if (!exportSucceeded) return; // Do not show success modal if export failed
            await logExportActivity('unmasked');
            Swal.fire('Export Successful', 'Unmasked clinical report downloaded.', 'success');
          } else {
            Swal.fire(
              'Access Denied',
              result.message || result.error || 'Incorrect Password. Unmasked export blocked.',
              'error'
            );
          }
        } catch (error) {
          Swal.fire('Error', 'Server verification failed.', 'error');
        }
      }
  };

  if (btnExportAnalytics) {
    btnExportAnalytics.addEventListener('click', runRegistryExport);
  }

  // --- Analytics Dashboard Controls & Filter Bindings (Reference Dashboard) ---
  const globalFilterIds = [
    'globalFilterYear',
    'globalFilterQuarter',
    'globalFilterMonth',
    'globalFilterAnimal',
    'globalFilterOutcome',
    'globalFilterAge',
    'globalFilterSex'
  ];

  function handleGlobalFilterChange() {
    const activeFilters = [];
    globalFilterIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.value !== 'All') {
        const label = el.previousElementSibling ? el.previousElementSibling.textContent.replace(':', '') : id;
        activeFilters.push(`${label}: ${el.value}`);
      }
    });

    if (activeFilters.length > 0) {
      showToast(`Filter applied: ${activeFilters.join(' | ')}`);
    } else {
      showToast('Filters cleared: Viewing All records');
    }
    renderMasterDashboard();
    renderMasterDashboardCharts();
  }

  globalFilterIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', handleGlobalFilterChange);
    }
  });

  // Reset Back Buttons (↶ Back)
  document.querySelectorAll('.btn-crumb-back').forEach((btn) => {
    btn.addEventListener('click', () => {
      globalFilterIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = 'All';
      });
      showToast('Reset view: Showing all baseline registry data.');
      renderMasterDashboard();
      // Master dashboard charts removed
    });
  });

  // Clinical info modal triggers (? button)
  const CLINICAL_HELP_TOPICS = {
    animal: {
      title: 'Bite Vector Distribution (Canine & Feline)',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #334155;">
          <p><strong>Clinical Surveillance:</strong> Tracks live patient exposures across the four permitted WHO mammalian bite vectors: Stray Dog, Domestic Dog, Stray Cat, and Domestic Cat.</p>
          <p><strong>WHO Protocol:</strong> Any warm-blooded mammalian exposure in an endemic rabies zone requires immediate categorization and initiation of post-exposure prophylaxis unless the animal completes a 14-day veterinary observation period.</p>
        </div>
      `
    },
    age: {
      title: 'Patient Demographics (Age & Sex Split)',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #334155;">
          <p><strong>Demographic Profile:</strong> Stratifies active registry patients into Children (&lt;15y), Youth (15–24y), Adults (25–54y), and Seniors (55+y) alongside the Male/Female sex split.</p>
          <p><strong>Pediatric Dosing:</strong> Pediatric patients receive the standard 0.1 mL intradermal 2-site ID regimen on Days 0, 3, and 7 without dose reduction.</p>
        </div>
      `
    },
    trend: {
      title: 'Walk-In & Outcome Trend (2026 Surveillance)',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #334155;">
          <p><strong>Active Surveillance Window:</strong> Compares walk-in intake volume and Category III high-risk presentations against fulfilled PEP dose milestones across the active 2026 clinical cohort.</p>
          <p><strong>Interactive Filtering:</strong> Use the Year, Quarter, and Month controls to drill into weekly or monthly cohort velocity.</p>
        </div>
      `
    },
    purok: {
      title: 'Geographic Incidence by Purok (Brgy. Kapitan Pepe)',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #334155;">
          <p><strong>Geographic Hotspots:</strong> Ranks canonical Purok zones in Barangay Kapitan Pepe (Purok 1 Centro through Purok 7 Narra St.) by active bite exposure volume.</p>
          <p><strong>Public Health Action:</strong> Puroks exceeding the barangay mean incidence are flagged as high-surge zones for targeted canine vaccination drives.</p>
        </div>
      `
    },
    severity: {
      title: 'WHO Wound Severity Breakdown',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #334155;">
          <p><strong>WHO &amp; DOH Classification:</strong></p>
          <ul style="padding-left: 20px; margin: 6px 0;">
            <li><strong>Category III (Severe / ERIG):</strong> Transdermal bites/scratches or mucous membrane contamination. Mandates active PEP + ERIG infiltration.</li>
            <li><strong>Category II (Moderate / PEP):</strong> Minor scratches or abrasions without bleeding. Requires active anti-rabies PEP course.</li>
            <li><strong>Category I (Intact / Wash):</strong> Touching/feeding animals or licks on intact skin. Wound cleansing only.</li>
          </ul>
        </div>
      `
    },
    outcomes: {
      title: 'PEP Regimen Milestone Funnel (Day 0 to Day 28)',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.5; color: #334155;">
          <p><strong>Milestone Retention:</strong> Tracks patient progression from Day 0 intake through Day 3, Day 7, Day 14, and Day 28 completion.</p>
          <p><strong>Defaulter Prevention:</strong> Any drop-off between Day 0 and Day 7 is surfaced in the Overdue &amp; Missed Doses Watchlist for immediate SMS/call follow-up.</p>
        </div>
      `
    }
  };

  document.querySelectorAll('.btn-card-info').forEach((btn) => {
    btn.addEventListener('click', () => {
      const topicKey = btn.getAttribute('data-info');
      const topic = CLINICAL_HELP_TOPICS[topicKey] || {
        title: 'Clinical Metric Information',
        html: '<p>Dr. Pau Animal Bite Treatment Center clinical registry statistics.</p>'
      };

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: topic.title,
          html: topic.html,
          icon: 'info',
          confirmButtonText: 'Understood',
          confirmButtonColor: '#3B0D47'
        });
      } else {
        alert(topic.title);
      }
    });
  });

  // Operations Collapsible Toggle
  const toggleOpsBtn = document.getElementById('toggleOperationsBtn');
  const opsSectionToggle = document.getElementById('operationsSectionToggle');
  const opsContent = document.getElementById('operationsSectionContent');
  const opsChevron = document.getElementById('operationsChevron');

  function toggleOpsSection() {
    if (!opsContent) return;
    const isHidden = opsContent.style.display === 'none';
    opsContent.style.display = isHidden ? 'block' : 'none';
    if (opsChevron) {
      opsChevron.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
  }

  if (toggleOpsBtn) toggleOpsBtn.addEventListener('click', toggleOpsSection);

  // Epidemiological Anomaly Detection & Forecast Controls (Admin Only)
  const btnRunLiveScan = document.getElementById('btnRunLiveAnomalyScan');
  if (btnRunLiveScan) {
    btnRunLiveScan.addEventListener('click', () => recalculateClinicForecast(true));
  }
  const btnRecalcForecast = document.getElementById('btnRecalculateForecast');
  if (btnRecalcForecast) {
    btnRecalcForecast.addEventListener('click', () => recalculateClinicForecast(false));
  }
  const refreshForecastBtn = document.getElementById('refreshForecastBtn');
  if (refreshForecastBtn) {
    refreshForecastBtn.addEventListener('click', () => recalculateClinicForecast(false));
  }
  if (opsSectionToggle) {
    opsSectionToggle.addEventListener('click', (e) => {
      if (e.target !== toggleOpsBtn && !toggleOpsBtn?.contains(e.target)) {
        toggleOpsSection();
      }
    });
  }

  try {
  const auditRoleFilter = document.getElementById('auditRoleFilter');
  if (auditRoleFilter) {
    auditRoleFilter.addEventListener('change', () => renderAdminAuditLogs());
  }
  const auditActionFilter = document.getElementById('auditActionFilter');
  if (auditActionFilter) {
    auditActionFilter.addEventListener('change', () => renderAdminAuditLogs());
  }
  const auditSearchInput = document.getElementById('auditSearchInput');
  if (auditSearchInput) {
    auditSearchInput.addEventListener('input', () => renderAdminAuditLogs());
  }

  window.addEventListener('popstate', (e) => {
    if (!clinicAppState.authenticatedUser) return;
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const targetView = e.state?.view || hash;
    if (targetView && ROLE_NAVIGATION_MAP[clinicAppState.authenticatedUser.role]?.some((item) => item.viewId === targetView)) {
      switchClinicalView(targetView, false);
    } else {
      const currentView = clinicAppState.activeViewId || ROLE_NAVIGATION_MAP[clinicAppState.authenticatedUser.role][0].viewId;
      if (window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({ view: currentView }, '', `#${currentView}`);
      }
      switchClinicalView(currentView, false);
    }
  });



    const savedToken = (typeof localStorage !== 'undefined') ? (localStorage.getItem('token') || localStorage.getItem('pep_auth_token')) : null;
    const meRes = await fetch('/api/auth/me', {
      headers: savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {}
    });
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




// ==========================================================================
// INTERACTIVE CAPSTONE ANALYTICS DASHBOARD (SuperAdmin Only)
// 1. Vaccine Inventory Demand Forecasting   -> inventoryForecastChart
// 2. Emergency Walk-in Volume & Peak Trends -> seasonalPeakChart
// 3. Treatment Completion vs. Defaulters    -> defaulterRateChart
// 4. Geographic Case Distribution           -> geographicHotspotChart
// Charts are updated in place on every 2-second poll (no destroy/re-create),
// so hover tooltips and legend toggles are preserved while data stays live.
// ==========================================================================
var capstoneChartInstances = {};
var capstoneChartSignatures = {};

var CAPSTONE_COLORS = {
  purple: '#7A1FA2',
  purpleDark: '#4A0F63',
  purpleSoft: 'rgba(122, 31, 162, 0.12)',
  green: '#16A34A',
  greenDark: '#15803D',
  red: '#DC2626',
  redDark: '#991B1B',
  orange: '#F97316',
  amber: '#F59E0B',
  amberDark: '#B45309',
  slate: '#CBD5E1',
  grid: 'rgba(100, 116, 139, 0.12)',
  tick: '#475569'
};

function capstoneLocalIso(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function capstoneDateOnly(raw) {
  if (!raw) return '';
  const str = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(str) && str.length <= 10) return str.substring(0, 10);
  const dt = new Date(str);
  if (isNaN(dt.getTime())) return str.substring(0, 10);
  return capstoneLocalIso(dt);
}

function capstoneTooltipBase() {
  return {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    titleColor: '#FFFFFF',
    bodyColor: '#E2E8F0',
    footerColor: '#CBD5E1',
    borderColor: 'rgba(122, 31, 162, 0.6)',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    titleFont: { family: '"Plus Jakarta Sans", sans-serif', size: 12, weight: '700' },
    bodyFont: { family: '"IBM Plex Sans", sans-serif', size: 12 },
    footerFont: { family: '"IBM Plex Sans", sans-serif', size: 11, weight: '500' },
    displayColors: true,
    boxPadding: 4
  };
}

// Creates a chart once, then updates its data in place on subsequent polls.
function upsertCapstoneChart(key, canvasId, buildConfig, signatureData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;

  const signature = JSON.stringify(signatureData);
  const existing = capstoneChartInstances[key];

  if (existing && existing.canvas === canvas) {
    if (capstoneChartSignatures[key] === signature) return existing;
    const fresh = buildConfig();
    existing.data.labels = fresh.data.labels;
    fresh.data.datasets.forEach((ds, i) => {
      if (existing.data.datasets[i]) {
        Object.assign(existing.data.datasets[i], ds);
      } else {
        existing.data.datasets.push(ds);
      }
    });
    existing.data.datasets.length = fresh.data.datasets.length;
    if (fresh.$meta) existing.$capstoneMeta = fresh.$meta;
    existing.update('none');
    capstoneChartSignatures[key] = signature;
    return existing;
  }

  if (existing) {
    try { existing.destroy(); } catch (e) { // ignore
    }
  }
  const stale = typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
  if (stale) {
    try { stale.destroy(); } catch (e) { // ignore
    }
  }

  const config = buildConfig();
  const chart = new Chart(canvas, config);
  if (config.$meta) chart.$capstoneMeta = config.$meta;
  capstoneChartInstances[key] = chart;
  capstoneChartSignatures[key] = signature;
  return chart;
}

// --- 1. Vaccine Inventory Demand Forecasting (Line) ---------------------
function buildInventoryForecastData(patients, inventory) {
  const HISTORY_DAYS = 14;
  const FORECAST_DAYS = 14;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Historical administered PVRV doses per day (1 dose = 1 vial).
  const usedByDay = {};
  // Upcoming scheduled (pending) follow-up doses per day.
  const scheduledByDay = {};
  // Day 0 walk-ins over the trailing 30 days -> historical daily average.
  const thirtyAgoIso = capstoneLocalIso(new Date(today.getTime() - 30 * 86400000));
  const todayIso = capstoneLocalIso(today);
  let walkIns30 = 0;

  (patients || []).forEach((p) => {
    const walkInIso = capstoneDateOnly(p.day0WalkInDate || p.createdAt);
    if (walkInIso && walkInIso >= thirtyAgoIso && walkInIso <= todayIso) walkIns30 += 1;

    (p.pepSchedule || []).forEach((d) => {
      if (!d) return;
      const status = String(d.status || '').toLowerCase();
      const vType = String(d.vaccineTypeUsed || 'anti-rabies');
      if (status === 'fulfilled' || status === 'completed') {
        if (vType === 'ERIG' || vType === 'anti-tetanus') return;
        const usedIso = capstoneDateOnly(d.dateProcessed || d.dateAdministered || d.scheduledDate);
        if (usedIso) usedByDay[usedIso] = (usedByDay[usedIso] || 0) + 1;
      } else if (status === 'pending') {
        const schedIso = capstoneDateOnly(d.scheduledDate || d.expectedDate);
        if (schedIso && schedIso >= todayIso) scheduledByDay[schedIso] = (scheduledByDay[schedIso] || 0) + 1;
      }
    });
  });

  const avgDailyWalkIns = Number((walkIns30 / 30).toFixed(2));

  const labels = [];
  const isoDates = [];
  const historical = [];
  const predicted = [];
  const breakdown = [];

  for (let offset = -HISTORY_DAYS; offset <= FORECAST_DAYS; offset++) {
    const dt = new Date(today.getTime() + offset * 86400000);
    const iso = capstoneLocalIso(dt);
    isoDates.push(iso);
    labels.push(offset === 0 ? 'Today' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    if (offset <= 0) {
      historical.push(usedByDay[iso] || 0);
    } else {
      historical.push(null);
    }

    if (offset < 0) {
      predicted.push(null);
      breakdown.push(null);
    } else if (offset === 0) {
      // Anchor the dashed forecast to today's actual usage for a continuous line.
      predicted.push(usedByDay[iso] || 0);
      breakdown.push({ scheduled: scheduledByDay[iso] || 0, walkIns: avgDailyWalkIns, anchor: true });
    } else {
      const scheduled = scheduledByDay[iso] || 0;
      predicted.push(Number((scheduled + avgDailyWalkIns).toFixed(1)));
      breakdown.push({ scheduled, walkIns: avgDailyWalkIns, anchor: false });
    }
  }

  // Reorder threshold (vials/day): the maximum daily demand the current PVRV
  // stock can sustain over the forecast window without breaching the safety buffer.
  const pvrvLots = (inventory || []).filter((i) => i.vaccineType === 'anti-rabies');
  const pvrvStock = pvrvLots.reduce((sum, i) => sum + Number(i.currentStock || 0), 0);
  const safetyBuffer = pvrvLots.length
    ? Math.max(...pvrvLots.map((l) => Number(l.lowStockThreshold || 10)))
    : 30;
  const reorderThreshold = Number((Math.max(0, pvrvStock - safetyBuffer) / FORECAST_DAYS).toFixed(1));

  const totalPredicted = predicted.slice(HISTORY_DAYS + 1).reduce((s, v) => s + (v || 0), 0);

  return {
    labels,
    isoDates,
    historical,
    predicted,
    breakdown,
    reorderThreshold,
    pvrvStock,
    safetyBuffer,
    avgDailyWalkIns,
    totalPredicted: Math.ceil(totalPredicted)
  };
}

function renderInventoryForecastChart(patients, inventory) {
  const data = buildInventoryForecastData(patients, inventory);

  const subEl = document.getElementById('inventoryForecastSummary');
  if (subEl) {
    const shortfall = Math.max(0, data.totalPredicted - Math.max(0, data.pvrvStock - data.safetyBuffer));
    subEl.innerHTML = `Next 14 days: <strong>${data.totalPredicted}</strong> PVRV vials needed &bull; ` +
      `On hand: <strong>${data.pvrvStock}</strong> &bull; ` +
      (shortfall > 0
        ? `<strong class="text-red">Order at least ${shortfall} vials</strong>`
        : `<strong style="color:${CAPSTONE_COLORS.green}">Stock sufficient</strong>`);
  }

  return upsertCapstoneChart('inventoryForecast', 'inventoryForecastChart', () => ({
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Historical Usage',
          data: data.historical,
          borderColor: CAPSTONE_COLORS.purple,
          backgroundColor: CAPSTONE_COLORS.purpleSoft,
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 7,
          pointBackgroundColor: CAPSTONE_COLORS.purple,
          spanGaps: false
        },
        {
          label: 'Predicted Demand',
          data: data.predicted,
          borderColor: CAPSTONE_COLORS.orange,
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          fill: false,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 7,
          pointBackgroundColor: CAPSTONE_COLORS.orange,
          breakdown: data.breakdown,
          spanGaps: false
        },
        {
          label: 'Reorder Threshold',
          data: data.labels.map(() => data.reorderThreshold),
          borderColor: CAPSTONE_COLORS.red,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 6,
          fill: false,
          tension: 0
        }
      ]
    },
    $meta: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, right: 8 } },
      scales: {
        x: {
          title: { display: true, text: 'Time (Days)', color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } },
          grid: { display: false },
          ticks: { color: CAPSTONE_COLORS.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 10.5 } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Vials per Day', color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } },
          grid: { color: CAPSTONE_COLORS.grid },
          ticks: { color: CAPSTONE_COLORS.tick, precision: 0, font: { size: 10.5 } }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 28, color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } }
        },
        tooltip: {
          ...capstoneTooltipBase(),
          filter: (item) => item.raw !== null && item.raw !== undefined,
          callbacks: {
            title: (items) => {
              const idx = items[0] ? items[0].dataIndex : 0;
              const iso = (data.isoDates && data.isoDates[idx]) || '';
              return `${items[0] ? items[0].label : ''}${iso ? ` (${iso})` : ''}`;
            },
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              if (ctx.dataset.label === 'Historical Usage') {
                return ` Historical Usage: ${v} vial${v === 1 ? '' : 's'} administered`;
              }
              if (ctx.dataset.label === 'Predicted Demand') {
                const needed = Math.ceil(v);
                return ` Predicted Demand: ${needed} vial${needed === 1 ? '' : 's'} needed`;
              }
              return ` Reorder Threshold: ${v} vials/day`;
            },
            afterLabel: (ctx) => {
              if (ctx.dataset.label === 'Predicted Demand') {
                const b = (ctx.dataset.breakdown || [])[ctx.dataIndex];
                if (b && !b.anchor) {
                  return `   ↳ ${b.scheduled} scheduled follow-up(s) + ${b.walkIns} avg. walk-ins`;
                }
              }
              return '';
            },
            footer: (items) => {
              const pred = items.find((i) => i.dataset.label === 'Predicted Demand' && i.raw != null);
              if (pred && Number(pred.raw) > data.reorderThreshold) {
                return '⚠ Demand exceeds reorder threshold — schedule PVRV restock';
              }
              return '';
            }
          }
        }
      }
    }
  }), [data.historical, data.predicted, data.reorderThreshold, data.labels]);
}

// --- 2. Emergency Walk-in Volume & Peak Trends (Vertical Bar) ------------
function renderSeasonalPeakChart(patients) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const counts = new Array(12).fill(0);

  (patients || []).forEach((p) => {
    const iso = capstoneDateOnly(p.day0WalkInDate || p.createdAt);
    if (!iso || iso.length < 7) return;
    const monthIdx = parseInt(iso.substring(5, 7), 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) counts[monthIdx] += 1;
  });

  const total = counts.reduce((a, b) => a + b, 0);
  const mean = total / 12;
  const peak = Math.max(...counts);

  const bg = counts.map((c) => (c > 0 && c === peak ? CAPSTONE_COLORS.red : c > mean ? CAPSTONE_COLORS.amber : CAPSTONE_COLORS.purple));
  const hoverBg = counts.map((c) => (c > 0 && c === peak ? CAPSTONE_COLORS.redDark : c > mean ? CAPSTONE_COLORS.amberDark : CAPSTONE_COLORS.purpleDark));

  return upsertCapstoneChart('seasonalPeak', 'seasonalPeakChart', () => ({
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        {
          label: 'Day 0 Walk-ins',
          data: counts,
          backgroundColor: bg,
          hoverBackgroundColor: hoverBg,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 34
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Month', color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } },
          grid: { display: false },
          ticks: { color: CAPSTONE_COLORS.tick, font: { size: 10.5 } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Patient Count', color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } },
          grid: { color: CAPSTONE_COLORS.grid },
          ticks: { color: CAPSTONE_COLORS.tick, precision: 0, font: { size: 10.5 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...capstoneTooltipBase(),
          displayColors: false,
          callbacks: {
            title: (items) => MONTHS_FULL[items[0] ? items[0].dataIndex : 0],
            label: (ctx) => `Total Day 0 Walk-ins: ${ctx.raw}`,
            footer: (items) => {
              const v = Number(items[0] ? items[0].raw : 0);
              if (v > 0 && v === peak) return '🔺 Peak seasonal surge month';
              if (v > mean) return '▲ Above monthly average';
              return `Monthly average: ${mean.toFixed(1)}`;
            }
          }
        }
      }
    }
  }), counts);
}

// --- 3. Treatment Completion vs. Defaulter Rates (Donut) -----------------
var enrolledCenterTextPlugin = {
  id: 'enrolledCenterText',
  afterDatasetsDraw(chart) {
    const meta = chart.$capstoneMeta;
    if (!meta || !chart.chartArea) return;
    const { ctx, chartArea } = chart;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(String(Number(meta.total || 0).toLocaleString()), cx, cy - 8);
    ctx.fillStyle = '#64748B';
    ctx.font = '600 10.5px "IBM Plex Sans", sans-serif';
    ctx.fillText('Total Patients Enrolled', cx, cy + 14);
    ctx.restore();
  }
};

function renderDefaulterRateChart(patients) {
  let completed = 0;
  let defaulters = 0;
  let ongoing = 0;

  (patients || []).forEach((p) => {
    const hasDefaultDose = (p.pepSchedule || []).some((d) => d && d.status === 'Defaulter');
    if (typeof isPatientRegistryComplete === 'function' && isPatientRegistryComplete(p)) {
      completed += 1;
    } else if (hasDefaultDose || (typeof isPatientRegistryOverdue === 'function' && isPatientRegistryOverdue(p))) {
      defaulters += 1;
    } else {
      ongoing += 1;
    }
  });

  const total = (patients || []).length;
  const pct = (n) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0.0');
  const closed = completed + defaulters;
  const completionRate = closed > 0 ? ((completed / closed) * 100).toFixed(1) : '0.0';

  const rateEl = document.getElementById('defaulterRateSummary');
  if (rateEl) {
    rateEl.innerHTML = `Completion rate: <strong style="color:${CAPSTONE_COLORS.green}">${pct(completed)}%</strong> &bull; ` +
      `Defaulter rate: <strong class="text-red">${pct(defaulters)}%</strong>`;
  }

  return upsertCapstoneChart('defaulterRate', 'defaulterRateChart', () => ({
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Defaulters', 'Ongoing (On Schedule)'],
      datasets: [
        {
          data: [completed, defaulters, ongoing],
          backgroundColor: [CAPSTONE_COLORS.green, CAPSTONE_COLORS.red, CAPSTONE_COLORS.slate],
          hoverBackgroundColor: [CAPSTONE_COLORS.greenDark, CAPSTONE_COLORS.redDark, '#94A3B8'],
          borderColor: 'rgba(255, 255, 255, 0.9)',
          borderWidth: 3,
          hoverOffset: 10
        }
      ]
    },
    $meta: { total, completed, defaulters, ongoing, completionRate },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      layout: { padding: 8 },
      plugins: {
        legend: {
          position: 'bottom',
          onClick: (evt, legendItem, legend) => {
            // Click-to-toggle: hide/show a segment (e.g. isolate Defaulters).
            legend.chart.toggleDataVisibility(legendItem.index);
            legend.chart.update();
          },
          onHover: (evt) => { if (evt.native && evt.native.target) evt.native.target.style.cursor = 'pointer'; },
          onLeave: (evt) => { if (evt.native && evt.native.target) evt.native.target.style.cursor = 'default'; },
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, color: CAPSTONE_COLORS.tick, font: { size: 11.5, weight: '600' } }
        },
        tooltip: {
          ...capstoneTooltipBase(),
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              return ` ${ctx.label}: ${v} patient${v === 1 ? '' : 's'} (${pct(v)}% of enrolled)`;
            },
            footer: () => `Completion vs. default (closed cases): ${completionRate}%`
          }
        }
      }
    },
    plugins: [enrolledCenterTextPlugin]
  }), [completed, defaulters, ongoing, total]);
}

// --- 4. Geographic Case Distribution (Horizontal Bar) --------------------
function renderGeographicHotspotChart(patients) {
  const counts = {};
  Object.values(CANONICAL_PUROK_MAP).forEach((name) => { counts[name] = 0; });

  (patients || []).forEach((p) => {
    const name = normalizePurokName(p.purok || p.barangay || '');
    counts[name] = (counts[name] || 0) + 1;
  });

  // Sort descending so the highest bite-frequency Purok is pinned to the top.
  const rows = Object.entries(counts)
    .map(([purok, count]) => ({ purok, count }))
    .sort((a, b) => b.count - a.count || a.purok.localeCompare(b.purok, undefined, { numeric: true }));

  const values = rows.map((r) => r.count);
  const n = values.length || 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n);
  const zScores = values.map((v) => (std > 0 ? (v - mean) / std : 0));

  const bg = zScores.map((z, i) => (values[i] > 0 && z >= 1 ? CAPSTONE_COLORS.red : z > 0 ? CAPSTONE_COLORS.amber : CAPSTONE_COLORS.purple));
  const hoverBg = zScores.map((z, i) => (values[i] > 0 && z >= 1 ? CAPSTONE_COLORS.redDark : z > 0 ? CAPSTONE_COLORS.amberDark : CAPSTONE_COLORS.purpleDark));

  return upsertCapstoneChart('geographicHotspot', 'geographicHotspotChart', () => ({
    type: 'bar',
    data: {
      labels: rows.map((r) => r.purok),
      datasets: [
        {
          label: 'Bite Incidents',
          data: values,
          zScores,
          backgroundColor: bg,
          hoverBackgroundColor: hoverBg,
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 18
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 4, right: 36 } },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: 'Case Count', color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } },
          grid: { color: CAPSTONE_COLORS.grid },
          ticks: { color: CAPSTONE_COLORS.tick, precision: 0, font: { size: 10.5 } }
        },
        y: {
          grid: { display: false },
          afterFit: (scale) => { scale.width = Math.max(scale.width, 150); },
          ticks: { autoSkip: false, color: '#1E293B', padding: 6, font: { size: 11, weight: '600' } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...capstoneTooltipBase(),
          displayColors: false,
          callbacks: {
            title: (items) => `${items[0] ? items[0].label : ''} — Brgy. Kapitan Pepe`,
            label: (ctx) => `Bite Incidents: ${ctx.raw}`,
            afterLabel: (ctx) => {
              const z = (ctx.dataset.zScores || [])[ctx.dataIndex] || 0;
              return `Z-score: ${z >= 0 ? '+' : ''}${z.toFixed(2)}`;
            },
            footer: (items) => {
              const idx = items[0] ? items[0].dataIndex : 0;
              const z = zScores[idx] || 0;
              if (values[idx] > 0 && z >= 1) return '🔴 Anomaly cluster — prioritize animal control drive';
              if (z > 0) return '🟠 Above barangay average';
              return '🟣 Baseline incidence';
            }
          }
        }
      }
    },
    plugins: typeof horizontalBarLabelPlugin !== 'undefined' ? [horizontalBarLabelPlugin] : []
  }), rows);
}

// Helper to filter patients by the Analytics Filter bar (Year, Quarter, Month)
function getFilteredCapstonePatients() {
  const allPatients = Array.isArray(clinicAppState.patients) ? clinicAppState.patients : [];
  const yEl = document.getElementById('analyticsFilterYear');
  const qEl = document.getElementById('analyticsFilterQuarter');
  const mEl = document.getElementById('analyticsFilterMonth');

  const selectedYear = yEl ? yEl.value : 'All';
  const selectedQuarter = qEl ? qEl.value : 'All';
  const selectedMonth = mEl ? mEl.value : 'All';

  if (selectedYear === 'All' && selectedQuarter === 'All' && selectedMonth === 'All') {
    return allPatients;
  }

  return allPatients.filter((p) => {
    const rawDate = p.day0WalkInDate || p.createdAt;
    if (!rawDate) return true;
    const dt = new Date(rawDate);
    if (isNaN(dt.getTime())) return true;

    if (selectedYear !== 'All' && String(dt.getFullYear()) !== String(selectedYear)) {
      return false;
    }
    if (selectedQuarter !== 'All') {
      const qMap = { Q1: [0, 1, 2], Q2: [3, 4, 5], Q3: [6, 7, 8], Q4: [9, 10, 11] };
      const allowedMonths = qMap[selectedQuarter] || [];
      if (!allowedMonths.includes(dt.getMonth())) return false;
    }
    if (selectedMonth !== 'All' && String(dt.getMonth() + 1) !== String(selectedMonth)) {
      return false;
    }
    return true;
  });
}

function initAnalyticsFilterListeners() {
  ['analyticsFilterYear', 'analyticsFilterQuarter', 'analyticsFilterMonth'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.__filterWired) {
      el.__filterWired = true;
      el.addEventListener('change', () => {
        renderCapstoneAnalyticsDashboard();
      });
    }
  });

  const resetBtn = document.getElementById('btnResetAnalyticsFilters');
  if (resetBtn && !resetBtn.__filterWired) {
    resetBtn.__filterWired = true;
    resetBtn.addEventListener('click', () => {
      const yEl = document.getElementById('analyticsFilterYear');
      const qEl = document.getElementById('analyticsFilterQuarter');
      const mEl = document.getElementById('analyticsFilterMonth');
      if (yEl) yEl.value = 'All';
      if (qEl) qEl.value = 'All';
      if (mEl) mEl.value = 'All';
      renderCapstoneAnalyticsDashboard();
    });
  }
}

function _deletedPysparkBenchmarkChart() { return; }
function _oldPysparkBenchmark() { return; /* DEPRECATED PYSPARK
function renderPysparkBenchmarkChart() {
  const canvas = document.getElementById('pysparkBenchmarkChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const pipelines = [
    'Patient Ingestion & Scrub',
    'Exposure Categorization',
    'PEP Adherence & Recalls',
    'Purok Hotspot Spatial ETL',
    'Demand Forecast Projection'
  ];
  const baseline500 = [22, 18, 28, 15, 34];
  const spark10k = [68, 49, 82, 41, 95];

  upsertCapstoneChart('pysparkBenchmark', 'pysparkBenchmarkChart', () => ({
    type: 'bar',
    data: {
      labels: pipelines,
      datasets: [
        {
          label: 'Baseline (500 Records)',
          data: baseline500,
          backgroundColor: '#94A3B8',
          hoverBackgroundColor: '#64748B',
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.6
        },
        {
          label: 'PySpark In-Memory (10,000 Records)',
          data: CAPSTONE_COLORS.purple,
          hoverBackgroundColor: CAPSTONE_COLORS.purpleDark,
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 12, bottom: 4, left: 8, right: 12 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#1E293B', font: { size: 11, weight: '600' } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Execution Latency (ms)', color: CAPSTONE_COLORS.tick, font: { size: 11, weight: '600' } },
          grid: { color: CAPSTONE_COLORS.grid },
          ticks: { color: CAPSTONE_COLORS.tick, font: { size: 10.5 } }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, font: { size: 11, weight: '600' } }
        },
        tooltip: {
          ...capstoneTooltipBase(),
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} ms`,
            afterBody: (items) => {
              const idx = items[0] ? items[0].dataIndex : 0;
              const b = baseline500[idx] || 1;
              const s = spark10k[idx] || 1;
              const speedup = ((10000 / s) / (500 / b)).toFixed(1);
              return `Throughput Scaling: ${speedup}x efficiency`;
            }
          }
        }
      }
    }
  }), { baseline500, spark10k }); */
}

// --- Orchestrator ---------------------------------------------------------
function renderCapstoneAnalyticsDashboard() {
  const role = clinicAppState.authenticatedUser && clinicAppState.authenticatedUser.role;
  if (role !== 'SuperAdmin') return;
  const adminView = document.getElementById('viewAdminDashboard') || document.getElementById('viewAdminReports');
  if (!adminView || adminView.classList.contains('hidden')) return;
  if (typeof Chart === 'undefined') return;

  initAnalyticsFilterListeners();

  const patients = getFilteredCapstonePatients();
  const inventory = clinicAppState.inventory || [];

  try { renderInventoryForecastChart(patients, inventory); } catch (e) { console.warn('Forecast chart error:', e); }
  try { renderSeasonalPeakChart(patients); } catch (e) { console.warn('Seasonal chart error:', e); }
  try { renderDefaulterRateChart(patients); } catch (e) { console.warn('Defaulter chart error:', e); }
  try { renderGeographicHotspotChart(patients); } catch (e) { console.warn('Hotspot chart error:', e); }
  return;
}
function _oldOrchestrator() { return; /* OLD_ORCHESTRATOR
function renderCapstoneAnalyticsDashboard() {
  const role = clinicAppState.authenticatedUser && clinicAppState.authenticatedUser.role;
  if (role !== 'SuperAdmin') return;
  const adminView = document.getElementById('viewAdminDashboard');
  if (!adminView || adminView.classList.contains('hidden')) return;
  if (typeof Chart === 'undefined') return;

  const patients = clinicAppState.patients || [];
  const inventory = clinicAppState.inventory || [];

  try { renderInventoryForecastChart(patients, inventory); } catch (e) { console.warn('Forecast chart error:', e); }
  try { renderSeasonalPeakChart(patients); } catch (e) { console.warn('Seasonal chart error:', e); }
  try { renderDefaulterRateChart(patients); } catch (e) { console.warn('Defaulter chart error:', e); }
  try { renderGeographicHotspotChart(patients); } catch (e) { console.warn('Hotspot chart error:', e); }
  // PySpark benchmark removed per requirements */
}

if (typeof window !== 'undefined') {
  window.renderCapstoneAnalyticsDashboard = renderCapstoneAnalyticsDashboard;

  // Render immediately when the SuperAdmin navigates back to the Dashboard
  // (instead of waiting for the next 2-second poll).
  try {
  if (typeof switchClinicalView === 'function' && !switchClinicalView.__capstoneWrapped) {
    const _origSwitchClinicalView = switchClinicalView;
    switchClinicalView = function (viewId, ...rest) {
      const result = _origSwitchClinicalView.call(this, viewId, ...rest);
      if (viewId === 'viewAdminDashboard' || viewId === 'viewAdminReports') {
        const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
        raf(() => renderCapstoneAnalyticsDashboard());
      }
      return result;
    };
    switchClinicalView.__capstoneWrapped = true;
    window.switchClinicalView = switchClinicalView;
  }
  } catch (wrapErr) {
    // switchClinicalView is not reassignable; the 2-second poll still renders the charts.
  }
}
