# Architecture

## System Overview

LineageLock is structured as three layers: a **reusable TypeScript library**, a **GitHub Action**, and a **CLI**. All three share the same core modules.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Points                             │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐   │
│  │ GitHub Action │   │   CLI (dry-run)  │   │  Library API  │   │
│  │ src/action/   │   │   src/cli.ts     │   │  src/index.ts │   │
│  └──────┬───────┘   └────────┬─────────┘   └──────┬────────┘   │
│         │                    │                     │            │
│         └────────────────────┼─────────────────────┘            │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │                    Core Pipeline                          │   │
│  │                                                           │   │
│  │  1. Config Loader ─→ 2. Asset Resolver ─→ 3. OM Client   │   │
│  │        │                     │                   │        │   │
│  │        ▼                     ▼                   ▼        │   │
│  │  Load .lineagelock    Map files to FQNs    Fetch entity   │   │
│  │  .json + env vars     via mappings or      metadata,      │   │
│  │                       naming convention    lineage, and   │   │
│  │                                            contracts      │   │
│  │                              │                            │   │
│  │                              ▼                            │   │
│  │              4. Risk Scorer ─→ 5. Report Renderer         │   │
│  │                    │                   │                   │   │
│  │                    ▼                   ▼                   │   │
│  │             Score 0-100          Markdown PR               │   │
│  │             + risk level         comment                   │   │
│  │             + pass/warn/fail                               │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                 OpenMetadata REST API                      │   │
│  │                                                           │   │
│  │  GET /api/v1/tables/name/{fqn}      Entity metadata       │   │
│  │  GET /api/v1/lineage/table/{id}     Lineage graph         │   │
│  │  GET /api/v1/dataQuality/testSuites Contract validation   │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### `src/config/`
- **`types.ts`** — TypeScript interfaces for `.lineagelock.json` and runtime config
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
  - Data contract/test suite status
  - Downstream impact categorization (tables, dashboards, ML models, pipelines)
  - 404 graceful handling
  - Response normalization

### `src/risk/`
- **`types.ts`** — Risk factor, assessment, and report types
- **`scoring.ts`** — Deterministic scoring engine
  - 7 weighted risk factors (configurable weights)
  - Score capped at 100
  - Level mapping: LOW/MEDIUM/HIGH/CRITICAL
  - Decision computation against configurable thresholds

### `src/report/`
- **`renderer.ts`** — Generates a rich Markdown PR comment with:
  - Overall summary table
  - Blast radius counts
  - Per-entity collapsible details
  - Risk factor breakdown
  - Downstream asset lists
  - Governance summary (owner, tier, tags)
  - Contract test status
  - Unresolved entity warnings

### `src/action/`
- **`github.ts`** — GitHub API helpers (PR context, changed files, comment posting)
- **`main.ts`** — Orchestrates the full action pipeline

### `src/cli.ts`
- CLI with three modes:
  - `analyze` — Live analysis against an OpenMetadata instance
  - `demo` — Fixture-based demo (no external deps)
  - Default shorthand for quick file analysis

### `src/fixtures/`
- **`demo-data.ts`** — Realistic fixture data based on actual OpenMetadata API shapes
  - High-risk Tier 1 fact table with PII, dashboards, ML models, and failing contracts
  - Low-risk staging table with no owner
  - Unresolved entity scenario

## Data Flow

```
PR Event
  │
  ├── Extract changed files from GitHub API
  │
  ├── Filter: models/**/*.sql, models/**/*.yml, etc.
  │
  ├── For each matched file:
  │     ├── Resolve to OpenMetadata FQN
  │     │     ├── Check explicit mappings first
  │     │     └── Fall back to naming convention
  │     │
  │     ├── Fetch from OpenMetadata:
  │     │     ├── GET /api/v1/tables/name/{fqn}
  │     │     │     → entity metadata, owner, tags, tier, columns
  │     │     │
  │     │     ├── GET /api/v1/lineage/table/{id}
  │     │     │     → upstream & downstream graph
  │     │     │
  │     │     └── GET /api/v1/dataQuality/testSuites
  │     │           → contract test results
  │     │
  │     └── Categorize downstream nodes:
  │           tables, dashboards, ML models, pipelines
  │
  ├── Score each entity (7 risk factors → 0-100)
  │
  ├── Aggregate: max score, overall level, decision
  │
  ├── Render Markdown report
  │
  ├── Post/update PR comment (idempotent via marker)
  │
  └── Set outputs: risk_score, risk_level, decision
        └── Exit non-zero if fail threshold exceeded
```

## Design Decisions

### Why deterministic scoring?
LLM-based or heuristic scoring would be unpredictable. A deterministic formula with configurable weights lets teams tune the behavior and understand exactly why a PR was flagged.

### Why not parse dbt manifest.json?
The MVP resolves files to entities using path-based conventions and explicit mappings. This works for most dbt projects. Manifest parsing is planned for v2 to support compiled SQL and ref() resolution.

### Why idempotent PR comments?
LineageLock uses a hidden HTML marker (`<!-- lineagelock-report -->`) to find and update its own comment instead of creating duplicates on re-runs.

### Why fixture-based demo mode?
Hackathon judges need a guaranteed demo. The fixture data mirrors real OpenMetadata API response shapes, showing what the tool produces with real data — without requiring a live OpenMetadata instance during evaluation.
