# Architecture

## System Overview

LineageLock is structured as four layers: a **reusable TypeScript library**, a **GitHub Action** with workflow automation, a **CLI**, and a **website dashboard**. All share the same core modules.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Entry Points                                  │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐  ┌───────────┐   │
│  │ GitHub Action │  │    CLI     │  │ Library API │  │  Website  │   │
│  │ src/action/   │  │ src/cli.ts │  │ src/index.ts│  │ scripts/  │   │
│  └──────┬───────┘  └─────┬──────┘  └──────┬──────┘  └─────┬─────┘   │
│         └────────────────┼────────────────┼────────────────┘         │
│                          │                │                           │
│  ┌───────────────────────▼────────────────▼──────────────────────┐   │
│  │                     Core Pipeline                              │   │
│  │                                                                │   │
│  │  1. Patch Parser ─→ 2. Asset Resolver ─→ 3. OM Client         │   │
│  │       │                    │                    │               │   │
│  │       ▼                    ▼                    ▼               │   │
│  │  Parse PR diffs       Map files to FQNs    Fetch entity        │   │
│  │  for changed cols     via mappings or      metadata, lineage,  │   │
│  │                       naming convention    contracts, glossary  │   │
│  │       │                    │                    │               │   │
│  │       ▼                    ▼                    ▼               │   │
│  │  4. Risk Scorer ─→ 5. PR Aggregate ─→ 6. Report Renderer      │   │
│  │       │                    │                    │               │   │
│  │       ▼                    ▼                    ▼               │   │
│  │  Score 0-100          Escalate for         Markdown PR          │   │
│  │  per entity           compound risk        comment with         │   │
│  │                                            column impact        │   │
│  │                              │                                  │   │
│  │                              ▼                                  │   │
│  │                     7. Workflow Automation                      │   │
│  │                        │         │         │                    │   │
│  │                        ▼         ▼         ▼                    │   │
│  │                   Reviewers   Labels   Webhooks                 │   │
│  │                   from OM     risk-    Slack/Teams/             │   │
│  │                   owners      based    generic                  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                  OpenMetadata REST API (8 capabilities)         │   │
│  │                                                                │   │
│  │  GET /api/v1/tables/name/{fqn}        Entity metadata          │   │
│  │  GET /api/v1/lineage/table/{id}       Lineage graph            │   │
│  │  ├─ edge.columnLineage                Column-level lineage     │   │
│  │  GET /api/v1/dataContracts             Contract validation      │   │
│  │  (fallback: /api/v1/dataQuality/…)      (dual-track, OM 1.5+)   │   │
│  │  Entity tags (source: Glossary)       Glossary terms           │   │
│  │  Entity owners[]                      Reviewer routing         │   │
│  │  Entity tags (PII, GDPR, etc.)        Classification           │   │
│  │  Entity tier tag                      Criticality               │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### `src/diff/`
- **`patch-parser.ts`** — Deterministic changed-column detection from PR patches
  - SQL: SELECT clause columns, ALTER TABLE, column aliases
  - YAML: dbt schema.yml column definitions, descriptions, tests
  - Explicit confidence levels (`high` / `medium` / `low`)
  - No LLM dependency — pure regex/heuristic parsing

### `src/config/`
- **`types.ts`** — TypeScript interfaces for `.lineagelock.json` and runtime config
  - Includes `automation` config for reviewers, labels, and notifications
- **`loader.ts`** — Loads config with priority: env vars > JSON file > defaults

### `src/resolver/`
- **`asset-resolver.ts`** — Maps PR changed files to OpenMetadata FQNs
  - Supports explicit `mappings[]` (glob → FQN template)
  - Falls back to convention-based resolution (service.database.schema.name)
  - Two name strategies: `filename` (basename) or `path` (directory-based)

### `src/openmetadata/`
- **`types.ts`** — TypeScript types matching OpenMetadata REST API responses
- **`client.ts`** — HTTP client using axios with:
  - Entity lookup by FQN
  - Lineage fetching with configurable depth
  - **Column-level lineage extraction** from edge `columnLineage` fields
  - **Glossary term detection** from tags with `source: Glossary`
  - Data contract/test suite status
  - Downstream impact categorization (tables, dashboards, ML models, pipelines)
  - 404 graceful handling
  - Response normalization for both v1.12+ and legacy API shapes

### `src/risk/`
- **`types.ts`** — Risk factor, assessment, and report types
- **`scoring.ts`** — Deterministic scoring engine
  - 7 weighted risk factors (configurable weights)
  - PII.None/PII.NonSensitive false-positive exclusion
  - Score capped at 100
  - Level mapping: LOW/MEDIUM/HIGH/CRITICAL
  - Decision computation against configurable thresholds
- **`pr-aggregate.ts`** — PR-level aggregate risk escalation
  - Multiple medium+ entities compound risk
  - Multiple contract failures escalation
  - Unresolved entity blind spots
  - High column change count
  - Multiple critical-tier assets

### `src/report/`
- **`renderer.ts`** — Generates a rich Markdown PR comment with:
  - Overall summary table (with aggregate score)
  - PR-level escalation breakdown
  - **Column-level impact section** with changed columns and downstream column tracing
  - Blast radius counts
  - Per-entity collapsible details
  - Risk factor breakdown
  - Downstream asset lists with **column lineage mappings**
  - Governance summary (owner, tier, tags, **glossary terms**)
  - Contract test status
  - **Owner action recommendations**
  - Unresolved entity warnings

### `src/automation/`
- **`workflow.ts`** — Workflow automation engine:
  - **Reviewer routing:** Maps OpenMetadata owners → GitHub usernames
  - **Label automation:** 6 idempotent risk-based PR labels
  - **Webhook notifications:** Slack blocks, Teams MessageCard, generic JSON
  - All automation is opt-in, configurable, and failure-safe

### `src/action/`
- **`github.ts`** — GitHub API helpers (PR context, changed files, comment posting)
- **`main.ts`** — Orchestrates the full pipeline: patch parsing → entity resolution → metadata fetch → scoring → aggregate → comment → reviewers → labels → webhooks

### `src/cli.ts`
- CLI with two modes:
  - `analyze` — Live analysis against an OpenMetadata instance
  - `demo` — Fixture-based demo with simulated patch analysis and PR aggregate

### `src/fixtures/`
- **`demo-data.ts`** — Realistic fixture data based on actual OpenMetadata API shapes
  - High-risk Tier 1 fact table with PII, dashboards, ML models, column lineage, glossary terms, and failing contracts
  - Low-risk staging table with no owner
  - Unresolved entity scenario

## Data Flow

```
PR Event
  │
  ├── Extract changed files + patches from GitHub API
  │
  ├── Filter: models/**/*.sql, models/**/*.yml, etc.
  │
  ├── Parse patches for changed columns (deterministic SQL/YAML analysis)
  │
  ├── For each matched file:
  │     ├── Resolve to OpenMetadata FQN
  │     │     ├── Check explicit mappings first
  │     │     └── Fall back to naming convention
  │     │
  │     ├── Fetch from OpenMetadata:
  │     │     ├── GET /api/v1/tables/name/{fqn}
  │     │     │     → entity metadata, owner, tags, tier, columns, glossary terms
  │     │     │
  │     │     ├── GET /api/v1/lineage/table/{id}
  │     │     │     → upstream & downstream graph + column-level lineage
  │     │     │
  │     │     └── GET /api/v1/dataContracts (OM 1.5+)
  │     │           → official contract status, results
  │     │         fallback: GET /api/v1/dataQuality/testSuites/search/list
  │     │           → test suite results as contract proxy
  │     │           → contract test results
  │     │
  │     └── Categorize downstream nodes:
  │           tables, dashboards, ML models, pipelines, column mappings
  │
  ├── Score each entity (7 risk factors → 0-100)
  │
  ├── Intersect changed columns with column-level lineage
  │
  ├── Compute PR-level aggregate (escalation for compound risk)
  │
  ├── Render Markdown report (with column impact + glossary + aggregate)
  │
  ├── Post/update PR comment (idempotent via marker)
  │
  ├── Request reviewers from OpenMetadata owners
  │
  ├── Apply risk-based PR labels
  │
  ├── Send webhook notifications (Slack/Teams/generic)
  │
  └── Set outputs: risk_score, risk_level, decision, changed_columns
        └── Exit non-zero if fail threshold exceeded
```

## Design Decisions

### Why deterministic scoring?
LLM-based or heuristic scoring would be unpredictable. A deterministic formula with configurable weights lets teams tune the behavior and understand exactly why a PR was flagged.

### Why deterministic patch parsing?
Changed column detection uses regex/heuristic analysis, not an LLM. This keeps the tool fast, reproducible, and dependency-free. When detection is uncertain, it degrades gracefully with explicit confidence levels instead of guessing.

### Why PR-level aggregate scoring?
A single high-risk entity is different from five medium-risk entities. The aggregate scoring ensures that compound risk across a PR escalates review urgency, even when no single entity exceeds the threshold alone.

### Why not parse dbt manifest.json?
The MVP resolves files to entities using path-based conventions and explicit mappings. This works for most dbt projects. Manifest parsing is planned for v2 to support compiled SQL and ref() resolution.

### Why idempotent PR comments?
LineageLock uses a hidden HTML marker (`<!-- lineagelock-report -->`) to find and update its own comment instead of creating duplicates on re-runs.

### Why failure-safe automation?
Reviewer requests, label application, and webhook notifications are wrapped in try/catch with visible warnings. The main risk analysis always completes even if optional automation fails.

### Why fixture-based demo mode?
Hackathon judges need a guaranteed demo. The fixture data mirrors real OpenMetadata API response shapes, showing what the tool produces with real data — without requiring a live OpenMetadata instance during evaluation.
