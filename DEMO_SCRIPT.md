# Demo Script (3 Minutes)

## Setup (Before the Demo)

```bash
git clone https://github.com/jayjoshix/incident-commander.git
cd incident-commander
npm install
```

No OpenMetadata instance needed — demo mode uses built-in fixtures.

---

## Part 1: The Problem (30 seconds)

> "Data teams change dbt models and SQL files every day in PRs. But nobody knows what breaks downstream. A column rename in `fact_orders` could silently break the Revenue Dashboard, violate a data contract, or expose PII to a downstream consumer."
>
> "Code review catches code bugs. But it doesn't catch data impact. **LineageLock turns OpenMetadata from a passive catalog into active merge-time governance.**"

---

## Part 2: Live Demo — High Risk Change (60 seconds)

Run the high-risk demo scenario:

```bash
npx ts-node src/cli.ts demo --scenario high-risk
```

**Walk through the output:**

> "Here's what happens when someone changes `fact_orders.sql` — a Tier 1 table.
>
> LineageLock **parses the PR patch** and detects 3 changed columns: `amount` (modified), `customer_id` (modified), and `discount_pct` (added).
>
> It resolves the file to an OpenMetadata entity, fetches lineage, and scores 7 risk factors:
>
> - **Contract Violation** — a data quality test is failing (+40)
> - **Tier 1 Critical Asset** — this is a source-of-truth table (+20)
> - **PII Detected** — customer email has PII and GDPR tags (+20)
> - **2 Dashboards impacted** — Revenue Dashboard, Executive KPIs (+10)
> - **1 ML Model impacted** — the churn predictor (+10)
> - **7 downstream entities total** — above the threshold (+10)
>
> Then the **Column-Level Impact** section shows exactly which downstream columns are affected:
> - `amount` → `agg_daily_revenue.total_revenue` and `dim_order_details.order_total`
> - `customer_id` → `agg_customer_ltv.customer_id`
>
> This is OpenMetadata's column lineage graph — surfaced directly in the PR comment.
>
> And the **Glossary Terms** section flags that this entity is linked to `Revenue` and `Customer Lifetime Value` — business-critical terms.
>
> Final score: **100/100 CRITICAL — PR blocked.**
>
> The Data Engineering Team is flagged as the owner, and LineageLock would automatically request their review and apply labels like `lineagelock:tier1-change` and `lineagelock:pii-impact`."

---

## Part 3: Live Demo — Low Risk Change (30 seconds)

```bash
npx ts-node src/cli.ts demo --scenario low-risk
```

> "Compare that to `stg_payments` — a staging table. Low downstream impact, no sensitive tags, no tier.
>
> The only flag: **no owner assigned** (+10 points).
>
> Score: **10/100 LOW — safe to merge.**"

---

## Part 4: How It Works (30 seconds)

> "Under the hood, LineageLock:
>
> 1. Runs as a GitHub Action on every PR that touches data models
> 2. **Parses PR patches** to detect exactly which columns changed
> 3. Resolves files to OpenMetadata entities using configurable naming conventions
> 4. Hits the OpenMetadata REST API for lineage, column lineage, ownership, tags, glossary terms, and contracts
> 5. **Intersects changed columns with column-level lineage** for precise downstream impact
> 6. Computes a deterministic risk score with configurable weights
> 7. **Escalates PR-level risk** when multiple entities compound risk
> 8. Posts a rich Markdown comment on the PR
> 9. **Requests reviewers** from OpenMetadata owners, **applies risk labels**, and **sends Slack/Teams notifications**
> 10. Blocks the merge if the risk is too high
>
> Everything is configurable — thresholds, weights, path patterns, entity mappings, automation."

---

## Part 5: The OpenMetadata Integration (30 seconds)

> "This isn't a dashboard clone. It's a developer tool that lives in the PR workflow.
>
> We use **8 OpenMetadata capabilities**:
> - **Entity resolution** via table FQN lookup
> - **Lineage graph** to compute blast radius
> - **Column-level lineage** to trace changed columns through downstream entities
> - **Ownership** to route PR reviewers automatically
> - **Tags/Classifications** to detect PII and GDPR (with false-positive filtering)
> - **Glossary terms** to flag business-critical term exposure
> - **Tier** to identify critical assets
> - **Data contracts** via test suite status
>
> Teams get data governance enforcement where it matters — at merge time."

---

## Commands Reference

```bash
# Full demo (3 entities including unresolved)
npx ts-node src/cli.ts demo

# High-risk only
npx ts-node src/cli.ts demo --scenario high-risk

# Low-risk only
npx ts-node src/cli.ts demo --scenario low-risk

# JSON output
npx ts-node src/cli.ts demo --json

# Live analysis (requires OpenMetadata)
export OPENMETADATA_URL=http://localhost:8585
export OPENMETADATA_TOKEN=your-token
npx ts-node src/cli.ts analyze --changed-file models/fact_orders.sql

# Website dashboard (live OpenMetadata)
npm run website
```
