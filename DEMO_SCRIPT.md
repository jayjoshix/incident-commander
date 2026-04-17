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
> "Code review catches code bugs. But it doesn't catch data impact. LineageLock does."

---

## Part 2: Live Demo — High Risk Change (60 seconds)

Run the high-risk demo scenario:

```bash
npx ts-node src/cli.ts demo --scenario high-risk
```

**Walk through the output:**

> "Here's what happens when someone changes `fact_orders.sql` — a Tier 1 table.
>
> LineageLock resolves the file to an OpenMetadata entity, fetches lineage, and scores 7 risk factors:
>
> - **Contract Violation** — a data quality test is failing (+40)
> - **Tier 1 Critical Asset** — this is a source-of-truth table (+20)
> - **PII Detected** — customer email has PII and GDPR tags (+20)
> - **2 Dashboards impacted** — Revenue Dashboard, Executive KPIs (+10)
> - **1 ML Model impacted** — the churn predictor (+10)
> - **7 downstream entities total** — above the threshold (+10)
>
> Final score: **100/100 CRITICAL — PR blocked.**
>
> The Data Engineering Team is flagged as the owner to notify."

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
> 2. Resolves files to OpenMetadata entities using configurable naming conventions
> 3. Hits the OpenMetadata REST API for lineage, ownership, tags, and contracts
> 4. Computes a deterministic risk score with configurable weights
> 5. Posts a rich Markdown comment on the PR
> 6. Blocks the merge if the risk is too high
>
> Everything is configurable — thresholds, weights, path patterns, entity mappings."

---

## Part 5: The OpenMetadata Integration (30 seconds)

> "This isn't a dashboard clone. It's a developer tool that lives in the PR workflow.
>
> We use 6 OpenMetadata capabilities:
> - **Entity resolution** via table FQN lookup
> - **Lineage graph** to compute blast radius
> - **Ownership** to identify stakeholders
> - **Tags/Classifications** to detect PII and GDPR
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
```
