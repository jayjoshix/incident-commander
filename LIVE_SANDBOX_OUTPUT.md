🔒 LineageLock — Live Analysis
   Target: https://sandbox.open-metadata.org
   ✅ Connected to OpenMetadata 1.12.5

Changed files:
   models/marts/fact_orders.sql
   models/staging/stg_orders.sql
   models/staging/stg_products.sql

📐 models/marts/fact_orders.sql → acme_nexus_analytics.ANALYTICS.MARTS.fact_orders
   ✅ Found | 10 columns
      Owner: admin
      Tier: Tier.Tier1
      Tags: DataSensitivity.Confidential, DataSensitivity.Highly Confidential, Tier.Tier1
      Sensitive: DataSensitivity.Confidential, DataSensitivity.Highly Confidential
      Lineage: 6 upstream, 4 downstream edges
      Downstream: 3 total (tables=3, dashboards=0, ML=0, pipelines=0)
      Test Suite: acme_nexus_analytics.ANALYTICS.MARTS.fact_orders.testSuite
      Score: 40/100 (MEDIUM)

📐 models/staging/stg_orders.sql → acme_nexus_analytics.ANALYTICS.STAGING.stg_orders
   ✅ Found | 9 columns
      Owner: ⚠️ NONE
      Tier: Tier.Tier3
      Tags: BusinessDomain.HR, Tier.Tier3
      Sensitive: none
      Lineage: 1 upstream, 5 downstream edges
      Downstream: 4 total (tables=4, dashboards=0, ML=0, pipelines=0)
      Test Suite: acme_nexus_analytics.ANALYTICS.STAGING.stg_orders.testSuite
      Score: 10/100 (LOW)

📐 models/staging/stg_products.sql → acme_nexus_analytics.ANALYTICS.STAGING.stg_products
   ✅ Found | 8 columns
      Owner: ⚠️ NONE
      Tier: not classified
      Tags: DataTier.Bronze
      Sensitive: none
      Lineage: 1 upstream, 8 downstream edges
      Downstream: 5 total (tables=5, dashboards=0, ML=0, pipelines=0)
      Score: 20/100 (LOW)

════════════════════════════════════════════════════════════

## 🔒 LineageLock Risk Report

### Overall Assessment

| Metric | Value |
|--------|-------|
| **Risk Score** | 🟡 **40/100** (MEDIUM) |
| **Decision** | ⚠️ Warning — review recommended |
| **Entities Analyzed** | 3 |
| **Resolved** | 3 |
| **Unresolved** | 0 |

### 💥 Blast Radius

| Category | Count |
|----------|-------|
| Total downstream entities | 12 |
| Dashboards impacted | 0 |
| ML Models impacted | 0 |

### 🟡 `models/marts/fact_orders.sql`

**Entity:** `acme_nexus_analytics.ANALYTICS.MARTS.fact_orders`
**Score:** 40/100 (MEDIUM)

<details>
<summary>Risk Factors (2/7 triggered)</summary>

| Factor | Points | Status | Detail |
|--------|--------|--------|--------|
| Contract Violation | 0/40 | ✅ Clear | No contract defined |
| Critical Tier Asset | 20/20 | 🔴 Triggered | Asset is Tier.Tier1 |
| Sensitive Data Tags | 20/20 | 🔴 Triggered | Found: DataSensitivity.Confidential, DataSensitivity.Highly Confidential |
| Downstream Dashboards | 0/10 | ✅ Clear | No downstream dashboards |
| Downstream ML Models | 0/10 | ✅ Clear | No downstream ML models |
| High Downstream Count | 0/10 | ✅ Clear | 3 downstream entities (threshold: 5) |
| No Clear Owner | 0/10 | ✅ Clear | Owner: admin (user) |

</details>

<details>
<summary>Downstream Assets (3)</summary>

**Tables:**
- 📋 `acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics`
- 📋 `acme_nexus_analytics.ANALYTICS.METRICS.product_performance`
- 📋 `acme_nexus_redshift.enterprise_dw.public.executive_sales_summary`

</details>

<details>
<summary>Governance</summary>

- **Owner:** admin (user)
- **Tier:** Tier.Tier1
- **Tags:** DataSensitivity.Confidential, DataSensitivity.Highly Confidential, Tier.Tier1

</details>

📬 **Notify:** admin

### 🟢 `models/staging/stg_orders.sql`

**Entity:** `acme_nexus_analytics.ANALYTICS.STAGING.stg_orders`
**Score:** 10/100 (LOW)

<details>
<summary>Risk Factors (1/7 triggered)</summary>

| Factor | Points | Status | Detail |
|--------|--------|--------|--------|
| Contract Violation | 0/40 | ✅ Clear | No contract defined |
| Critical Tier Asset | 0/20 | ✅ Clear | Tier.Tier3 (not critical) |
| Sensitive Data Tags | 0/20 | ✅ Clear | No sensitive tags |
| Downstream Dashboards | 0/10 | ✅ Clear | No downstream dashboards |
| Downstream ML Models | 0/10 | ✅ Clear | No downstream ML models |
| High Downstream Count | 0/10 | ✅ Clear | 4 downstream entities (threshold: 5) |
| No Clear Owner | 10/10 | 🔴 Triggered | No owner assigned |

</details>

<details>
<summary>Downstream Assets (4)</summary>

**Tables:**
- 📋 `acme_nexus_analytics.ANALYTICS.MARTS.fact_orders`
- 📋 `acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics`
- 📋 `acme_nexus_analytics.ANALYTICS.METRICS.product_performance`
- 📋 `acme_nexus_redshift.enterprise_dw.public.executive_sales_summary`

</details>

<details>
<summary>Governance</summary>

- **Owner:** ⚠️ No owner assigned
- **Tier:** Tier.Tier3
- **Tags:** BusinessDomain.HR, Tier.Tier3

</details>

### 🟢 `models/staging/stg_products.sql`

**Entity:** `acme_nexus_analytics.ANALYTICS.STAGING.stg_products`
**Score:** 20/100 (LOW)

<details>
<summary>Risk Factors (2/7 triggered)</summary>

| Factor | Points | Status | Detail |
|--------|--------|--------|--------|
| Contract Violation | 0/40 | ✅ Clear | No contract defined |
| Critical Tier Asset | 0/20 | ✅ Clear | No tier assigned |
| Sensitive Data Tags | 0/20 | ✅ Clear | No sensitive tags |
| Downstream Dashboards | 0/10 | ✅ Clear | No downstream dashboards |
| Downstream ML Models | 0/10 | ✅ Clear | No downstream ML models |
| High Downstream Count | 10/10 | 🔴 Triggered | 5 downstream entities (threshold: 5) |
| No Clear Owner | 10/10 | 🔴 Triggered | No owner assigned |

</details>

<details>
<summary>Downstream Assets (5)</summary>

**Tables:**
- 📋 `acme_nexus_analytics.ANALYTICS.MARTS.fact_orders`
- 📋 `acme_nexus_analytics.ANALYTICS.MARTS.dim_products`
- 📋 `acme_nexus_analytics.ANALYTICS.METRICS.customer_metrics`
- 📋 `acme_nexus_analytics.ANALYTICS.METRICS.product_performance`
- 📋 `acme_nexus_redshift.enterprise_dw.public.executive_sales_summary`

</details>

<details>
<summary>Governance</summary>

- **Owner:** ⚠️ No owner assigned
- **Tier:** Not classified
- **Tags:** DataTier.Bronze

</details>

---
*Generated by [LineageLock](https://github.com/jayjoshix/incident-commander) · Powered by [OpenMetadata](https://open-metadata.org) · **LIVE DATA from sandbox.open-metadata.org***

════════════════════════════════════════════════════════════

🟡 LineageLock: MEDIUM (40/100) — Warning
