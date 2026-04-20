/**
 * GitHub Action Entry Point
 *
 * Orchestrates the full LineageLock workflow:
 * 1. Load config
 * 2. Get PR changed files
 * 3. Resolve files to OpenMetadata entities
 * 4. Fetch metadata and lineage
 * 5. Score risk
 * 6. Post PR comment
 * 7. Set outputs and exit code
 */

import * as core from '@actions/core';
import { loadConfig } from '../config/loader';
import { OpenMetadataClient } from '../openmetadata/client';
import { resolveFiles, filterDataModelFiles } from '../resolver/asset-resolver';
import { scoreEntities } from '../risk/scoring';
import { renderReport, renderCompactSummary } from '../report/renderer';
import { ResolvedEntity } from '../openmetadata/types';
import { getPRContext, getChangedFiles, postOrUpdateComment } from './github';

async function run(): Promise<void> {
  try {
    // 1. Wire action-level threshold inputs into env vars for config loader
    const warnInput = core.getInput('warn-threshold');
    const failInput = core.getInput('fail-threshold');
    if (warnInput) process.env.LINEAGELOCK_WARN_THRESHOLD = warnInput;
    if (failInput) process.env.LINEAGELOCK_FAIL_THRESHOLD = failInput;

    const configPath = core.getInput('config-path') || undefined;
    const config = loadConfig(configPath);
    core.info('📋 Configuration loaded');

    // 2. Get PR context and changed files
    const prContext = getPRContext();
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('github-token input or GITHUB_TOKEN env var required');
    }

    const allChangedFiles = await getChangedFiles(githubToken, prContext);
    core.info(`📂 Found ${allChangedFiles.length} changed files in PR #${prContext.pullNumber}`);

    // 3. Filter to data model files
    const filenames = allChangedFiles.map((f) => f.filename);
    const dataModelFiles = filterDataModelFiles(filenames, config);

    if (dataModelFiles.length === 0) {
      core.info('✅ No data model files changed — skipping analysis');
      core.setOutput('risk_score', '0');
      core.setOutput('risk_level', 'LOW');
      core.setOutput('decision', 'pass');
      return;
    }

    core.info(`🔍 Analyzing ${dataModelFiles.length} data model file(s)`);

    // 4. Resolve files to OpenMetadata FQNs
    const resolutions = resolveFiles(filenames, config);
    core.info(`🗺️  Resolved ${resolutions.length} file(s) to entity FQNs`);

    // 5. Fetch metadata from OpenMetadata
    const omUrl = core.getInput('openmetadata-url') || process.env.OPENMETADATA_URL;
    const omToken = core.getInput('openmetadata-token') || process.env.OPENMETADATA_TOKEN;

    if (!omUrl || !omToken) {
      throw new Error(
        'OpenMetadata connection required. Set openmetadata-url/openmetadata-token inputs or OPENMETADATA_URL/OPENMETADATA_TOKEN env vars.'
      );
    }

    const client = new OpenMetadataClient({ baseUrl: omUrl, token: omToken });
    const entities: ResolvedEntity[] = [];

    for (const resolution of resolutions) {
      if (resolution.fqn) {
        core.info(`  → Resolving: ${resolution.filePath} → ${resolution.fqn}`);
        const entity = await client.resolveEntity(resolution.filePath, resolution.fqn);
        entities.push(entity);
      } else {
        entities.push({
          filePath: resolution.filePath,
          fqn: 'unresolved',
          found: false,
          error: 'Could not derive FQN from file path',
        });
      }
    }

    // 6. Score risk
    const report = scoreEntities(entities, config);
    core.info(`📊 Risk analysis complete: ${report.overallLevel} (${report.maxScore}/100)`);

    // 7. Render and post PR comment
    const markdown = renderReport(report, entities);
    await postOrUpdateComment(githubToken, prContext, markdown);
    core.info('💬 PR comment posted');

    // 8. Set outputs
    core.setOutput('risk_score', report.maxScore.toString());
    core.setOutput('risk_level', report.overallLevel);
    core.setOutput('decision', report.decision);
    core.info(renderCompactSummary(report));

    // 9. Exit code based on decision
    if (report.decision === 'fail') {
      core.setFailed(
        `🚫 LineageLock: Risk score ${report.maxScore}/100 exceeds fail threshold (${config.thresholds.fail}). ` +
        `Manual review required before merging.`
      );
    } else if (report.decision === 'warn') {
      core.warning(
        `⚠️ LineageLock: Risk score ${report.maxScore}/100 exceeds warn threshold (${config.thresholds.warn}). ` +
        `Review recommended.`
      );
    }
  } catch (error: any) {
    core.setFailed(`LineageLock failed: ${error.message}`);
  }
}

run();
