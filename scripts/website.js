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
const { loadConfig } = require('../dist/config/loader');

const OM_URL = process.env.OPENMETADATA_URL || 'https://sandbox.open-metadata.org';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

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
    const report = scoreEntities(entities, config);
    const results = report.assessments.map((a, i) => {
      const entity = entities[i];
      const ownerObj = entity.entity?.owner;
      return {
        file: a.filePath, fqn: a.fqn, found: entity.found !== false,
        score: a.score, level: a.level, factors: a.factors,
        owner: ownerObj ? (ownerObj.displayName || ownerObj.name) : null,
        ownerType: ownerObj?.type || null,
        tier: entity.entity?.tier || null,
        tags: (entity.entity?.tags || []).map(t => t.tagFQN),
        columns: entity.entity?.columns?.length || 0,
        downstream: {
          total: entity.downstream?.total || 0,
          tables: entity.downstream?.tables?.length || 0,
          dashboards: entity.downstream?.dashboards?.length || 0,
          mlModels: entity.downstream?.mlModels?.length || 0,
        },
      };
    });
    res.json({ maxScore: report.maxScore, overallLevel: report.overallLevel, decision: report.decision, summary: report.summary, results });
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
  --black:#09090b;
  --black-2:#111113;
  --black-3:#18181b;
  --black-4:#1e1e22;
  --saffron:#e8860c;
  --saffron-light:#f5a623;
  --saffron-dim:rgba(232,134,12,0.12);
  --saffron-border:rgba(232,134,12,0.18);
  --white:#fafaf9;
  --white-dim:#a8a29e;
  --white-muted:#57534e;
  --white-faint:#292524;
  --green:#22c55e;
  --red:#ef4444;
  --yellow:#eab308;
  --orange:#f97316;
  --font:'DM Sans',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono','Fira Code',monospace;
}

html{scroll-behavior:smooth}

body{
  font-family:var(--font);
  background:var(--black);
  color:var(--white);
  -webkit-font-smoothing:antialiased;
  line-height:1.6;
}

/* ────────── Navbar ────────── */
nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  height:64px;display:flex;align-items:center;justify-content:space-between;
  padding:0 40px;
  background:rgba(9,9,11,0.92);
  backdrop-filter:blur(16px) saturate(180%);
  border-bottom:1px solid var(--white-faint);
}
.n-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--white);font-weight:700;font-size:1.05rem;letter-spacing:-0.02em}
.n-brand svg{width:24px;height:24px}
.n-links{display:flex;align-items:center;gap:8px}
.n-links a{
  color:var(--white-dim);text-decoration:none;font-size:0.82rem;font-weight:500;
  padding:6px 14px;border-radius:6px;transition:color .15s,background .15s;
}
.n-links a:hover{color:var(--white);background:rgba(255,255,255,0.04)}
.n-cta{
  background:var(--saffron)!important;color:var(--black)!important;font-weight:600!important;
  border-radius:6px;transition:opacity .15s!important;
}
.n-cta:hover{opacity:0.88;background:var(--saffron)!important}

/* ────────── Layout ────────── */
.wrap{max-width:1120px;margin:0 auto;padding:0 32px}
section{padding:100px 0}

/* ────────── Hero ────────── */
.hero{padding-top:160px;padding-bottom:80px;text-align:center}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  padding:5px 14px 5px 8px;border-radius:999px;
  background:var(--saffron-dim);border:1px solid var(--saffron-border);
  font-size:0.78rem;font-weight:500;color:var(--saffron-light);margin-bottom:28px;
}
.hero-eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--green);display:block}
.hero h1{
  font-size:clamp(2.6rem,5.5vw,4.2rem);font-weight:700;
  line-height:1.08;letter-spacing:-0.035em;
  color:var(--white);margin-bottom:20px;
}
.hero h1 em{font-style:normal;color:var(--saffron)}
.hero p{
  font-size:1.15rem;color:var(--white-dim);max-width:580px;margin:0 auto 36px;
  line-height:1.65;font-weight:400;
}
.hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn{
  padding:11px 28px;border-radius:8px;font-size:0.88rem;font-weight:600;
  text-decoration:none;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:7px;
  transition:all .15s;font-family:var(--font);
}
.btn-s{background:var(--saffron);color:var(--black)}
.btn-s:hover{opacity:0.85}
.btn-o{background:transparent;color:var(--white-dim);border:1px solid var(--white-faint)}
.btn-o:hover{border-color:var(--white-muted);color:var(--white)}

/* ────────── Section Headings ────────── */
.sh{margin-bottom:56px}
.sh-label{
  font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;
  color:var(--saffron);margin-bottom:12px;
}
.sh h2{font-size:2rem;font-weight:700;letter-spacing:-0.025em;line-height:1.15;color:var(--white);margin-bottom:10px}
.sh p{color:var(--white-dim);font-size:1rem;max-width:560px}

/* ────────── Divider ────────── */
.divider{border:0;border-top:1px solid var(--white-faint);margin:0}

/* ────────── Features grid ────────── */
.f-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--white-faint);border:1px solid var(--white-faint);border-radius:16px;overflow:hidden}
.f-card{background:var(--black-2);padding:32px;transition:background .2s}
.f-card:hover{background:var(--black-3)}
.f-icon{color:var(--saffron);font-size:1.4rem;margin-bottom:14px}
.f-card h3{font-size:0.95rem;font-weight:600;color:var(--white);margin-bottom:6px}
.f-card p{font-size:0.82rem;color:var(--white-dim);line-height:1.55}

/* ────────── Pipeline ────────── */
.pipe{display:flex;align-items:center;justify-content:center;gap:0;margin-top:40px}
.pipe-step{
  padding:14px 24px;background:var(--black-2);border:1px solid var(--white-faint);
  display:flex;align-items:center;gap:10px;font-size:0.85rem;font-weight:500;
}
.pipe-step:first-child{border-radius:10px 0 0 10px}
.pipe-step:last-child{border-radius:0 10px 10px 0}
.pipe-step span{font-size:1.2rem}
.pipe-arr{color:var(--saffron);font-size:1rem;padding:0 2px}

/* ────────── Scoring table ────────── */
.s-table{width:100%;border-collapse:collapse;border:1px solid var(--white-faint);border-radius:12px;overflow:hidden}
.s-table th{
  padding:12px 20px;text-align:left;font-size:0.7rem;font-weight:600;
  text-transform:uppercase;letter-spacing:0.08em;color:var(--white-muted);
  background:var(--black-2);border-bottom:1px solid var(--white-faint);
}
.s-table td{padding:13px 20px;border-bottom:1px solid var(--white-faint);font-size:0.88rem}
.s-table tr:last-child td{border-bottom:none}
.s-table .wt{color:var(--saffron);font-weight:700;font-family:var(--mono);font-size:0.82rem}

/* ────────── Architecture ────────── */
.arch-flow{display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:48px}
.arch-box{
  padding:20px 32px;border-radius:12px;text-align:center;
  background:var(--black-2);border:1px solid var(--white-faint);min-width:280px;
}
.arch-box.core{border-color:var(--saffron-border);min-width:420px}
.arch-box h4{font-size:0.95rem;font-weight:600;color:var(--white);margin-bottom:4px}
.arch-box p{font-size:0.78rem;color:var(--white-muted)}
.arch-mods{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.arch-mod{
  padding:6px 10px;border-radius:6px;font-size:0.75rem;font-weight:500;
  background:var(--saffron-dim);color:var(--saffron-light);border:1px solid var(--saffron-border);
}
.arch-arrow{color:var(--white-muted);font-size:1.2rem}
.arch-row{display:flex;justify-content:center;gap:16px;flex-wrap:wrap}

/* ────────── Integration cards ────────── */
.int-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--white-faint);border:1px solid var(--white-faint);border-radius:16px;overflow:hidden}
.int-card{background:var(--black-2);padding:24px}
.int-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.int-head span{font-size:1.4rem}
.int-name{font-weight:600;font-size:0.9rem;color:var(--white)}
.int-ep{display:block;font-family:var(--mono);font-size:0.7rem;color:var(--saffron);margin-top:2px}
.int-card p{font-size:0.82rem;color:var(--white-dim);line-height:1.55}
.int-card code{font-family:var(--mono);font-size:0.78rem;background:var(--black-3);padding:1px 5px;border-radius:3px;color:var(--saffron-light)}

/* ────────── Config ────────── */
.cfg-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.cfg-code{background:var(--black-2);border:1px solid var(--white-faint);border-radius:12px;overflow:hidden}
.cfg-bar{
  padding:10px 16px;display:flex;align-items:center;gap:7px;
  background:var(--black-3);border-bottom:1px solid var(--white-faint);
  font-size:0.75rem;color:var(--white-muted);
}
.cfg-dot{width:9px;height:9px;border-radius:50%}
.cfg-code pre{padding:16px;margin:0;overflow-x:auto;font-family:var(--mono);font-size:0.78rem;color:#d4d4d8;line-height:1.6}
.cfg-ref code{font-family:var(--mono);font-size:0.78rem;background:var(--black-3);padding:1px 5px;border-radius:3px;color:var(--saffron-light)}

/* ────────── Action setup ────────── */
.act-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.act-step{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--white-faint)}
.act-step:last-of-type{border:none}
.act-num{
  width:28px;height:28px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:var(--saffron);color:var(--black);font-weight:700;font-size:0.8rem;
}
.act-step div{font-size:0.85rem;line-height:1.5}
.act-step strong{color:var(--white)}
.act-step code{font-family:var(--mono);font-size:0.78rem;background:var(--black-3);padding:1px 5px;border-radius:3px;color:var(--saffron-light)}
.outcomes{display:flex;flex-direction:column;gap:6px;margin-top:16px}
.oc{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;font-size:0.85rem}
.oc-pass{background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.12)}
.oc-warn{background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.12)}
.oc-fail{background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12)}

/* ────────── Dashboard ────────── */
.conn{
  display:flex;align-items:center;justify-content:center;gap:10px;
  padding:12px 20px;border-radius:10px;font-size:0.85rem;font-weight:500;margin-bottom:28px;
}
.conn.ok{background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.12);color:var(--green)}
.conn.err{background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12);color:var(--red)}
.conn.wait{background:var(--saffron-dim);border:1px solid var(--saffron-border);color:var(--saffron-light)}

.selector{background:var(--black-2);border:1px solid var(--white-faint);border-radius:14px;padding:28px;margin-bottom:28px}
.sel-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.sel-top h3{font-size:1rem;font-weight:600}
.sel-acts{display:flex;align-items:center;gap:10px}
.sel-count{font-size:0.82rem;color:var(--white-muted)}
.sel-btn{
  padding:4px 12px;border-radius:5px;font-size:0.78rem;font-weight:500;
  background:var(--black-3);border:1px solid var(--white-faint);color:var(--white-dim);
  cursor:pointer;font-family:var(--font);transition:all .12s;
}
.sel-btn:hover{border-color:var(--white-muted);color:var(--white)}

.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;max-height:400px;overflow-y:auto;padding-right:4px}
.chip{
  padding:10px 14px;border-radius:10px;cursor:pointer;
  background:var(--black-3);border:1px solid var(--white-faint);
  display:flex;flex-direction:column;gap:3px;min-width:190px;flex:0 0 auto;
  transition:all .12s;user-select:none;
}
.chip:hover{border-color:var(--white-muted)}
.chip.on{background:var(--saffron-dim);border-color:var(--saffron-border)}
.chip-n{font-weight:600;font-size:0.85rem;color:var(--white)}
.chip.on .chip-n{color:var(--saffron-light)}
.chip-f{font-size:0.68rem;color:var(--white-muted);font-family:var(--mono);word-break:break-all}
.chip-m{display:flex;gap:5px;flex-wrap:wrap;margin-top:3px}
.chip-b{font-size:0.62rem;padding:1px 6px;border-radius:3px;background:var(--black-4);color:var(--white-dim)}
.chip-b.t{background:rgba(234,179,8,0.1);color:var(--yellow)}
.chip-b.o{background:rgba(34,197,94,0.08);color:var(--green)}
.chip-b.g{background:var(--saffron-dim);color:var(--saffron-light)}

.go{
  padding:12px 36px;border-radius:8px;font-size:0.9rem;font-weight:600;
  background:var(--saffron);color:var(--black);border:none;cursor:pointer;
  font-family:var(--font);transition:opacity .12s;
}
.go:hover{opacity:0.85}
.go:disabled{opacity:0.35;cursor:not-allowed}
.go.spin{color:transparent;position:relative}
.go.spin::after{
  content:'';position:absolute;inset:0;margin:auto;
  width:18px;height:18px;border:2px solid var(--black);border-top-color:transparent;
  border-radius:50%;animation:sp .7s linear infinite;
}
@keyframes sp{to{transform:rotate(360deg)}}

/* ────────── Results ────────── */
#results{display:none}

.res-hero{
  display:flex;align-items:center;gap:40px;
  padding:36px;margin-bottom:24px;
  background:var(--black-2);border:1px solid var(--white-faint);border-radius:16px;
}
.ring{position:relative;width:180px;height:180px;flex-shrink:0}
.ring svg{transform:rotate(-90deg)}
.ring-bg{fill:none;stroke:var(--white-faint);stroke-width:7}
.ring-fg{fill:none;stroke-width:7;stroke-linecap:round;transition:all 1.2s ease}
.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring-num{font-size:3rem;font-weight:700;letter-spacing:-0.03em}
.ring-lbl{font-size:0.8rem;color:var(--white-muted)}

.res-meta{display:flex;flex-direction:column;gap:14px}
.rm-row{display:flex;align-items:center;gap:10px}
.rm-k{color:var(--white-muted);font-size:0.85rem;min-width:120px}
.rm-v{font-weight:600;font-size:1rem}
.rm-badge{
  display:inline-flex;align-items:center;gap:5px;
  padding:5px 14px;border-radius:999px;font-weight:600;font-size:0.85rem;
}

.stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.stat{
  background:var(--black-2);border:1px solid var(--white-faint);border-radius:12px;
  padding:20px;text-align:center;
}
.stat-n{font-size:2rem;font-weight:700;color:var(--white)}
.stat-l{font-size:0.7rem;color:var(--white-muted);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}

/* Entity cards */
.ent{
  background:var(--black-2);border:1px solid var(--white-faint);border-radius:14px;
  padding:24px;margin-bottom:12px;transition:border-color .15s;
}
.ent:hover{border-color:var(--white-muted)}
.ent-top{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.ent-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.ent-info{flex:1}
.ent-file{font-weight:600;font-size:0.95rem;color:var(--white)}
.ent-fqn{font-size:0.72rem;color:var(--white-muted);font-family:var(--mono)}
.ent-sc{text-align:right}
.ent-sc-n{font-size:2rem;font-weight:700}
.ent-sc-m{font-size:0.85rem;color:var(--white-muted)}
.ent-sc-l{font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;display:block}

.ent-meta{
  display:flex;gap:24px;padding:10px 14px;margin-bottom:14px;
  background:var(--black-3);border-radius:8px;
}
.em-l{font-size:0.65rem;color:var(--white-muted);text-transform:uppercase;letter-spacing:0.05em}
.em-v{font-size:0.85rem;font-weight:500;margin-top:1px}
.em-w{color:var(--yellow)}

.tag-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px}
.tag{
  padding:2px 8px;border-radius:4px;font-size:0.68rem;font-weight:500;
  background:var(--saffron-dim);color:var(--saffron-light);border:1px solid var(--saffron-border);
}

.fac-toggle{
  font-size:0.78rem;color:var(--white-dim);cursor:pointer;font-weight:500;
  background:none;border:none;padding:4px 0;font-family:var(--font);
  display:flex;align-items:center;gap:5px;
}
.fac-toggle:hover{color:var(--white)}
.fac-body{display:none;margin-top:10px}
.fac-body.open{display:block}
.fac-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--white-faint)}
.fac-row:last-child{border:none}
.fac-n{font-size:0.82rem;min-width:170px;color:var(--white-dim)}
.fac-bar{flex:1;height:4px;background:var(--black-4);border-radius:2px;overflow:hidden}
.fac-fill{height:100%;border-radius:2px;transition:width .6s ease}
.fac-pts{font-size:0.78rem;color:var(--white-muted);min-width:48px;text-align:right;font-family:var(--mono)}
.fac-st{font-size:0.82rem;width:20px;text-align:center}

/* ────────── Footer ────────── */
footer{
  text-align:center;padding:36px 32px;
  border-top:1px solid var(--white-faint);
  color:var(--white-muted);font-size:0.78rem;
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
  .ent-meta{flex-direction:column;gap:10px}
  .arch-box.core{min-width:auto}
  nav{padding:0 16px}
  .n-links{gap:4px}
}
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
      <div class="f-card"><div class="f-icon">&#x1F4A5;</div><h3>Blast Radius</h3><p>Maps every downstream table, dashboard, and ML model affected by your change via OpenMetadata lineage.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4CB;</div><h3>Contract Verification</h3><p>Checks data contract test suites and flags violations before they break downstream consumers.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F3F7;&#xFE0F;</div><h3>Sensitive Data Detection</h3><p>Flags changes to PII, GDPR, confidential, and PHI-tagged assets using OpenMetadata classifications.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F3AF;</div><h3>Tier-Based Risk</h3><p>Tier 1 and Tier 2 assets get higher risk scores. Business-critical changes cannot slip through.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F465;</div><h3>Owner Identification</h3><p>Identifies stakeholders from OpenMetadata ownership and flags unowned assets as governance risks.</p></div>
      <div class="f-card"><div class="f-icon">&#x2699;&#xFE0F;</div><h3>GitHub Action</h3><p>Drop-in GitHub Action that posts risk reports as PR comments and can block merges automatically.</p></div>
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
      <div class="f-card"><div class="f-icon">&#x1F4CA;</div><h3>Risk Scoring Engine</h3><p>Deterministic 0-100 scorer with 7 weighted factors. Segment-boundary tag matching prevents FPs.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F4CB;</div><h3>Report Renderer</h3><p>Generates rich Markdown PR comments with collapsible sections and stakeholder notifications.</p></div>
      <div class="f-card"><div class="f-icon">&#x2699;&#xFE0F;</div><h3>Config Loader</h3><p>Merges .lineagelock.json, environment variables, and GitHub Action inputs with sensible defaults.</p></div>
      <div class="f-card"><div class="f-icon">&#x1F916;</div><h3>Action Orchestrator</h3><p>GitHub Action entry point — detects changed files, runs analysis, posts comments, sets exit codes.</p></div>
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
    <div class="sh"><div class="sh-label">Risk Model</div><h2>Scoring Methodology</h2><p>Deterministic score from 0 to 100 based on 7 weighted factors.</p></div>
    <table class="s-table">
      <thead><tr><th>Factor</th><th>Weight</th><th>Trigger</th></tr></thead>
      <tbody>
        <tr><td>Contract Violation</td><td class="wt">+40</td><td>Data contract tests failing</td></tr>
        <tr><td>Critical Tier</td><td class="wt">+20</td><td>Asset is Tier 1 or Tier 2</td></tr>
        <tr><td>Sensitive Tags</td><td class="wt">+20</td><td>PII, GDPR, Confidential tags found</td></tr>
        <tr><td>Downstream Dashboards</td><td class="wt">+10</td><td>Any dashboard depends on asset</td></tr>
        <tr><td>Downstream ML Models</td><td class="wt">+10</td><td>Any ML model depends on asset</td></tr>
        <tr><td>High Downstream Count</td><td class="wt">+10</td><td>5 or more downstream entities</td></tr>
        <tr><td>No Owner</td><td class="wt">+10</td><td>No owner assigned in OpenMetadata</td></tr>
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
    <div class="sh"><div class="sh-label">Interactive</div><h2>Live Analysis</h2><p>Select tables to analyze against the OpenMetadata sandbox.</p></div>

    <div id="conn" class="conn wait">Checking connection...</div>

    <div class="selector">
      <div class="sel-top">
        <h3>Select Tables</h3>
        <div class="sel-acts">
          <span id="sel-count" class="sel-count">0 / 0</span>
          <button class="sel-btn" onclick="selAll()">All</button>
          <button class="sel-btn" onclick="selNone()">Clear</button>
        </div>
      </div>
      <div class="chips" id="chips"></div>
      <button class="go" id="go-btn" onclick="analyze()" disabled>Analyze Risk</button>
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
  el.innerHTML='<div style="color:var(--white-muted);font-size:0.85rem">Loading tables from OpenMetadata...</div>';
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
  el.innerHTML=FILES.map(function(f,i){
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

async function analyze(){
  var btn=document.getElementById('go-btn'),res=document.getElementById('results');
  btn.classList.add('spin');btn.disabled=true;res.style.display='none';
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
  h+='<div class="rm-row"><span class="rm-k">Risk Level</span><span class="rm-v">'+E[d.overallLevel]+' '+d.overallLevel+'</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Decision</span><span class="rm-badge" style="background:'+c+'15;color:'+c+';border:1px solid '+c+'30">'+D[d.decision]+'</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Entities</span><span class="rm-v">'+d.summary.resolvedEntities+' / '+d.summary.totalEntities+' resolved</span></div>';
  h+='<div class="rm-row"><span class="rm-k">Downstream</span><span class="rm-v">'+d.summary.totalDownstream+' entities</span></div>';
  h+='</div></div>';

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

    h+='<button class="fac-toggle" onclick="toggleFactors(this)"><span>\\u25B6</span> Risk Factors ('+tr+'/'+r.factors.length+' triggered)</button>';
    h+='<div class="fac-body">';
    r.factors.forEach(function(f){
      var pct=f.maxPoints>0?(f.points/f.maxPoints*100):0;
      h+='<div class="fac-row"><div class="fac-n">'+f.name+'</div>';
      h+='<div class="fac-bar"><div class="fac-fill" style="width:'+pct+'%;background:'+(f.triggered?rc:'var(--black-4)')+'"></div></div>';
      h+='<div class="fac-pts">'+f.points+'/'+f.maxPoints+'</div>';
      h+='<div class="fac-st">'+(f.triggered?'\\u{1F534}':'\\u2705')+'</div></div>';
    });
    h+='</div></div>';
  });

  el.innerHTML=h;
  el.style.display='block';
  el.scrollIntoView({behavior:'smooth',block:'start'});
}

loadTables();
checkConn();
</script>
</body>
</html>`;
}

module.exports = { app };
