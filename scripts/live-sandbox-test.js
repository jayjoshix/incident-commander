#!/usr/bin/env node
/**
 * LineageLock — Live Sandbox Test
 *
 * Tests all components against a real OpenMetadata instance
 * using the CORE LineageLock engine (not reimplemented logic).
 *
 * Usage:
 *   export OPENMETADATA_URL=https://sandbox.open-metadata.org
 *   export OPENMETADATA_TOKEN=<your-jwt-token>
 *   npm run live-test
 */

const axios = require('axios');
const path = require('path');

// Import core modules from built dist
const { OpenMetadataClient } = require('../dist/openmetadata/client');
const { scoreEntities } = require('../dist/risk/scoring');
const { renderReport, renderCompactSummary } = require('../dist/report/renderer');
const { loadConfig } = require('../dist/config/loader');

const OM_URL = process.env.OPENMETADATA_URL || 'https://sandbox.open-metadata.org';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN;

if (!OM_TOKEN) {
  console.error('❌ Set OPENMETADATA_TOKEN env var');
  process.exit(1);
}

// Files to analyze — simulating a PR that touches 3 real sandbox entities
// All 3 confirmed to exist in sandbox.open-metadata.org with tags, tiers, owners
const CHANGED_FILES = [
  // Tier 1, DataTier, Business_Glossary — highest risk entity
  { file: 'models/marts/fact_orders.sql',        fqn: 'acme_nexus_analytics.ANALYTICS.MARTS.fact_orders' },
  // Confidential + Tier2 — sensitive clickstream data
  { file: 'models/raw/clickstream.sql',           fqn: 'acme_nexus_raw_data.acme_raw.analytics.clickstream' },
  // PII.Name tag — customer PII data
  { file: 'models/staging/dim_customer.sql',      fqn: 'sample_redshift.staging_db.integration.dim_customer' },
];

async function main() {
  console.log('🔒 LineageLock — Live Analysis (using core engine)');
  console.log(`   Target: ${OM_URL}`);

  // Verify connectivity
  const http = axios.default.create({
    baseURL: OM_URL,
    timeout: 15000,
    headers: { Authorization: `Bearer ${OM_TOKEN}`, 'Content-Type': 'application/json' },
  });
  const ver = await http.get('/api/v1/system/version');
  console.log(`   ✅ Connected to OpenMetadata ${ver.data.version}\n`);

  console.log('Changed files:');
  CHANGED_FILES.forEach(f => console.log(`   ${f.file}`));
  console.log('');

  // Load config (uses the real config loader)
  const config = loadConfig(path.join(process.cwd(), '.lineagelock.json'));
  console.log('📋 Config loaded\n');

  // Create the REAL OpenMetadata client
  const client = new OpenMetadataClient({ baseUrl: OM_URL, token: OM_TOKEN });

  // Resolve entities using the REAL client
  const entities = [];

  for (const { file, fqn } of CHANGED_FILES) {
    console.log(`📐 ${file} → ${fqn}`);
    const entity = await client.resolveEntity(file, fqn);
    entities.push(entity);

    if (!entity.found) {
      console.log(`   ❌ Not found in OpenMetadata\n`);
      continue;
    }

    // Log details
    const ownerName = entity.entity?.owner
      ? (entity.entity.owner.displayName || entity.entity.owner.name)
      : '⚠️ NONE';
    const tier = entity.entity?.tier || 'not classified';
    const tags = (entity.entity?.tags || []).map(t => t.tagFQN).join(', ') || 'none';
    const cols = entity.entity?.columns?.length || 0;
    const upEdges = entity.upstream?.total || 0;
    const downEdges = entity.downstream?.total || 0;

    console.log(`   ✅ Found | ${cols} columns`);
    console.log(`      Owner: ${ownerName}`);
    console.log(`      Tier: ${tier}`);
    console.log(`      Tags: ${tags}`);
    console.log(`      Downstream: ${downEdges} total`);
    console.log('');
  }

  // Score using the REAL scoring engine
  const report = scoreEntities(entities, config);
  console.log(`📊 Risk scored: ${report.overallLevel} (${report.maxScore}/100)\n`);

  // Render using the REAL renderer
  console.log('═'.repeat(60));
  const markdown = renderReport(report, entities);
  console.log(markdown);
  console.log('═'.repeat(60));
  console.log('');
  console.log(renderCompactSummary(report));
}

main().catch(e => {
  console.error('❌ Fatal:', e.message || e);
  process.exit(1);
});
