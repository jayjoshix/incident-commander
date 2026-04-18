/**
 * LineageLock CLI
 *
 * Local dry-run and demo mode for testing without a live PR.
 *
 * Usage:
 *   npm run dry-run -- --changed-file models/fact_orders.sql
 *   npm run demo
 */

import { Command } from 'commander';
import { loadConfig } from './config/loader';
import { OpenMetadataClient } from './openmetadata/client';
import { resolveFiles, filterDataModelFiles, resolveFileToFQN } from './resolver/asset-resolver';
import { scoreEntities } from './risk/scoring';
import { renderReport, renderCompactSummary } from './report/renderer';
import { ResolvedEntity } from './openmetadata/types';
import { DEMO_ENTITIES, DEMO_CHANGED_FILES } from './fixtures/demo-data';

const program = new Command();

program
  .name('lineagelock')
  .description('LineageLock — PR guard for data changes powered by OpenMetadata')
  .version('1.0.0');

// ─── Dry Run Command ──────────────────────────────────────────────────────

program
  .command('analyze')
  .description('Analyze changed files against a live OpenMetadata instance')
  .requiredOption('--changed-file <files...>', 'File paths that changed (space-separated)')
  .option('--config <path>', 'Path to .lineagelock.json', '.lineagelock.json')
  .option('--om-url <url>', 'OpenMetadata server URL', process.env.OPENMETADATA_URL)
  .option('--om-token <token>', 'OpenMetadata JWT token', process.env.OPENMETADATA_TOKEN)
  .option('--json', 'Output as JSON instead of Markdown', false)
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      console.log('📋 Configuration loaded\n');

      // Filter to data model files
      const dataModelFiles = filterDataModelFiles(opts.changedFile, config);
      if (dataModelFiles.length === 0) {
        console.log('✅ No data model files in the changed list — nothing to analyze.');
        process.exit(0);
      }

      console.log(`🔍 Analyzing ${dataModelFiles.length} data model file(s):\n`);
      for (const f of dataModelFiles) {
        console.log(`   ${f}`);
      }
      console.log('');

      // Resolve files
      const resolutions = resolveFiles(opts.changedFile, config);

      if (!opts.omUrl || !opts.omToken) {
        console.error(
          '❌ OpenMetadata connection required for live analysis.\n' +
          '   Set --om-url and --om-token, or use OPENMETADATA_URL/OPENMETADATA_TOKEN env vars.\n' +
          '   Or use "lineagelock demo" for fixture-based demo.'
        );
        process.exit(1);
      }

      // Fetch from OpenMetadata
      const client = new OpenMetadataClient({
        baseUrl: opts.omUrl,
        token: opts.omToken,
      });

      const entities: ResolvedEntity[] = [];
      for (const res of resolutions) {
        if (res.fqn) {
          console.log(`  → ${res.filePath} → ${res.fqn} (${res.method})`);
          const entity = await client.resolveEntity(res.filePath, res.fqn);
          entities.push(entity);
        }
      }

      // Score and render
      const report = scoreEntities(entities, config);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('\n' + '═'.repeat(60));
        console.log(renderReport(report, entities));
        console.log('═'.repeat(60));
        console.log('\n' + renderCompactSummary(report));
      }

      process.exit(report.decision === 'fail' ? 1 : 0);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── Demo Command ─────────────────────────────────────────────────────────

program
  .command('demo')
  .description('Run a demo with fixture data (no live OpenMetadata required)')
  .option('--json', 'Output as JSON instead of Markdown', false)
  .option('--scenario <name>', 'Demo scenario: full, high-risk, low-risk', 'full')
  .action((opts) => {
    console.log('🎭 LineageLock Demo Mode');
    console.log('   Using fixture data — no live OpenMetadata connection needed\n');

    const config = loadConfig();
    let entities: ResolvedEntity[];

    switch (opts.scenario) {
      case 'high-risk':
        entities = [DEMO_ENTITIES[0]]; // Just the Tier 1 fact table
        console.log('📌 Scenario: High-risk change to Tier 1 fact table\n');
        break;
      case 'low-risk':
        entities = [DEMO_ENTITIES[1]]; // Just the staging table
        console.log('📌 Scenario: Low-risk change to staging table\n');
        break;
      case 'full':
      default:
        entities = DEMO_ENTITIES;
        console.log('📌 Scenario: Full PR with multiple changed models\n');
        break;
    }

    console.log('Changed files:');
    for (const e of entities) {
      console.log(`   ${e.filePath}`);
    }
    console.log('');

    const report = scoreEntities(entities, config);

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('═'.repeat(60));
      console.log('');
      console.log(renderReport(report, entities));
      console.log('═'.repeat(60));
      console.log('');
      console.log(renderCompactSummary(report));
    }
  });

(async () => {
  await program.parseAsync();
})().catch((err) => {
  console.error(`❌ Fatal: ${err.message || err}`);
  process.exit(1);
});
