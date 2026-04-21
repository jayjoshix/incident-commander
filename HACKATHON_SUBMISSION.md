# Hackathon Submission — LineageLock

## WeMakeDevs × OpenMetadata Hackathon (April 17–26, 2026)

---

## Project Name

**LineageLock** — GitHub PR guard for data changes

## Tagline

*Turns OpenMetadata from a passive catalog into active merge-time governance.*

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
2. **Parses PR patches to detect changed columns** using deterministic SQL/YAML diff analysis
3. Resolves each file to an OpenMetadata entity using configurable path-to-FQN mappings
4. Fetches the entity's lineage graph, ownership, tags, tier, glossary terms, and data contract status
5. **Intersects changed columns with column-level lineage** to show exactly which downstream columns and entities are impacted
6. Computes a deterministic risk score (0–100) with **PR-level aggregate escalation** when multiple entities compound risk
7. Posts a rich Markdown risk report with column-level impact, governance details, and owner action recommendations
8. **Requests reviewers from OpenMetadata owners**, applies risk-based PR labels, and sends webhook notifications
9. Optionally blocks the PR if the risk exceeds a configurable threshold

This puts OpenMetadata's governance intelligence directly in the PR — where merge decisions are made.

---

## How It Integrates OpenMetadata

LineageLock uses 8 OpenMetadata capabilities through the official REST API:

| # | Capability | API Used | Purpose in LineageLock |
|---|-----------|----------|----------------------|
| 1 | **Entity Resolution** | `GET /api/v1/tables/name/{fqn}` | Map changed PR files to OpenMetadata table entities |
| 2 | **Lineage Graph** | `GET /api/v1/lineage/table/{id}` | Compute blast radius — downstream tables, dashboards, ML models, pipelines |
| 3 | **Column-Level Lineage** | Lineage edge `columnLineage` field | Track which specific columns flow downstream — intersected with PR patch analysis |
| 4 | **Ownership** | Entity `owners[]` / `owner` field | Route PR reviewers and identify stakeholders (supports v1.12+ `owners` array and legacy `owner` field) |
| 5 | **Classifications/Tags** | Entity & column `tags` fields | Detect PII, GDPR, and sensitive data exposure risks (with false-positive filtering for PII.None) |
| 6 | **Glossary Terms** | Entity tags with `source: Glossary` | Detect changes touching business-critical glossary terms (Revenue, Customer Data) |
| 7 | **Tier/Criticality** | Entity `tier` tag | Identify changes to business-critical Tier 1/Tier 2 assets |
| 8 | **Data Contracts** | `GET /api/v1/dataContracts` (OM 1.5+) with fallback to `GET /api/v1/dataQuality/testSuites/search/list` | Dual-track contract validation — uses official API when available, falls back gracefully to test-suite proxy |

This is not a superficial integration. LineageLock depends on OpenMetadata as its core data source — without it, there is no blast radius, no governance context, and no risk score.

---

## Why This Wins

**LineageLock turns OpenMetadata from a passive catalog into active merge-time governance.**

Most OpenMetadata integrations are read-only dashboards or search interfaces. LineageLock is the opposite — it's an enforcement layer that plugs directly into the developer workflow where decisions happen: the pull request.

- **Every PR that touches data** automatically gets OpenMetadata's lineage, ownership, classification, and contract intelligence
- **Column-level precision** — not just "this table changed" but "this column changed, and here's every downstream column and dashboard it feeds"
- **Real workflow automation** — reviewer requests, risk labels, and webhook notifications, all driven by OpenMetadata metadata
- **Honest about what it knows** — when patch analysis is uncertain, it says so explicitly instead of pretending precision

---

## Technical Architecture

```
PR Event → File Detection → Patch Parsing → Asset Resolution → OpenMetadata API → Column Intersection → Risk Scoring → PR Aggregate → Comment + Labels + Reviewers + Webhooks
```

**Stack:** TypeScript, Node.js 20, GitHub Actions

**Components:**
- **GitHub Action** (`action.yml`) — triggers on PRs, posts comments, requests reviewers, applies labels
- **Patch Parser** (`src/diff/patch-parser.ts`) — deterministic SQL/YAML diff analysis for changed column detection
- **OpenMetadata Client** (`src/openmetadata/client.ts`) — REST API client with entity, lineage, column lineage, glossary, and contract fetching
- **Asset Resolver** (`src/resolver/`) — maps file paths to OpenMetadata FQNs via explicit mappings or naming conventions
- **Risk Scoring Engine** (`src/risk/scoring.ts`) — deterministic 0-100 scorer with 7 configurable factors
- **PR Aggregate Engine** (`src/risk/pr-aggregate.ts`) — escalates review urgency when multiple entities compound risk
- **Report Renderer** (`src/report/renderer.ts`) — rich Markdown PR comment with column-level impact, glossary terms, and owner actions
- **Workflow Automation** (`src/automation/workflow.ts`) — reviewer routing, label automation, Slack/Teams/webhook notifications
- **CLI** (`src/cli.ts`) — local dry-run and demo mode
- **Website** (`scripts/website.js`) — interactive analysis dashboard with live OpenMetadata sandbox connection

**Quality:**
- Full TypeScript with strict mode
- 8 test suites with 90+ test cases covering patch parsing, scoring, aggregation, automation, and rendering
- Type-safe OpenMetadata API response handling
- False-positive filtering for sensitive tag detection

---

## Risk Scoring Formula

| Factor | Weight | Trigger |
|--------|--------|---------|
| Contract violation (failing tests) | +40 | Data contract tests failing in OpenMetadata |
| Critical tier asset | +20 | Entity tagged as Tier 1 or Tier 2 |
| Sensitive data tags | +20 | PII, GDPR, Confidential, PHI, or PCI tags found (PII.None excluded) |
| Downstream dashboards | +10 | At least 1 dashboard in downstream lineage |
| Downstream ML models | +10 | At least 1 ML model in downstream lineage |
| High downstream count | +10 | 5+ total downstream entities |
| No clear owner | +10 | No owner assigned in OpenMetadata |

### PR-Level Aggregate Escalation

On top of per-entity scores, LineageLock computes a PR-level aggregate that escalates when:
- **Multiple medium+ risk entities** in the same PR (+5 per additional)
- **Multiple contract failures** across entities (+5 per)
- **Unresolved entities** that create blind spots (+3 per)
- **High column change count** (3+ columns changed across files)
- **Multiple critical-tier assets** touched in single PR (+10)

Score capped at 100. All weights configurable via `.lineagelock.json`.

---

## Workflow Automation

LineageLock extends beyond comments into real GitHub workflow automation:

| Feature | How It Works |
|---------|-------------|
| **Reviewer Routing** | Maps OpenMetadata entity owners to GitHub usernames, requests reviews automatically |
| **Risk Labels** | Applies idempotent labels: `lineagelock:tier1-change`, `lineagelock:pii-impact`, `lineagelock:contract-risk`, `lineagelock:column-breakage`, `lineagelock:high-risk`, `lineagelock:no-owner` |
| **Slack Notifications** | Rich Slack messages with risk summary and PR link |
| **Teams Notifications** | MessageCard format for Microsoft Teams |
| **Generic Webhooks** | JSON payload to any webhook endpoint |

All automation is **opt-in and configurable** via `.lineagelock.json`. Notification failures never block the main action.

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

# Tests (use --maxWorkers=1 for WSL)
npx jest --forceExit --maxWorkers=1

# Build
npm run build

# Website (live OpenMetadata analysis)
npm run website
```

### For real usage:

1. Add `.lineagelock.json` to your data repo
2. Set `OPENMETADATA_URL` and `OPENMETADATA_TOKEN` as GitHub secrets
3. Add the GitHub Action workflow (see `.github/workflows/lineagelock.yml`)
4. Optionally configure automation (reviewers, labels, notifications)

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

The **website** (`npm run website`) connects to the OpenMetadata sandbox for live interactive analysis with search, table selection, and real-time risk scoring.

See `DEMO_SCRIPT.md` for a complete 3-minute presentation script.

---

## What's Real vs. Demo-Only

| Component | Status | Notes |
|-----------|--------|-------|
| OpenMetadata REST API client | ✅ Real | Connects to any OpenMetadata instance |
| Entity resolution by FQN | ✅ Real | Uses `/api/v1/tables/name/{fqn}` |
| Lineage graph fetching | ✅ Real | Uses `/api/v1/lineage/table/{id}` |
| Column-level lineage | ✅ Real | Extracts `columnLineage` from edges |
| Glossary term detection | ✅ Real | Filters tags by `source: Glossary` |
| Data contract validation | ✅ Real | Dual-track: official `/api/v1/dataContracts` (OM 1.5+) → fallback to `/api/v1/dataQuality/testSuites/search/list` |
| Patch parser (changed columns) | ✅ Real | Deterministic SQL/YAML diff analysis |
| PR aggregate risk | ✅ Real | Compound risk escalation |
| Risk scoring engine | ✅ Real | Deterministic, fully functional |
| PR comment rendering | ✅ Real | Produces valid GitHub Markdown with column impact |
| Reviewer/label automation | ✅ Real | GitHub API integration, configurable |
| Webhook notifications | ✅ Real | Slack, Teams, generic formats |
| GitHub Action | ✅ Real | Wired up, ready for deployment |
| CLI analyze mode | ✅ Real | Works against live OpenMetadata |
| Website dashboard | ✅ Real | Live connection to OpenMetadata sandbox |
| Demo fixtures | 🎭 Demo | Realistic data for guaranteed demos |

---

## Why This Fits the Hackathon

1. **Deep OpenMetadata integration** — uses 8 API capabilities including column-level lineage and glossary terms
2. **Solves a real problem** — data teams need governance in PR workflows
3. **Unique angle** — the only tool that intersects PR diffs with column-level lineage for blast radius
4. **Production-ready architecture** — clean TypeScript, 90+ tests, configurable, extensible
5. **Real workflow automation** — not just a dashboard, but reviewer routing, labeling, and notifications
6. **Dual-track submission** — fits both **Developer Tooling & CI/CD** and **Governance & Classification** tracks
7. **Honest scope** — clearly labeled MVP with documented limitations and explicit confidence levels

---

## Limitations & Future Work

**Current scope (MVP):**
- Focused on table entities (dbt models, SQL, schema YAML)
- Convention-based or explicit file-to-entity mapping (no dbt manifest parsing yet)
- Lineage depth of 3 downstream hops
- Column detection is heuristic-based — confidence levels are explicit
- Contract validation uses test suite results (official contract API endpoint used when available, with fallback)

**Planned for v2:**
- dbt manifest.json parsing for `ref()` resolution
- Schema diff detection (before/after comparison)
- Slack/Teams app integration (beyond webhooks)
- Dashboard and pipeline entities as first-class citizens
- OpenMetadata webhook integration for real-time lineage updates
- Response caching for large lineage graphs

---

## Team

Built for the WeMakeDevs × OpenMetadata Hackathon, April 2026.

## License

Apache 2.0
