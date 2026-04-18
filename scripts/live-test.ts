/**
 * Quick live test — runs LineageLock against the OpenMetadata sandbox.
 * Usage: OPENMETADATA_URL=... OPENMETADATA_TOKEN=... npx ts-node scripts/live-test.ts
 */

import { loadConfig } from '../src/config/loader';
import { OpenMetadataClient } from '../src/openmetadata/client';
import { resolveFiles } from '../src/resolver/asset-resolver';
import { scoreEntities } from '../src/risk/scoring';
import { renderReport, renderCompactSummary } from '../src/report/renderer';
import { ResolvedEntity } from '../src/openmetadata/types';

const OM_URL = process.env.OPENMETADATA_URL || 'https://sandbox.open-metadata.org';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN || '';

if (!OM_TOKEN) {
  console.error('❌ OPENMETADATA_TOKEN is required');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('🔒 LineageLock — Live Analysis against OpenMetadata Sandbox');
  console.log(`   Target: ${OM_URL}\n`);

  const config = loadConfig();
  const client = new OpenMetadataClient({
    baseUrl: OM_URL,
    token: OM_TOKEN,
  });

  const changedFiles = [
    'models/marts/fact_orders.sql',
    'models/staging/stg_orders.sql',
    'models/staging/stg_products.sql',
  ];

  console.log('Changed files:');
  for (const f of changedFiles) {
    console.log(`   ${f}`);
  }
  console.log('');

  // Resolve files to FQNs
  const resolutions = resolveFiles(changedFiles, config);
  console.log('📐 File → Entity Resolution:');
  for (const r of resolutions) {
    console.log(`   ${r.filePath} → ${r.fqn || 'NO MATCH'} (${r.method})`);
  }
  console.log('');

  // Fetch from live OpenMetadata
  console.log('🌐 Fetching from OpenMetadata...');
  const entities: ResolvedEntity[] = [];

  for (const r of resolutions) {
    if (r.fqn) {
      const entity = await client.resolveEntity(r.filePath, r.fqn);
      entities.push(entity);

      if (entity.found) {
        const downstream = entity.downstream;
        console.log(`   ✅ ${r.fqn}`);
        console.log(`      Owner: ${entity.entity?.owner?.displayName || entity.entity?.owner?.name || 'NONE'}`);
        console.log(`      Tags: ${(entity.entity?.tags || []).map(t => t.tagFQN).join(', ') || 'NONE'}`);
        console.log(`      Tier: ${entity.entity?.tier || 'NONE'}`);
        console.log(`      Downstream: ${downstream?.total || 0} (tables=${downstream?.tables.length || 0}, dashboards=${downstream?.dashboards.length || 0}, ML=${downstream?.mlModels.length || 0})`);
        console.log(`      Contract: ${entity.contract?.hasContract ? `${entity.contract.failingTests}/${entity.contract.totalTests} failing` : 'None'}`);
      } else {
        console.log(`   ❌ ${r.fqn}: ${entity.error}`);
      }
    }
  }

  console.log('');

  // Score and render
  const report = scoreEntities(entities, config);

  console.log('═'.repeat(60));
  console.log('');
  console.log(renderReport(report, entities));
  console.log('═'.repeat(60));
  console.log('');
  console.log(renderCompactSummary(report));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
