# LineageLock

**GitHub PR guard for data changes — blast radius, governance risk, and contract compatibility powered by [OpenMetadata](https://open-metadata.org).**

[![OpenMetadata Integration](https://img.shields.io/badge/OpenMetadata-Integrated-blue?style=flat-square)](https://open-metadata.org)
[![GitHub Action](https://img.shields.io/badge/GitHub_Action-Ready-green?style=flat-square)](https://github.com/features/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-orange?style=flat-square)](LICENSE)

---

## The Problem

Data teams routinely change dbt models, SQL files, and schema definitions without visibility into what might break downstream. A column rename in a staging model can silently break a Tier 1 executive dashboard, violate a data contract, or expose PII in a downstream table nobody remembered existed.

**Code review catches code problems. LineageLock catches data problems.**

## What It Does

When a PR changes a dbt model, SQL file, or schema YAML, LineageLock:

1. **Detects** changed data model files in the PR
2. **Resolves** file paths to OpenMetadata entities
3. **Fetches** lineage, ownership, tags, tier, and data contracts from OpenMetadata
4. **Computes** a deterministic risk score (0–100)
5. **Posts** a detailed Markdown risk report as a PR comment
6. **Blocks** the PR if the risk exceeds configurable thresholds

```
PR opened → Changed files detected → OpenMetadata lookup → Risk scored → PR comment posted
```

## Example PR Comment

<details>
<summary>Click to expand example report</summary>

## 🔒 LineageLock Risk Report

### Overall Assessment

| Metric | Value |
|--------|-------|
| **Risk Score** | 🔴 **100/100** (CRITICAL) |
| **Decision** | 🚫 Block — manual review needed |
| **Entities Analyzed** | 3 |
| **Resolved** | 2 |
| **Unresolved** | 1 |

### 💥 Blast Radius

| Category | Count |
|----------|-------|
| Total downstream entities | 8 |
| Dashboards impacted | 2 |
| ML Models impacted | 1 |

### 🔴 `models/marts/fact_orders.sql`
**Entity:** `warehouse.analytics.public.fact_orders`
**Score:** 100/100 (CRITICAL)

| Factor | Points | Status | Detail |
|--------|--------|--------|--------|
| Contract Violation | 40/40 | 🔴 Triggered | 1/4 tests failing |
| Critical Tier Asset | 20/20 | 🔴 Triggered | Asset is Tier.Tier1 |
| Sensitive Data Tags | 20/20 | 🔴 Triggered | PII.Sensitive, GDPR.Subject |
| Downstream Dashboards | 10/10 | 🔴 Triggered | 2 dashboard(s) |
| Downstream ML Models | 10/10 | 🔴 Triggered | 1 ML model(s) |
| High Downstream Count | 10/10 | 🔴 Triggered | 7 downstream entities |
| No Clear Owner | 0/10 | ✅ Clear | Owner: Data Engineering Team |

📬 **Notify:** Data Engineering Team

</details>

## OpenMetadata Integration

LineageLock uses the following OpenMetadata capabilities:

| Capability | API Endpoint | Purpose |
|------------|-------------|---------|
| **Entity Resolution** | `GET /api/v1/tables/name/{fqn}` | Resolve changed files to metadata entities |
| **Lineage Graph** | `GET /api/v1/lineage/table/{id}` | Compute blast radius and downstream impact |
| **Ownership** | Entity `owner` field | Identify stakeholders to notify |
| **Classifications** | Entity `tags` field | Detect PII, GDPR, and sensitive data |
| **Tier/Criticality** | Entity `tier` tag | Identify business-critical assets |
| **Data Contracts** | `GET /api/v1/dataQuality/testSuites` | Check contract/test compliance |

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

# High-risk scenario only
npx ts-node src/cli.ts demo --scenario high-risk

# Low-risk scenario only
npx ts-node src/cli.ts demo --scenario low-risk

# JSON output
npx ts-node src/cli.ts demo --json
```

### Live Analysis (Against Real OpenMetadata)

```bash
# Set connection
export OPENMETADATA_URL=http://localhost:8585
export OPENMETADATA_TOKEN=your-jwt-token

# Analyze specific files
npm run dry-run -- analyze --changed-file models/fact_orders.sql models/staging/stg_payments.sql
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
    "service": "warehouse",
    "database": "analytics",
    "schema": "public",
    "nameStrategy": "filename"
  },
  "mappings": [
    {
      "filePattern": "models/staging/**/*.sql",
      "fqn": "warehouse.analytics.staging.{name}"
    }
  ],
  "sensitiveTags": {
    "keywords": ["PII", "GDPR", "Confidential"]
  },
  "criticalTiers": ["Tier1", "Tier2", "Tier.Tier1", "Tier.Tier2"],
  "thresholds": {
    "warn": 30,
    "fail": 70
  }
}
```

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

LineageLock computes a deterministic score from 0–100:

| Factor | Default Weight | Trigger |
|--------|---------------|---------|
| Contract violation | +40 | Data contract tests failing |
| Critical tier | +20 | Asset is Tier 1 or Tier 2 |
| Sensitive tags | +20 | PII, GDPR, or similar tags found |
| Downstream dashboards | +10 | Any dashboard depends on this asset |
| Downstream ML models | +10 | Any ML model depends on this asset |
| High downstream count | +10 | ≥5 downstream entities |
| No clear owner | +10 | No owner assigned in OpenMetadata |

**Score is capped at 100.**

| Score Range | Level | Decision |
|------------|-------|----------|
| 0–29 | 🟢 LOW | Pass |
| 30–59 | 🟡 MEDIUM | Warn (review recommended) |
| 60–79 | 🟠 HIGH | Warn or fail (configurable) |
| 80–100 | 🔴 CRITICAL | Fail (block merge) |

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Build check
npm run build
```

## Project Structure

```
├── .github/workflows/      # GitHub Actions workflow
├── src/
│   ├── action/              # GitHub Action entry point
│   │   ├── github.ts        # PR API helpers
│   │   └── main.ts          # Action orchestrator
│   ├── openmetadata/        # OpenMetadata API client
│   │   ├── client.ts        # REST API client
│   │   └── types.ts         # API response types
│   ├── resolver/            # File → entity resolution
│   │   └── asset-resolver.ts
│   ├── risk/                # Risk scoring engine
│   │   ├── scoring.ts       # Score computation
│   │   └── types.ts         # Risk types
│   ├── report/              # PR comment rendering
│   │   └── renderer.ts      # Markdown generator
│   ├── config/              # Configuration
│   │   ├── loader.ts        # Config file + env loader
│   │   └── types.ts         # Config types
│   ├── fixtures/            # Demo data
│   │   └── demo-data.ts     # Realistic fixture entities
│   ├── cli.ts               # CLI for local usage
│   └── index.ts             # Library exports
├── tests/                   # Test suite
├── .lineagelock.json        # Example config
├── action.yml               # GitHub Action metadata
├── ARCHITECTURE.md          # Technical architecture
├── DEMO_SCRIPT.md           # 3-minute demo script
└── HACKATHON_SUBMISSION.md  # Submission materials
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
