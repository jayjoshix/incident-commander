# Hackathon Submission — LineageLock

## WeMakeDevs × OpenMetadata Hackathon (April 17–26, 2026)

---

## Project Name

**LineageLock** — GitHub PR guard for data changes

## Tagline

*Bring OpenMetadata's governance intelligence into every data PR.*

---

## Problem

Data teams change dbt models, SQL transformations, and schema definitions through pull requests every day. Code review catches syntax issues and logic bugs — but it has zero visibility into what breaks downstream.

A column rename in a staging model can:
- Break a Tier 1 executive dashboard that nobody on the code review knows about
- Violate a data contract that was carefully set up in OpenMetadata
- Expose PII to a downstream consumer through a lineage path nobody remembered

The infrastructure to detect these problems already exists in OpenMetadata — lineage graphs, ownership, classifications, tier metadata, and data contracts. But that information sits in a separate tool that nobody checks during a PR review.

**The gap:** PR reviews don't have access to data governance context, and data governance platforms don't have access to PR workflows.

## Solution

LineageLock bridges this gap. It's a GitHub Action that runs on every PR that touches data model files. It:

1. Detects changed dbt models, SQL files, and schema YAML in the PR
2. Resolves each file to an OpenMetadata entity using configurable path-to-FQN mappings
3. Fetches the entity's lineage graph, ownership, tags, tier, and data contract status from OpenMetadata
4. Computes a deterministic risk score (0–100) based on 7 weighted factors
5. Posts a rich Markdown risk report as a PR comment
6. Optionally blocks the PR if the risk exceeds a configurable threshold

This puts OpenMetadata's governance intelligence directly in the PR — where merge decisions are made.

---

## How It Integrates OpenMetadata

LineageLock uses 6 OpenMetadata capabilities through the official REST API:

| # | Capability | API Used | Purpose in LineageLock |
|---|-----------|----------|----------------------|
| 1 | **Entity Resolution** | `GET /api/v1/tables/name/{fqn}` | Map changed PR files to OpenMetadata table entities |
| 2 | **Lineage Graph** | `GET /api/v1/lineage/table/{id}` | Compute blast radius — downstream tables, dashboards, ML models, pipelines |
| 3 | **Ownership** | Entity `owners[]` / `owner` field | Identify stakeholders to notify when their asset is impacted (supports v1.12+ `owners` array and legacy `owner` field) |
| 4 | **Classifications/Tags** | Entity & column `tags` fields | Detect PII, GDPR, and sensitive data exposure risks |
| 5 | **Tier/Criticality** | Entity `tier` tag | Identify changes to business-critical Tier 1/Tier 2 assets |
| 6 | **Data Contracts** | `GET /api/v1/dataQuality/testSuites/search/list` | Check if data quality tests are passing or failing |

This is not a superficial integration. LineageLock depends on OpenMetadata as its core data source — without it, there is no blast radius, no governance context, and no risk score.

---

## Technical Architecture

```
PR Event → File Detection → Asset Resolution → OpenMetadata API → Risk Scoring → PR Comment
```

**Stack:** TypeScript, Node.js 20, GitHub Actions

**Components:**
- **GitHub Action** (`action.yml`) — triggers on PRs, posts comments, sets pass/fail
- **OpenMetadata Client** (`src/openmetadata/client.ts`) — REST API client with entity, lineage, and contract fetching
- **Asset Resolver** (`src/resolver/`) — maps file paths to OpenMetadata FQNs via explicit mappings or naming conventions
- **Risk Scoring Engine** (`src/risk/`) — deterministic 0-100 scorer with 7 configurable factors
- **Report Renderer** (`src/report/`) — rich Markdown PR comment with collapsible sections
- **CLI** (`src/cli.ts`) — local dry-run and demo mode
- **Fixtures** (`src/fixtures/`) — realistic demo data for guaranteed demos

**Quality:**
- Full TypeScript with strict mode
- Test suite with 30+ test cases
- Type-safe OpenMetadata API response handling

---

## Risk Scoring Formula

| Factor | Weight | Trigger |
|--------|--------|---------|
| Contract violation (failing tests) | +40 | Data contract tests failing in OpenMetadata |
| Critical tier asset | +20 | Entity tagged as Tier 1 or Tier 2 |
| Sensitive data tags | +20 | PII, GDPR, Confidential, PHI, or PCI tags found |
| Downstream dashboards | +10 | At least 1 dashboard in downstream lineage |
| Downstream ML models | +10 | At least 1 ML model in downstream lineage |
| High downstream count | +10 | 5+ total downstream entities |
| No clear owner | +10 | No owner assigned in OpenMetadata |

Score capped at 100. All weights configurable via `.lineagelock.json`.

---

## Setup Instructions

```bash
# Clone
git clone https://github.com/jayjoshix/incident-commander.git
cd incident-commander

# Install
npm install

# Demo (no OpenMetadata needed)
npx ts-node src/cli.ts demo

# Tests
npm test

# Build
npm run build
```

### For real usage:

1. Add `.lineagelock.json` to your data repo
2. Set `OPENMETADATA_URL` and `OPENMETADATA_TOKEN` as GitHub secrets
3. Add the GitHub Action workflow (see `.github/workflows/lineagelock.yml`)

---

## Demo

The project includes a `demo` CLI mode with realistic fixture data. No live OpenMetadata instance required.

```bash
# Full demo (3 entities: high-risk, low-risk, unresolved)
npx ts-node src/cli.ts demo

# High-risk scenario only (Tier 1 fact table, PII, dashboards, contract failure)
npx ts-node src/cli.ts demo --scenario high-risk

# Low-risk scenario (staging table, no owner)
npx ts-node src/cli.ts demo --scenario low-risk
```

See `DEMO_SCRIPT.md` for a complete 3-minute presentation script.

---

## What's Real vs. Demo-Only

| Component | Status | Notes |
|-----------|--------|-------|
| OpenMetadata REST API client | ✅ Real | Connects to any OpenMetadata instance |
| Entity resolution by FQN | ✅ Real | Uses `/api/v1/tables/name/{fqn}` |
| Lineage graph fetching | ✅ Real | Uses `/api/v1/lineage/table/{id}` |
| Data contract validation | ✅ Real | Uses `/api/v1/dataQuality/testSuites/search/list` |
| Risk scoring engine | ✅ Real | Deterministic, fully functional |
| PR comment rendering | ✅ Real | Produces valid GitHub Markdown |
| GitHub Action | ✅ Real | Wired up, ready for deployment |
| CLI analyze mode | ✅ Real | Works against live OpenMetadata |
| Demo fixtures | 🎭 Demo | Realistic data for guaranteed demos |
| GitHub PR posting | ✅ Real | Requires running in GitHub Actions context |

---

## Why This Fits the Hackathon

1. **Deep OpenMetadata integration** — uses 6 API capabilities, not a superficial wrapper
2. **Solves a real problem** — data teams need governance in PR workflows
3. **Practical tool** — not a dashboard clone, not a chatbot, but a CI/CD-integrated guard
4. **Production-ready architecture** — clean TypeScript, tests, configurable, extensible
5. **Honest scope** — clearly labeled MVP with documented limitations and future work

---

## Limitations & Future Work

**Current scope (MVP):**
- Focused on table entities (dbt models, SQL, schema YAML)
- Convention-based or explicit file-to-entity mapping (no dbt manifest parsing yet)
- Lineage depth of 3 downstream hops
- Contract status via test suite results (not schema-diff comparison)

**Planned for v2:**
- Column-level impact analysis
- Schema diff detection (before/after comparison)
- dbt manifest.json parsing for ref() resolution
- Slack/Teams notifications to affected owners
- Dashboard and pipeline entities as first-class citizens
- OpenMetadata webhook integration for real-time lineage updates
- Response caching for large lineage graphs

---

## Team

Built for the WeMakeDevs × OpenMetadata Hackathon, April 2026.

## License

Apache 2.0
