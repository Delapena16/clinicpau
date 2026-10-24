# Project: Dr. Pau ABTC Clinic Overview Command Center Overhaul

## Architecture
The Dr. Pau ABTC application is an Express.js and Vanilla JS Single Page Application (SPA) providing electronic medical record (EMR), post-exposure prophylaxis (PEP) tracking, inventory management, and epidemiological surveillance for rabies bite exposures.

- **Backend**:
  - `server.js`: Express HTTP server, routes, session management, static asset serving.
  - `controllers/adminController.js`: Executive dashboard summary (`/api/dashboard/summary`), audit logs, patient registry, inventory summaries.
  - `controllers/receptionistController.js`: Patient intake, schedule calculation (`calculatePepSchedule`), queue management.
  - `controllers/physicianController.js`: Clinical triage, wound categorization, dose administration.
  - `models/Patient.js`: Patient document schema (demographics, exposure, wound category, clinical status, PEP schedule).
  - `models/Inventory.js`: Vaccine inventory schema (anti-rabies, anti-tetanus, ERIG lots, stock, thresholds, expiration).
  - `config/inMemoryStore.js`: Resilient in-memory fallback store when remote DB is offline.
- **Frontend**:
  - `public/index.html`: Responsive clinical dashboard layout with 181 unique element IDs (131 queried by `app.js`).
  - `public/js/app.js`: Client state (`clinicAppState`), chart rendering (Chart.js), filter event handlers, API communication.
  - `public/css/styles.css`: CSS grid/flexbox clinical layout, theme, card styles, and responsive breakpoints.
- **Data Flow**:
  - Live patient records and vaccine inventory stored in MongoDB / in-memory store.
  - `GET /api/dashboard/summary` aggregates real-time operational metrics and returns live data to `app.js`.
  - `app.js` stores records in `clinicAppState.patients` and `clinicAppState.inventory`.
  - Filter changes in topbar trigger dynamic in-memory filtering across all charts, tables, and KPI cards without console errors.

## Code Layout
- `server.js`: Entry point, server setup, API route registration
- `controllers/adminController.js`: Dashboard summary API, inventory and patient aggregation
- `controllers/receptionistController.js`: Intake, PEP schedule creation
- `controllers/physicianController.js`: Triage, dose administration
- `models/Patient.js`: Patient schema, enum definitions
- `models/Inventory.js`: Vaccine inventory schema
- `config/inMemoryStore.js`: In-memory data store with authentic seed data
- `public/index.html`: Dashboard markup, topbar filters, triage widgets, charts
- `public/js/app.js`: Client application logic, chart rendering, filter synchronization
- `public/css/styles.css`: Dashboard styling, chart padding, responsive grid
- `scripts/verify_system.js`: Automated system verification suite
- `scripts/test_interactive_ui.js`: DOM binding audit and interactive VM execution audit

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Live Triage Queue Visibility | Display waiting patients queue for doctor triage on Clinic Overview | M2 | R1 |
| F2 | Booster Doses Due Today Breakdown | Real-time tracking of patients due today split by Day 0, 3, 7, 14, 28 | M1, M2 | R1 |
| F3 | Actionable Defaulter Alerts & List | Critical alerts and actionable list of missed/overdue doses for clinical recall | M1, M2 | R1 |
| F4 | Authentic Regimen Progression Funnel | Rewire doseFunnelChart to plot authentic milestone completion (Day 0-28) from schedules | M1, M2 | R1 |
| F5 | Fix Active Patients Metric | Decouple activePatients from patientsDueToday in adminController | M1 | R1 |
| F6 | WHO Wound Category Surveillance | Standardize Category I, II, III, and Pending Physician Assessment with clinical descriptors | M2, M3 | R2 |
| F7 | Authentic Rabies Vector Surveillance | Exclusively track Domestic Dog, Stray Dog, Domestic Cat, Stray Cat; fix substring filter bug; remove 'Other' | M1, M3 | R2 |
| F8 | Purok Community Outbreak Hotspots | Group bite cases by Purok to monitor local canine outbreaks | M3 | R2 |
| F9 | Live Vaccine Stock Runway | Calculate PVRV, Anti-Tetanus, and ERIG runway days strictly from live consumption rates | M1, M2 | R3 |
| F10 | Critical Restock Threshold Warnings | Prominent restock alerts when batches breach safety thresholds | M1, M2 | R3 |
| F11 | Approaching Expiration Early Warnings | Proactive FEFO alerts for lots expiring within 30-60 days | M1, M2 | R3 |
| F12 | Eliminate Horizontal Bar Chart Clipping | Fix left padding and CSS column widths on purokChart, biteSeverityChart, doseFunnelChart | M3 | R4 |
| F13 | Responsive Topbar Multi-Filtering | Synchronize Year, Month, Animal, Status, Age, Sex across charts, KPIs, and tables | M3 | R4 |
| F14 | Pure Live Data & Zero Synthetic Fallbacks | Remove hardcoded dummy arrays, static YoY pills, and pre-seeded heatmap matrix counts | M1, M2, M3 | AC1 |
| F15 | DOM ID Preservation & Functional Wiring | Ensure all 131 getElementById DOM IDs in app.js remain intact and functional | M2, M3 | AC2 |
| F16 | Automated E2E Test Suite | 4-tier requirement-driven test suite passing 100% with verify_system.js | M4 | AC3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend APIs, Models & Live Aggregation | Fix adminController.js, models, authentic burn rates, activePatients, vector enums, defaulter endpoints | none | DONE (Verified: 212/212 E2E, 8/8 UI, Audit CLEAN) |
| M2 | Operational Clinical Workflow & Inventory UI | Triage queue, due today breakdown, actionable defaulters, restock alerts, regimen funnel | M1 | PLANNED |
| M3 | Surveillance, Vector Filtering & Visual Polishing | Fix vector substring bug, prune 'Other', fix chart clipping, zero synthetic fallbacks, dynamic multi-filtering | M2 | PLANNED |
| M4 | Dual-Track E2E Test Pass & Coverage Hardening | Run full 4-tier E2E test suite, adversarial tests, verify_system.js, forensic integrity audit | M3 | PLANNED |

## Interface Contracts
### Client ↔ Server: `GET /api/dashboard/summary`
- **Request**: Query parameters optional: `{ year, month, animalType, status, ageGroup, sex }`
- **Response**:
  ```json
  {
    "activePatients": 12,
    "patientsDueToday": 5,
    "dueTodayBreakdown": { "day0": 1, "day3": 2, "day7": 1, "day14": 1, "day28": 0 },
    "missedDoses": 3,
    "defaulters": [
      {
        "id": "PEP-2026-005",
        "name": "Maria Santos",
        "phone": "09171234567",
        "missedDose": "Day 7",
        "dueDate": "2026-10-21",
        "daysOverdue": 3
      }
    ],
    "triageQueue": [
      {
        "id": "PEP-2026-020",
        "name": "Juan Dela Cruz",
        "animalType": "Stray Dog",
        "purok": "Purok 3",
        "arrivalTime": "2026-10-24T08:15:00Z"
      }
    ],
    "inventory": {
      "pvrv": { "stock": 120, "dailyConsumption": 4.2, "runwayDays": 28, "status": "Optimal" },
      "antiTetanus": { "stock": 45, "dailyConsumption": 1.5, "runwayDays": 30, "status": "Optimal" },
      "erig": { "stock": 8, "dailyConsumption": 0.8, "runwayDays": 10, "status": "Critical Restock" }
    },
    "expiringBatches": [
      { "vaccineType": "ERIG", "batchNumber": "ERIG-2026-A", "expirationDate": "2026-11-15", "daysUntilExpiry": 22 }
    ],
    "doseCompletion": [45, 38, 30, 22, 18],
    "purokOutbreaks": { "Purok 1": 12, "Purok 2": 18, "Purok 3": 25 },
    "woundCategories": { "Category I": 10, "Category II": 35, "Category III": 15, "Pending": 4 },
    "vectorDistribution": { "Domestic Dog": 30, "Stray Dog": 20, "Domestic Cat": 10, "Stray Cat": 4 }
  }
  ```

### Client-side Global Filter Contract: `handleGlobalFilterChange()`
- Triggered on change of `#globalFilterYear`, `#globalFilterMonth`, `#globalFilterAnimal`, `#globalFilterStatus`, `#globalFilterAge`, `#globalFilterSex`.
- Synchronously updates:
  1. `renderMasterDashboard()` (KPI cards: due today, missed doses, stock runway, active PEP).
  2. `renderMasterDashboardCharts()` (`purokChart`, `biteSeverityChart`, `doseFunnelChart`, `speciesDonutChart`, `monthlyTrendChart`, `seasonalHeatmapGrid`).
  3. Operational tables (Triage Queue, Defaulter List, Inventory Table).
  4. Zero console errors, zero NaN / undefined values.
