#!/usr/bin/env node
/**
 * LineageLock Web Dashboard
 * 
 * Runs the analysis and serves a beautiful risk report on localhost.
 * Usage: node scripts/dashboard.js
 */

const http = require('http');
const path = require('path');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { OpenMetadataClient } = require('../dist/openmetadata/client');
const { scoreEntities } = require('../dist/risk/scoring');
const { loadConfig } = require('../dist/config/loader');

const OM_URL = process.env.OPENMETADATA_URL || 'https://sandbox.open-metadata.org';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN;
const PORT = process.env.PORT || 3000;

const CHANGED_FILES = [
  { file: 'models/marts/fact_orders.sql', fqn: 'acme_nexus_analytics.ANALYTICS.MARTS.fact_orders' },
  { file: 'models/staging/stg_orders.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_orders' },
  { file: 'models/staging/stg_products.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_products' },
];

async function runAnalysis() {
  const config = loadConfig(path.join(__dirname, '..', '.lineagelock.json'));
  const client = new OpenMetadataClient({ baseUrl: OM_URL, token: OM_TOKEN });
  
  const entities = [];
  for (const { file, fqn } of CHANGED_FILES) {
    const entity = await client.resolveEntity(file, fqn);
    entities.push(entity);
  }

  const report = scoreEntities(entities, config);
  return { report, entities, config };
}

function renderHTML(report, entities) {
  const levelColors = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' };
  const levelEmoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };
  const decisionLabels = { pass: 'Safe to Merge', warn: 'Review Required', fail: 'Block — Manual Review Needed' };
  const decisionEmoji = { pass: '✅', warn: '⚠️', fail: '🚫' };
  
  const mainColor = levelColors[report.overallLevel] || '#6b7280';

  const entityCards = report.assessments.map((a, i) => {
    const entity = entities[i];
    const color = levelColors[a.level];
    const factorsHTML = a.factors.map(f => `
      <div class="factor-row ${f.triggered ? 'triggered' : 'clear'}">
        <div class="factor-name">${f.name}</div>
        <div class="factor-bar-wrap">
          <div class="factor-bar" style="width: ${(f.points / f.maxPoints) * 100}%; background: ${f.triggered ? color : '#1f2937'}"></div>
        </div>
        <div class="factor-points">${f.points}/${f.maxPoints}</div>
        <div class="factor-status">${f.triggered ? '🔴' : '✅'}</div>
      </div>
    `).join('');

    const tagsHTML = (entity.entity?.tags || []).map(t => 
      `<span class="tag">${t.tagFQN}</span>`
    ).join('');

    const ownerName = entity.entity?.owner 
      ? (entity.entity.owner.displayName || entity.entity.owner.name)
      : null;

    const downstreamCount = entity.downstream?.total || 0;
    const downTables = entity.downstream?.tables?.length || 0;
    const downDash = entity.downstream?.dashboards?.length || 0;
    const downML = entity.downstream?.mlModels?.length || 0;

    return `
      <div class="entity-card">
        <div class="entity-header" style="border-left: 4px solid ${color}">
          <div class="entity-file">${a.filePath}</div>
          <div class="entity-fqn">${a.fqn}</div>
          <div class="entity-score" style="color: ${color}">
            <span class="score-number">${a.score}</span>
            <span class="score-max">/100</span>
            <span class="score-level">${a.level}</span>
          </div>
        </div>
        
        <div class="entity-meta">
          <div class="meta-item">
            <span class="meta-label">Owner</span>
            <span class="meta-value ${ownerName ? '' : 'warning'}">${ownerName || '⚠️ Unassigned'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Tier</span>
            <span class="meta-value">${entity.entity?.tier || 'Not classified'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Downstream</span>
            <span class="meta-value">${downstreamCount} entities</span>
          </div>
        </div>

        ${tagsHTML ? `<div class="tags-row">${tagsHTML}</div>` : ''}
        
        <div class="factors-section">
          <div class="factors-header">Risk Factors (${a.factors.filter(f => f.triggered).length}/${a.factors.length} triggered)</div>
          ${factorsHTML}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔒 LineageLock Risk Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #0a0a0f;
      color: #e5e7eb;
      min-height: 100vh;
    }

    .bg-grid {
      position: fixed;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 60px 60px;
      z-index: 0;
    }

    .bg-glow {
      position: fixed;
      width: 600px; height: 600px;
      border-radius: 50%;
      filter: blur(150px);
      opacity: 0.15;
      z-index: 0;
    }
    .bg-glow-1 { top: -200px; left: -100px; background: ${mainColor}; }
    .bg-glow-2 { bottom: -200px; right: -100px; background: #6366f1; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 24px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 48px;
    }
    .header-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .header h1 {
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .header-sub {
      font-size: 1rem;
      color: #9ca3af;
    }
    .header-sub a { color: #60a5fa; text-decoration: none; }

    /* Score Hero */
    .score-hero {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 48px;
      margin-bottom: 48px;
      padding: 40px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 20px;
      backdrop-filter: blur(10px);
    }
    .score-circle {
      position: relative;
      width: 180px; height: 180px;
    }
    .score-circle svg { transform: rotate(-90deg); }
    .score-circle-bg { fill: none; stroke: #1f2937; stroke-width: 8; }
    .score-circle-fill { 
      fill: none; stroke: ${mainColor}; stroke-width: 8; 
      stroke-linecap: round;
      stroke-dasharray: ${2 * Math.PI * 72};
      stroke-dashoffset: ${2 * Math.PI * 72 * (1 - report.maxScore / 100)};
      transition: stroke-dashoffset 1.5s ease;
    }
    .score-center {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .score-big { font-size: 3rem; font-weight: 800; color: ${mainColor}; }
    .score-label { font-size: 0.85rem; color: #9ca3af; margin-top: 4px; }
    .score-details {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .score-detail-item {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .score-detail-label { color: #9ca3af; font-size: 0.9rem; min-width: 140px; }
    .score-detail-value { font-weight: 600; font-size: 1.1rem; }
    .decision-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.9rem;
      background: ${mainColor}20;
      color: ${mainColor};
      border: 1px solid ${mainColor}40;
    }

    /* Stats row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 48px;
    }
    .stat-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
    }
    .stat-number { font-size: 2rem; font-weight: 700; color: #fff; }
    .stat-label { font-size: 0.8rem; color: #9ca3af; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

    /* Entity cards */
    .entities-title {
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 20px;
      color: #fff;
    }
    .entity-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 20px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .entity-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .entity-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-left: 16px;
      margin-bottom: 20px;
    }
    .entity-file { font-weight: 600; font-size: 1.05rem; color: #fff; }
    .entity-fqn { font-size: 0.8rem; color: #6b7280; font-family: monospace; flex: 1; }
    .entity-score { text-align: right; }
    .score-number { font-size: 2rem; font-weight: 800; }
    .score-max { font-size: 1rem; color: #6b7280; }
    .score-level { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

    .entity-meta {
      display: flex;
      gap: 32px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: rgba(255,255,255,0.02);
      border-radius: 10px;
    }
    .meta-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
    .meta-value { font-size: 0.9rem; font-weight: 500; }
    .meta-value.warning { color: #f59e0b; }

    .tags-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .tag {
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.2);
    }

    .factors-section { margin-top: 8px; }
    .factors-header { font-size: 0.8rem; color: #9ca3af; margin-bottom: 12px; font-weight: 500; }
    .factor-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .factor-row:last-child { border-bottom: none; }
    .factor-name { font-size: 0.85rem; min-width: 180px; color: #d1d5db; }
    .factor-bar-wrap {
      flex: 1;
      height: 6px;
      background: #1f2937;
      border-radius: 3px;
      overflow: hidden;
    }
    .factor-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.8s ease;
    }
    .factor-points { font-size: 0.8rem; color: #9ca3af; min-width: 50px; text-align: right; font-family: monospace; }
    .factor-status { font-size: 0.9rem; }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid rgba(255,255,255,0.06);
      color: #6b7280;
      font-size: 0.8rem;
    }
    .footer a { color: #60a5fa; text-decoration: none; }

    @media (max-width: 768px) {
      .score-hero { flex-direction: column; gap: 24px; }
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      .entity-header { flex-direction: column; align-items: flex-start; }
      .entity-meta { flex-direction: column; gap: 12px; }
    }
  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="bg-glow bg-glow-1"></div>
  <div class="bg-glow bg-glow-2"></div>

  <div class="container">
    <div class="header">
      <div class="header-icon">🔒</div>
      <h1>LineageLock Risk Report</h1>
      <div class="header-sub">Powered by <a href="https://open-metadata.org">OpenMetadata</a> · Live data from <a href="${OM_URL}">${OM_URL.replace('https://', '')}</a></div>
    </div>

    <div class="score-hero">
      <div class="score-circle">
        <svg viewBox="0 0 160 160" width="180" height="180">
          <circle class="score-circle-bg" cx="80" cy="80" r="72" />
          <circle class="score-circle-fill" cx="80" cy="80" r="72" />
        </svg>
        <div class="score-center">
          <div class="score-big">${report.maxScore}</div>
          <div class="score-label">out of 100</div>
        </div>
      </div>
      <div class="score-details">
        <div class="score-detail-item">
          <span class="score-detail-label">Risk Level</span>
          <span class="score-detail-value">${levelEmoji[report.overallLevel]} ${report.overallLevel}</span>
        </div>
        <div class="score-detail-item">
          <span class="score-detail-label">Decision</span>
          <span class="decision-badge">${decisionEmoji[report.decision]} ${decisionLabels[report.decision]}</span>
        </div>
        <div class="score-detail-item">
          <span class="score-detail-label">Entities Analyzed</span>
          <span class="score-detail-value">${report.summary.totalEntities}</span>
        </div>
        <div class="score-detail-item">
          <span class="score-detail-label">Resolved</span>
          <span class="score-detail-value">${report.summary.resolvedEntities} / ${report.summary.totalEntities}</span>
        </div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-number">${report.summary.totalDownstream}</div>
        <div class="stat-label">Downstream Entities</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${report.summary.totalDashboards}</div>
        <div class="stat-label">Dashboards Impacted</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${report.summary.totalMlModels}</div>
        <div class="stat-label">ML Models Impacted</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${report.summary.unresolvedEntities}</div>
        <div class="stat-label">Unresolved</div>
      </div>
    </div>

    <div class="entities-title">📊 Entity Analysis</div>
    ${entityCards}

    <div class="footer">
      Generated by <a href="https://github.com/jayjoshix/incident-commander">LineageLock</a> · 
      Powered by <a href="https://open-metadata.org">OpenMetadata</a> · 
      Built for <a href="https://wemakedevs.org">WeMakeDevs × OpenMetadata Hackathon</a>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  if (!OM_TOKEN) {
    console.error('❌ Set OPENMETADATA_TOKEN in .env or environment');
    process.exit(1);
  }

  console.log('🔒 LineageLock Dashboard');
  console.log(`   Analyzing against ${OM_URL}...`);

  const { report, entities } = await runAnalysis();
  const html = renderHTML(report, entities);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(PORT, () => {
    console.log(`\n   ✅ Dashboard ready at http://localhost:${PORT}\n`);
    console.log(`   Risk: ${report.overallLevel} (${report.maxScore}/100)`);
    console.log(`   Press Ctrl+C to stop\n`);
  });
}

main().catch(e => {
  console.error('❌ Fatal:', e.message || e);
  process.exit(1);
});
