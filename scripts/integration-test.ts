/**
 * Integration Test — Validates LineageLock against a live OpenMetadata instance.
 *
 * Prerequisites:
 *   1. Run the seed script first: npx ts-node scripts/seed-openmetadata.ts
 *   2. Set OPENMETADATA_URL and OPENMETADATA_TOKEN env vars
 *
 * Usage:
 *   npx ts-node scripts/integration-test.ts
 */

import { OpenMetadataClient } from '../src/openmetadata/client';
import { loadConfig } from '../src/config/loader';
import { resolveFileToFQN } from '../src/resolver/asset-resolver';
import { scoreEntity, scoreEntities } from '../src/risk/scoring';
import { renderReport, renderCompactSummary } from '../src/report/renderer';
import { ResolvedEntity } from '../src/openmetadata/types';

const OM_URL = process.env.OPENMETADATA_URL || 'http://localhost:8585';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN || '';

if (!OM_TOKEN) {
  console.error('❌ OPENMETADATA_TOKEN is required');
  process.exit(1);
}

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function test(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '✅' : '❌'} ${name}: ${detail}`);
}

async function main(): Promise<void> {
  console.log('🧪 LineageLock Integration Test');
  console.log(`   Target: ${OM_URL}\n`);

  const config = loadConfig();
  const client = new OpenMetadataClient({ baseUrl: OM_URL, token: OM_TOKEN });

  // ─── Test 1: Server connectivity ─────────────────────────────────────
  console.log('1️⃣  Server Connectivity');
  try {
    const table = await client.getTableByFQN('warehouse.analytics.public.fact_orders');
    test('Connect to OpenMetadata', !!table, table ? `Found: ${table.fullyQualifiedName}` : 'Not found');
  } catch (err: any) {
    test('Connect to OpenMetadata', false, err.message);
  }

  // ─── Test 2: Entity resolution ───────────────────────────────────────
  console.log('\n2️⃣  Entity Resolution');
  const resolution = resolveFileToFQN('models/marts/fact_orders.sql', config);
  test('File → FQN resolution', !!resolution.fqn, `${resolution.filePath} → ${resolution.fqn} (${resolution.method})`);

  // ─── Test 3: Full entity metadata ────────────────────────────────────
  console.log('\n3️⃣  Entity Metadata');
  try {
    const table = await client.getTableByFQN('warehouse.analytics.public.fact_orders');
    if (table) {
      test('Entity found', true, table.fullyQualifiedName);
      test('Has columns', table.columns.length > 0, `${table.columns.length} columns`);
      test('Has owner', !!table.owner, table.owner ? `${table.owner.displayName || table.owner.name}` : 'No owner');
      test('Has tags', (table.tags?.length || 0) > 0, (table.tags || []).map(t => t.tagFQN).join(', '));
      test('Has tier', !!table.tier, table.tier || 'No tier');
    } else {
      test('Entity found', false, 'fact_orders not in OpenMetadata');
    }
  } catch (err: any) {
    test('Entity metadata', false, err.message);
  }

  // ─── Test 4: Lineage ─────────────────────────────────────────────────
  console.log('\n4️⃣  Lineage');
  try {
    const table = await client.getTableByFQN('warehouse.analytics.public.fact_orders');
    if (table) {
      const lineage = await client.getTableLineage(table.id);
      if (lineage) {
        const upstream = lineage.upstreamEdges.length;
        const downstream = lineage.downstreamEdges.length;
        test('Lineage fetched', true, `${upstream} upstream, ${downstream} downstream edges`);
        test('Has upstream', upstream > 0, `${upstream} upstream source(s)`);
        test('Has downstream', downstream > 0, `${downstream} downstream consumer(s)`);
        test('Has lineage nodes', lineage.nodes.length > 0, `${lineage.nodes.length} nodes in graph`);
      } else {
        test('Lineage fetched', false, 'No lineage returned');
      }
    }
  } catch (err: any) {
    test('Lineage', false, err.message);
  }

  // ─── Test 5: Data contract ───────────────────────────────────────────
  console.log('\n5️⃣  Data Contract');
  try {
    const contract = await client.getDataContract('warehouse.analytics.public.fact_orders');
    test('Contract check', true, contract.hasContract
      ? `Suite: ${contract.testSuiteName}, ${contract.failingTests}/${contract.totalTests} failing`
      : 'No contract defined (expected for seed data)');
  } catch (err: any) {
    test('Contract check', false, err.message);
  }

  // ─── Test 6: Full resolution pipeline ────────────────────────────────
  console.log('\n6️⃣  Full Resolution Pipeline');
  try {
    const entity = await client.resolveEntity(
      'models/marts/fact_orders.sql',
      'warehouse.analytics.public.fact_orders'
    );
    test('Full resolve', entity.found, entity.found
      ? `Score inputs ready: entity=${!!entity.entity}, lineage=${!!entity.lineage}, downstream=${!!entity.downstream}`
      : entity.error || 'Unknown error');

    if (entity.found) {
      // Score it
      const assessment = scoreEntity(entity, config);
      test('Risk scoring', assessment.score >= 0, `Score: ${assessment.score}/100 (${assessment.level})`);

      const triggeredCount = assessment.factors.filter(f => f.triggered).length;
      test('Risk factors', assessment.factors.length === 7, `${triggeredCount}/${assessment.factors.length} factors triggered`);

      // Log each factor
      for (const f of assessment.factors) {
        console.log(`     ${f.triggered ? '🔴' : '✅'} ${f.name}: ${f.points}/${f.maxPoints} — ${f.detail}`);
      }
    }
  } catch (err: any) {
    test('Full resolve', false, err.message);
  }

  // ─── Test 7: Multi-entity report ─────────────────────────────────────
  console.log('\n7️⃣  Multi-Entity Report');
  try {
    const filesToCheck = [
      { file: 'models/marts/fact_orders.sql', fqn: 'warehouse.analytics.public.fact_orders' },
      { file: 'models/staging/stg_payments.sql', fqn: 'warehouse.analytics.staging.stg_payments' },
    ];

    const entities: ResolvedEntity[] = [];
    for (const f of filesToCheck) {
      const entity = await client.resolveEntity(f.file, f.fqn);
      entities.push(entity);
    }

    const report = scoreEntities(entities, config);
    test('Aggregate report', report.assessments.length === 2, `${report.assessments.length} assessments`);
    test('Max score computed', report.maxScore >= 0, `Max: ${report.maxScore}/100 (${report.overallLevel})`);
    test('Decision computed', ['pass', 'warn', 'fail'].includes(report.decision), `Decision: ${report.decision}`);

    // Render the full report
    const markdown = renderReport(report, entities);
    test('Markdown rendered', markdown.includes('LineageLock Risk Report'), `${markdown.length} chars`);

    console.log('\n' + '═'.repeat(60));
    console.log('📝 LIVE REPORT (from real OpenMetadata data):');
    console.log('═'.repeat(60));
    console.log(markdown);
    console.log('═'.repeat(60));
    console.log(renderCompactSummary(report));
  } catch (err: any) {
    test('Multi-entity report', false, err.message);
  }

  // ─── Test 8: Non-existent entity handling ────────────────────────────
  console.log('\n8️⃣  Error Handling');
  try {
    const missing = await client.resolveEntity(
      'models/nonexistent.sql',
      'warehouse.analytics.public.nonexistent_table'
    );
    test('Missing entity handled', !missing.found, `found=${missing.found}, error=${missing.error || 'none'}`);
  } catch (err: any) {
    test('Missing entity handled', false, `Unexpected error: ${err.message}`);
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;
  console.log(`${allPassed ? '🎉' : '⚠️'}  Integration Test: ${passed}/${total} passed`);

  if (!allPassed) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
  }

  console.log('═'.repeat(50));
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
