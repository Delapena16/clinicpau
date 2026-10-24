# Dr. Pau ABTC Clinical System Architecture & UI Invariants

## 1. Animal Bite Vector & Surveillance Invariants
- **Permitted Vectors**: Exclusively `['Domestic Dog', 'Stray Dog', 'Domestic Cat', 'Stray Cat']`.
- **Prohibited Placeholders**: Never introduce synthetic or non-vector species (Birds, Rabbits, Reptiles, Bats, or generic 'Other') in patient registration, seed stores, or analytics filters.
- **Wound Categorization**: Strictly conform to WHO & Philippine DOH guidelines:
  - `Category I`: Touching, feeding, licks on intact skin (Wound Cleansing Only; no PEP).
  - `Category II`: Minor scratches, abrasions without bleeding (Anti-Rabies Active PEP).
  - `Category III`: Transdermal bites, scratches, mucous membrane contamination (Active PEP + ERIG Infiltration).

## 2. Multi-Biologic Inventory & FEFO Protocol
- **Distinct Biologics**: Always track PVRV Anti-Rabies, Anti-Tetanus, and ERIG independently with their own burn rates and lot numbers.
- **Critical Thresholds**:
  - ERIG: Critical Restock Alert triggered when on-hand stock <= 10 vials.
  - PVRV: Critical Restock Alert triggered when on-hand stock <= 30 vials or runway <= 10 days.
- **FEFO Dispatch**: Display and sort lots expiring within 60 days in chronological First-Expiry First-Out order.

## 3. Chart.js & Visualization Standards
- **Padding Invariant**: All horizontal bar charts (`indexAxis: 'y'`) must include `layout: { padding: { left: 24, right: 30 } }` to eliminate Y-axis label clipping across all viewport resolutions.
- **Zero Synthetic Injections**: Heatmaps, funnels, and trend charts must initialize from pure zero baselines and derive counts strictly from live registry data.
