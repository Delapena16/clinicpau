# E2E Test Infra: Dr. Pau ABTC Clinic Overview

## Test Philosophy
- Opaque-box, requirement-driven, clinical integrity verified.
- Direct derivation from ORIGINAL_REQUEST.md with zero synthetic mock reliance.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Scenario) |
|---|---------|-------------|:----------------:|:-----------------:|:----------------------:|:-----------------:|
| F1 | Live Triage Queue | R1 | 5 tests | 5 tests | ✓ | S1, S2 |
| F2 | Booster Doses Due Today Breakdown | R1 | 5 tests | 5 tests | ✓ | S1, S3 |
| F3 | Actionable Defaulter Alerts & Recall | R1 | 5 tests | 5 tests | ✓ | S2, S4 |
| F4 | Authentic Regimen Progression Funnel | R1 | 5 tests | 5 tests | ✓ | S3 |
| F5 | Decoupled Active Patients Metric | R1 | 5 tests | 5 tests | ✓ | S1, S5 |
| F6 | WHO Wound Category Surveillance | R2 | 5 tests | 5 tests | ✓ | S2 |
| F7 | Authentic Rabies Vector Surveillance | R2 | 5 tests | 5 tests | ✓ | S4 |
| F8 | Purok Outbreak Cluster Surveillance | R2 | 5 tests | 5 tests | ✓ | S4, S5 |
| F9 | Live Vaccine Stock Runway Days | R3 | 5 tests | 5 tests | ✓ | S3, S5 |
| F10 | Critical Restock Threshold Warnings | R3 | 5 tests | 5 tests | ✓ | S3 |
| F11 | Approaching Expiration Early Warnings | R3 | 5 tests | 5 tests | ✓ | S3 |
| F12 | Zero Horizontal Bar Chart Clipping | R4 | 5 tests | 5 tests | ✓ | S1 |
| F13 | Responsive Topbar Multi-Filtering | R4 | 5 tests | 5 tests | ✓ | S4 |
| F14 | Pure Live Data (Zero Synthetic Numbers) | AC1 | 5 tests | 5 tests | ✓ | S1, S5 |
| F15 | DOM ID Preservation (131+ Functional) | AC2 | 5 tests | 5 tests | ✓ | S1 |
| F16 | Automated Regression Suite | AC3 | 5 tests | 5 tests | ✓ | S1-S5 |

## Test Architecture
- Test Runner: Node.js test script `scripts/e2e_test_suite.js` and `scripts/test_interactive_ui.js`.
- Invocations:
  - `node scripts/e2e_test_suite.js --tier=1` (Feature Coverage)
  - `node scripts/e2e_test_suite.js --tier=2` (Boundary & Edge Cases)
  - `node scripts/e2e_test_suite.js --tier=3` (Combinatorial Cross-Feature)
  - `node scripts/e2e_test_suite.js --tier=4` (Real-World Scenarios)
  - `node scripts/test_interactive_ui.js` (DOM Integrity & VM Interaction)
  - `node scripts/verify_system.js` (System Verification)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| S1 | Morning Clinic Rush Intake & Triage | F1, F2, F5, F14, F15, F16 | High |
| S2 | High-Risk Stray Dog Exposure (Cat III) | F1, F3, F6, F7, F10 | High |
| S3 | Defaulter Surge & Vaccine Restock Crisis | F2, F3, F4, F9, F10, F11 | High |
| S4 | Purok Canine Outbreak Epidemiological Investigation | F7, F8, F12, F13 | High |
| S5 | Multi-Year Rabies Eradication Program Review | F4, F5, F8, F9, F13, F14 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (Total: 80+ tests)
- Tier 2: ≥5 per feature (Total: 80+ tests)
- Tier 3: Pairwise coverage across filters, categories, and dose statuses (Total: 25+ tests)
- Tier 4: 5 comprehensive end-to-end clinical scenarios
- Total Target: 190+ test assertions
