# Hackathon Submission — LineageLock

## WeMakeDevs × OpenMetadata Hackathon (April 17–26, 2026)

---

## Project Name

**LineageLock** — OpenMetadata-native merge governance for data PRs

## Tagline

*Every data PR answered: what changed, what breaks, who must review, which policy triggered, why OpenMetadata is required.*

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

LineageLock is a GitHub Action that runs on every PR touching data model files. For each changed file it answers 5 questions — all sourced directly from OpenMetadata:

1. **What changed?** — Deterministic SQL/YAML patch analysis detects changed columns
2. **What breaks?** — Column-level lineage intersection shows exact downstream columns, dashboards, and ML models
3. **Who must review?** — Approval policies derived from Tier, PII tags, glossary terms, contracts, and ownership
4. **Which governance policy triggered?** — 5 built-in policies driven by OpenMetadata metadata, all with explicit reasons
5. **Why is OpenMetadata required?** — Without lineage, ownership, contracts, and classifications, none of this is possible

The PR comment structure:
```
🔴 CRITICAL · 100/100 · 🚫 Block

### 🚫 Merge Blocked — 2 Approval Policies Require Sign-off
   Critical tier asset with sensitive data → team:data-platform, team:business-owners
   Failing contract + downstream dashboards → team:data-quality

### 🔬 What Changed → What Breaks
   amount → total_revenue in agg_daily_revenue
   customer_id → customer_id in agg_customer_ltv
   Affected: Revenue Dashboard, churn_predictor

### 🏛️ Governance Triggers (from OpenMetadata)
   Tier.Tier1 · PII.Sensitive · Glossary.Revenue · Contract: Failing

### ⚡ Automation (with reasons)
   team:data-platform — Tier1 + PII policy triggered
   lineagelock:pii-impact — column tags include PII/GDPR

> ⚠️ Active Quality Issues: amount_positive failing for 3 days

📋 Safe Rollout Guidance: dual-write → migrate → deprecate
```

LineageLock also posts a **GitHub Check Run** alongside the PR comment, integrating with branch protection rules.

---

## How It Integrates OpenMetadata

LineageLock uses **10 OpenMetadata capabilities** through the official REST API:

| # | Capability | API Used | Purpose in LineageLock |
|---|-----------|----------|----------------------|
| 1 | **Entity Resolution** | `GET /api/v1/tables/name/{fqn}` | Map changed PR files to OpenMetadata table entities |
| 2 | **Lineage Graph** | `GET /api/v1/lineage/table/{id}` | Compute blast radius — downstream tables, dashboards, ML models, pipelines |
| 3 | **Column-Level Lineage** | Lineage edge `columnLineage` field | Intersect changed columns with downstream column mappings for precise breakage analysis |
| 4 | **Ownership** | Entity `owners[]` / `owner` field | Route PR reviewers and drive approval policies (supports v1.12+ and legacy) |
| 5 | **Classifications/Tags** | Entity & column `tags` fields | Detect PII, GDPR, and sensitive data — drives COLUMN_PII_BREAKAGE approval policy |
| 6 | **Glossary Terms** | Entity tags with `source: Glossary` | Drive GLOSSARY_BUSINESS_CRITICAL policy for Revenue/CustomerData-linked assets |
| 7 | **Tier/Criticality** | Entity `tier` tag | Drive TIER1_PII approval policy — requires Data Platform + Business Owner sign-off |
| 8 | **Data Contracts** | `GET /api/v1/dataContracts` (OM 1.5+) → fallback `GET /api/v1/dataQuality/testSuites/search/list` | Dual-track contract validation — drives CONTRACT_FAILURE_DASHBOARD block policy |
| 9 | **Observability / Test Results** | `GET /api/v1/dataQuality/testCases/search/list` | Surface active quality failures — "this asset is already failing, this PR adds risk" |
| 10 | **GitHub Check Run** | `POST /checks` (GitHub API) | Post a blocking check alongside the PR comment for branch protection integration |

**This is not a superficial integration.** Without OpenMetadata, LineageLock has no blast radius, no approval policies, no governance context, and no risk score. Every output is derived from OpenMetadata metadata.

---

## Why This Wins

**LineageLock is the only tool that turns OpenMetadata into a merge-time governance gate.**

Most OpenMetadata integrations are read-only dashboards or search interfaces. LineageLock is an enforcement layer that plugs into the developer workflow where merge decisions happen.

- **Approval Policy Engine** — 5 built-in policies driven entirely by OM metadata: Tier+PII, contract+dashboard, glossary business terms, PII column breakage, no-owner block
- **Column-level precision** — not "this table changed" but "this column changed → here's every downstream column, dashboard, and ML model it feeds"
- **Active observability** — "this asset already has 2 failing quality tests (3 days old). This PR adds risk on top."
- **Safe rollout guidance** — for risky changes: "dual-write first, migrate consumers, then deprecate"
- **GitHub Check Run** — integrates with branch protection, not just a comment
- **Real automation with reasons** — every reviewer request and label includes an explicit OpenMetadata signal as justification

---

## Technical Architecture

```
PR Event → Patch Parsing → Asset Resolution → OpenMetadata API → Observability Enrichment → Column Intersection → Risk Scoring → PR Aggregate → Policy Engine → Comment + Check Run + Labels + Reviewers + Webhooks
```

**Stack:** TypeScript, Node.js 20, GitHub Actions

**Components:**
- **GitHub Action** (`action.yml`) — triggers on PRs, posts comments, creates Check Runs, requests reviewers, applies labels
- **Patch Parser** (`src/diff/patch-parser.ts`) — deterministic SQL/YAML diff analysis for changed column detection
- **OpenMetadata Client** (`src/openmetadata/client.ts`) — REST client for 9 OM capabilities: entity, lineage, column lineage, owners, tags, glossary, tier, contracts, observability
- **Asset Resolver** (`src/resolver/`) — maps file paths to OpenMetadata FQNs via explicit mappings or naming conventions
- **Risk Scoring Engine** (`src/risk/scoring.ts`) — deterministic 0–100 scorer with 7 configurable factors
- **PR Aggregate Engine** (`src/risk/pr-aggregate.ts`) — escalates when multiple entities compound risk
- **Approval Policy Engine** (`src/policy/approval-engine.ts`) — 5 OM-driven policies: TIER1_PII, CONTRACT_FAILURE_DASHBOARD, GLOSSARY_BUSINESS_CRITICAL, COLUMN_PII_BREAKAGE, NO_OWNER
- **Rollout Guidance** (`src/policy/rollout-guidance.ts`) — safe migration steps for modified/renamed columns with downstream impact
- **Report Renderer** (`src/report/renderer.ts`) — impact-first PR comment: policies → blast radius → governance → observability → rollout
- **Workflow Automation** (`src/automation/workflow.ts`) — reviewer routing (users + teams), label automation, Slack/Teams/webhook notifications
- **CLI** (`src/cli.ts`) — local dry-run and demo mode (`--scenario high-risk / low-risk`)

**Quality:**
- Full TypeScript with strict mode
- **9 test suites, 112 test cases** covering patch parsing, scoring, aggregation, policy engine, automation, and rendering
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
