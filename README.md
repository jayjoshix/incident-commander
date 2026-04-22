# 🔒 LineageLock

**GitHub PR guard for data changes — blast radius, governance risk, and contract compatibility powered by [OpenMetadata](https://open-metadata.org).**

[![OpenMetadata Integration](https://img.shields.io/badge/OpenMetadata-Integrated-blue?style=flat-square)](https://open-metadata.org)
[![GitHub Action](https://img.shields.io/badge/GitHub_Action-Ready-green?style=flat-square)](https://github.com/features/actions)
[![Tests](https://img.shields.io/badge/Tests-96_passing-brightgreen?style=flat-square)](#testing)
[![License](https://img.shields.io/badge/License-Apache_2.0-orange?style=flat-square)](LICENSE)

---

## The Problem

Data teams routinely change dbt models, SQL files, and schema definitions without visibility into what might break downstream. A column rename in a staging model can silently break a Tier 1 executive dashboard, violate a data contract, or expose PII in a downstream table nobody remembered existed.

**Code review catches code problems. LineageLock catches data problems.**

## What It Does

When a PR changes a dbt model, SQL file, or schema YAML, LineageLock:

1. **Detects** changed data model files in the PR
2. **Parses patches** to detect changed columns via deterministic SQL/YAML diff analysis
3. **Resolves** file paths to OpenMetadata entities via configurable naming conventions
4. **Fetches** lineage, column lineage, ownership, tags, glossary terms, tier, and data contracts from OpenMetadata
5. **Intersects** changed columns with column-level lineage — "this column flows into *this downstream column* in *this dashboard*"
6. **Computes** a deterministic risk score (0–100) with PR-level aggregate escalation
7. **Posts** a PR comment leading with column-aware impact, OpenMetadata governance signals, and automation reasons
8. **Automates** reviewer requests (users + teams), risk labels, and Slack/Teams/webhook notifications
9. **Blocks or warns** based on configurable thresholds

The PR comment structure:
```
🔴 CRITICAL · 100/100 · 🚫 Block

### 🔬 What Changed → What Breaks   ← HEADLINE
   amount → total_revenue in agg_daily_revenue
   customer_id → customer_id in agg_customer_ltv
   Affected: Revenue Dashboard, churn_predictor

### 🏛️ Governance Triggers          ← OpenMetadata signals
   Tier.Tier1 · PII.Sensitive · Glossary.Revenue
   Contract: Failing · Owner: Data Engineering Team

### ⚡ Automation                    ← with reasons
   team:data-engineering — owned by Data Engineering Team in OM
   lineagelock:pii-impact — column tags include PII/GDPR

<details> 📊 Detailed Scoring </details>
```

```
PR opened → Patch parsed → Files resolved → OpenMetadata lookup → Column intersection → Risk scored → PR aggregate → Comment + Labels + Reviewers + Webhooks
```

## Live Sandbox Verification ✅

LineageLock has been verified against the **live OpenMetadata sandbox** (`sandbox.open-metadata.org`, v1.12.5):

```
🔒 LineageLock — Live Analysis
   Target: https://sandbox.open-metadata.org
   ✅ Connected to OpenMetadata 1.12.5

📐 models/marts/fact_orders.sql → acme_nexus_analytics.ANALYTICS.MARTS.fact_orders
   ✅ Found | 10 columns
      Owner: admin
      Tier: Tier.Tier1
      Tags: DataSensitivity.Confidential, DataSensitivity.Highly Confidential, Tier.Tier1
      Lineage: 6 upstream, 4 downstream edges
      Score: 40/100 (MEDIUM)

📐 models/staging/stg_orders.sql → acme_nexus_analytics.ANALYTICS.STAGING.stg_orders
   ✅ Found | 9 columns | Owner: ⚠️ NONE | Tier3
      Score: 10/100 (LOW)

📐 models/staging/stg_products.sql → acme_nexus_analytics.ANALYTICS.STAGING.stg_products
   ✅ Found | 8 columns | 5 downstream
      Score: 20/100 (LOW)

🟡 LineageLock: MEDIUM (40/100) — Warning
```

> Full output saved in [`LIVE_SANDBOX_OUTPUT.md`](LIVE_SANDBOX_OUTPUT.md)

## Example PR Comment

<details>
<summary>Click to expand example report</summary>

## 🔒 LineageLock Risk Report

🔴 **CRITICAL** · 100/100 · 🚫 Block — manual review needed

### 🔬 What Changed → What Breaks

**Changed columns** in `models/marts/fact_orders.sql`: `amount`, `customer_id`, `discount_pct`

**Downstream breakage:**
- `amount` → `total_revenue` in `agg_daily_revenue`
- `customer_id` → `customer_id` in `agg_customer_ltv`
- `order_id, amount` → `order_total` in `dim_order_details`

**Affected assets:** 📊 Revenue Dashboard, 📊 Executive KPIs, 🤖 churn_predictor

### 🏛️ Governance Triggers

*Signals from OpenMetadata that drive this assessment:*

- 🏷️ **Tier:** `Tier.Tier1` on `fact_orders`
- 🔐 **Sensitive tags:** `PII.Sensitive`, `GDPR.Subject`
- 📖 **Glossary terms:** `Glossary.Revenue`, `Glossary.CustomerData`
- 📄 **Contract:** 🔴 Failing (3/4 tests) · Source: Test Suite
- 👤 **Owner:** **Data Engineering Team** (team)

### ⚡ Automation

**Requested reviewers:**
- team:data-engineering — *this asset is owned by **Data Engineering Team** in OpenMetadata*

**Applied labels:**
- `lineagelock:tier1-change` — *entity has Tier 1/Tier 2 classification in OpenMetadata*
- `lineagelock:pii-impact` — *column tags include PII, GDPR, or sensitive data classifications*
- `lineagelock:contract-risk` — *data contract has failing quality tests*

<details><summary>📊 Detailed Scoring</summary>

| Metric | Value |
|--------|-------|
| **Risk Score** | 🔴 **100/100** (CRITICAL) |
| **Decision** | 🚫 Block — manual review needed |
| **Entities Analyzed** | 1 |
| **Downstream Impact** | 7 entities (2 dashboards, 1 ML models) |

</details>

</details>

## OpenMetadata Integration

LineageLock uses the following OpenMetadata capabilities:

| Capability | API Endpoint | Purpose |
|------------|-------------|---------|
| **Entity Resolution** | `GET /api/v1/tables/name/{fqn}` | Resolve changed files to metadata entities |
| **Lineage Graph** | `GET /api/v1/lineage/table/{id}` | Compute blast radius and downstream impact |
| **Column-Level Lineage** | Lineage edge `columnLineage` field | Precise downstream column tracing, intersected with PR patches |
| **Ownership** | Entity `owners` field | Route PR reviewers based on data owners |
| **Classifications** | Entity `tags` field | Detect PII, GDPR, and sensitive data (with PII.None filtering) |
| **Glossary Terms** | Entity tags with `source: Glossary` | Flag changes to business-critical glossary terms |
| **Tier/Criticality** | Entity `tier` tag | Identify business-critical assets |
| **Data Contracts** | `GET /api/v1/dataContracts` (OM 1.5+), fallback to `GET /api/v1/dataQuality/testSuites/search/list` | Check contract/test compliance (dual-track — tries official API first) |

> **API Compatibility:** Supports both OpenMetadata 1.12+ (`owners` array) and older versions (`owner` singular).

## Quick Start

### Prerequisites

- Node.js 20+
- An OpenMetadata instance (or use demo mode)

### Install

```bash
git clone https://github.com/jayjoshix/incident-commander.git
cd incident-commander
npm install
```

### Demo Mode (No OpenMetadata Required)

```bash
# Full demo with fixture data
npm run demo

# High-risk scenario
npx ts-node src/cli.ts demo --scenario high-risk

# Low-risk scenario
npx ts-node src/cli.ts demo --scenario low-risk

# JSON output
npx ts-node src/cli.ts demo --json
```

### Live OpenMetadata Integration

#### Option A: OpenMetadata Sandbox (Recommended for Testing)

```bash
# 1. Get a personal access token from https://sandbox.open-metadata.org
#    → Log in → Settings → Users → Your profile → Access Tokens → Generate

# 2. Set credentials
export OPENMETADATA_URL=https://sandbox.open-metadata.org
export OPENMETADATA_TOKEN=<your-jwt-token>

# 3. Run LineageLock against real sandbox data
npm run live-test
```

#### Option B: Local OpenMetadata (Docker)

```bash
# 1. Start OpenMetadata locally (requires Docker)
npm run setup-om

# 2. Get your JWT token from the OpenMetadata UI:
#    → http://localhost:8585 → Settings → Bots → ingestion-bot → Copy Token

# 3. Set credentials
export OPENMETADATA_URL=http://localhost:8585
export OPENMETADATA_TOKEN=<your-jwt-token>

# 4. Seed sample data (tables, lineage, tags, ownership)
npm run seed

# 5. Run the full integration test suite
npm run integration-test
```

#### Option C: Existing OpenMetadata Instance

```bash
# Point to your instance
export OPENMETADATA_URL=https://your-openmetadata.company.com
export OPENMETADATA_TOKEN=<your-jwt-token>

# Update .lineagelock.json with your service/database/schema names
# Then analyze files that match entities in your instance
npm run build
node dist/src/cli.js analyze --changed-file models/fact_orders.sql \
  --om-url $OPENMETADATA_URL --om-token $OPENMETADATA_TOKEN
```

### GitHub Action

Add to your repository's `.github/workflows/lineagelock.yml`:

```yaml
name: LineageLock PR Guard

on:
  pull_request:
    paths:
      - 'models/**'
      - 'sql/**'
      - 'schemas/**'

permissions:
  contents: read
  pull-requests: write

jobs:
  lineagelock:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openmetadata-url: ${{ secrets.OPENMETADATA_URL }}
          openmetadata-token: ${{ secrets.OPENMETADATA_TOKEN }}
          warn-threshold: '30'   # Optional: override warning threshold
          fail-threshold: '70'   # Optional: override failure threshold
```

## Configuration

Create a `.lineagelock.json` in your repo root:

```json
{
  "paths": {
    "sql": ["models/**/*.sql"],
    "yaml": ["models/**/*.yml"]
  },
  "naming": {
    "service": "acme_nexus_analytics",
    "database": "ANALYTICS",
    "schema": "MARTS",
    "nameStrategy": "filename"
  },
  "mappings": [
    {
      "filePattern": "models/staging/**/*.sql",
      "fqn": "acme_nexus_analytics.ANALYTICS.STAGING.{name}"
    },
    {
      "filePattern": "models/marts/**/*.sql",
      "fqn": "acme_nexus_analytics.ANALYTICS.MARTS.{name}"
    }
  ],
  "sensitiveTags": {
    "keywords": ["PII", "GDPR", "Confidential", "Sensitive", "PHI", "PCI", "DataSensitivity"]
  },
  "criticalTiers": ["Tier1", "Tier2", "Tier.Tier1", "Tier.Tier2"],
  "failOnUnresolved": false,
  "thresholds": {
    "warn": 30,
    "fail": 70
  }
}
```

### Configuration Reference

| Key | Description | Default |
|-----|-------------|---------|
| `paths.sql` | Glob patterns for SQL files | `["models/**/*.sql"]` |
| `paths.yaml` | Glob patterns for YAML files | `["models/**/*.yml"]` |
| `naming.service` | OpenMetadata service name | `"warehouse"` |
| `naming.database` | Database name | `"analytics"` |
| `naming.schema` | Schema name | `"public"` |
| `naming.nameStrategy` | How to derive table name from file | `"filename"` |
| `mappings` | Explicit file → FQN mappings | `[]` |
| `sensitiveTags.keywords` | Tag FQN segments that indicate sensitive data | `["PII", "GDPR", ...]` |
| `criticalTiers` | Tier tags considered critical | `["Tier1", "Tier2"]` |
| `failOnUnresolved` | Fail PR if entities can't be resolved | `false` |
| `thresholds.warn` | Score threshold for warning | `30` |
| `thresholds.fail` | Score threshold for failure | `70` |
| `highDownstreamThreshold` | Min downstream count for high-downstream factor | `5` |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENMETADATA_URL` | OpenMetadata server URL | — |
| `OPENMETADATA_TOKEN` | JWT authentication token | — |
| `GITHUB_TOKEN` | GitHub token (auto-provided in Actions) | — |
| `LINEAGELOCK_WARN_THRESHOLD` | Score to trigger warning | `30` |
| `LINEAGELOCK_FAIL_THRESHOLD` | Score to trigger failure | `70` |
| `LINEAGELOCK_CONFIG_PATH` | Path to config file | `.lineagelock.json` |

## Risk Scoring

LineageLock computes a deterministic score from 0–100 using 7 weighted factors:

| Factor | Default Weight | Trigger |
|--------|---------------|---------|
| Contract violation | +40 | Data contract tests failing |
| Critical tier | +20 | Asset is Tier 1 or Tier 2 |
| Sensitive tags | +20 | PII, GDPR, Confidential, or similar tags found |
| Downstream dashboards | +10 | Any dashboard depends on this asset |
| Downstream ML models | +10 | Any ML model depends on this asset |
| High downstream count | +10 | ≥5 downstream entities |
| No clear owner | +10 | No owner assigned in OpenMetadata |

**Score is capped at 100.** All weights are configurable.

| Score Range | Level | Decision |
|------------|-------|----------|
| 0–29 | 🟢 LOW | Pass |
| 30–59 | 🟡 MEDIUM | Warn (review recommended) |
| 60–79 | 🟠 HIGH | Warn or fail (configurable) |
| 80–100 | 🔴 CRITICAL | Fail (block merge) |

### Sensitive Tag Matching

Tags are matched using **segment-boundary** matching (not substring). The `tagFQN` is split on `.` and each segment is compared independently against configured keywords:

- `PII.Sensitive` → Matches keyword `PII` (first segment) ✅
- `DataSensitivity.Confidential` → Matches keyword `Confidential` (second segment) ✅
- `DataSensitivity.Confidential` → Does **not** match keyword `PII` (no segment equals `PII`) ✅
- `PII.None` → **Excluded** — explicitly filtered as a known non-sensitive tag ✅
- `PII.NonSensitive` → **Excluded** — explicitly filtered as a known non-sensitive tag ✅

**False-positive exclusion list:** `PII.None`, `PII.NonSensitive`, `PII.Non-Sensitive`, `PII.Public` are all excluded from sensitive tag detection, even though they match the `PII` keyword segment. This prevents false positives from classification tags that explicitly indicate non-sensitive data.

### Error Handling

- **404 / Not Found** — Entity treated as "not found", scored at 0 by default
- **Auth / Network / Server errors** — Propagated as failures (not silently swallowed)
- **Contract errors** — Only 404 is treated as "no contract"; other errors are surfaced
- **Unresolved entities** — Configurable via `failOnUnresolved` flag

## Testing

```bash
# Run all 59 tests
npm test

# Run tests in band (serial)
npm test -- --runInBand

# Watch mode
npm run test:watch

# Build check
npm run build

# Live test against OpenMetadata sandbox
npm run live-test
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run demo` | Run demo with fixture data |
| `npm test` | Run 59 unit tests |
| `npm run live-test` | Test against live OpenMetadata sandbox |
| `npm run seed` | Seed local OpenMetadata with sample data |
| `npm run integration-test` | E2E test against live instance |
| `npm run setup-om` | Start local OpenMetadata via Docker |
| `npm run clean` | Remove dist/ and coverage/ |

## Project Structure

```
├── .github/workflows/          # GitHub Actions workflow
├── scripts/
│   ├── live-sandbox-test.js    # Live test against OM sandbox
│   ├── setup-openmetadata.sh   # One-command local OM setup
│   ├── seed-openmetadata.ts    # Seeds real OM with sample data
│   ├── integration-test.ts     # E2E test against live OM
│   └── live-test.ts            # TypeScript live test script
├── src/
│   ├── action/                 # GitHub Action entry point
│   │   ├── github.ts           # PR API helpers
│   │   └── main.ts             # Action orchestrator
│   ├── openmetadata/           # OpenMetadata API client
│   │   ├── client.ts           # REST API client (v1.12+ compatible)
│   │   └── types.ts            # API response types
│   ├── resolver/               # File → entity resolution
│   │   └── asset-resolver.ts
│   ├── risk/                   # Risk scoring engine
│   │   ├── scoring.ts          # Score computation (7 factors)
│   │   └── types.ts            # Risk types
│   ├── report/                 # PR comment rendering
│   │   └── renderer.ts         # Markdown generator
│   ├── config/                 # Configuration
│   │   ├── loader.ts           # Config file + env loader
│   │   └── types.ts            # Config types
│   ├── fixtures/               # Demo data
│   │   └── demo-data.ts        # Realistic fixture entities
│   ├── cli.ts                  # CLI for local usage
│   └── index.ts                # Library exports
├── tests/                      # Test suite (59 tests)
│   ├── config/
│   ├── openmetadata/
│   ├── report/
│   ├── resolver/
│   └── risk/
├── .lineagelock.json           # Configuration (sandbox-mapped)
├── action.yml                  # GitHub Action metadata
├── ARCHITECTURE.md             # Technical architecture
├── DEMO_SCRIPT.md              # 3-minute demo script
├── HACKATHON_SUBMISSION.md     # Submission materials
└── LIVE_SANDBOX_OUTPUT.md      # Verified live sandbox output
```

## Limitations & Future Work

**Current scope (MVP):**
- Focused on dbt models, SQL files, and schema YAML
- Table entities only (dashboard/pipeline entities planned)
- Lineage depth of 3 downstream hops
- Contract validation via test suite status (not schema-diff)

**Future work:**
- Column-level impact analysis
- Schema diff detection (before/after comparison)
- Slack/Teams notifications for affected owners
- Support for dbt manifest.json parsing for richer resolution
- Dashboard and pipeline entity support as first-class citizens
- Caching layer for OpenMetadata API responses
- Multi-repo support

## License

Apache 2.0

---

Built for the [WeMakeDevs × OpenMetadata Hackathon](https://wemakedevs.org) (April 17–26, 2026).
*Generated by [LineageLock](https://github.com/jayjoshix/incident-commander) · Powered by [OpenMetadata](https://open-metadata.org)*
