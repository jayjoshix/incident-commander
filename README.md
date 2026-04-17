# 🛡️ OpenMetadata Incident Commander

**Lineage-aware war room for data incidents.**

When a data quality test fails, schema drift happens, or a pipeline breaks — Incident Commander uses OpenMetadata metadata to show you the full picture in seconds, not hours.

![Status](https://img.shields.io/badge/status-hackathon--ready-7c3aed?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20TypeScript%20%2B%20Vite-blue?style=flat-square)
![OpenMetadata](https://img.shields.io/badge/integration-OpenMetadata-22c55e?style=flat-square)
![Cost](https://img.shields.io/badge/cost-%240%20%2F%20no%20API%20keys-green?style=flat-square)

---

## 🎯 Problem

When data breaks, teams waste hours playing detective:
- *"What was affected?"* — Nobody knows the blast radius
- *"How bad is it?"* — Severity is guesswork
- *"Who owns this?"* — Ownership is buried in wikis
- *"What should we do?"* — No playbook exists
- *"Is this PII data?"* — Governance info lives in another tool

**Result:** Slow response, missed SLAs, repeated incidents.

## 💡 Solution

Incident Commander is a **single pane of glass** for data incidents that auto-enriches every alert with OpenMetadata context:

| Feature | How It Helps |
|---|---|
| **Root Asset Identification** | Immediately see the origin of the problem |
| **Blast Radius Visualization** | Know every downstream table, dashboard, ML model, and pipeline affected |
| **Lineage Graph** | Interactive DAG showing upstream → downstream flow |
| **Deterministic Severity Scoring** | 7-signal weighted algorithm — no LLM needed |
| **Owner & Team Routing** | See every impacted person and team instantly |
| **Governance Tags** | PII, GDPR, Tier flags front-and-center |
| **Test Result Evidence** | Recent pass/fail details from OpenMetadata quality tests |
| **Resolution Checklist** | Interactive playbook tailored to incident type |
| **Incident Timeline** | Chronological event log of all actions |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                    React App                     │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ Incident List    │  │ War Room (Detail)     │ │
│  │  · Summary stats │  │  · Severity gauge     │ │
│  │  · Filter bar    │  │  · Lineage graph      │ │
│  │  · Incident cards│  │  · Asset info + tags  │ │
│  └──────────────────┘  │  · Blast radius       │ │
│                        │  · Owners & teams     │ │
│                        │  · Test results       │ │
│                        │  · Action checklist   │ │
│                        │  · Timeline           │ │
│                        └──────────────────────┘ │
├─────────────────────────────────────────────────┤
│             Severity Scoring Engine              │
│  7 weighted signals · deterministic · no LLM    │
├─────────────────────────────────────────────────┤
│           OpenMetadata Client Layer              │
│  REST API calls / Mock data provider             │
├─────────────────────────────────────────────────┤
│     OpenMetadata Server (or Mock Data)           │
└─────────────────────────────────────────────────┘
```

### Severity Scoring Signals (100-point scale)

| Signal | Weight | Logic |
|---|:---:|---|
| Downstream count | 20% | 0–20+ assets → 0–100 score |
| Asset tier / criticality | 20% | Tier1=100, Tier2=75, … |
| Sensitive / PII tags | 15% | Presence of PII/GDPR/HIPAA tags |
| Missing owner | 10% | Unowned asset = 80 score |
| Recent test failures | 10% | Failures in last 7 days |
| Impacted teams | 15% | Cross-team blast radius |
| Dashboard/ML model impact | 10% | Feeds critical consumers |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and npm

### 1. Clone & Install

```bash
git clone <repo-url>
cd openmeta
npm install
```

### 2. Run in Mock Mode (no setup needed)

```bash
npm run dev
```

Open **http://localhost:3000** — the app runs with realistic seeded data out of the box.

### 3. Run with Real OpenMetadata

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_OPENMETADATA_URL=http://localhost:8585
VITE_OPENMETADATA_TOKEN=eyJhbGciOi...
```

Then:
```bash
npm run dev
```

The header badge switches from 🟡 **Mock Mode** → 🟢 **Live** when connected.

---

## 🔧 Environment Variables

| Variable | Required | Description |
|---|:---:|---|
| `VITE_OPENMETADATA_URL` | No | OpenMetadata server URL (e.g. `http://localhost:8585`) |
| `VITE_OPENMETADATA_TOKEN` | No | JWT or bot token for authentication |

**Both empty = Mock Mode** with built-in demo data.

---

## 🎬 Demo Scenario

Follow this script for a compelling 3-minute demo:

### Act 1 — The Command Center (30s)
1. Open the app → Show the **Incident Command Center**
2. Point out the summary stats: active incidents, critical count
3. Show the severity color coding and filter options

### Act 2 — Critical Incident Deep Dive (90s)
1. Click the **"Null values detected in raw_orders.order_id"** incident
2. Walk through:
   - **Severity Gauge**: Score of 75+ with 7 signal breakdown
   - **Lineage Graph**: Interactive DAG showing data flow from ingestion → raw → staging → analytics → dashboards + ML model
   - **Root Asset Panel**: `warehouse.raw.orders` with PII tags highlighted in red
   - **Blast Radius**: 8+ downstream assets including Revenue Dashboard and Churn ML model
   - **Impacted Owners**: 4 people across 3 teams
   - **Test Results**: 4 failed, 1 passed — with detail messages
   - **Resolution Checklist**: Interactive, categorized steps

### Act 3 — Schema Drift & Pipeline Failure (45s)
1. Go back → Click schema drift incident → Show different checklist
2. Go back → Click pipeline failure → Show it's already partially resolved (3/10 checked)

### Act 4 — Why This Matters (15s)
- "Every signal here is from OpenMetadata — lineage, owners, tags, tiers, test results"
- "Zero LLM cost, zero external APIs — pure deterministic logic"
- "This turns a 2-hour war room into a 2-minute triage"

---

## 📂 Project Structure

```
src/
├── components/
│   ├── Header.tsx              # App header with mode indicator
│   ├── IncidentCard.tsx        # Incident list card
│   ├── AssetInfo.tsx           # Root asset detail panel
│   ├── SeverityScore.tsx       # Gauge + signal breakdown
│   ├── BlastRadius.tsx         # Downstream impact stats
│   ├── ImpactedOwners.tsx      # Owner/team cards
│   ├── TestResults.tsx         # Test case pass/fail list
│   ├── ActionChecklist.tsx     # Interactive resolution steps
│   ├── IncidentTimeline.tsx    # Chronological event log
│   └── LineageGraph.tsx        # React Flow lineage DAG
├── pages/
│   ├── IncidentListPage.tsx    # Incident command center
│   └── WarRoomPage.tsx         # Incident detail / war room
├── lib/
│   ├── types.ts                # TypeScript type definitions
│   ├── severity-engine.ts      # 7-signal scoring algorithm
│   └── openmetadata-client.ts  # REST API client layer
├── data/
│   └── mock-data.ts            # Seeded demo data (12 assets, 3 incidents)
├── App.tsx                     # Router setup
├── main.tsx                    # Entry point
└── index.css                   # Full design system
```

---

## 🔗 OpenMetadata Features Used

| Feature | How We Use It |
|---|---|
| **Entity Metadata** | Asset details, descriptions, service info |
| **Lineage API** | Upstream/downstream dependency traversal |
| **Ownership** | Route incidents to the right people |
| **Classifications & Tags** | PII, Sensitivity, GDPR detection |
| **Tier System** | Criticality weighting in severity score |
| **Data Quality Test Cases** | Evidence of failures, pass/fail history |
| **Test Case Results** | Actual error messages and failure counts |

---

## 🏆 Why This Wins a Hackathon

| Criterion | How We Nail It |
|---|---|
| **Real-world usefulness** | Every data team needs incident triage |
| **OpenMetadata depth** | Uses 7+ OpenMetadata features, not just search |
| **Zero cost** | No OpenAI, no paid APIs, runs locally |
| **Demo quality** | Dark-mode UI, animated graphs, interactive panels |
| **Technical depth** | Deterministic scoring engine, lineage traversal, BFS algorithms |
| **Completeness** | List → Detail → Scoring → Actions, full user flow |
| **Code quality** | TypeScript, typed throughout, clean separation |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| Routing | React Router v7 |
| Graph | React Flow (@xyflow/react) |
| Icons | Lucide React |
| Styling | Vanilla CSS (dark mode, glassmorphism) |
| Fonts | Inter + JetBrains Mono (Google Fonts) |

**Total dependencies: 4** (react-router-dom, @xyflow/react, lucide-react, + React itself)

---

## 📝 License

MIT — built for the WeMakeDevs hackathon.
