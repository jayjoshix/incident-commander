#!/usr/bin/env node
/**
 * LineageLock — Live Sandbox Test
 * Directly tests all components against the OpenMetadata sandbox.
 * No CLI framework, no commander — just pure API calls.
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

const OM_URL = process.env.OPENMETADATA_URL || 'https://sandbox.open-metadata.org';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN;

if (!OM_TOKEN) {
  console.error('❌ Set OPENMETADATA_TOKEN env var');
  process.exit(1);
}

const http = axios.default.create({
  baseURL: OM_URL,
  timeout: 15000,
  headers: { Authorization: `Bearer ${OM_TOKEN}`, 'Content-Type': 'application/json' },
});

// Load config
const configPath = path.join(process.cwd(), '.lineagelock.json');
let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

const CHANGED_FILES = [
  { file: 'models/marts/fact_orders.sql', fqn: 'acme_nexus_analytics.ANALYTICS.MARTS.fact_orders' },
  { file: 'models/staging/stg_orders.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_orders' },
  { file: 'models/staging/stg_products.sql', fqn: 'acme_nexus_analytics.ANALYTICS.STAGING.stg_products' },
];

async function fetchTable(fqn) {
  try {
    const r = await http.get(`/api/v1/tables/name/${encodeURIComponent(fqn)}`, {
      params: { fields: 'owners,tags,columns,testSuite' },
    });
    return r.data;
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw new Error(`Table ${fqn}: HTTP ${e.response?.status} — ${e.response?.data?.message || e.message}`);
  }
}

async function fetchLineage(tableId) {
  try {
    const r = await http.get(`/api/v1/lineage/table/${tableId}`, {
      params: { upstreamDepth: 2, downstreamDepth: 3 },
    });
    return r.data;
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw new Error(`Lineage ${tableId}: ${e.message}`);
  }
}

function extractOwner(raw) {
  if (raw.owners && raw.owners.length > 0) return raw.owners[0];
  if (raw.owner) return raw.owner;
  return null;
}

function extractTier(tags) {
  for (const t of tags || []) {
    if (t.tagFQN?.startsWith('Tier.')) return t.tagFQN;
  }
  return null;
}

function findSensitiveTags(tags) {
  const keywords = ['PII', 'GDPR', 'Confidential', 'Sensitive', 'PHI', 'PCI', 'DataSensitivity'];
  return (tags || []).filter(t => keywords.some(k => t.tagFQN?.includes(k))).map(t => t.tagFQN);
}

function categorizeDownstream(lineage) {
  const downstream = { tables: [], dashboards: [], mlModels: [], pipelines: [], total: 0 };
  if (!lineage) return downstream;
  const downIds = new Set((lineage.downstreamEdges || []).map(e => e.toEntity?.id || e.toEntity));
  for (const node of lineage.nodes || []) {
    if (!downIds.has(node.id)) continue;
    const type = (node.type || 'table').toLowerCase();
    if (type === 'dashboard') downstream.dashboards.push(node);
    else if (type === 'mlmodel') downstream.mlModels.push(node);
    else if (type === 'pipeline') downstream.pipelines.push(node);
    else downstream.tables.push(node);
  }
  downstream.total = downstream.tables.length + downstream.dashboards.length + downstream.mlModels.length + downstream.pipelines.length;
  return downstream;
}

function scoreEntity(table, lineage, downstream, contract) {
  let score = 0;
  const factors = [];
  const tags = table?.tags || [];
  const owner = extractOwner(table || {});
  const tier = extractTier(tags);
  const sensitive = findSensitiveTags(tags);

  // 1. Contract violation (+40)
  const contractFailing = contract?.failingTests > 0;
  factors.push({ name: 'Contract Violation', points: contractFailing ? 40 : 0, max: 40, triggered: contractFailing,
    detail: contractFailing ? `${contract.failingTests}/${contract.totalTests} tests failing` : contract?.hasContract ? 'All tests passing' : 'No contract defined' });
  if (contractFailing) score += 40;

  // 2. Critical tier (+20)
  const isCritical = tier && (tier.includes('Tier1') || tier.includes('Tier2'));
  factors.push({ name: 'Critical Tier Asset', points: isCritical ? 20 : 0, max: 20, triggered: !!isCritical,
    detail: isCritical ? `Asset is ${tier}` : tier ? `${tier} (not critical)` : 'No tier assigned' });
  if (isCritical) score += 20;

  // 3. Sensitive tags (+20)
  const hasSensitive = sensitive.length > 0;
  factors.push({ name: 'Sensitive Data Tags', points: hasSensitive ? 20 : 0, max: 20, triggered: hasSensitive,
    detail: hasSensitive ? `Found: ${sensitive.join(', ')}` : 'No sensitive tags' });
  if (hasSensitive) score += 20;

  // 4. Downstream dashboards (+10)
  const hasDash = downstream.dashboards.length > 0;
  factors.push({ name: 'Downstream Dashboards', points: hasDash ? 10 : 0, max: 10, triggered: hasDash,
    detail: hasDash ? `${downstream.dashboards.length} dashboard(s)` : 'No downstream dashboards' });
  if (hasDash) score += 10;

  // 5. Downstream ML (+10)
  const hasML = downstream.mlModels.length > 0;
  factors.push({ name: 'Downstream ML Models', points: hasML ? 10 : 0, max: 10, triggered: hasML,
    detail: hasML ? `${downstream.mlModels.length} ML model(s)` : 'No downstream ML models' });
  if (hasML) score += 10;

  // 6. High downstream count (+10)
  const highDown = downstream.total >= 5;
  factors.push({ name: 'High Downstream Count', points: highDown ? 10 : 0, max: 10, triggered: highDown,
    detail: `${downstream.total} downstream entities (threshold: 5)` });
  if (highDown) score += 10;

  // 7. No owner (+10)
  const noOwner = !owner;
  factors.push({ name: 'No Clear Owner', points: noOwner ? 10 : 0, max: 10, triggered: noOwner,
    detail: noOwner ? 'No owner assigned' : `Owner: ${owner.displayName || owner.name} (${owner.type})` });
  if (noOwner) score += 10;

  return { score: Math.min(score, 100), factors };
}

function getLevelEmoji(score) {
  if (score >= 80) return '🔴';
  if (score >= 60) return '🟠';
  if (score >= 30) return '🟡';
  return '🟢';
}

function getLevel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

async function main() {
  console.log('🔒 LineageLock — Live Analysis');
  console.log(`   Target: ${OM_URL}`);

  // Verify connectivity
  const ver = await http.get('/api/v1/system/version');
  console.log(`   ✅ Connected to OpenMetadata ${ver.data.version}\n`);

  console.log('Changed files:');
  CHANGED_FILES.forEach(f => console.log(`   ${f.file}`));
  console.log('');

  const results = [];

  for (const { file, fqn } of CHANGED_FILES) {
    console.log(`📐 ${file} → ${fqn}`);
    const table = await fetchTable(fqn);
    if (!table) {
      console.log(`   ❌ Not found in OpenMetadata\n`);
      results.push({ file, fqn, found: false, score: 0 });
      continue;
    }

    const owner = extractOwner(table);
    const tier = extractTier(table.tags);
    const sensitive = findSensitiveTags(table.tags);
    console.log(`   ✅ Found | ${table.columns?.length || 0} columns`);
    console.log(`      Owner: ${owner ? (owner.displayName || owner.name) : '⚠️ NONE'}`);
    console.log(`      Tier: ${tier || 'not classified'}`);
    console.log(`      Tags: ${(table.tags || []).map(t => t.tagFQN).join(', ') || 'none'}`);
    console.log(`      Sensitive: ${sensitive.length > 0 ? sensitive.join(', ') : 'none'}`);

    const lineage = await fetchLineage(table.id);
    const upstream = lineage?.upstreamEdges?.length || 0;
    const downEdges = lineage?.downstreamEdges?.length || 0;
    console.log(`      Lineage: ${upstream} upstream, ${downEdges} downstream edges`);

    const downstream = categorizeDownstream(lineage);
    console.log(`      Downstream: ${downstream.total} total (tables=${downstream.tables.length}, dashboards=${downstream.dashboards.length}, ML=${downstream.mlModels.length}, pipelines=${downstream.pipelines.length})`);

    // Contract
    const contract = { hasContract: false, failingTests: 0, totalTests: 0 };
    if (table.testSuite) {
      console.log(`      Test Suite: ${table.testSuite.name}`);
    }

    const { score, factors } = scoreEntity(table, lineage, downstream, contract);
    console.log(`      Score: ${score}/100 (${getLevel(score)})`);
    results.push({ file, fqn, found: true, score, factors, table, downstream, owner, tier, sensitive });
    console.log('');
  }

  // ═══════════════ RENDER REPORT ═══════════════
  const maxScore = Math.max(...results.map(r => r.score), 0);
  const level = getLevel(maxScore);
  const emoji = getLevelEmoji(maxScore);
  const decision = maxScore >= 70 ? '🚫 Block — manual review needed' : maxScore >= 30 ? '⚠️ Warning — review recommended' : '✅ Safe to merge';
  const resolved = results.filter(r => r.found).length;
  const unresolved = results.filter(r => !r.found).length;

  console.log('═'.repeat(60));
  console.log('');
  console.log('## 🔒 LineageLock Risk Report');
  console.log('');
  console.log('### Overall Assessment');
  console.log('');
  console.log('| Metric | Value |');
  console.log('|--------|-------|');
  console.log(`| **Risk Score** | ${emoji} **${maxScore}/100** (${level}) |`);
  console.log(`| **Decision** | ${decision} |`);
  console.log(`| **Entities Analyzed** | ${results.length} |`);
  console.log(`| **Resolved** | ${resolved} |`);
  console.log(`| **Unresolved** | ${unresolved} |`);
  console.log('');

  // Blast radius
  const totalDown = results.reduce((sum, r) => sum + (r.downstream?.total || 0), 0);
  const totalDash = results.reduce((sum, r) => sum + (r.downstream?.dashboards?.length || 0), 0);
  const totalML = results.reduce((sum, r) => sum + (r.downstream?.mlModels?.length || 0), 0);
  console.log('### 💥 Blast Radius');
  console.log('');
  console.log('| Category | Count |');
  console.log('|----------|-------|');
  console.log(`| Total downstream entities | ${totalDown} |`);
  console.log(`| Dashboards impacted | ${totalDash} |`);
  console.log(`| ML Models impacted | ${totalML} |`);
  console.log('');

  // Per-entity details
  for (const r of results) {
    const eEmoji = getLevelEmoji(r.score);
    console.log(`### ${eEmoji} \`${r.file}\``);
    console.log('');
    console.log(`**Entity:** \`${r.fqn}\``);
    console.log(`**Score:** ${r.score}/100 (${getLevel(r.score)})`);
    console.log('');

    if (!r.found) {
      console.log('> ⚠️ Entity not found in OpenMetadata');
      console.log('');
      continue;
    }

    // Risk factors table
    const triggered = r.factors.filter(f => f.triggered).length;
    console.log(`<details>`);
    console.log(`<summary>Risk Factors (${triggered}/${r.factors.length} triggered)</summary>`);
    console.log('');
    console.log('| Factor | Points | Status | Detail |');
    console.log('|--------|--------|--------|--------|');
    for (const f of r.factors) {
      console.log(`| ${f.name} | ${f.points}/${f.max} | ${f.triggered ? '🔴 Triggered' : '✅ Clear'} | ${f.detail} |`);
    }
    console.log('');
    console.log('</details>');
    console.log('');

    // Downstream assets
    if (r.downstream && r.downstream.total > 0) {
      console.log('<details>');
      console.log(`<summary>Downstream Assets (${r.downstream.total})</summary>`);
      console.log('');
      if (r.downstream.dashboards.length > 0) {
        console.log('**Dashboards:**');
        r.downstream.dashboards.forEach(n => console.log(`- 📊 \`${n.fullyQualifiedName || n.name}\``));
      }
      if (r.downstream.mlModels.length > 0) {
        console.log('**ML Models:**');
        r.downstream.mlModels.forEach(n => console.log(`- 🤖 \`${n.fullyQualifiedName || n.name}\``));
      }
      if (r.downstream.tables.length > 0) {
        console.log('**Tables:**');
        r.downstream.tables.forEach(n => console.log(`- 📋 \`${n.fullyQualifiedName || n.name}\``));
      }
      if (r.downstream.pipelines.length > 0) {
        console.log('**Pipelines:**');
        r.downstream.pipelines.forEach(n => console.log(`- ⚙️ \`${n.fullyQualifiedName || n.name}\``));
      }
      console.log('');
      console.log('</details>');
      console.log('');
    }

    // Governance
    console.log('<details>');
    console.log('<summary>Governance</summary>');
    console.log('');
    console.log(`- **Owner:** ${r.owner ? `${r.owner.displayName || r.owner.name} (${r.owner.type})` : '⚠️ No owner assigned'}`);
    console.log(`- **Tier:** ${r.tier || 'Not classified'}`);
    console.log(`- **Tags:** ${(r.table?.tags || []).map(t => t.tagFQN).join(', ') || 'None'}`);
    console.log('');
    console.log('</details>');
    console.log('');

    if (r.owner) {
      console.log(`📬 **Notify:** ${r.owner.displayName || r.owner.name}`);
      console.log('');
    }
  }

  console.log('---');
  console.log('*Generated by [LineageLock](https://github.com/jayjoshix/incident-commander) · Powered by [OpenMetadata](https://open-metadata.org) · **LIVE DATA from sandbox.open-metadata.org***');
  console.log('');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`${emoji} LineageLock: ${level} (${maxScore}/100) — ${maxScore >= 70 ? 'BLOCKED' : maxScore >= 30 ? 'Warning' : 'Safe to merge'}`);
}

main().catch(e => {
  console.error('❌ Fatal:', e.message || e);
  process.exit(1);
});
