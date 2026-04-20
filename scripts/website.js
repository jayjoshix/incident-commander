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
    
    // Build response with entity details
    const results = report.assessments.map((a, i) => {
      const entity = entities[i];
      const ownerObj = entity.entity?.owner;
      return {
        file: a.filePath,
        fqn: a.fqn,
        found: entity.found !== false,
        score: a.score,
        level: a.level,
        factors: a.factors,
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
    
    res.json({
      maxScore: report.maxScore,
      overallLevel: report.overallLevel,
      decision: report.decision,
      summary: report.summary,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════ PAGES ═══════════════════════════

app.get('/', (req, res) => {
  res.send(getHTML());
});

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
  <meta name="description" content="GitHub PR guard for data changes. Blast radius, governance risk, and contract compatibility powered by OpenMetadata.">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --bg: #06060b;
      --surface: rgba(255,255,255,0.03);
      --surface-hover: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.06);
      --border-hover: rgba(255,255,255,0.12);
      --text: #e5e7eb;
      --text-dim: #9ca3af;
      --text-muted: #6b7280;
      --accent: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.3);
      --green: #10b981;
      --yellow: #f59e0b;
      --orange: #f97316;
      --red: #ef4444;
      --blue: #3b82f6;
    }

    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Background effects */
    .bg-grid {
      position: fixed; inset: 0; z-index: 0;
      background-image: 
        linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
      background-size: 80px 80px;
    }
    .bg-glow {
      position: fixed; border-radius: 50%; filter: blur(180px); opacity: 0.12; z-index: 0;
    }
    .bg-glow-1 { width: 700px; height: 700px; top: -300px; left: -200px; background: var(--accent); }
    .bg-glow-2 { width: 500px; height: 500px; bottom: -200px; right: -100px; background: var(--green); }
    .bg-glow-3 { width: 400px; height: 400px; top: 50%; left: 50%; transform: translate(-50%,-50%); background: var(--yellow); opacity: 0.06; }

    .page { position: relative; z-index: 1; }

    /* Navigation */
    nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      padding: 16px 32px;
      background: rgba(6,6,11,0.8);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-brand {
      display: flex; align-items: center; gap: 10px;
      font-weight: 800; font-size: 1.2rem; color: #fff;
      text-decoration: none;
    }
    .nav-brand span { font-size: 1.4rem; }
    .nav-links { display: flex; gap: 32px; align-items: center; }
    .nav-links a {
      color: var(--text-dim); text-decoration: none; font-size: 0.9rem; font-weight: 500;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: #fff; }
    .nav-cta {
      padding: 8px 20px !important;
      background: var(--accent) !important;
      color: #fff !important;
      border-radius: 8px;
      font-weight: 600 !important;
      transition: transform 0.15s, box-shadow 0.15s !important;
    }
    .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 4px 20px var(--accent-glow); }

    /* Sections */
    section { padding: 120px 32px; max-width: 1200px; margin: 0 auto; }

    /* Hero */
    .hero { padding-top: 180px; text-align: center; }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 16px; border-radius: 999px; font-size: 0.8rem;
      background: var(--accent)15; color: var(--accent); border: 1px solid var(--accent)30;
      margin-bottom: 24px; font-weight: 500;
    }
    .hero-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    
    .hero h1 {
      font-size: 4rem; font-weight: 900; line-height: 1.1; letter-spacing: -0.03em;
      margin-bottom: 20px;
      background: linear-gradient(135deg, #fff 0%, #94a3b8 60%, #6366f1 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .hero p { font-size: 1.25rem; color: var(--text-dim); max-width: 640px; margin: 0 auto 40px; line-height: 1.6; }
    .hero-actions { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
    .btn {
      padding: 14px 32px; border-radius: 12px; font-size: 1rem; font-weight: 600;
      text-decoration: none; cursor: pointer; border: none;
      transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px var(--accent-glow); }
    .btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--surface-hover); border-color: var(--border-hover); }

    /* Features */
    .features-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
      margin-top: 48px;
    }
    .feature-card {
      padding: 32px; border-radius: 16px;
      background: var(--surface); border: 1px solid var(--border);
      transition: all 0.2s;
    }
    .feature-card:hover { border-color: var(--border-hover); transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
    .feature-icon { font-size: 2rem; margin-bottom: 16px; }
    .feature-card h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; color: #fff; }
    .feature-card p { font-size: 0.9rem; color: var(--text-dim); line-height: 1.5; }

    /* How it works */
    .section-title {
      font-size: 2.5rem; font-weight: 800; text-align: center; margin-bottom: 12px;
      background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .section-sub { text-align: center; color: var(--text-dim); font-size: 1.1rem; margin-bottom: 48px; }
    
    .pipeline {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 32px; flex-wrap: wrap;
    }
    .pipeline-step {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 24px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .pipeline-step .step-icon { font-size: 1.5rem; }
    .pipeline-step .step-text { font-weight: 600; font-size: 0.9rem; }
    .pipeline-arrow { font-size: 1.5rem; color: var(--text-muted); }

    /* Scoring */
    .scoring-table {
      width: 100%; border-collapse: separate; border-spacing: 0;
      border-radius: 16px; overflow: hidden;
      background: var(--surface); border: 1px solid var(--border);
    }
    .scoring-table th {
      padding: 14px 20px; text-align: left; font-size: 0.8rem;
      text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim);
      background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border);
    }
    .scoring-table td {
      padding: 14px 20px; border-bottom: 1px solid var(--border); font-size: 0.9rem;
    }
    .scoring-table tr:last-child td { border-bottom: none; }
    .scoring-table .weight { font-weight: 700; font-family: monospace; color: var(--accent); }

    /* Dashboard */
    #dashboard { padding-top: 100px; }
    .dash-header { text-align: center; margin-bottom: 40px; }
    
    .connection-banner {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      padding: 16px 24px; border-radius: 12px; margin-bottom: 32px;
      font-size: 0.9rem; font-weight: 500;
    }
    .connection-banner.connected { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: var(--green); }
    .connection-banner.disconnected { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: var(--red); }
    .connection-banner.loading { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); color: var(--accent); }

    /* File selector */
    .file-selector {
      background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
      padding: 32px; margin-bottom: 32px;
    }
    .file-selector h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; color: #fff; }
    .file-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
    .file-chip {
      padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 500;
      background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); color: var(--accent);
      cursor: pointer; transition: all 0.15s; user-select: none;
    }
    .file-chip:hover { background: rgba(99,102,241,0.2); }
    .file-chip.selected { background: var(--accent); color: #fff; border-color: var(--accent); }
    
    .analyze-btn {
      padding: 14px 40px; border-radius: 12px; font-size: 1rem; font-weight: 700;
      background: var(--accent); color: #fff; border: none; cursor: pointer;
      transition: all 0.2s;
    }
    .analyze-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px var(--accent-glow); }
    .analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .analyze-btn.loading { position: relative; color: transparent; }
    .analyze-btn.loading::after {
      content: ''; position: absolute; inset: 0; margin: auto;
      width: 20px; height: 20px; border: 2px solid #fff; border-top-color: transparent;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Results */
    #results { display: none; }
    
    .result-hero {
      display: flex; align-items: center; justify-content: center; gap: 48px;
      padding: 40px; margin-bottom: 32px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
    }
    .score-ring { position: relative; width: 200px; height: 200px; }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring-bg { fill: none; stroke: #1f2937; stroke-width: 8; }
    .score-ring-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: all 1.5s ease; }
    .score-ring-center {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .score-ring-number { font-size: 3.5rem; font-weight: 900; }
    .score-ring-label { font-size: 0.85rem; color: var(--text-dim); }
    
    .result-meta { display: flex; flex-direction: column; gap: 16px; }
    .result-meta-row { display: flex; align-items: center; gap: 12px; }
    .result-meta-label { color: var(--text-dim); font-size: 0.9rem; min-width: 140px; }
    .result-meta-value { font-weight: 600; font-size: 1.1rem; }
    .result-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 16px; border-radius: 999px; font-weight: 600; font-size: 0.9rem;
    }

    .stats-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;
    }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
      padding: 24px; text-align: center;
    }
    .stat-number { font-size: 2.2rem; font-weight: 800; color: #fff; }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

    /* Entity card */
    .entity-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
      padding: 28px; margin-bottom: 16px; transition: all 0.2s;
    }
    .entity-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); border-color: var(--border-hover); }
    .entity-top { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .entity-level-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .entity-info { flex: 1; }
    .entity-file { font-weight: 700; font-size: 1.05rem; color: #fff; }
    .entity-fqn { font-size: 0.8rem; color: var(--text-muted); font-family: monospace; }
    .entity-score-big { text-align: right; }
    .entity-score-num { font-size: 2.2rem; font-weight: 900; }
    .entity-score-max { font-size: 0.9rem; color: var(--text-muted); }
    .entity-score-level { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: block; }

    .entity-meta-row {
      display: flex; gap: 28px; padding: 12px 16px; margin-bottom: 16px;
      background: rgba(255,255,255,0.015); border-radius: 10px;
    }
    .em-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .em-value { font-size: 0.9rem; font-weight: 500; margin-top: 2px; }
    .em-warn { color: var(--yellow); }

    .tags-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .tag-pill {
      padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 500;
      background: rgba(99,102,241,0.12); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.18);
    }

    .factors-wrap { margin-top: 8px; }
    .factors-toggle {
      font-size: 0.8rem; color: var(--text-dim); cursor: pointer; font-weight: 500;
      background: none; border: none; padding: 4px 0;
      display: flex; align-items: center; gap: 6px;
    }
    .factors-toggle:hover { color: #fff; }
    .factors-body { display: none; margin-top: 12px; }
    .factors-body.open { display: block; }
    .factor-row {
      display: flex; align-items: center; gap: 12px; padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    .factor-row:last-child { border-bottom: none; }
    .f-name { font-size: 0.85rem; min-width: 180px; color: #d1d5db; }
    .f-bar-wrap { flex: 1; height: 6px; background: #1f2937; border-radius: 3px; overflow: hidden; }
    .f-bar { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
    .f-points { font-size: 0.8rem; color: var(--text-muted); min-width: 50px; text-align: right; font-family: monospace; }
    .f-status { font-size: 0.9rem; }

    /* Footer */
    footer {
      text-align: center; padding: 40px 32px; margin-top: 60px;
      border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.8rem;
    }
    footer a { color: var(--accent); text-decoration: none; }

    /* Responsive */
    @media (max-width: 900px) {
      .hero h1 { font-size: 2.5rem; }
      .features-grid { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .result-hero { flex-direction: column; gap: 24px; }
      .pipeline { flex-direction: column; }
      .pipeline-arrow { transform: rotate(90deg); }
      .entity-top { flex-direction: column; align-items: flex-start; }
      .entity-meta-row { flex-direction: column; gap: 12px; }
    }

    /* Smooth scroll */
    html { scroll-behavior: smooth; }

    /* Hide sections by default for SPA feel */
    /* Hide sections by default for SPA feel */
    .section-hidden { display: none; }

    /* Architecture */
    .arch-diagram { text-align: center; margin-bottom: 48px; }
    .arch-row { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; }
    .arch-box {
      padding: 24px 32px; border-radius: 16px; text-align: center; min-width: 200px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .arch-trigger { border-color: rgba(99,102,241,0.3); }
    .arch-core { border-color: rgba(16,185,129,0.3); min-width: 400px; }
    .arch-ext { border-color: rgba(245,158,11,0.3); }
    .arch-icon { font-size: 2rem; margin-bottom: 8px; }
    .arch-label { font-weight: 700; font-size: 1rem; color: #fff; }
    .arch-desc { font-size: 0.8rem; color: var(--text-dim); margin-top: 4px; }
    .arch-inner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .arch-module {
      padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 500;
      background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15); color: var(--green);
    }
    .arch-module span { margin-right: 4px; }
    .arch-arrow-down { font-size: 2rem; color: var(--text-muted); text-align: center; padding: 8px 0; }
    .arch-arrow-row { display: flex; justify-content: center; gap: 200px; }
    .arch-components { margin-top: 24px; }

    /* Integration */
    .integration-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .int-card {
      padding: 24px; border-radius: 16px;
      background: var(--surface); border: 1px solid var(--border);
      transition: all 0.2s;
    }
    .int-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
    .int-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .int-icon { font-size: 1.8rem; }
    .int-name { font-weight: 700; color: #fff; font-size: 1rem; }
    .int-endpoint { font-size: 0.75rem; color: var(--accent); background: rgba(99,102,241,0.1); padding: 2px 8px; border-radius: 4px; }
    .int-card p { font-size: 0.85rem; color: var(--text-dim); line-height: 1.5; }
    .int-card code { font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; color: var(--accent); }

    /* Config */
    .config-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .config-code {
      background: #0d1117; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;
    }
    .code-header {
      padding: 10px 16px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-dim);
    }
    .code-dot { width: 10px; height: 10px; border-radius: 50%; }
    .code-dot.red { background: #ff5f56; }
    .code-dot.yellow { background: #ffbd2e; }
    .code-dot.green { background: #27c93f; }
    .config-code pre { padding: 16px; margin: 0; overflow-x: auto; }
    .config-code code { font-size: 0.8rem; color: #e6edf3; line-height: 1.5; }
    .config-reference code { font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 3px; color: var(--accent); }

    /* GitHub Action */
    .action-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .action-steps { }
    .setup-step {
      display: flex; align-items: flex-start; gap: 16px;
      padding: 16px 0; border-bottom: 1px solid var(--border);
    }
    .setup-step:last-of-type { border-bottom: none; }
    .step-num {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--accent); color: #fff; font-weight: 700; font-size: 0.9rem;
    }
    .setup-step div { font-size: 0.9rem; line-height: 1.5; }
    .setup-step strong { color: #fff; }
    .setup-step code { font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 3px; color: var(--accent); }
    .action-outcomes { display: flex; flex-direction: column; gap: 8px; }
    .outcome {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; border-radius: 10px; font-size: 0.9rem;
    }
    .outcome.pass { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15); }
    .outcome.warn { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.15); }
    .outcome.fail { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15); }

    /* Nav overflow for many links */
    .nav-links { gap: 20px !important; flex-wrap: wrap; }
    .nav-links a { font-size: 0.82rem !important; }

    @media (max-width: 900px) {
      .integration-cards { grid-template-columns: 1fr; }
      .config-layout, .action-layout { grid-template-columns: 1fr; }
      .arch-core { min-width: auto; }
      .arch-arrow-row { gap: 40px; }
    }
  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="bg-glow bg-glow-1"></div>
  <div class="bg-glow bg-glow-2"></div>
  <div class="bg-glow bg-glow-3"></div>

  <div class="page">
    <!-- Nav -->
    <nav>
      <a href="#" class="nav-brand" onclick="showSection('hero')"><span>🔒</span> LineageLock</a>
      <div class="nav-links">
        <a href="#" onclick="showSection('hero')">Home</a>
        <a href="#" onclick="showSection('features')">Features</a>
        <a href="#" onclick="showSection('how')">How It Works</a>
        <a href="#" onclick="showSection('architecture')">Architecture</a>
        <a href="#" onclick="showSection('integration')">Integration</a>
        <a href="#" onclick="showSection('scoring')">Scoring</a>
        <a href="#" onclick="showSection('config')">Config</a>
        <a href="#" onclick="showSection('action')">GitHub Action</a>
        <a href="#" onclick="showSection('dashboard')" class="nav-cta">🚀 Try It Live</a>
      </div>
    </nav>

    <!-- Hero -->
    <section id="hero" class="hero">
      <div class="hero-badge"><span class="dot"></span> Connected to OpenMetadata Sandbox</div>
      <h1>PR Guard for<br>Data Changes</h1>
      <p>Blast radius analysis, governance risk scoring, and contract verification for every pull request. Powered by OpenMetadata lineage.</p>
      <div class="hero-actions">
        <a href="#" class="btn btn-primary" onclick="showSection('dashboard')">🔍 Analyze Now</a>
        <a href="https://github.com/jayjoshix/incident-commander" class="btn btn-secondary" target="_blank">⭐ GitHub</a>
      </div>
    </section>

    <!-- Features -->
    <section id="features">
      <h2 class="section-title">Why LineageLock</h2>
      <p class="section-sub">Catch data problems before they reach production</p>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">💥</div>
          <h3>Blast Radius</h3>
          <p>Automatically maps every downstream table, dashboard, and ML model affected by your change using OpenMetadata lineage.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📋</div>
          <h3>Contract Verification</h3>
          <p>Checks data contract test suites and flags violations before they break downstream consumers.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🏷️</div>
          <h3>Sensitive Data Detection</h3>
          <p>Flags changes to PII, GDPR, confidential, and PHI-tagged assets using OpenMetadata classifications.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🎯</div>
          <h3>Tier-Based Risk</h3>
          <p>Tier 1 and Tier 2 assets automatically get higher risk scores. Business-critical changes can't slip through.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">👥</div>
          <h3>Owner Notifications</h3>
          <p>Identifies stakeholders from OpenMetadata ownership and flags unowned assets as governance risks.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🤖</div>
          <h3>GitHub Action</h3>
          <p>Drop-in GitHub Action that runs on every PR. Posts risk reports as comments and can block merges.</p>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section id="how">
      <h2 class="section-title">How It Works</h2>
      <p class="section-sub">From PR to decision in seconds</p>
      <div class="pipeline">
        <div class="pipeline-step"><span class="step-icon">📝</span><span class="step-text">PR Opened</span></div>
        <span class="pipeline-arrow">→</span>
        <div class="pipeline-step"><span class="step-icon">🔍</span><span class="step-text">Files Detected</span></div>
        <span class="pipeline-arrow">→</span>
        <div class="pipeline-step"><span class="step-icon">🌐</span><span class="step-text">OpenMetadata Lookup</span></div>
        <span class="pipeline-arrow">→</span>
        <div class="pipeline-step"><span class="step-icon">📊</span><span class="step-text">Risk Scored</span></div>
        <span class="pipeline-arrow">→</span>
        <div class="pipeline-step"><span class="step-icon">💬</span><span class="step-text">PR Comment</span></div>
      </div>
    </section>

    <!-- Scoring -->
    <section id="scoring">
      <h2 class="section-title">Risk Scoring</h2>
      <p class="section-sub">Deterministic score from 0–100 based on 7 weighted factors</p>
      <table class="scoring-table">
        <thead><tr><th>Factor</th><th>Weight</th><th>Trigger</th></tr></thead>
        <tbody>
          <tr><td>📋 Contract Violation</td><td class="weight">+40</td><td>Data contract tests failing</td></tr>
          <tr><td>🎯 Critical Tier</td><td class="weight">+20</td><td>Asset is Tier 1 or Tier 2</td></tr>
          <tr><td>🏷️ Sensitive Tags</td><td class="weight">+20</td><td>PII, GDPR, Confidential tags found</td></tr>
          <tr><td>📊 Downstream Dashboards</td><td class="weight">+10</td><td>Any dashboard depends on asset</td></tr>
          <tr><td>🤖 Downstream ML Models</td><td class="weight">+10</td><td>Any ML model depends on asset</td></tr>
          <tr><td>💥 High Downstream Count</td><td class="weight">+10</td><td>≥5 downstream entities</td></tr>
          <tr><td>👤 No Owner</td><td class="weight">+10</td><td>No owner assigned</td></tr>
        </tbody>
      </table>
    </section>

    <!-- Architecture -->
    <section id="architecture">
      <h2 class="section-title">Architecture</h2>
      <p class="section-sub">How LineageLock connects to your data stack</p>
      
      <div class="arch-diagram">
        <div class="arch-row">
          <div class="arch-box arch-trigger">
            <div class="arch-icon">📝</div>
            <div class="arch-label">Pull Request</div>
            <div class="arch-desc">Developer changes dbt model, SQL file, or schema YAML</div>
          </div>
        </div>
        <div class="arch-arrow-down">↓</div>
        <div class="arch-row">
          <div class="arch-box arch-core">
            <div class="arch-icon">🔒</div>
            <div class="arch-label">LineageLock Engine</div>
            <div class="arch-inner-grid">
              <div class="arch-module"><span>🔍</span> Asset Resolver</div>
              <div class="arch-module"><span>📊</span> Risk Scorer</div>
              <div class="arch-module"><span>📋</span> Report Renderer</div>
              <div class="arch-module"><span>⚙️</span> Config Loader</div>
            </div>
          </div>
        </div>
        <div class="arch-arrow-row">
          <div class="arch-arrow-down">↓</div>
          <div class="arch-arrow-down">↓</div>
        </div>
        <div class="arch-row arch-bottom">
          <div class="arch-box arch-ext">
            <div class="arch-icon">🌐</div>
            <div class="arch-label">OpenMetadata API</div>
            <div class="arch-desc">Tables, lineage, tags, ownership, contracts</div>
          </div>
          <div class="arch-box arch-ext">
            <div class="arch-icon">🐙</div>
            <div class="arch-label">GitHub API</div>
            <div class="arch-desc">PR files, comments, status checks</div>
          </div>
        </div>
      </div>

      <div class="arch-components">
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:16px;color:#fff;text-align:center">Core Components</h3>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">🔍</div>
            <h3>Asset Resolver</h3>
            <p>Maps file paths (models/marts/fact_orders.sql) to OpenMetadata FQNs using configurable naming conventions and explicit mappings.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🌐</div>
            <h3>OpenMetadata Client</h3>
            <p>REST API client with automatic response normalization, v1.12+ compatibility (owners array), 404 handling, and error propagation.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <h3>Risk Scoring Engine</h3>
            <p>Deterministic 0-100 scorer with 7 weighted factors. Segment-boundary tag matching prevents false positives.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📋</div>
            <h3>Report Renderer</h3>
            <p>Generates rich Markdown PR comments with collapsible sections, risk factor tables, and stakeholder notifications.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">⚙️</div>
            <h3>Config Loader</h3>
            <p>Merges .lineagelock.json, environment variables, and GitHub Action inputs with sensible defaults.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🤖</div>
            <h3>Action Orchestrator</h3>
            <p>GitHub Action entry point that wires everything together — detects changed files, runs analysis, posts comments, sets exit codes.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- OpenMetadata Integration -->
    <section id="integration">
      <h2 class="section-title">OpenMetadata Integration</h2>
      <p class="section-sub">Deep integration with 6 OpenMetadata capabilities</p>

      <div class="integration-cards">
        <div class="int-card">
          <div class="int-header">
            <span class="int-icon">📡</span>
            <div>
              <div class="int-name">Entity Resolution</div>
              <code class="int-endpoint">GET /api/v1/tables/name/{fqn}</code>
            </div>
          </div>
          <p>Resolves changed file paths to OpenMetadata table entities. Fetches columns, owners, tags, tier, and test suite metadata in a single call using the <code>fields</code> parameter.</p>
        </div>
        <div class="int-card">
          <div class="int-header">
            <span class="int-icon">🌳</span>
            <div>
              <div class="int-name">Lineage Graph</div>
              <code class="int-endpoint">GET /api/v1/lineage/table/{id}</code>
            </div>
          </div>
          <p>Traverses the full lineage DAG with configurable depth (upstream=2, downstream=3). Categorizes downstream nodes by type: tables, dashboards, ML models, pipelines.</p>
        </div>
        <div class="int-card">
          <div class="int-header">
            <span class="int-icon">👥</span>
            <div>
              <div class="int-name">Ownership</div>
              <code class="int-endpoint">Entity owners/owner field</code>
            </div>
          </div>
          <p>Extracts owner information for stakeholder notification. Supports both v1.12+ <code>owners[]</code> array and legacy <code>owner</code> singular field for backward compatibility.</p>
        </div>
        <div class="int-card">
          <div class="int-header">
            <span class="int-icon">🏷️</span>
            <div>
              <div class="int-name">Classifications & Tags</div>
              <code class="int-endpoint">Entity tags field</code>
            </div>
          </div>
          <p>Scans entity tags using segment-boundary matching. Detects PII, GDPR, Confidential, PHI, PCI, and DataSensitivity classifications without false positives from unrelated tag hierarchies.</p>
        </div>
        <div class="int-card">
          <div class="int-header">
            <span class="int-icon">🎯</span>
            <div>
              <div class="int-name">Tier / Criticality</div>
              <code class="int-endpoint">Entity tier tag</code>
            </div>
          </div>
          <p>Identifies business-critical assets by tier classification. Tier 1 and Tier 2 assets receive +20 risk points, ensuring high-value data gets extra review scrutiny.</p>
        </div>
        <div class="int-card">
          <div class="int-header">
            <span class="int-icon">📋</span>
            <div>
              <div class="int-name">Data Contracts</div>
              <code class="int-endpoint">GET /api/v1/dataQuality/testSuites/search/list</code>
            </div>
          </div>
          <p>Queries test suite results to check contract compliance. Failing tests trigger the highest-weight factor (+40 points). Only 404 is treated as "no contract" — auth/server errors propagate.</p>
        </div>
      </div>
    </section>

    <!-- Configuration -->
    <section id="config">
      <h2 class="section-title">Configuration</h2>
      <p class="section-sub">Customize LineageLock via .lineagelock.json in your repo root</p>

      <div class="config-layout">
        <div class="config-code">
          <div class="code-header"><span class="code-dot red"></span><span class="code-dot yellow"></span><span class="code-dot green"></span> .lineagelock.json</div>
          <pre><code>{
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
    }
  ],
  "sensitiveTags": {
    "keywords": ["PII", "GDPR", "Confidential"]
  },
  "criticalTiers": ["Tier1", "Tier2"],
  "failOnUnresolved": false,
  "thresholds": {
    "warn": 30,
    "fail": 70
  }
}</code></pre>
        </div>
        <div class="config-reference">
          <h3 style="font-weight:700;margin-bottom:16px;color:#fff">Configuration Reference</h3>
          <table class="scoring-table">
            <thead><tr><th>Key</th><th>Description</th><th>Default</th></tr></thead>
            <tbody>
              <tr><td><code>naming.service</code></td><td>OpenMetadata service name</td><td>warehouse</td></tr>
              <tr><td><code>naming.database</code></td><td>Database name</td><td>analytics</td></tr>
              <tr><td><code>naming.schema</code></td><td>Schema name</td><td>public</td></tr>
              <tr><td><code>mappings</code></td><td>Explicit file → FQN mappings</td><td>[]</td></tr>
              <tr><td><code>sensitiveTags</code></td><td>Tag keywords to flag</td><td>PII, GDPR...</td></tr>
              <tr><td><code>criticalTiers</code></td><td>Tiers considered critical</td><td>Tier1, Tier2</td></tr>
              <tr><td><code>failOnUnresolved</code></td><td>Fail if entities not found</td><td>false</td></tr>
              <tr><td><code>thresholds.warn</code></td><td>Warning score threshold</td><td>30</td></tr>
              <tr><td><code>thresholds.fail</code></td><td>Failure score threshold</td><td>70</td></tr>
            </tbody>
          </table>
          <h3 style="font-weight:700;margin:24px 0 16px;color:#fff">Environment Variables</h3>
          <table class="scoring-table">
            <thead><tr><th>Variable</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>OPENMETADATA_URL</code></td><td>OpenMetadata server URL</td></tr>
              <tr><td><code>OPENMETADATA_TOKEN</code></td><td>JWT authentication token</td></tr>
              <tr><td><code>GITHUB_TOKEN</code></td><td>GitHub token (auto in Actions)</td></tr>
              <tr><td><code>LINEAGELOCK_WARN_THRESHOLD</code></td><td>Override warning threshold</td></tr>
              <tr><td><code>LINEAGELOCK_FAIL_THRESHOLD</code></td><td>Override failure threshold</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- GitHub Action -->
    <section id="action">
      <h2 class="section-title">GitHub Action</h2>
      <p class="section-sub">Drop-in workflow for any repository with data models</p>

      <div class="action-layout">
        <div class="config-code">
          <div class="code-header"><span class="code-dot red"></span><span class="code-dot yellow"></span><span class="code-dot green"></span> .github/workflows/lineagelock.yml</div>
          <pre><code>name: LineageLock PR Guard

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
          github-token: $&#123;&#123; secrets.GITHUB_TOKEN &#125;&#125;
          openmetadata-url: $&#123;&#123; secrets.OPENMETADATA_URL &#125;&#125;
          openmetadata-token: $&#123;&#123; secrets.OPENMETADATA_TOKEN &#125;&#125;
          warn-threshold: '30'
          fail-threshold: '70'</code></pre>
        </div>
        <div class="action-steps">
          <h3 style="font-weight:700;margin-bottom:20px;color:#fff">Setup Steps</h3>
          <div class="setup-step"><span class="step-num">1</span><div><strong>Add secrets</strong><br>Go to Settings → Secrets → Add <code>OPENMETADATA_URL</code> and <code>OPENMETADATA_TOKEN</code></div></div>
          <div class="setup-step"><span class="step-num">2</span><div><strong>Add config</strong><br>Create <code>.lineagelock.json</code> with your service, database, and schema names</div></div>
          <div class="setup-step"><span class="step-num">3</span><div><strong>Add workflow</strong><br>Copy the YAML into <code>.github/workflows/lineagelock.yml</code></div></div>
          <div class="setup-step"><span class="step-num">4</span><div><strong>Open a PR</strong><br>Change any data model file — LineageLock posts a risk comment automatically</div></div>
          <h3 style="font-weight:700;margin:24px 0 16px;color:#fff">What Happens on PR</h3>
          <div class="action-outcomes">
            <div class="outcome pass"><span>🟢</span> Score &lt; 30 → <strong>Pass</strong> — safe to merge</div>
            <div class="outcome warn"><span>🟡</span> Score 30-69 → <strong>Warn</strong> — review recommended</div>
            <div class="outcome fail"><span>🔴</span> Score ≥ 70 → <strong>Fail</strong> — blocks merge</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dashboard -->
    <section id="dashboard">
      <div class="dash-header">
        <h2 class="section-title">Live Analysis</h2>
        <p class="section-sub">Select files to analyze against the OpenMetadata sandbox</p>
      </div>

      <div id="connection-banner" class="connection-banner loading">
        ⏳ Checking OpenMetadata connection...
      </div>

      <div class="file-selector">
        <h3>📁 Select Changed Files</h3>
        <div class="file-chips" id="file-chips"></div>
        <button class="analyze-btn" id="analyze-btn" onclick="runAnalysis()" disabled>🔍 Analyze Risk</button>
      </div>

      <div id="results"></div>
    </section>

    <footer>
      Built for the <a href="https://wemakedevs.org">WeMakeDevs × OpenMetadata Hackathon</a> (April 2026)<br>
      <a href="https://github.com/jayjoshix/incident-commander">GitHub</a> · 
      Powered by <a href="https://open-metadata.org">OpenMetadata</a>
    </footer>
  </div>

  <script>
    // Available files for analysis
    const AVAILABLE_FILES = [
      { file: 'models/marts/fact_orders.sql', fqn: 'acme_nexus_analytics.ANALYTICS.MARTS.fact_orders' },
      { file: 'models/staging/stg_orders.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_orders' },
      { file: 'models/staging/stg_products.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_products' },
      { file: 'models/marts/dim_products.sql', fqn: 'acme_nexus_analytics.ANALYTICS.MARTS.dim_products' },
      { file: 'models/staging/stg_customers.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_customers' },
    ];

    const selected = new Set([0, 1, 2]); // Default selected

    const COLORS = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' };
    const EMOJI = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };
    const DECISION = { pass: '✅ Safe to Merge', warn: '⚠️ Review Required', fail: '🚫 Block Merge' };

    // Section navigation  
    function showSection(id) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }

    // Toggle factors accordion
    function toggleFactors(btn) {
      var body = btn.nextElementSibling;
      body.classList.toggle('open');
      btn.querySelector('span').textContent = body.classList.contains('open') ? '▼' : '▶';
    }

    // Init file chips
    function initChips() {
      const container = document.getElementById('file-chips');
      container.innerHTML = AVAILABLE_FILES.map((f, i) => 
        '<span class="file-chip ' + (selected.has(i) ? 'selected' : '') + '" onclick="toggleFile(' + i + ')">' + f.file + '</span>'
      ).join('');
      document.getElementById('analyze-btn').disabled = selected.size === 0;
    }

    function toggleFile(i) {
      selected.has(i) ? selected.delete(i) : selected.add(i);
      initChips();
    }

    // Health check
    async function checkConnection() {
      const banner = document.getElementById('connection-banner');
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (data.ok) {
          banner.className = 'connection-banner connected';
          banner.innerHTML = '✅ Connected to OpenMetadata ' + data.version + ' — ' + data.url;
        } else {
          banner.className = 'connection-banner disconnected';
          banner.innerHTML = '❌ Cannot connect: ' + data.error;
        }
      } catch (e) {
        banner.className = 'connection-banner disconnected';
        banner.innerHTML = '❌ Server error: ' + e.message;
      }
    }

    // Run analysis
    async function runAnalysis() {
      const btn = document.getElementById('analyze-btn');
      const resultsDiv = document.getElementById('results');
      
      btn.classList.add('loading');
      btn.disabled = true;
      resultsDiv.style.display = 'none';

      const files = [...selected].map(i => AVAILABLE_FILES[i]);

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        renderResults(data);
      } catch (e) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="padding:24px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:12px;color:var(--red);">❌ ' + e.message + '</div>';
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }

    function renderResults(data) {
      const div = document.getElementById('results');
      const color = COLORS[data.overallLevel];
      const circ = 2 * Math.PI * 80;
      const offset = circ * (1 - data.maxScore / 100);

      let html = '';
      
      // Score hero
      html += '<div class="result-hero">';
      html += '<div class="score-ring"><svg viewBox="0 0 180 180" width="200" height="200">';
      html += '<circle class="score-ring-bg" cx="90" cy="90" r="80"/>';
      html += '<circle class="score-ring-fill" cx="90" cy="90" r="80" style="stroke:' + color + ';stroke-dasharray:' + circ + ';stroke-dashoffset:' + offset + '"/>';
      html += '</svg><div class="score-ring-center">';
      html += '<div class="score-ring-number" style="color:' + color + '">' + data.maxScore + '</div>';
      html += '<div class="score-ring-label">out of 100</div>';
      html += '</div></div>';
      
      html += '<div class="result-meta">';
      html += '<div class="result-meta-row"><span class="result-meta-label">Risk Level</span><span class="result-meta-value">' + EMOJI[data.overallLevel] + ' ' + data.overallLevel + '</span></div>';
      html += '<div class="result-meta-row"><span class="result-meta-label">Decision</span><span class="result-badge" style="background:' + color + '20;color:' + color + ';border:1px solid ' + color + '40">' + DECISION[data.decision] + '</span></div>';
      html += '<div class="result-meta-row"><span class="result-meta-label">Entities</span><span class="result-meta-value">' + data.summary.resolvedEntities + ' / ' + data.summary.totalEntities + ' resolved</span></div>';
      html += '<div class="result-meta-row"><span class="result-meta-label">Downstream</span><span class="result-meta-value">' + data.summary.totalDownstream + ' entities</span></div>';
      html += '</div></div>';

      // Stats
      html += '<div class="stats-grid">';
      html += '<div class="stat-card"><div class="stat-number">' + data.summary.totalDownstream + '</div><div class="stat-label">Downstream</div></div>';
      html += '<div class="stat-card"><div class="stat-number">' + data.summary.totalDashboards + '</div><div class="stat-label">Dashboards</div></div>';
      html += '<div class="stat-card"><div class="stat-number">' + data.summary.totalMlModels + '</div><div class="stat-label">ML Models</div></div>';
      html += '<div class="stat-card"><div class="stat-number">' + data.summary.unresolvedEntities + '</div><div class="stat-label">Unresolved</div></div>';
      html += '</div>';

      // Entity cards
      html += '<h3 style="font-size:1.3rem;font-weight:700;margin-bottom:16px;color:#fff">📊 Per-Entity Analysis</h3>';
      
      data.results.forEach((r, idx) => {
        const c = COLORS[r.level];
        const triggered = r.factors.filter(f => f.triggered).length;
        
        html += '<div class="entity-card">';
        html += '<div class="entity-top">';
        html += '<div class="entity-level-dot" style="background:' + c + '"></div>';
        html += '<div class="entity-info"><div class="entity-file">' + r.file + '</div><div class="entity-fqn">' + r.fqn + '</div></div>';
        html += '<div class="entity-score-big"><span class="entity-score-num" style="color:' + c + '">' + r.score + '</span><span class="entity-score-max">/100</span><span class="entity-score-level" style="color:' + c + '">' + r.level + '</span></div>';
        html += '</div>';

        // Meta row
        html += '<div class="entity-meta-row">';
        html += '<div><div class="em-label">Owner</div><div class="em-value ' + (r.owner ? '' : 'em-warn') + '">' + (r.owner || '⚠️ Unassigned') + '</div></div>';
        html += '<div><div class="em-label">Tier</div><div class="em-value">' + (r.tier || 'Not classified') + '</div></div>';
        html += '<div><div class="em-label">Columns</div><div class="em-value">' + r.columns + '</div></div>';
        html += '<div><div class="em-label">Downstream</div><div class="em-value">' + r.downstream.total + '</div></div>';
        html += '</div>';

        // Tags
        if (r.tags.length) {
          html += '<div class="tags-wrap">';
          r.tags.forEach(t => { html += '<span class="tag-pill">' + t + '</span>'; });
          html += '</div>';
        }

        // Factors
        html += '<div class="factors-wrap">';
        html += '<button class="factors-toggle" onclick="toggleFactors(this)"><span>▶</span>&nbsp; Risk Factors (' + triggered + '/' + r.factors.length + ' triggered)</button>';
        html += '<div class="factors-body">';
        r.factors.forEach(f => {
          const pct = f.maxPoints > 0 ? (f.points / f.maxPoints * 100) : 0;
          html += '<div class="factor-row">';
          html += '<div class="f-name">' + f.name + '</div>';
          html += '<div class="f-bar-wrap"><div class="f-bar" style="width:' + pct + '%;background:' + (f.triggered ? c : '#1f2937') + '"></div></div>';
          html += '<div class="f-points">' + f.points + '/' + f.maxPoints + '</div>';
          html += '<div class="f-status">' + (f.triggered ? '🔴' : '✅') + '</div>';
          html += '</div>';
        });
        html += '</div></div>';
        html += '</div>';
      });

      div.innerHTML = html;
      div.style.display = 'block';
      div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Init
    initChips();
    checkConnection();
  </script>
</body>
</html>`;
}

module.exports = { app };
