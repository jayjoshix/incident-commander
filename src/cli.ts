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
import { computePRAggregate } from './risk/pr-aggregate';
import { renderReport, renderCompactSummary, RenderContext } from './report/renderer';
import { parsePatch, PatchAnalysis } from './diff/patch-parser';
import { determineReviewers, determineLabels } from './automation/workflow';
import { evaluatePolicies } from './policy/approval-engine';
import { ResolvedEntity } from './openmetadata/types';
import { DEMO_ENTITIES, DEMO_CHANGED_FILES } from './fixtures/demo-data';
import { buildAuditTrail } from './audit/audit-trail';
import { generateRemediations } from './remediation/remediation';
import { computeTrustSignal } from './trust/trust-signal';
import { routeByRiskType } from './routing/routing';

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

      // Score, aggregate, and render
      const emptyPatches: PatchAnalysis[] = entities.map(e => ({
        filePath: e.filePath,
        changedColumns: [],
        isStructuralChange: false,
        changeDescription: 'No patch data in CLI mode',
      }));

      const report = scoreEntities(entities, config);
      const aggregate = computePRAggregate(report, entities, emptyPatches, config);

      if (opts.json) {
        console.log(JSON.stringify({ report, aggregate }, null, 2));
      } else {
        console.log('\n' + '═'.repeat(60));
        console.log(renderReport(report, entities, emptyPatches, aggregate));
        console.log('═'.repeat(60));
        console.log('\n' + renderCompactSummary(report, aggregate));
      }

      process.exit(aggregate.escalatedDecision === 'fail' ? 1 : 0);
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

    // Simulate patch analysis for demo
    const demoPatchAnalyses: PatchAnalysis[] = entities.map(e => {
      if (e.filePath === 'models/marts/fact_orders.sql') {
        return {
          filePath: e.filePath,
          changedColumns: [
            { name: 'amount', changeType: 'modified' as const, confidence: 'high' as const, source: 'sql-select' as const },
            { name: 'customer_id', changeType: 'modified' as const, confidence: 'high' as const, source: 'sql-select' as const },
            { name: 'discount_pct', changeType: 'added' as const, confidence: 'high' as const, source: 'sql-select' as const },
          ],
          isStructuralChange: true,
          changeDescription: '3 column(s) potentially affected',
        };
      }
      return {
        filePath: e.filePath,
        changedColumns: [],
        isStructuralChange: false,
        changeDescription: 'No structural changes detected',
      };
    });

    const report = scoreEntities(entities, config);
    const aggregate = computePRAggregate(report, entities, demoPatchAnalyses, config);

    // Simulate automation context for demo
    const automationConfig = config.automation || { reviewers: { enabled: true }, labels: { enabled: true } };
    const ownerReviewers = determineReviewers(entities, automationConfig);
    const appliedLabels = determineLabels(report, entities, demoPatchAnalyses, automationConfig);
    // Evaluate approval policies (core governance feature)
    const policyResult = evaluatePolicies(entities, demoPatchAnalyses, config);
    const reviewerResult = {
      users: [...new Set([...ownerReviewers.users, ...policyResult.allRequiredUsers])],
      teams: [...new Set([...ownerReviewers.teams, ...policyResult.allRequiredTeams])],
    };

    // New: trust signal, routing, remediation, audit
    const trustSignal = computeTrustSignal(entities, report, policyResult);
    const routingResult = routeByRiskType(entities, report, policyResult);
    routingResult.users.forEach(u => { if (!reviewerResult.users.includes(u)) reviewerResult.users.push(u); });
    routingResult.teams.forEach(t => { if (!reviewerResult.teams.includes(t)) reviewerResult.teams.push(t); });
    const remediationPlan = generateRemediations(entities, demoPatchAnalyses, report, policyResult);
    const auditTrail = buildAuditTrail({
      entities, report, aggregate, policyResult,
      patchAnalyses: demoPatchAnalyses,
      reviewerResult, appliedLabels,
    });

    const demoContext: RenderContext = {
      reviewerResult: (reviewerResult.users.length > 0 || reviewerResult.teams.length > 0) ? reviewerResult : undefined,
      appliedLabels: appliedLabels.length > 0 ? appliedLabels : undefined,
      policyResult: policyResult.triggeredPolicies.length > 0 ? policyResult : undefined,
      trustSignal,
      remediationPlan: remediationPlan.totalItems > 0 ? remediationPlan : undefined,
      auditTrail,
      routingResult: routingResult.routingReasons.length > 0 ? routingResult : undefined,
    };

    if (opts.json) {
      console.log(JSON.stringify({ report, aggregate, automation: { reviewerResult, appliedLabels }, trustSignal, remediationPlan, auditTrail }, null, 2));
    } else {
      console.log('═'.repeat(60));
      console.log('');
      console.log(renderReport(report, entities, demoPatchAnalyses, aggregate, demoContext));
      console.log('═'.repeat(60));
      console.log('');
      console.log(renderCompactSummary(report, aggregate));
    }
  });

(async () => {
  await program.parseAsync();
})().catch((err) => {
  console.error(`❌ Fatal: ${err.message || err}`);
  process.exit(1);
});
