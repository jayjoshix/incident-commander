## 🔒 LineageLock Risk Report

🔴 **CRITICAL** · 100/100 · 🚫 Block — manual review needed

### 🚫 Merge Blocked — 2 Approval Policies Require Sign-off

**🚫 Critical tier asset with sensitive data**
Asset is classified as Tier.Tier1 and contains sensitive data columns. Changes require Data Platform sign-off.
> Required: team:data-platform, team:business-owners
> Signals: Tier.Tier1 (critical tier) · PII.Sensitive · DataSensitivity.Confidential

**🚫 Failing contract with downstream dashboards**
Data quality tests are currently failing AND downstream dashboards depend on this asset. Merging now risks breaking live dashboards.
> Required: team:data-quality
> Signals: 2 failing test(s) in fact_orders_contract_suite · Dashboard: Revenue Dashboard · Dashboard: Executive KPIs

**⚠️ Business-critical glossary terms affected**
Entity is linked to business-critical glossary terms (Glossary.Revenue, Glossary.CustomerData). Business owners must approve changes.
> Required: team:business-owners
> Signals: Glossary.Revenue · Glossary.CustomerData

**⚠️ Asset has no owner in OpenMetadata**
stg_payments has no owner assigned in OpenMetadata. Assign an owner before this PR can be approved.
> Signals: stg_payments: no owner


### 🔬 What Changed → What Breaks

**Changed columns** in `models/marts/fact_orders.sql`: `customer_id`, `email`

**Downstream breakage:**
- `customer_id` → `customer_id` in `agg_customer_ltv`

**Affected assets:** 📊 Revenue Dashboard, 📊 Executive KPIs, 🤖 churn_predictor

**Changed columns** in `models/staging/stg_payments.sql`: `customer_id`, `email`

**Changed columns** in `models/staging/stg_inventory.sql`: `customer_id`, `email`


### 🏛️ Governance Triggers

*Signals from OpenMetadata that drive this assessment:*

- 🏷️ **Tier:** `Tier.Tier1` on `fact_orders`
- 🔐 **Sensitive tags:** `PII.Sensitive`, `GDPR.Subject`, `PersonalData.Address`
- 📖 **Glossary terms:** `Glossary.Revenue`, `Glossary.CustomerData`
- 📄 **Contract:** 🔴 Failing (2/4 tests) · Source: Test Suite
- 👤 **Owner:** **Data Engineering Team** (team)

### ⚡ Automation

**Requested reviewers:**
- team:data-platform — *team ownership detected in OpenMetadata*
- team:business-owners — *team ownership detected in OpenMetadata*
- team:data-quality — *team ownership detected in OpenMetadata*
- team:data-platform — *team ownership detected in OpenMetadata*
- team:business-owners — *team ownership detected in OpenMetadata*
- team:data-quality — *team ownership detected in OpenMetadata*
- team:privacy-team — *team ownership detected in OpenMetadata*
- team:security — *team ownership detected in OpenMetadata*
- team:bi-owners — *team ownership detected in OpenMetadata*
- team:analytics — *team ownership detected in OpenMetadata*
- team:platform-admin — *team ownership detected in OpenMetadata*

**Applied labels:**
- `lineagelock:critical` — *governance condition triggered*
- `governance:blocked` — *governance condition triggered*


**Routing Reasons:**
- 🔀 **PII / Privacy Governance** → team:privacy-team, team:security: *Asset contains PII/sensitive classifications — requires privacy team review*
- 🔀 **Data Contract Quality** → team:data-quality: *Data contract tests failing — requires data quality team sign-off*
- 🔀 **Dashboard / BI Impact** → team:bi-owners, team:analytics: *Downstream dashboards affected — requires BI owner review*
- 🔀 **Tier-1 Critical Asset** → team:data-platform: *Tier 1/2 critical asset — requires data platform team review*
- 🔀 **Active Quality Issues** → team:data-quality: *Asset has active failing quality tests — data quality team must resolve first*
- 🔀 **Business Glossary Impact** → team:business-owners: *Business-critical glossary terms affected — business owner review required*
- 🔀 **Unowned Asset** → team:platform-admin: *No owner assigned in OpenMetadata — platform admin must review*

<details>
<summary>📊 Detailed Scoring</summary>

| Metric | Value |
|--------|-------|
| **Risk Score** | 🔴 **100/100** (CRITICAL) |
| **Decision** | 🚫 Block — manual review needed |
| **Entities Analyzed** | 3 |
| **Resolved** | 2 |
| **Downstream Impact** | 8 entities (2 dashboards, 1 ML models) |

</details>

### 🔴 `models/marts/fact_orders.sql`

**Entity:** `warehouse.analytics.public.fact_orders`
**Score:** 100/100 (CRITICAL)

<details>
<summary>Risk Factors (7/8 triggered)</summary>

| Factor | Points | Status | Detail |
|--------|--------|--------|--------|
| Contract Violation | 40/40 | 🔴 Triggered | 2/4 tests failing in fact_orders_contract_suite |
| Critical Tier Asset | 20/20 | 🔴 Triggered | Asset is classified as Tier.Tier1 |
| Sensitive Data Tags | 20/20 | 🔴 Triggered | Found sensitive tags: PII.Sensitive, DataSensitivity.Confidential, GDPR.Subject |
| Downstream Dashboards | 10/10 | 🔴 Triggered | 2 dashboard(s) depend on this asset |
| Downstream ML Models | 10/10 | 🔴 Triggered | 1 ML model(s) depend on this asset |
| High Downstream Count | 10/10 | 🔴 Triggered | 7 downstream entities (threshold: 5) |
| No Clear Owner | 0/10 | ✅ Clear | Owner: Data Engineering Team (team) |
| Active Quality Issues | 15/15 | 🔴 Triggered | 2 active failing test(s): amount_positive, freshness_check |

</details>

<details>
<summary>Downstream Assets (7)</summary>

**Dashboards:**
- 📊 `superset.Revenue Dashboard`
- 📊 `superset.Executive KPIs`
**ML Models:**
- 🤖 `mlflow.churn_predictor`
**Tables:**
- 📋 `warehouse.analytics.public.agg_daily_revenue`
- 📋 `warehouse.analytics.public.agg_customer_ltv`
- 📋 `warehouse.analytics.public.dim_order_details`
**Pipelines:**
- ⚙️ `airflow.nightly_reports`

**Column Lineage (3 mappings):**
- `amount` → `total_revenue` in `warehouse.analytics.public.agg_daily_revenue`
- `customer_id` → `customer_id` in `warehouse.analytics.public.agg_customer_ltv`
- `order_id, amount` → `order_total` in `warehouse.analytics.public.dim_order_details`

</details>

<details>
<summary>Contract Status</summary>

- **Status:** 🔴 Failing
- **Source:** Test Suite
- **Suite:** `fact_orders_contract_suite`
- **Tests:** 2/4 passing
  - ✅ column_count_check
  - ✅ not_null_order_id
  - ❌ amount_positive
  - ❌ freshness_check

</details>

> ⚠️ **Active Quality Issues (from OpenMetadata)**
> 
> This asset already has failing quality tests. Merging now adds risk on top of existing issues.
> 
> - ❌ `amount_positive` — Found 142 rows where amount <= 0 (expected: all positive) *(3d ago)*
> - ❌ `freshness_check` — Table not updated in 8 hours (SLA: 6 hours) *(6h ago)*

<details>
<summary>📋 Safe Rollout Guidance</summary>

*These columns flow into downstream assets. To change them safely:*

**Column `customer_id`** (renamed) — affects: `customer_id` in `agg_customer_ltv`, `Revenue Dashboard`, `Executive KPIs`
1. **Add alias / dual-write** — Expose both the old and new column name from this model simultaneously
2. **Migrate downstream** — Update consumers to use the new name: `customer_id` in `agg_customer_ltv`, `Revenue Dashboard`, `Executive KPIs`
3. **Update OpenMetadata** — Rename the column in OpenMetadata and update glossary/tag assignments
4. **Remove the alias** — Once all consumers are migrated, remove the old column alias in a follow-up PR

</details>

### 🟢 `models/staging/stg_payments.sql`

**Entity:** `warehouse.analytics.staging.stg_payments`
**Score:** 10/100 (LOW)

<details>
<summary>Risk Factors (1/8 triggered)</summary>

| Factor | Points | Status | Detail |
|--------|--------|--------|--------|
| Contract Violation | 0/40 | ✅ Clear | No data contract defined |
| Critical Tier Asset | 0/20 | ✅ Clear | No tier assigned |
| Sensitive Data Tags | 0/20 | ✅ Clear | No tags on this asset |
| Downstream Dashboards | 0/10 | ✅ Clear | No downstream dashboards detected |
| Downstream ML Models | 0/10 | ✅ Clear | No downstream ML models detected |
| High Downstream Count | 0/10 | ✅ Clear | 1 downstream entities (threshold: 5) |
| No Clear Owner | 10/10 | 🔴 Triggered | No owner assigned — changes may go unreviewed |
| Active Quality Issues | 0/15 | ✅ Clear | No active quality issues detected |

</details>

<details>
<summary>Downstream Assets (1)</summary>

**Tables:**
- 📋 `warehouse.analytics.public.fact_orders`

</details>

<details>
<summary>Contract Status</summary>

- No data contract defined for this asset

</details>

### 🟢 `models/staging/stg_inventory.sql`

**Entity:** `warehouse.analytics.staging.stg_inventory`
**Score:** 0/100 (LOW)

> ⚠️ Entity not found in OpenMetadata: Entity not found in OpenMetadata: warehouse.analytics.staging.stg_inventory

### ⚠️ Unresolved Entities

The following changed files could not be resolved to OpenMetadata entities:

- `models/staging/stg_inventory.sql` → `warehouse.analytics.staging.stg_inventory` — Entity not found in OpenMetadata: warehouse.analytics.staging.stg_inventory

> Check your `.lineagelock.json` naming convention or add explicit mappings.

### 🔴 Trust Signal — Grade D (54/100)

> Significant governance gaps. Address before merging to production.

| Dimension | Score | Grade |
|-----------|-------|-------|
| Owner Coverage | 50/100 | 🔴 D — 1/2 entities have an assigned owner |
| Contract Health | 50/100 | 🔴 D — 0/1 contracts passing |
| Quality Observability | 50/100 | 🔴 D — 1/2 entities have active quality issues |
| Governance Posture | 20/100 | 🔴 F — 2 blocking + 2 warning policies triggered |
| Lineage Coverage | 100/100 | 🟢 A — 2/2 entities have lineage data in OpenMetadata |

**Top risks:**
- ⚠️ Low owner coverage (1/2 entities owned)
- ⚠️ Contract failures in data quality suite
- ⚠️ 1 entity(ies) with active quality issues
- ⚠️ 2 blocking governance policy(ies) triggered

<details>
<summary>🔧 Proposed Safe Fixes — 7 remediation action(s) (2 critical)</summary>

### 🔴 REM-001: Fix failing contract tests on fact_orders

> 2/4 data contract tests are currently failing in "fact_orders_contract_suite". Merging this PR on top of existing failures compounds risk.

**Steps:**
1. **Identify failing tests** — In OpenMetadata → Data Quality → fact_orders_contract_suite — review each failing test *(OpenMetadata UI)*
2. **Fix or acknowledge each failure** — Either fix the data issue causing the failure, or update the contract expectation if the test is stale *(dbt / SQL / OpenMetadata)*
3. **Re-run test suite** — Trigger a test run in OpenMetadata to confirm tests pass before merging *(OpenMetadata Data Quality)*
4. **Update contract SLAs if needed** — If business logic changed, update the contract definition to reflect new expectations *(OpenMetadata UI)*

**Suggested follow-up PR scope:**
- [ ] Fix failing contract tests in fact_orders_contract_suite
- [ ] Update dbt tests or data quality definitions

### 🔴 REM-002: PII/sensitive data access review for fact_orders

> Asset is tagged with sensitive classifications (PII.Sensitive, DataSensitivity.Confidential). Any schema change requires a privacy/security review.

**Steps:**
1. **Conduct privacy impact assessment** — Document why this schema change is needed and whether it affects data subject rights (GDPR Art. 35) *(Legal/Compliance)* · Owner: `privacy-team`
2. **Verify column-level access controls** — Confirm downstream consumers only access PII via approved access patterns (masked views, row-level security) *(OpenMetadata Policies / Data Warehouse)*
3. **Update data lineage documentation** — Confirm OpenMetadata lineage reflects the new schema path *(OpenMetadata UI)*
4. **Get privacy team sign-off** — Obtain written approval from data privacy officer or designated reviewer · Owner: `privacy-team`

**Suggested follow-up PR scope:**
- [ ] Privacy impact assessment document
- [ ] Update access control definitions
- [ ] Update OpenMetadata PII documentation

### 🟠 REM-003: Migrate 2 affected dashboard(s) after schema change

> Dashboards depend on this asset via lineage: Revenue Dashboard, Executive KPIs.

**Steps:**
1. **Audit each affected dashboard** — Review Revenue Dashboard, Executive KPIs for hardcoded column references *(BI Tool (Superset / Looker / Tableau))* · Owner: `bi-owners`
2. **Test dashboards against staging** — Deploy schema change to staging first and confirm all dashboard queries still execute *(Staging environment)*
3. **Update dashboard queries/metrics** — Update any column references, calculated fields, or saved filters affected by the change · Owner: `bi-owners`
4. **Coordinate migration window** — Schedule the production merge during a low-traffic window to minimize dashboard downtime · Owner: `data-eng`

**Suggested follow-up PR scope:**
- [ ] Update dashboard: Revenue Dashboard
- [ ] Update dashboard: Executive KPIs

### 🟠 REM-004: Resolve 2 active quality issue(s) before merging

> This asset already has failing quality checks. Merging more changes while unhealthy compounds the risk.

**Steps:**
1. **Review each failing test** — amount_positive: Found 142 rows where amount <= 0 (expected: all positive); freshness_check: Table not updated in 8 hours (SLA: 6 hours) *(OpenMetadata Data Quality)*
2. **Fix root cause or acknowledge** — Either fix the underlying data issue or mark the test as acknowledged with a reason *(OpenMetadata UI)*
3. **Re-run quality suite** — Trigger re-run to confirm clean state before merging this PR *(OpenMetadata Automations)*

**Suggested follow-up PR scope:**
- [ ] Fix active quality issues on fact_orders

### 🟠 REM-005: Dual-write strategy for renamed/removed columns: customer_id

> Columns customer_id are being renamed or removed. Downstream consumers may break without a migration window.

**Steps:**
1. **Add compatibility alias** — SELECT old_name, new_name AS old_name_alias FROM fact_orders — emit both old and new column names in a transitional period *(dbt / SQL)*
2. **Notify downstream owners** — Alert owners of downstream consumers to migrate their queries within the deprecation window · Owner: `data-eng`
3. **Migrate consumers** — For each downstream entity, update queries to use the new column name · Owner: `consumer-teams`
4. **Remove the alias** — Once all consumers have migrated, open a follow-up PR to remove the compatibility column · Owner: `data-eng`

**Suggested follow-up PR scope:**
- [ ] Remove compatibility alias for customer_id after consumer migration

### 🟠 REM-007: Assign owner to stg_payments

> This asset has no owner in OpenMetadata. Changes to unowned assets bypass normal review routing.

**Steps:**
1. **Navigate to asset in OpenMetadata** — Open warehouse.analytics.staging.stg_payments in your OpenMetadata instance *(OpenMetadata UI)*
2. **Assign team or user as owner** — Go to → Edit → Owners → assign the responsible data team *(OpenMetadata UI)*
3. **Add to .lineagelock.json ownerMapping** — "warehouse.analytics.staging.stg_payments": "team-name" *(.lineagelock.json)*

**Suggested follow-up PR scope:**
- [ ] Update OpenMetadata ownership for stg_payments
- [ ] Add ownership mapping to .lineagelock.json

### 🟡 REM-006: Business glossary review required: Glossary.Revenue, Glossary.CustomerData

> Asset is linked to business-critical glossary terms. Schema changes may affect the semantic meaning of these terms.

**Steps:**
1. **Review glossary term definitions** — In OpenMetadata → Glossary, review Glossary.Revenue, Glossary.CustomerData and confirm the schema change aligns *(OpenMetadata Glossary)*
2. **Get business owner sign-off** — Obtain approval from the glossary term owner (usually a business stakeholder) · Owner: `business-owners`
3. **Update glossary documentation if needed** — If the schema change changes the semantic meaning, update the glossary term description *(OpenMetadata UI)*

**Suggested follow-up PR scope:**
- [ ] Update glossary term definitions if semantic meaning changed

> 📄 Full remediation plan: `artifacts/lineagelock-remediation.json`
</details>

<details>
<summary>📋 Governance Audit Trail — 2026-04-25T05:03:58.724Z</summary>

| Field | Value |
|-------|-------|
| **Decision** | 🚫 FAIL |
| **Score** | 100/100 (CRITICAL) |
| **Policies Triggered** | 4 |
| **Reviewers Requested** | team:data-platform, team:business-owners, team:data-quality, team:data-platform, team:business-owners, team:data-quality, team:privacy-team, team:security, team:bi-owners, team:analytics, team:platform-admin |
| **Labels Applied** | lineagelock:critical, governance:blocked |
| **Entities Analyzed** | 3 (2 resolved) |
| **Active Quality Issues** | 2 |
| **Changed Columns** | 6 across 3 file(s) |
| **Run Timestamp** | `2026-04-25T05:03:58.724Z` |

**Triggered Policies:**
- 🚫 **Critical tier asset with sensitive data** — Asset is classified as Tier.Tier1 and contains sensitive data columns. Changes require Data Platform
  - Signals: `Tier.Tier1 (critical tier)` · `PII.Sensitive` · `DataSensitivity.Confidential` · `GDPR.Subject`
- 🚫 **Failing contract with downstream dashboards** — Data quality tests are currently failing AND downstream dashboards depend on this asset. Merging now
  - Signals: `2 failing test(s) in fact_orders_contract_suite` · `Dashboard: Revenue Dashboard` · `Dashboard: Executive KPIs`
- ⚠️ **Business-critical glossary terms affected** — Entity is linked to business-critical glossary terms (Glossary.Revenue, Glossary.CustomerData). Busi
  - Signals: `Glossary.Revenue` · `Glossary.CustomerData`
- ⚠️ **Asset has no owner in OpenMetadata** — stg_payments has no owner assigned in OpenMetadata. Assign an owner before this PR can be approved.
  - Signals: `stg_payments: no owner`

> 🔒 Full audit record: `artifacts/lineagelock-audit.json`
</details>

---
*Generated by [LineageLock](https://github.com/jayjoshix/incident-commander) · Powered by [OpenMetadata](https://open-metadata.org)*