# Original User Request

## 2026-10-24T06:03:50Z

Overhaul, redesign, and accurately align the Dr. Pau ABTC Clinic Overview into a balanced clinical command center that combines real-time operational workflow tracking (patient queue, booster doses due today, missed dose alerts, vaccine runway) with authentic rabies epidemiological surveillance (WHO categories, animal vectors, purok hotspots).

Working directory: D:\PATIENT RECORD AND POST-EXPOSURE
Integrity mode: development

## Requirements

### R1. Operational Clinical Workflow & Defaulter Tracking
Transform the Clinic Overview into an immediate operational command center:
- Live visibility into patients waiting for physician triage.
- Real-time tracking of patients due today for Day 0, Day 3, Day 7, Day 14, and Day 28 booster doses.
- Prominent critical alerts and actionable lists for missed/overdue doses (defaulters) to ensure rapid clinical follow-up and prevent rabies mortality.
- Regimen progression and adherence tracking calculated strictly from actual clinic patient schedules.

### R2. WHO Wound Category & Vector Surveillance
Align all epidemiological charts strictly with clinical rabies guidelines and authentic patient records:
- WHO Wound Categories: Accurately display Category I (low risk / wash only), Category II (moderate risk / PEP vaccine), Category III (high risk / PEP vaccine + ERIG infiltration), and Pending Physician Assessment.
- Rabies Vector Distribution: Track exclusively authentic vectors (Domestic Dog, Stray Dog, Domestic Cat, Stray Cat) with zero placeholder species (no Birds, Rabbits, Reptiles, or Wild animals).
- Community Hotspots: Group patient volume by Purok to monitor local canine outbreaks and high-risk bite clusters across the barangay.

### R3. Vaccine Stock Health & Runway Monitoring
Ensure vaccine inventory health and restock forecasts are computed strictly from real clinic batches:
- Accurate PVRV, Anti-Tetanus, and ERIG vial counts and stock runway days based on live consumption rates.
- Clear restock warnings when batches approach critical safety thresholds.
- Early warning alerts for lots approaching expiration dates.

### R4. Intuitive Layout, Responsive Filtering & Data Accuracy
Modernize the dashboard visual layout and topbar controls:
- Layout optimized for fast clinic triage and clear readability without visual clutter.
- All horizontal bar charts and donut charts render with proper padding to eliminate Y-axis label clipping.
- Topbar filters (Year, Month, Animal Type, Status, Age Group, Sex) contain only authentic clinical options and dynamically filter all dashboard charts and tables in real time with zero errors.

## Acceptance Criteria

### Data Authenticity & Alignment
- [ ] Every graph, chart, and table derives its data exclusively from live database records (`clinicAppState.patients` and `clinicAppState.inventory`) with zero synthetic numbers or placeholder categories.
- [ ] No non-existent animals (e.g. Bird, Rabbit, Reptile) or irrelevant outcome categories exist in filters, charts, or legends.
- [ ] All horizontal bar charts (`purokChart`, `biteSeverityChart`, `doseFunnelChart`) display complete labels with zero text clipping.

### Operational Utility & Performance
- [ ] Top KPI cards provide immediate, accurate operational counts: Patients Due Today, Missed/Overdue Doses, Active PEP Patients, and PVRV Stock Runway.
- [ ] Filter changes synchronously update all charts and tables in memory without console errors.
- [ ] All 130+ DOM element IDs remain properly wired and functional.
- [ ] The automated test suite (`verify_system.js`) passes 100% of assertions with zero regressions.
