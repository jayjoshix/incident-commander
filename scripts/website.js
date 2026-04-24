#!/usr/bin/env node
/**
 * LineageLock Web Application
 * 
 * Full website with landing page + interactive risk analysis dashboard.
 * Usage: npm run website
 */

const express = require('express');
const path = require('path');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { OpenMetadataClient } = require('../dist/openmetadata/client');
const { scoreEntities } = require('../dist/risk/scoring');
const { computePRAggregate } = require('../dist/risk/pr-aggregate');
const { loadConfig } = require('../dist/config/loader');
const { evaluatePolicies } = require('../dist/policy/approval-engine');
const { generateRolloutGuidance } = require('../dist/policy/rollout-guidance');
const { computeTrustSignal } = require('../dist/trust/trust-signal');
const { generateRemediations } = require('../dist/remediation/remediation');
const { buildAuditTrail } = require('../dist/audit/audit-trail');
const { routeByRiskType } = require('../dist/routing/routing');
const { DEMO_ENTITIES } = require('../dist/fixtures/demo-data');
const { parsePatch } = require('../dist/diff/patch-parser');

const OM_URL = process.env.OPENMETADATA_URL || 'https://sandbox.open-metadata.org';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// ─── Shared governance pipeline ─────────────────────────────────────────────

function runGovernancePipeline(entities, config) {
  const patches = entities.map(e => ({ filePath: e.filePath, changedColumns: [], isStructuralChange: false, changeDescription: '' }));
  const report = scoreEntities(entities, config);
  const aggregate = computePRAggregate(report, entities, patches, config);
  const policyResult = evaluatePolicies(entities, patches, config);
  const trustSignal = computeTrustSignal(entities, report, policyResult);
  const routingResult = routeByRiskType(entities, report, policyResult);
  const remediationPlan = generateRemediations(entities, patches, report, policyResult);
  const auditTrail = buildAuditTrail({
    entities, report, aggregate, policyResult, patchAnalyses: patches,
    reviewerResult: { users: [...policyResult.allRequiredUsers, ...routingResult.users], teams: [...policyResult.allRequiredTeams, ...routingResult.teams] },
    appliedLabels: [],
  });
  const results = report.assessments.map((a, i) => {
    const entity = entities[i];
    const ownerObj = entity.entity && entity.entity.owner;
    const rollout = generateRolloutGuidance(patches[i], entity);
    return {
      file: a.filePath, fqn: a.fqn, found: entity.found !== false,
      score: a.score, level: a.level, factors: a.factors,
      owner: ownerObj ? (ownerObj.displayName || ownerObj.name) : null,
      ownerType: ownerObj ? ownerObj.type : null,
      tier: entity.entity ? entity.entity.tier : null,
      tags: ((entity.entity && entity.entity.tags) || []).map(t => t.tagFQN),
      columns: (entity.entity && entity.entity.columns) ? entity.entity.columns.length : 0,
      downstream: {
        total: (entity.downstream && entity.downstream.total) || 0,
        tables: (entity.downstream && entity.downstream.tables) ? entity.downstream.tables.length : 0,
        dashboards: (entity.downstream && entity.downstream.dashboards) ? entity.downstream.dashboards.length : 0,
        mlModels: (entity.downstream && entity.downstream.mlModels) ? entity.downstream.mlModels.length : 0,
        columnImpact: (entity.downstream && entity.downstream.columnImpact) || [],
      },
      glossaryTerms: entity.glossaryTerms || [],
      qualityIssues: entity.activeQualityIssues || [],
      rollout,
    };
  });
  const policies = policyResult.triggeredPolicies.map(p => ({
    name: p.name, severity: p.severity, reason: p.reason,
    requiredTeams: p.requiredTeams, requiredUsers: p.requiredUsers, signals: p.signals,
  }));
  return {
    maxScore: report.maxScore, overallLevel: report.overallLevel,
    decision: report.decision, summary: report.summary,
    results, policies,
    isBlocked: policyResult.isBlocked,
    allRequiredTeams: policyResult.allRequiredTeams,
    allRequiredUsers: policyResult.allRequiredUsers,
    trustSignal, remediationPlan, auditTrail, routingResult,
    isDemo: false,
  };
}

// ═══════════════════════════ API ═══════════════════════════

app.get('/api/health', async (req, res) => {
  try {
    const axios = require('axios');
    const http = axios.default.create({
      baseURL: OM_URL, timeout: 10000,
      headers: { Authorization: `Bearer ${OM_TOKEN}`, 'Content-Type': 'application/json' },
    });
    const ver = await http.get('/api/v1/system/version');
    res.json({ ok: true, version: ver.data.version, url: OM_URL });
  } catch (e) {
    res.json({ ok: false, error: e.message, url: OM_URL });
  }
});

// ─── Demo mode endpoint (uses fixture data, no OM needed) ─────────────────

app.get('/api/demo', async (req, res) => {
  try {
    const config = loadConfig(path.join(__dirname, '..', '.lineagelock.json'));
    const result = runGovernancePipeline(DEMO_ENTITIES, config);
    result.isDemo = true;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !files.length) {
      return res.status(400).json({ error: 'No files provided' });
    }
    const config = loadConfig(path.join(__dirname, '..', '.lineagelock.json'));
    const client = new OpenMetadataClient({ baseUrl: OM_URL, token: OM_TOKEN });
    const entities = [];
    for (const { file, fqn } of files) {
      const entity = await client.resolveEntity(file, fqn);
      entities.push(entity);
    }
    const result = runGovernancePipeline(entities, config);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tables', async (req, res) => {
  try {
    const axios = require('axios');
    const http = axios.default.create({
      baseURL: OM_URL, timeout: 15000,
      headers: { Authorization: `Bearer ${OM_TOKEN}`, 'Content-Type': 'application/json' },
    });
    const r = await http.get('/api/v1/tables', { params: { limit: 50, fields: 'owners,tags' } });
    const tables = (r.data.data || []).map(t => {
      const fqn = t.fullyQualifiedName || '';
      const parts = fqn.split('.');
      const schema = parts.length >= 3 ? parts[parts.length - 2] : 'unknown';
      const name = parts.length >= 1 ? parts[parts.length - 1] : t.name;
      const file = 'models/' + schema.toLowerCase() + '/' + name + '.sql';
      const owner = (t.owners && t.owners[0]) ? (t.owners[0].displayName || t.owners[0].name) : (t.owner ? (t.owner.displayName || t.owner.name) : null);
      const tier = (t.tags || []).find(tg => tg.tagFQN && tg.tagFQN.startsWith('Tier.'));
      return { file, fqn, name: t.name, owner, tier: tier ? tier.tagFQN : null, tagCount: (t.tags || []).length };
    });
    res.json({ tables });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════ PAGES ═══════════════════════════

app.get('/', (req, res) => { res.send(getHTML()); });

app.listen(PORT, () => {
  console.log(`\n🔒 LineageLock Website`);
  console.log(`   ✅ Running at http://localhost:${PORT}`);
  console.log(`   📡 OpenMetadata: ${OM_URL}`);
  console.log(`   Press Ctrl+C to stop\n`);
});

// ═══════════════════════════ HTML ═══════════════════════════

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LineageLock — PR Guard for Data Changes</title>
<meta name="description" content="Blast radius analysis, governance risk scoring, and contract verification for every pull request. Powered by OpenMetadata lineage.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#fffbf5;
  --bg-warm:#fff7ed;
  --surface:#ffffff;
  --surface-2:#fef3e2;
  --surface-3:#fdf2e9;
  --border:#f0e6d9;
  --border-strong:#e0d2c0;
  --text:#1c1917;
  --text-2:#44403c;
  --text-3:#78716c;
  --text-4:#a8a29e;
  --saffron:#d97706;
  --saffron-dark:#b45309;
  --saffron-light:#f59e0b;
  --saffron-bg:rgba(217,119,6,0.06);
  --saffron-border:rgba(217,119,6,0.15);
  --green:#16a34a;
  --green-bg:rgba(22,163,74,0.06);
  --red:#dc2626;
  --red-bg:rgba(220,38,38,0.06);
  --yellow:#ca8a04;
  --orange:#ea580c;
  --font:'DM Sans',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono','Fira Code',monospace;
  --shadow:0 1px 3px rgba(28,25,23,0.04),0 4px 16px rgba(28,25,23,0.03);
  --shadow-lg:0 4px 24px rgba(28,25,23,0.06),0 12px 48px rgba(28,25,23,0.04);
}

html{scroll-behavior:smooth}

body{
  font-family:var(--font);
  background:var(--bg);
  color:var(--text);
  -webkit-font-smoothing:antialiased;
  line-height:1.6;
}

/* ────────── Navbar ────────── */
nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:64px;display:flex;align-items:center;justify-content:space-between;
  padding:0 40px;
  background:rgba(255,251,245,0.88);
  backdrop-filter:blur(16px) saturate(180%);
  border-bottom:1px solid var(--border);
}
.n-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);font-weight:700;font-size:1.05rem;letter-spacing:-0.02em}
.n-brand svg{width:22px;height:22px;color:var(--saffron)}
.n-links{display:flex;align-items:center;gap:6px}
.n-links a{
  color:var(--text-3);text-decoration:none;font-size:0.82rem;font-weight:500;
  padding:6px 12px;border-radius:6px;transition:color .15s,background .15s;
}
.n-links a:hover{color:var(--text);background:rgba(28,25,23,0.04)}
.n-cta{
  background:var(--saffron)!important;color:#fff!important;font-weight:600!important;
  border-radius:6px;transition:opacity .15s!important;
}
.n-cta:hover{opacity:0.88;background:var(--saffron)!important}

/* ────────── Layout ────────── */
.wrap{max-width:1080px;margin:0 auto;padding:0 32px}
section{padding:88px 0}

/* ────────── Hero ────────── */
.hero{padding-top:150px;padding-bottom:72px;text-align:center}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  padding:5px 14px 5px 8px;border-radius:999px;
  background:var(--saffron-bg);border:1px solid var(--saffron-border);
  font-size:0.78rem;font-weight:500;color:var(--saffron-dark);margin-bottom:28px;
}
.hero-eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--green);display:block}
.hero h1{
  font-size:clamp(2.4rem,5vw,3.8rem);font-weight:700;
  line-height:1.1;letter-spacing:-0.035em;
  color:var(--text);margin-bottom:18px;
}
.hero h1 em{font-style:normal;color:var(--saffron)}
.hero p{font-size:1.1rem;color:var(--text-3);max-width:560px;margin:0 auto 32px;line-height:1.65}
.hero-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{
  padding:10px 26px;border-radius:8px;font-size:0.88rem;font-weight:600;
  text-decoration:none;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:7px;
  transition:all .15s;font-family:var(--font);
}
.btn-s{background:var(--saffron);color:#fff}
.btn-s:hover{background:var(--saffron-dark)}
.btn-o{background:var(--surface);color:var(--text-2);border:1px solid var(--border-strong)}
.btn-o:hover{background:var(--surface-2);border-color:var(--text-4)}

/* ────────── Section Headings ────────── */
.sh{margin-bottom:48px}
.sh-label{
  font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;
  color:var(--saffron);margin-bottom:10px;
}
.sh h2{font-size:1.85rem;font-weight:700;letter-spacing:-0.025em;line-height:1.15;color:var(--text);margin-bottom:8px}
.sh p{color:var(--text-3);font-size:0.95rem}

/* ────────── Divider ────────── */
.divider{border:0;border-top:1px solid var(--border);margin:0}

/* ────────── Features grid ────────── */
.f-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.f-card{background:var(--surface);padding:28px;transition:background .2s}
.f-card:hover{background:var(--surface-2)}
.f-icon{color:var(--saffron);font-size:1.3rem;margin-bottom:12px}
.f-card h3{font-size:0.92rem;font-weight:600;color:var(--text);margin-bottom:5px}
.f-card p{font-size:0.82rem;color:var(--text-3);line-height:1.55}

/* ────────── Pipeline ────────── */
.pipe{display:flex;align-items:center;justify-content:center;gap:0;margin-top:36px}
.pipe-step{
  padding:12px 20px;background:var(--surface);border:1px solid var(--border);
  display:flex;align-items:center;gap:8px;font-size:0.82rem;font-weight:500;color:var(--text-2);
}
.pipe-step:first-child{border-radius:10px 0 0 10px}
.pipe-step:last-child{border-radius:0 10px 10px 0}
.pipe-step span{font-size:1.1rem}
.pipe-arr{color:var(--saffron);font-size:0.9rem;padding:0 2px}

/* ────────── Scoring table ────────── */
.s-table{width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:12px;overflow:hidden}
.s-table th{
  padding:11px 18px;text-align:left;font-size:0.7rem;font-weight:600;
  text-transform:uppercase;letter-spacing:0.08em;color:var(--text-4);
  background:var(--surface-2);border-bottom:1px solid var(--border);
}
.s-table td{padding:12px 18px;border-bottom:1px solid var(--border);font-size:0.85rem;color:var(--text-2)}
.s-table tr:last-child td{border-bottom:none}
.s-table .wt{color:var(--saffron);font-weight:700;font-family:var(--mono);font-size:0.82rem}

/* ────────── Architecture ────────── */
.arch-flow{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:44px}
.arch-box{
  padding:18px 28px;border-radius:12px;text-align:center;
  background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow);min-width:260px;
}
.arch-box.core{border-color:var(--saffron-border);background:var(--bg-warm);min-width:400px}
.arch-box h4{font-size:0.92rem;font-weight:600;color:var(--text);margin-bottom:3px}
.arch-box p{font-size:0.76rem;color:var(--text-3)}
.arch-mods{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:10px}
.arch-mod{
  padding:5px 10px;border-radius:6px;font-size:0.73rem;font-weight:500;
  background:var(--saffron-bg);color:var(--saffron-dark);border:1px solid var(--saffron-border);
}
.arch-arrow{color:var(--text-4);font-size:1.1rem}
.arch-row{display:flex;justify-content:center;gap:14px;flex-wrap:wrap}

/* ────────── Integration cards ────────── */
.int-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.int-card{background:var(--surface);padding:22px}
.int-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.int-head span{font-size:1.3rem}
.int-name{font-weight:600;font-size:0.88rem;color:var(--text)}
.int-ep{display:block;font-family:var(--mono);font-size:0.68rem;color:var(--saffron);margin-top:1px}
.int-card p{font-size:0.8rem;color:var(--text-3);line-height:1.55}
.int-card code{font-family:var(--mono);font-size:0.76rem;background:var(--surface-3);padding:1px 5px;border-radius:3px;color:var(--saffron-dark)}

/* ────────── Config ────────── */
.cfg-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.cfg-code{background:var(--text);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-lg)}
.cfg-bar{
  padding:10px 16px;display:flex;align-items:center;gap:7px;
  background:rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.08);
  font-size:0.73rem;color:rgba(255,255,255,0.5);
}
.cfg-dot{width:9px;height:9px;border-radius:50%}
.cfg-code pre{padding:16px;margin:0;overflow-x:auto;font-family:var(--mono);font-size:0.76rem;color:#fde68a;line-height:1.6}
.cfg-ref code{font-family:var(--mono);font-size:0.76rem;background:var(--surface-3);padding:1px 5px;border-radius:3px;color:var(--saffron-dark)}

/* ────────── Action setup ────────── */
.act-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.act-step{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
.act-step:last-of-type{border:none}
.act-num{
  width:26px;height:26px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:var(--saffron);color:#fff;font-weight:700;font-size:0.78rem;
}
.act-step div{font-size:0.82rem;line-height:1.5;color:var(--text-2)}
.act-step strong{color:var(--text)}
.act-step code{font-family:var(--mono);font-size:0.76rem;background:var(--surface-3);padding:1px 5px;border-radius:3px;color:var(--saffron-dark)}
.outcomes{display:flex;flex-direction:column;gap:5px;margin-top:14px}
.oc{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;font-size:0.82rem}
.oc-pass{background:var(--green-bg);border:1px solid rgba(22,163,74,0.12)}
.oc-warn{background:rgba(202,138,4,0.06);border:1px solid rgba(202,138,4,0.12)}
.oc-fail{background:var(--red-bg);border:1px solid rgba(220,38,38,0.12)}

/* ────────── Dashboard ────────── */
.conn{
  display:flex;align-items:center;justify-content:center;gap:10px;
  padding:11px 18px;border-radius:10px;font-size:0.82rem;font-weight:500;margin-bottom:24px;
}
.conn.ok{background:var(--green-bg);border:1px solid rgba(22,163,74,0.12);color:var(--green)}
.conn.err{background:var(--red-bg);border:1px solid rgba(220,38,38,0.12);color:var(--red)}
.conn.wait{background:var(--saffron-bg);border:1px solid var(--saffron-border);color:var(--saffron-dark)}

.selector{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:24px;box-shadow:var(--shadow)}
.sel-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.sel-top h3{font-size:0.95rem;font-weight:600;color:var(--text)}
.sel-acts{display:flex;align-items:center;gap:8px}
.sel-count{font-size:0.8rem;color:var(--text-4)}
.sel-btn{
  padding:4px 12px;border-radius:5px;font-size:0.76rem;font-weight:500;
  background:var(--surface-2);border:1px solid var(--border);color:var(--text-3);
  cursor:pointer;font-family:var(--font);transition:all .12s;
}
.sel-btn:hover{border-color:var(--border-strong);color:var(--text)}

.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px;max-height:380px;overflow-y:auto;padding-right:4px}
.chip{
  padding:9px 13px;border-radius:10px;cursor:pointer;
  background:var(--bg);border:1px solid var(--border);
  display:flex;flex-direction:column;gap:2px;min-width:185px;flex:0 0 auto;
  transition:all .12s;user-select:none;
}
.chip:hover{border-color:var(--border-strong);box-shadow:var(--shadow)}
.chip.on{background:var(--saffron-bg);border-color:var(--saffron-border)}
.chip-n{font-weight:600;font-size:0.82rem;color:var(--text)}
.chip.on .chip-n{color:var(--saffron-dark)}
.chip-f{font-size:0.65rem;color:var(--text-4);font-family:var(--mono);word-break:break-all}
.chip-m{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.chip-b{font-size:0.6rem;padding:1px 5px;border-radius:3px;background:var(--surface-2);color:var(--text-3)}
.chip-b.t{background:rgba(202,138,4,0.08);color:var(--yellow)}
.chip-b.o{background:var(--green-bg);color:var(--green)}
.chip-b.g{background:var(--saffron-bg);color:var(--saffron)}

.go{
  padding:11px 32px;border-radius:8px;font-size:0.88rem;font-weight:600;
  background:var(--saffron);color:#fff;border:none;cursor:pointer;
  font-family:var(--font);transition:background .12s;
}
.go:hover{background:var(--saffron-dark)}
.go:disabled{opacity:0.35;cursor:not-allowed}
.go.spin{color:transparent;position:relative}
.go.spin::after{
  content:'';position:absolute;inset:0;margin:auto;
  width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;
  border-radius:50%;animation:sp .7s linear infinite;
}
@keyframes sp{to{transform:rotate(360deg)}}

/* Demo banner */
.demo-banner{
  display:none;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;
  padding:14px 20px;margin-bottom:20px;border-radius:10px;
  background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.25);
}
.demo-banner-left{display:flex;align-items:center;gap:12px;font-size:0.85rem;color:var(--text-2);flex:1}
.demo-badge{
  background:rgba(250,204,21,0.15);color:#f59e0b;border:1px solid rgba(250,204,21,0.3);
  padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;white-space:nowrap;
}
.demo-close{
  background:transparent;border:1px solid rgba(255,255,255,0.1);color:var(--text-3);
  padding:5px 12px;border-radius:6px;font-size:0.78rem;cursor:pointer;
}
.demo-close:hover{background:rgba(255,255,255,0.05);color:var(--text)}

/* Dash actions row */
.dash-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.demo-btn{
  padding:11px 24px;border-radius:8px;font-size:0.88rem;font-weight:600;
  background:rgba(250,204,21,0.12);color:#f59e0b;
  border:1px solid rgba(250,204,21,0.25);cursor:pointer;
  font-family:var(--font);transition:all .15s;
}
.demo-btn:hover{background:rgba(250,204,21,0.2);border-color:rgba(250,204,21,0.4)}

/* Demo mode result badge */
.demo-result-badge{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;
  background:rgba(250,204,21,0.12);color:#f59e0b;border:1px solid rgba(250,204,21,0.25);
  margin-left:12px;vertical-align:middle;
}


/* ────────── Results ────────── */
#results{display:none}

.res-hero{
  display:flex;align-items:center;gap:36px;
  padding:32px;margin-bottom:20px;
  background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);
}
.ring{position:relative;width:170px;height:170px;flex-shrink:0}
.ring svg{transform:rotate(-90deg)}
.ring-bg{fill:none;stroke:var(--border);stroke-width:7}
.ring-fg{fill:none;stroke-width:7;stroke-linecap:round;transition:all 1.2s ease}
.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring-num{font-size:2.8rem;font-weight:700;letter-spacing:-0.03em}
.ring-lbl{font-size:0.78rem;color:var(--text-4)}

.res-meta{display:flex;flex-direction:column;gap:12px}
.rm-row{display:flex;align-items:center;gap:10px}
.rm-k{color:var(--text-4);font-size:0.82rem;min-width:110px}
.rm-v{font-weight:600;font-size:0.95rem;color:var(--text)}
.rm-badge{
  display:inline-flex;align-items:center;gap:5px;
  padding:4px 12px;border-radius:999px;font-weight:600;font-size:0.82rem;
}

.stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
.stat{
  background:var(--surface);border:1px solid var(--border);border-radius:12px;
  padding:18px;text-align:center;box-shadow:var(--shadow);
}
.stat-n{font-size:1.8rem;font-weight:700;color:var(--text)}
.stat-l{font-size:0.68rem;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}

/* Entity cards */
.ent{
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:22px;margin-bottom:10px;box-shadow:var(--shadow);transition:border-color .15s;
}
.ent:hover{border-color:var(--border-strong)}
.ent-top{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.ent-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.ent-info{flex:1}
.ent-file{font-weight:600;font-size:0.92rem;color:var(--text)}
.ent-fqn{font-size:0.7rem;color:var(--text-4);font-family:var(--mono)}
.ent-sc{text-align:right}
.ent-sc-n{font-size:1.8rem;font-weight:700}
.ent-sc-m{font-size:0.82rem;color:var(--text-4)}
.ent-sc-l{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;display:block}

.ent-meta{
  display:flex;gap:20px;padding:10px 14px;margin-bottom:12px;
  background:var(--bg-warm);border-radius:8px;
}
.em-l{font-size:0.63rem;color:var(--text-4);text-transform:uppercase;letter-spacing:0.05em}
.em-v{font-size:0.82rem;font-weight:500;margin-top:1px;color:var(--text-2)}
.em-w{color:var(--orange)}

.tag-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px}
.tag{
  padding:2px 7px;border-radius:4px;font-size:0.66rem;font-weight:500;
  background:var(--saffron-bg);color:var(--saffron-dark);border:1px solid var(--saffron-border);
}

.fac-toggle{
  font-size:0.76rem;color:var(--text-3);cursor:pointer;font-weight:500;
  background:none;border:none;padding:4px 0;font-family:var(--font);
  display:flex;align-items:center;gap:5px;
}
.fac-toggle:hover{color:var(--text)}
.fac-body{display:none;margin-top:8px}
.fac-body.open{display:block}
.fac-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)}
.fac-row:last-child{border:none}
.fac-n{font-size:0.8rem;min-width:160px;color:var(--text-3)}
.fac-bar{flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden}
.fac-fill{height:100%;border-radius:2px;transition:width .6s ease}
.fac-pts{font-size:0.76rem;color:var(--text-4);min-width:46px;text-align:right;font-family:var(--mono)}
.fac-st{font-size:0.8rem;width:18px;text-align:center}

/* ────────── Footer ────────── */
footer{
  text-align:center;padding:32px;
  border-top:1px solid var(--border);
  color:var(--text-4);font-size:0.76rem;
}
footer a{color:var(--saffron);text-decoration:none}

/* ────────── Responsive ────────── */
@media(max-width:900px){
  .f-grid,.int-grid{grid-template-columns:1fr}
  .cfg-grid,.act-grid{grid-template-columns:1fr}
  .stat-row{grid-template-columns:repeat(2,1fr)}
  .res-hero{flex-direction:column;gap:20px}
  .pipe{flex-direction:column}
  .pipe-step{border-radius:10px!important}
  .ent-top{flex-direction:column;align-items:flex-start}
  .ent-meta{flex-direction:column;gap:8px}
  .arch-box.core{min-width:auto}
  nav{padding:0 16px}
  .n-links{gap:3px;flex-wrap:wrap}
}

.search-input{
  width:100%;padding:10px 14px;border-radius:8px;font-size:0.85rem;
  background:var(--bg);border:1px solid var(--border);color:var(--text);
  font-family:var(--font);margin-bottom:14px;outline:none;transition:border-color .15s;
}
.search-input:focus{border-color:var(--saffron)}
.search-input::placeholder{color:var(--text-4)}

/* ────────── Policy block ────────── */
.pol-wrap{margin-bottom:20px;border-radius:14px;overflow:hidden;border:1px solid rgba(220,38,38,0.2)}
.pol-wrap.warn-only{border-color:rgba(202,138,4,0.2)}
.pol-head{
  padding:14px 20px;display:flex;align-items:center;gap:10px;
  font-weight:700;font-size:0.95rem;
  background:rgba(220,38,38,0.07);color:var(--red);
}
.pol-wrap.warn-only .pol-head{background:rgba(202,138,4,0.07);color:var(--yellow)}
.pol-item{padding:14px 20px;border-top:1px solid rgba(220,38,38,0.1);background:var(--surface)}
.pol-wrap.warn-only .pol-item{border-color:rgba(202,138,4,0.1)}
.pol-name{font-weight:600;font-size:0.88rem;margin-bottom:4px}
.pol-reason{font-size:0.8rem;color:var(--text-3);margin-bottom:6px}
.pol-pills{display:flex;flex-wrap:wrap;gap:5px}
.pol-pill{padding:2px 8px;border-radius:4px;font-size:0.68rem;font-weight:600}
.pol-team{background:rgba(217,119,6,0.1);color:var(--saffron-dark);border:1px solid var(--saffron-border)}
.pol-sig{background:var(--surface-2);color:var(--text-3);border:1px solid var(--border)}

/* ────────── Quality issues ────────── */
.qi-wrap{margin-bottom:12px;padding:12px 14px;border-radius:10px;background:rgba(220,38,38,0.04);border:1px solid rgba(220,38,38,0.12)}
.qi-head{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--red);margin-bottom:8px}
.qi-row{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(220,38,38,0.08);font-size:0.8rem}
.qi-row:last-child{border:none}
.qi-name{font-weight:600;color:var(--text-2);flex:1}
.qi-age{color:var(--text-4);font-size:0.72rem;white-space:nowrap}
.qi-reason{font-size:0.75rem;color:var(--text-3);display:block;margin-top:1px}

/* ────────── Rollout guidance ────────── */
.ro-wrap{margin-bottom:12px}
.ro-toggle{font-size:0.76rem;font-weight:500;color:var(--saffron-dark);background:var(--saffron-bg);border:1px solid var(--saffron-border);border-radius:6px;padding:5px 12px;cursor:pointer;font-family:var(--font);display:flex;align-items:center;gap:6px;transition:background .12s}
.ro-toggle:hover{background:rgba(217,119,6,0.12)}
.ro-body{display:none;margin-top:8px;padding:12px;background:var(--bg-warm);border:1px solid var(--border);border-radius:8px}
.ro-body.open{display:block}
.ro-col{font-weight:600;font-size:0.82rem;color:var(--text);margin-bottom:6px}
.ro-step{display:flex;gap:8px;padding:4px 0;font-size:0.78rem;color:var(--text-3)}
.ro-step strong{color:var(--text-2)}

/* ────────── Trust Signal ────────── */
.trust-wrap{margin-bottom:20px;border-radius:14px;border:1px solid rgba(99,102,241,0.18);overflow:hidden;background:var(--surface)}
.trust-head{padding:14px 20px;font-weight:700;font-size:1rem;background:rgba(99,102,241,0.06)}
.trust-summary{padding:6px 20px 10px;font-size:0.82rem;color:var(--text-3);border-bottom:1px solid var(--border)}
.trust-dims{padding:14px 20px;display:grid;gap:10px}
.trust-dim{background:var(--surface-2);border-radius:8px;padding:10px 12px;border:1px solid var(--border)}
.trust-dim-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.trust-dim-name{font-size:0.8rem;font-weight:600;color:var(--text-2)}
.trust-dim-grade{font-size:0.8rem;font-weight:700}
.trust-bar{height:5px;border-radius:3px;background:rgba(255,255,255,0.06);margin-bottom:5px;overflow:hidden}
.trust-bar-fill{height:100%;border-radius:3px;transition:width .4s ease}
.trust-dim-detail{font-size:0.72rem;color:var(--text-4)}
.trust-risks{padding:0 20px 14px;display:flex;flex-direction:column;gap:4px}
.trust-risk{font-size:0.78rem;color:var(--yellow);background:rgba(202,138,4,0.06);padding:5px 10px;border-radius:6px;border:1px solid rgba(202,138,4,0.12)}

/* ────────── Risk-Type Routing ────────── */
.routing-wrap{margin-bottom:20px;border-radius:14px;border:1px solid rgba(14,165,233,0.18);overflow:hidden}
.routing-head{padding:12px 20px;font-weight:700;font-size:0.9rem;background:rgba(14,165,233,0.06);color:#38bdf8}
.routing-item{display:grid;grid-template-columns:90px 20px 1fr;align-items:start;gap:6px;padding:9px 20px;border-top:1px solid rgba(14,165,233,0.08);font-size:0.78rem;background:var(--surface)}
.routing-type{font-weight:700;color:#38bdf8;font-family:monospace;font-size:0.75rem;background:rgba(14,165,233,0.08);padding:2px 6px;border-radius:4px}
.routing-arrow{color:var(--text-4);font-size:0.9rem}
.routing-to{font-weight:600;color:var(--text-2)}
.routing-reason{grid-column:1/-1;font-size:0.72rem;color:var(--text-4);padding-left:0;margin-top:1px}

/* ────────── Remediation accordion ────────── */
.rem-wrap{margin-bottom:20px;border-radius:14px;border:1px solid rgba(34,197,94,0.18);overflow:hidden}
.rem-head{padding:13px 20px;font-weight:700;font-size:0.9rem;background:rgba(34,197,94,0.06);color:#4ade80;display:flex;align-items:center;gap:8px}
.rem-count{font-size:0.78rem;font-weight:500;color:var(--text-3)}
.rem-item{border-top:1px solid rgba(34,197,94,0.1);background:var(--surface)}
.rem-summary{padding:10px 20px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.83rem;list-style:none;outline:none}
.rem-summary:hover{background:rgba(34,197,94,0.03)}
.rem-id{font-family:monospace;font-size:0.7rem;color:var(--text-4);background:var(--surface-2);padding:2px 6px;border-radius:4px;border:1px solid var(--border)}
.rem-pri{font-size:1rem}
.rem-title{font-weight:600;color:var(--text-2);flex:1}
.rem-body{padding:10px 20px 16px;border-top:1px dashed rgba(34,197,94,0.1)}
.rem-desc{font-size:0.8rem;color:var(--text-3);margin:0 0 10px;padding:8px 12px;background:rgba(34,197,94,0.04);border-radius:6px;border:1px solid rgba(34,197,94,0.1)}
.rem-steps{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}
.rem-step{display:flex;gap:10px;font-size:0.79rem;color:var(--text-3)}
.rem-step-n{font-weight:700;color:#4ade80;min-width:18px;font-family:monospace}
.rem-step strong{color:var(--text-2)}
.rem-step em{color:var(--text-4);font-size:0.73rem}
.rem-step code{background:var(--surface-2);padding:1px 5px;border-radius:3px;font-size:0.72rem;color:#a78bfa}
.rem-followup{font-size:0.77rem;margin-top:8px;padding:8px 12px;background:var(--surface-2);border-radius:6px;border:1px solid var(--border)}
.rem-followup ul{margin:4px 0 0 14px;padding:0;color:var(--text-3)}
.rem-followup li{margin:2px 0}
.rem-more{padding:10px 20px;font-size:0.76rem;color:var(--text-4);background:var(--surface);border-top:1px solid rgba(34,197,94,0.08)}

/* ────────── Audit Trail ────────── */
.audit-wrap{margin-bottom:20px;border-radius:14px;border:1px solid rgba(148,163,184,0.18);overflow:hidden}
.audit-head{padding:12px 20px;font-weight:700;font-size:0.9rem;background:rgba(148,163,184,0.05);color:var(--text-2);cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none;outline:none}
.audit-ts{font-size:0.72rem;font-weight:400;color:var(--text-4);font-family:monospace;margin-left:auto}
.audit-body{padding:14px 20px;background:var(--surface)}
.audit-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px}
.audit-row{display:flex;flex-direction:column;background:var(--surface-2);border-radius:7px;padding:8px 10px;border:1px solid var(--border)}
.audit-k{font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-4);margin-bottom:2px}
.audit-v{font-size:0.8rem;font-weight:600;color:var(--text-2)}
.audit-policies{margin-bottom:10px}
.audit-pol{font-size:0.78rem;color:var(--text-3);padding:5px 0;border-bottom:1px solid var(--border)}
.audit-pol:last-child{border:none}
.audit-note{font-size:0.74rem;color:var(--text-4);padding:8px 10px;background:rgba(148,163,184,0.05);border-radius:6px;border:1px solid var(--border)}
.audit-note code{color:#a78bfa;background:var(--surface-2);padding:1px 5px;border-radius:3px}
</style>
</head>
<body>

<nav>
  <a href="#" class="n-brand" onclick="showSection('hero')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    LineageLock
  </a>
  <div class="n-links">
    <a href="#" onclick="showSection('hero')">Home</a>
    <a href="#" onclick="showSection('features')">Features</a>
    <a href="#" onclick="showSection('how')">How It Works</a>
    <a href="#" onclick="showSection('arch')">Architecture</a>
    <a href="#" onclick="showSection('integration')">Integration</a>
    <a href="#" onclick="showSection('scoring')">Scoring</a>
    <a href="#" onclick="showSection('config')">Config</a>
    <a href="#" onclick="showSection('action')">Action</a>
    <a href="#" onclick="showSection('dashboard')" class="n-cta">Try It Live</a>
  </div>
</nav>

<!-- Hero -->
<section id="hero">
  <div class="wrap hero">
    <div class="hero-eyebrow"><i></i> Connected to OpenMetadata Sandbox</div>
    <h1>The <em>PR Guard</em> for<br>data infrastructure</h1>
    <p>Blast radius analysis, governance risk scoring, and contract verification for every pull request — powered by OpenMetadata lineage.</p>
    <div class="hero-btns">
      <a class="btn btn-s" href="#" onclick="showSection('dashboard')">Analyze Now</a>
      <a class="btn btn-o" href="https://github.com/jayjoshix/incident-commander" target="_blank">View on GitHub</a>
    </div>
  </div>
</section>

<hr class="divider">

<!-- Features -->
<section id="features">
  <div class="wrap">
    <div class="sh"><div class="sh-label">Capabilities</div><h2>Why LineageLock</h2><p>Catch data problems before they reach production.</p></div>
    <div class="f-grid">
      <div class="f-card"><div class="f-icon">&#x1F4A5;</div><h3>Blast Radius</h3><p>Maps every downstream table, dashboard, and ML model affected by your change via OpenMetadata column-level lineage.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4CB;</div><h3>Contract Verification</h3><p>Checks data contract test suites and flags violations before they break downstream consumers. +40 risk weight.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F3F7;&#xFE0F;</div><h3>Sensitive Data Detection</h3><p>Flags changes to PII, GDPR, confidential, and PHI-tagged assets using OpenMetadata classifications. Deduped across entity + column tags.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F3AF;</div><h3>Tier-Based Risk</h3><p>Tier 1 and Tier 2 assets get higher risk scores. Business-critical changes cannot slip through.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F465;</div><h3>Owner Identification</h3><p>Identifies stakeholders from OpenMetadata ownership and flags unowned assets as governance risks.</p></div>
      <div class="f-card"><div class="f-icon">&#x2699;&#xFE0F;</div><h3>GitHub Action</h3><p>Drop-in GitHub Action that posts risk reports as PR comments and can block merges automatically.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F3DB;&#xFE0F;</div><h3>Trust Signal</h3><p>A&#x2013;F grade across 5 governance dimensions: owner coverage, contract health, observability, governance posture, and lineage.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F527;</div><h3>Remediation Engine</h3><p>Generates per-risk safe-fix plans with step-by-step actions, tool hints, and follow-up PR scope checklists.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4CB;</div><h3>Audit Trail</h3><p>Every governance decision persisted to <code>artifacts/lineagelock-audit.json</code> for compliance teams and CI auditability.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F500;</div><h3>Risk-Type Routing</h3><p>PII &#x2192; privacy-team, contract &#x2192; data-quality, dashboard &#x2192; bi-owners, no-owner &#x2192; platform-admin. Automatic and explainable.</p></div>
    </div>
  </div>
</section>

<hr class="divider">

<!-- How It Works -->
<section id="how">
  <div class="wrap">
    <div class="sh"><div class="sh-label">Workflow</div><h2>How It Works</h2><p>From pull request to decision in seconds.</p></div>
    <div class="pipe">
      <div class="pipe-step"><span>&#x1F4DD;</span> PR Opened</div><span class="pipe-arr">&#x2192;</span>
      <div class="pipe-step"><span>&#x1F50D;</span> Files Detected</div><span class="pipe-arr">&#x2192;</span>
      <div class="pipe-step"><span>&#x1F310;</span> OpenMetadata Lookup</div><span class="pipe-arr">&#x2192;</span>
      <div class="pipe-step"><span>&#x1F4CA;</span> Risk Scored</div><span class="pipe-arr">&#x2192;</span>
      <div class="pipe-step"><span>&#x1F4AC;</span> PR Comment</div>
    </div>
  </div>
</section>

<hr class="divider">

<!-- Architecture -->
<section id="arch">
  <div class="wrap">
    <div class="sh"><div class="sh-label">System Design</div><h2>Architecture</h2><p>How LineageLock connects to your data stack.</p></div>
    <div class="arch-flow">
      <div class="arch-box"><h4>&#x1F4DD; Pull Request</h4><p>Developer changes dbt model, SQL, or schema YAML</p></div>
      <div class="arch-arrow">&#x2193;</div>
      <div class="arch-box core">
        <h4>&#x1F512; LineageLock Engine</h4>
        <div class="arch-mods">
          <div class="arch-mod">&#x1F50D; Asset Resolver</div>
          <div class="arch-mod">&#x1F4CA; Risk Scorer</div>
          <div class="arch-mod">&#x1F4CB; Report Renderer</div>
          <div class="arch-mod">&#x2699;&#xFE0F; Config Loader</div>
        </div>
      </div>
      <div class="arch-arrow">&#x2193;</div>
      <div class="arch-row">
        <div class="arch-box"><h4>&#x1F310; OpenMetadata API</h4><p>Tables, lineage, tags, contracts</p></div>
        <div class="arch-box"><h4>&#x1F419; GitHub API</h4><p>PR files, comments, status checks</p></div>
      </div>
    </div>
    <div class="f-grid">
      <div class="f-card"><div class="f-icon">&#x1F50D;</div><h3>Asset Resolver</h3><p>Maps file paths to OpenMetadata FQNs using configurable naming conventions and explicit mappings.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F310;</div><h3>OpenMetadata Client</h3><p>REST client with response normalization, v1.12+ compatibility, 404 handling, and error propagation.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4CA;</div><h3>Risk Scoring Engine</h3><p>Deterministic 0&#x2013;100 scorer with <strong>8 weighted factors</strong>. Factor 8: active quality issues (+15). Tag dedup prevents false positives.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4CB;</div><h3>Report Renderer</h3><p>11-section PR comment: blast radius, trust signal, routing, remediation, audit trail, rollout guidance, and more.</p></div>
      <div class="f-card"><div class="f-icon">&#x2699;&#xFE0F;</div><h3>Config Loader</h3><p>Merges .lineagelock.json, environment variables, and GitHub Action inputs with sensible defaults.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F916;</div><h3>Action Orchestrator</h3><p>GitHub Action entry point — detects changed files, runs analysis, posts comments, sets exit codes, writes artifacts.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F3DB;&#xFE0F;</div><h3>Trust Signal</h3><p>A&#x2013;F grade across 5 governance dimensions powered by live OpenMetadata metadata.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F527;</div><h3>Remediation Engine</h3><p>7 risk-type safe-fix generators. Each item has priority, step-by-step actions, and follow-up PR scope.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4DD;</div><h3>Audit Trail</h3><p>Structured JSON audit record for every CI run. Covers decision, score, policies, reviewers, and entity details.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F500;</div><h3>Risk-Type Routing</h3><p>Maps 7 risk categories to specific reviewer teams with explicit reasons surfaced in the PR comment.</p></div>
    </div>
  </div>
</section>

<hr class="divider">

<!-- Integration -->
<section id="integration">
  <div class="wrap">
    <div class="sh"><div class="sh-label">OpenMetadata</div><h2>Deep Integration</h2><p>Six API capabilities powering every analysis.</p></div>
    <div class="int-grid">
      <div class="int-card"><div class="int-head"><span>&#x1F4E1;</span><div><span class="int-name">Entity Resolution</span><span class="int-ep">GET /api/v1/tables/name/{fqn}</span></div></div><p>Resolves changed files to table entities. Fetches columns, owners, tags, tier, and test suite metadata in a single call.</p></div>
      <div class="int-card"><div class="int-head"><span>&#x1F333;</span><div><span class="int-name">Lineage Graph</span><span class="int-ep">GET /api/v1/lineage/table/{id}</span></div></div><p>Traverses the full lineage DAG with configurable depth. Categorizes downstream nodes by type.</p></div>
      <div class="int-card"><div class="int-head"><span>&#x1F465;</span><div><span class="int-name">Ownership</span><span class="int-ep">Entity owners/owner field</span></div></div><p>Extracts owner information. Supports both v1.12+ <code>owners[]</code> array and legacy <code>owner</code> field.</p></div>
      <div class="int-card"><div class="int-head"><span>&#x1F3F7;&#xFE0F;</span><div><span class="int-name">Classifications &amp; Tags</span><span class="int-ep">Entity tags field</span></div></div><p>Scans tags using segment-boundary matching. Detects PII, GDPR, Confidential, PHI, PCI classifications.</p></div>
      <div class="int-card"><div class="int-head"><span>&#x1F3AF;</span><div><span class="int-name">Tier / Criticality</span><span class="int-ep">Entity tier tag</span></div></div><p>Identifies business-critical assets by tier. Tier 1 and Tier 2 assets receive +20 risk points.</p></div>
      <div class="int-card"><div class="int-head"><span>&#x1F4CB;</span><div><span class="int-name">Data Contracts</span><span class="int-ep">GET /api/v1/dataQuality/testSuites/search/list</span></div></div><p>Queries test suite results for contract compliance. Failing tests trigger +40 points.</p></div>
    </div>
  </div>
</section>

<hr class="divider">

<!-- Scoring -->
<section id="scoring">
  <div class="wrap">
    <div class="sh"><div class="sh-label">Risk Model</div><h2>Scoring Methodology</h2><p>Deterministic score from 0 to 100 based on <strong>8 weighted factors</strong>. All weights configurable via <code>.lineagelock.json</code>.</p></div>
    <table class="s-table">
      <thead><tr><th>Factor</th><th>Weight</th><th>Trigger</th></tr></thead>
      <tbody>
        <tr><td>Contract Violation</td><td class="wt">+40</td><td>Data contract tests failing</td></tr>
        <tr><td>Critical Tier</td><td class="wt">+20</td><td>Asset is Tier 1 or Tier 2</td></tr>
        <tr><td>Sensitive Tags</td><td class="wt">+20</td><td>PII, GDPR, Confidential tags found (deduped)</td></tr>
        <tr><td>Downstream Dashboards</td><td class="wt">+10</td><td>Any dashboard depends on asset</td></tr>
        <tr><td>Downstream ML Models</td><td class="wt">+10</td><td>Any ML model depends on asset</td></tr>
        <tr><td>High Downstream Count</td><td class="wt">+10</td><td>5 or more downstream entities</td></tr>
        <tr><td>No Owner</td><td class="wt">+10</td><td>No owner assigned in OpenMetadata</td></tr>
        <tr style="background:rgba(34,197,94,0.05)"><td><strong>&#x1F7E2; Active Quality Issues</strong></td><td class="wt" style="color:#4ade80">+15</td><td>Failing OM quality tests on this asset</td></tr>
      </tbody>
    </table>
  </div>
</section>

<hr class="divider">

<!-- Config -->
<section id="config">
  <div class="wrap">
    <div class="sh"><div class="sh-label">Setup</div><h2>Configuration</h2><p>Customize via .lineagelock.json in your repo root.</p></div>
    <div class="cfg-grid">
      <div class="cfg-code">
        <div class="cfg-bar"><span class="cfg-dot" style="background:#ff5f56"></span><span class="cfg-dot" style="background:#ffbd2e"></span><span class="cfg-dot" style="background:#27c93f"></span> .lineagelock.json</div>
        <pre><code>{
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
    }
  ],
  "sensitiveTags": {
    "keywords": ["PII", "GDPR", "Confidential"]
  },
  "criticalTiers": ["Tier1", "Tier2"],
  "thresholds": { "warn": 30, "fail": 70 }
}</code></pre>
      </div>
      <div class="cfg-ref">
        <table class="s-table">
          <thead><tr><th>Key</th><th>Default</th></tr></thead>
          <tbody>
            <tr><td><code>naming.service</code></td><td>warehouse</td></tr>
            <tr><td><code>naming.database</code></td><td>analytics</td></tr>
            <tr><td><code>naming.schema</code></td><td>public</td></tr>
            <tr><td><code>sensitiveTags.keywords</code></td><td>PII, GDPR, Confidential</td></tr>
            <tr><td><code>criticalTiers</code></td><td>Tier1, Tier2</td></tr>
            <tr><td><code>thresholds.warn</code></td><td>30</td></tr>
            <tr><td><code>thresholds.fail</code></td><td>70</td></tr>
          </tbody>
        </table>
        <h4 style="font-weight:600;color:var(--white);margin:20px 0 10px">Environment Variables</h4>
        <table class="s-table">
          <thead><tr><th>Variable</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>OPENMETADATA_URL</code></td><td>OpenMetadata server URL</td></tr>
            <tr><td><code>OPENMETADATA_TOKEN</code></td><td>JWT auth token</td></tr>
            <tr><td><code>GITHUB_TOKEN</code></td><td>GitHub token (auto in Actions)</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<hr class="divider">

<!-- Action -->
<section id="action">
  <div class="wrap">
    <div class="sh"><div class="sh-label">CI/CD</div><h2>GitHub Action</h2><p>Drop-in workflow for any repository with data models.</p></div>
    <div class="act-grid">
      <div class="cfg-code">
        <div class="cfg-bar"><span class="cfg-dot" style="background:#ff5f56"></span><span class="cfg-dot" style="background:#ffbd2e"></span><span class="cfg-dot" style="background:#27c93f"></span> .github/workflows/lineagelock.yml</div>
        <pre><code>name: LineageLock PR Guard

on:
  pull_request:
    paths: ['models/**', 'sql/**']

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
          github-token: $&#123;&#123; secrets.GITHUB_TOKEN &#125;&#125;
          openmetadata-url: $&#123;&#123; secrets.OM_URL &#125;&#125;
          openmetadata-token: $&#123;&#123; secrets.OM_TOKEN &#125;&#125;</code></pre>
      </div>
      <div>
        <div class="act-step"><span class="act-num">1</span><div><strong>Add secrets</strong><br>Settings &#x2192; Secrets &#x2192; <code>OPENMETADATA_URL</code> and <code>OPENMETADATA_TOKEN</code></div></div>
        <div class="act-step"><span class="act-num">2</span><div><strong>Add config</strong><br>Create <code>.lineagelock.json</code> in repo root</div></div>
        <div class="act-step"><span class="act-num">3</span><div><strong>Add workflow</strong><br>Copy YAML to <code>.github/workflows/</code></div></div>
        <div class="act-step"><span class="act-num">4</span><div><strong>Open a PR</strong><br>Change any data model &#x2014; LineageLock comments automatically</div></div>
        <div class="outcomes">
          <div class="oc oc-pass"><span>&#x1F7E2;</span> Score &lt; 30 &#x2192; <strong>Pass</strong> &#x2014; safe to merge</div>
          <div class="oc oc-warn"><span>&#x1F7E1;</span> Score 30-69 &#x2192; <strong>Warn</strong> &#x2014; review required</div>
          <div class="oc oc-fail"><span>&#x1F534;</span> Score &#x2265; 70 &#x2192; <strong>Fail</strong> &#x2014; blocks merge</div>
        </div>
      </div>
    </div>
  </div>
</section>

<hr class="divider">

<!-- Dashboard -->
<section id="dashboard">
  <div class="wrap">
    <div class="sh"><div class="sh-label">Interactive</div><h2>Live Analysis</h2><p>Select tables to analyze against the OpenMetadata sandbox — or try the instant demo with pre-loaded fixture data.</p></div>

    <!-- Demo Mode Banner -->
    <div class="demo-banner" id="demo-banner">
      <div class="demo-banner-left">
        <span class="demo-badge">&#x26A1; Demo Mode</span>
        <span>Running with fixture data — <strong>fact_orders</strong> (Tier 1, PII, 7 downstream) + <strong>stg_payments</strong> (no owner). Full 8-factor governance pipeline.</span>
      </div>
      <button class="demo-close" onclick="exitDemo()">&#x2715; Exit Demo</button>
    </div>

    <div id="conn" class="conn wait">Checking connection...</div>

    <div class="selector" id="live-selector">
      <div class="sel-top">
        <h3>Select Tables</h3>
        <div class="sel-acts">
          <span id="sel-count" class="sel-count">0 / 0</span>
          <button class="sel-btn" onclick="selAll()">All</button>
          <button class="sel-btn" onclick="selNone()">Clear</button>
        </div>
      </div>
      <input type="text" class="search-input" id="search-input" placeholder="Search tables by name, FQN, or owner..." oninput="renderChips()">
      <div class="chips" id="chips"></div>
      <div class="dash-actions">
        <button class="go" id="go-btn" onclick="analyze()" disabled>Analyze Risk</button>
        <button class="demo-btn" onclick="analyzeDemo()">&#x26A1; Run Demo</button>
      </div>
    </div>

    <div id="results"></div>
  </div>
</section>

<footer>
  Built for the <a href="https://wemakedevs.org">WeMakeDevs &#xD7; OpenMetadata Hackathon</a> (April 2026)<br>
  <a href="https://github.com/jayjoshix/incident-commander">GitHub</a> &middot; Powered by <a href="https://open-metadata.org">OpenMetadata</a>
</footer>

<script>
var FILES=[], sel=new Set();
var C={LOW:'#22c55e',MEDIUM:'#eab308',HIGH:'#f97316',CRITICAL:'#ef4444'};
var E={LOW:'\\u{1F7E2}',MEDIUM:'\\u{1F7E1}',HIGH:'\\u{1F7E0}',CRITICAL:'\\u{1F534}'};
var D={pass:'\\u2705 Safe to Merge',warn:'\\u26A0\\uFE0F Review Required',fail:'\\u{1F6AB} Block Merge'};

function showSection(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'})}

function toggleFactors(btn){
  var b=btn.nextElementSibling;
  b.classList.toggle('open');
  btn.querySelector('span').textContent=b.classList.contains('open')?'\\u25BC':'\\u25B6';
}

async function loadTables(){
  var el=document.getElementById('chips');
  el.innerHTML='<div style="color:var(--text-3);font-size:0.85rem">Loading tables from OpenMetadata...</div>';
  try{
    var r=await fetch('/api/tables');
    var d=await r.json();
    if(d.error)throw new Error(d.error);
    FILES=d.tables;
    for(var i=0;i<Math.min(3,FILES.length);i++)sel.add(i);
    renderChips();
  }catch(e){
    el.innerHTML='<div style="color:var(--red)">Failed: '+e.message+'</div>';
  }
}

function renderChips(){
  var el=document.getElementById('chips');
  var q=(document.getElementById('search-input')||{}).value||'';
  q=q.toLowerCase();
  el.innerHTML=FILES.map(function(f,i){
    if(q && f.name.toLowerCase().indexOf(q)===-1 && f.fqn.toLowerCase().indexOf(q)===-1 && (!f.owner || f.owner.toLowerCase().indexOf(q)===-1)) return '';
    var s=sel.has(i)?' on':'';
    var m='';
    if(f.tier)m+='<span class="chip-b t">'+f.tier+'</span>';
    if(f.owner)m+='<span class="chip-b o">'+f.owner+'</span>';
    if(f.tagCount)m+='<span class="chip-b g">'+f.tagCount+' tags</span>';
    return '<div class="chip'+s+'" onclick="toggle('+i+')">'+
      '<div class="chip-n">'+f.name+'</div>'+
      '<div class="chip-f">'+f.fqn+'</div>'+
      (m?'<div class="chip-m">'+m+'</div>':'')+
      '</div>';
  }).join('');
  document.getElementById('go-btn').disabled=sel.size===0;
  document.getElementById('sel-count').textContent=sel.size+' / '+FILES.length;
}

function toggle(i){sel.has(i)?sel.delete(i):sel.add(i);renderChips()}
function selAll(){for(var i=0;i<FILES.length;i++)sel.add(i);renderChips()}
function selNone(){sel.clear();renderChips()}

async function checkConn(){
  var el=document.getElementById('conn');
  try{
    var r=await fetch('/api/health');
    var d=await r.json();
    if(d.ok){el.className='conn ok';el.innerHTML='\\u2705 Connected to OpenMetadata '+d.version+' \\u2014 '+d.url}
    else{el.className='conn err';el.innerHTML='\\u274C '+d.error}
  }catch(e){el.className='conn err';el.innerHTML='\\u274C '+e.message}
}

async function analyzeDemo(){
  var btn=document.getElementById('go-btn'),res=document.getElementById('results');
  var banner=document.getElementById('demo-banner');
  btn.classList.add('spin');btn.disabled=true;res.style.display='none';
  if(banner) banner.style.display='flex';
  try{
    var r=await fetch('/api/demo');
    var d=await r.json();
    if(d.error)throw new Error(d.error);
    d._isDemo=true;
    renderResults(d);
  }catch(e){
    res.style.display='block';
    res.innerHTML='<div style="padding:20px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12);border-radius:10px;color:var(--red)">'+e.message+'</div>';
  }finally{btn.classList.remove('spin');btn.disabled=false}
}

function exitDemo(){
  var banner=document.getElementById('demo-banner');
  if(banner)banner.style.display='none';
  document.getElementById('results').style.display='none';
}

async function analyze(){
  var btn=document.getElementById('go-btn'),res=document.getElementById('results');
  var banner=document.getElementById('demo-banner');
  btn.classList.add('spin');btn.disabled=true;res.style.display='none';
  if(banner)banner.style.display='none';
  var files=[...sel].map(function(i){return FILES[i]});
  try{
    var r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:files})});
    var d=await r.json();
    if(d.error)throw new Error(d.error);
    renderResults(d);
  }catch(e){
    res.style.display='block';
    res.innerHTML='<div style="padding:20px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12);border-radius:10px;color:var(--red)">'+e.message+'</div>';
  }finally{btn.classList.remove('spin');btn.disabled=false}
}

function renderResults(d){
  var el=document.getElementById('results');
  var c=C[d.overallLevel];
  var circ=2*Math.PI*76,off=circ*(1-d.maxScore/100);
  var h='';

  h+='<div class="res-hero">';
  h+='<div class="ring"><svg viewBox="0 0 170 170" width="180" height="180">';
  h+='<circle class="ring-bg" cx="85" cy="85" r="76"/>';
  h+='<circle class="ring-fg" cx="85" cy="85" r="76" style="stroke:'+c+';stroke-dasharray:'+circ+';stroke-dashoffset:'+off+'"/>';
  h+='</svg><div class="ring-center"><div class="ring-num" style="color:'+c+'">'+d.maxScore+'</div><div class="ring-lbl">of 100</div></div></div>';
  h+='<div class="res-meta">';
  if(d._isDemo||d.isDemo) h+='<div class="rm-row"><span class="demo-result-badge">&#x26A1; Demo Mode — fixture data</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Risk Level</span><span class="rm-v">'+E[d.overallLevel]+' '+d.overallLevel+'</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Decision</span><span class="rm-badge" style="background:'+c+'15;color:'+c+';border:1px solid '+c+'30">'+D[d.decision]+'</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Entities</span><span class="rm-v">'+d.summary.resolvedEntities+' / '+d.summary.totalEntities+' resolved</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Downstream</span><span class="rm-v">'+d.summary.totalDownstream+' entities</span></div>';
  if(d.policies&&d.policies.length) h+='<div class="rm-row"><span class="rm-k">Policies</span><span class="rm-v" style="color:'+(d.isBlocked?'var(--red)':'var(--yellow)')+'">'+(d.isBlocked?'🚫':'⚠️')+' '+d.policies.length+' triggered</span></div>';
  h+='</div></div>';

  // ── Approval Policies block ──
  if(d.policies&&d.policies.length){
    var hasBlock=d.policies.some(function(p){return p.severity==='block'});
    h+='<div class="pol-wrap'+(hasBlock?'':' warn-only')+'">';
    h+='<div class="pol-head">'+(hasBlock?'🚫 Merge Blocked — ':'⚠️ ')+d.policies.length+' Approval Polic'+(d.policies.length===1?'y':'ies')+' Triggered</div>';
    d.policies.forEach(function(p){
      h+='<div class="pol-item">';
      h+='<div class="pol-name">'+(p.severity==='block'?'🚫':'⚠️')+' '+p.name+'</div>';
      h+='<div class="pol-reason">'+p.reason+'</div>';
      h+='<div class="pol-pills">';
      p.requiredTeams.forEach(function(t){h+='<span class="pol-pill pol-team">team:'+t+'</span>';});
      p.requiredUsers.forEach(function(u){h+='<span class="pol-pill pol-team">@'+u+'</span>';});
      p.signals.slice(0,3).forEach(function(s){h+='<span class="pol-pill pol-sig">'+s+'</span>';});
      h+='</div></div>';
    });
    h+='</div>';
  }

  // ── Trust Signal panel ──
  if(d.trustSignal){
    var ts=d.trustSignal;
    var tg=ts.overallGrade;
    var tgColor=tg==='A'?'#22c55e':tg==='B'?'#84cc16':tg==='C'?'#f59e0b':tg==='D'?'#f97316':'#ef4444';
    h+='<div class="trust-wrap">';
    h+='<div class="trust-head" style="color:'+tgColor+'">🏛️ Trust Signal — Grade '+tg+' ('+ts.overallScore+'/100)</div>';
    h+='<div class="trust-summary">'+ts.summary+'</div>';
    h+='<div class="trust-dims">';
    ts.dimensions.forEach(function(dim){
      var dg=dim.grade;
      var dgc=dg==='A'?'#22c55e':dg==='B'?'#84cc16':dg==='C'?'#f59e0b':dg==='D'?'#f97316':'#ef4444';
      h+='<div class="trust-dim">';
      h+='<div class="trust-dim-top"><span class="trust-dim-name">'+dim.name+'</span><span class="trust-dim-grade" style="color:'+dgc+'">'+dg+' ('+dim.score+')</span></div>';
      h+='<div class="trust-bar"><div class="trust-bar-fill" style="width:'+dim.score+'%;background:'+dgc+'"></div></div>';
      h+='<div class="trust-dim-detail">'+dim.detail+'</div>';
      h+='</div>';
    });
    h+='</div>';
    if(ts.topRisks&&ts.topRisks.length){
      h+='<div class="trust-risks">';
      ts.topRisks.forEach(function(r){h+='<div class="trust-risk">⚠️ '+r+'</div>';});
      h+='</div>';
    }
    h+='</div>';
  }

  // ── Routing Reasons ──
  if(d.routingResult&&d.routingResult.routingReasons&&d.routingResult.routingReasons.length){
    h+='<div class="routing-wrap">';
    h+='<div class="routing-head">🔀 Risk-Type Routing</div>';
    d.routingResult.routingReasons.forEach(function(r){
      h+='<div class="routing-item">';
      h+='<span class="routing-type">'+r.riskType+'</span>';
      h+='<span class="routing-arrow">→</span>';
      h+='<span class="routing-to">'+r.assignedTo.join(', ')+'</span>';
      h+='<span class="routing-reason">'+r.reason+'</span>';
      h+='</div>';
    });
    h+='</div>';
  }

  h+='<div class="stat-row">';
  h+='<div class="stat"><div class="stat-n">'+d.summary.totalDownstream+'</div><div class="stat-l">Downstream</div></div>';
  h+='<div class="stat"><div class="stat-n">'+d.summary.totalDashboards+'</div><div class="stat-l">Dashboards</div></div>';
  h+='<div class="stat"><div class="stat-n">'+d.summary.totalMlModels+'</div><div class="stat-l">ML Models</div></div>';
  h+='<div class="stat"><div class="stat-n">'+d.summary.unresolvedEntities+'</div><div class="stat-l">Unresolved</div></div>';
  h+='</div>';

  h+='<h3 style="font-size:1.1rem;font-weight:600;margin-bottom:14px">Per-Entity Analysis</h3>';

  d.results.forEach(function(r){
    var rc=C[r.level];
    var tr=r.factors.filter(function(f){return f.triggered}).length;
    h+='<div class="ent">';
    h+='<div class="ent-top"><div class="ent-dot" style="background:'+rc+'"></div>';
    h+='<div class="ent-info"><div class="ent-file">'+r.file+'</div><div class="ent-fqn">'+r.fqn+'</div></div>';
    h+='<div class="ent-sc"><span class="ent-sc-n" style="color:'+rc+'">'+r.score+'</span><span class="ent-sc-m">/100</span><span class="ent-sc-l" style="color:'+rc+'">'+r.level+'</span></div></div>';

    h+='<div class="ent-meta">';
    h+='<div><div class="em-l">Owner</div><div class="em-v '+(r.owner?'':'em-w')+'">'+(r.owner||'\\u26A0\\uFE0F Unassigned')+'</div></div>';
    h+='<div><div class="em-l">Tier</div><div class="em-v">'+(r.tier||'None')+'</div></div>';
    h+='<div><div class="em-l">Columns</div><div class="em-v">'+r.columns+'</div></div>';
    h+='<div><div class="em-l">Downstream</div><div class="em-v">'+r.downstream.total+'</div></div>';
    h+='</div>';

    if(r.tags.length){
      h+='<div class="tag-row">';
      r.tags.forEach(function(t){h+='<span class="tag">'+t+'</span>'});
      h+='</div>';
    }

    if(r.glossaryTerms && r.glossaryTerms.length){
      h+='<div style="margin-bottom:12px"><span style="font-size:0.65rem;color:var(--text-4);text-transform:uppercase;letter-spacing:0.05em">Glossary Terms</span>';
      h+='<div class="tag-row" style="margin-top:4px">';
      r.glossaryTerms.forEach(function(g){h+='<span class="tag" style="background:rgba(139,92,246,0.08);color:#8b5cf6;border-color:rgba(139,92,246,0.15)">'+g+'</span>'});
      h+='</div></div>';
    }

    if(r.downstream.columnImpact && r.downstream.columnImpact.length){
      h+='<div style="margin-bottom:12px"><span style="font-size:0.65rem;color:var(--text-4);text-transform:uppercase;letter-spacing:0.05em">Column-Level Lineage ('+r.downstream.columnImpact.length+' mappings)</span>';
      h+='<div style="margin-top:6px;font-size:0.78rem;font-family:var(--mono);color:var(--text-3)">';
      r.downstream.columnImpact.slice(0,8).forEach(function(cl){
        h+='<div style="padding:3px 0;border-bottom:1px solid var(--border)">'+cl.fromColumns.join(', ')+' → '+cl.toColumn+' <span style="color:var(--text-4)">in</span> '+cl.toEntity+'</div>';
      });
      if(r.downstream.columnImpact.length>8) h+='<div style="padding:3px 0;color:var(--text-4)">...+'+(r.downstream.columnImpact.length-8)+' more</div>';
      h+='</div></div>';
    }

    // ── Active Quality Issues ──
    if(r.qualityIssues&&r.qualityIssues.length){
      h+='<div class="qi-wrap">';
      h+='<div class="qi-head">⚠️ Active Quality Issues from OpenMetadata</div>';
      r.qualityIssues.forEach(function(q){
        var age=q.timestamp?formatAge(q.timestamp):'';
        h+='<div class="qi-row"><div class="qi-name">❌ '+q.name+(q.failureReason?'<span class="qi-reason">'+q.failureReason+'</span>':'')+'</div><span class="qi-age">'+age+'</span></div>';
      });
      h+='</div>';
    }

    // ── Rollout Guidance ──
    if(r.rollout&&r.rollout.length){
      var rid='ro-'+Math.random().toString(36).slice(2);
      h+='<div class="ro-wrap">';
      h+='<button class="ro-toggle" onclick="var b=document.getElementById(\"'+rid+'\");b.classList.toggle(\"open\");"><span>📋</span> Safe Rollout Guidance ('+r.rollout.length+' column'+(r.rollout.length>1?'s':'')+')</button>';
      h+='<div class="ro-body" id="'+rid+'">';
      r.rollout.forEach(function(g){
        h+='<div class="ro-col">'+g.columnName+' <span style="font-weight:400;color:var(--text-4);font-size:0.75rem">('+g.changeType+')</span></div>';
        g.steps.forEach(function(s){h+='<div class="ro-step"><span>'+s.step+'.</span><strong>'+s.action+'</strong> — '+s.detail+'</div>';});
        h+='<div style="height:8px"></div>';
      });
      h+='</div></div>';
    }

    h+='<button class="fac-toggle" onclick="toggleFactors(this)"><span>\\u25B6</span> Risk Factors ('+tr+'/'+r.factors.length+' triggered)</button>';
    h+='<div class="fac-body">';
    r.factors.forEach(function(f){
      var pct=f.maxPoints>0?(f.points/f.maxPoints*100):0;
      h+='<div class="fac-row"><div class="fac-n">'+f.name+'</div>';
      h+='<div class="fac-bar"><div class="fac-fill" style="width:'+pct+'%;background:'+(f.triggered?rc:'var(--border)')+'"></div></div>';
      h+='<div class="fac-pts">'+f.points+'/'+f.maxPoints+'</div>';
      h+='<div class="fac-st">'+(f.triggered?'\\u{1F534}':'\\u2705')+'</div></div>';
    });
    h+='</div></div>';
  });

  // ── Proposed Safe Fixes ──
  if(d.remediationPlan&&d.remediationPlan.totalItems>0){
    var rp=d.remediationPlan;
    var pIcon={'critical':'🔴','high':'🟠','medium':'🟡','low':'🟢'};
    h+='<div class="rem-wrap">';
    h+='<div class="rem-head">🔧 Proposed Safe Fixes <span class="rem-count">'+rp.totalItems+' action'+(rp.totalItems===1?'':'s');
    if(rp.criticalCount>0) h+=' · <span style="color:#ef4444">'+rp.criticalCount+' critical</span>';
    h+='</span></div>';
    rp.items.slice(0,5).forEach(function(item){
      h+='<details class="rem-item">';
      h+='<summary class="rem-summary">';
      h+='<span class="rem-id">'+item.id+'</span>';
      h+='<span class="rem-pri">'+(pIcon[item.priority]||'•')+'</span>';
      h+='<span class="rem-title">'+item.title+'</span>';
      h+='</summary>';
      h+='<div class="rem-body">';
      h+='<p class="rem-desc">'+item.description+'</p>';
      h+='<div class="rem-steps">';
      item.steps.forEach(function(s){
        h+='<div class="rem-step"><span class="rem-step-n">'+s.step+'</span><div><strong>'+s.action+'</strong> — '+s.detail;
        if(s.tool) h+=' <em>('+s.tool+')</em>';
        if(s.owner) h+=' · <code>'+s.owner+'</code>';
        h+='</div></div>';
      });
      h+='</div>';
      if(item.followUpPRScope&&item.followUpPRScope.length){
        h+='<div class="rem-followup"><strong>Follow-up PR scope:</strong><ul>';
        item.followUpPRScope.forEach(function(s){h+='<li>☐ '+s+'</li>';});
        h+='</ul></div>';
      }
      h+='</div></details>';
    });
    if(rp.totalItems>5) h+='<div class="rem-more">+'+( rp.totalItems-5)+' more in artifacts/lineagelock-remediation.json</div>';
    h+='</div>';
  }

  // ── Audit Trail summary ──
  if(d.auditTrail){
    var at=d.auditTrail;
    var atDec=at.isBlocked?'🚫 BLOCKED':at.decision==='fail'?'🔴 FAIL':at.decision==='warn'?'⚠️ WARN':'✅ PASS';
    h+='<details class="audit-wrap">';
    h+='<summary class="audit-head">📋 Governance Audit Trail <span class="audit-ts">'+at.timestamp.slice(0,19).replace('T',' ')+'</span></summary>';
    h+='<div class="audit-body">';
    h+='<div class="audit-grid">';
    h+='<div class="audit-row"><span class="audit-k">Decision</span><span class="audit-v">'+atDec+'</span></div>';
    h+='<div class="audit-row"><span class="audit-k">Score</span><span class="audit-v">'+at.aggregateScore+'/100 ('+at.aggregateLevel+')</span></div>';
    h+='<div class="audit-row"><span class="audit-k">Policies Triggered</span><span class="audit-v">'+at.policies.length+'</span></div>';
    h+='<div class="audit-row"><span class="audit-k">Reviewers Requested</span><span class="audit-v">'+(at.routing.requestedUsers.concat(at.routing.requestedTeams.map(function(t){return'team:'+t;})).join(', ')||'none')+'</span></div>';
    h+='<div class="audit-row"><span class="audit-k">Active Quality Issues</span><span class="audit-v">'+at.observability.totalActiveQualityIssues+'</span></div>';
    h+='<div class="audit-row"><span class="audit-k">Entities Analyzed</span><span class="audit-v">'+at.entities.length+' ('+at.entities.filter(function(e){return e.found;}).length+' resolved)</span></div>';
    h+='<div class="audit-row"><span class="audit-k">Version</span><span class="audit-v">LineageLock v'+at.version+'</span></div>';
    h+='</div>';
    if(at.policies.length){
      h+='<div class="audit-policies"><strong>Triggered Policies:</strong>';
      at.policies.forEach(function(p){
        h+='<div class="audit-pol">'+(p.severity==='block'?'🚫':'⚠️')+' <strong>'+p.policyName+'</strong> — '+p.reason.slice(0,120)+'</div>';
      });
      h+='</div>';
    }
    h+='<div class="audit-note">🔒 Full record saved to <code>artifacts/lineagelock-audit.json</code></div>';
    h+='</div></details>';
  }

  el.innerHTML=h;
  el.style.display='block';
  el.scrollIntoView({behavior:'smooth',block:'start'});
}

function formatAge(ts){
  var ms=Date.now()-new Date(ts).getTime();
  var h=Math.floor(ms/3600000);
  return h<24?h+'h ago':Math.floor(h/24)+'d ago';
}

loadTables();
checkConn();
</script>
</body>
</html>`;
}

module.exports = { app };
