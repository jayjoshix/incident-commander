/**
 * GitHub Action Entry Point
 *
 * Orchestrates the full LineageLock workflow:
 * 1. Load config
 * 2. Get PR changed files
 * 3. Parse patches for changed columns
 * 4. Resolve files to OpenMetadata entities
 * 5. Fetch metadata and lineage
 * 6. Score risk per entity
 * 7. Compute PR-level aggregate risk
 * 8. Render and post PR comment
 * 9. Request reviewers and apply labels
 * 10. Send webhook notifications
 * 11. Set outputs and exit code
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from '../config/loader';
import { OpenMetadataClient } from '../openmetadata/client';
import { resolveFiles, filterDataModelFiles } from '../resolver/asset-resolver';
import { scoreEntities } from '../risk/scoring';
import { computePRAggregate } from '../risk/pr-aggregate';
import { renderReport, renderCompactSummary } from '../report/renderer';
import { parsePatch, PatchAnalysis } from '../diff/patch-parser';
import {
  determineReviewers,
  determineLabels,
  buildNotificationPayload,
  formatSlackMessage,
  formatTeamsMessage,
  sendWebhook,
} from '../automation/workflow';
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

    // 4. Parse patches for changed columns
    const patchMap = new Map(allChangedFiles.map(f => [f.filename, f.patch]));
    const patchAnalyses: PatchAnalysis[] = dataModelFiles.map(f =>
      parsePatch(f, patchMap.get(f))
    );
    const totalChangedCols = patchAnalyses.reduce((sum, p) => sum + p.changedColumns.length, 0);
    if (totalChangedCols > 0) {
      core.info(`🔬 Detected ${totalChangedCols} changed column(s) across ${patchAnalyses.filter(p => p.changedColumns.length > 0).length} file(s)`);
    }

    // 5. Resolve files to OpenMetadata FQNs
    const resolutions = resolveFiles(filenames, config);
    core.info(`🗺️  Resolved ${resolutions.length} file(s) to entity FQNs`);

    // 6. Fetch metadata from OpenMetadata
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

    // 7. Score risk per entity
    const report = scoreEntities(entities, config);
    core.info(`📊 Per-entity scoring complete: ${report.overallLevel} (${report.maxScore}/100)`);

    // 8. Compute PR-level aggregate risk
    const aggregate = computePRAggregate(report, entities, patchAnalyses, config);
    if (aggregate.aggregateScore > aggregate.maxEntityScore) {
      core.info(`⚡ PR-level escalation: ${aggregate.maxEntityScore} → ${aggregate.aggregateScore} (${aggregate.factors.length} escalation factors)`);
    }

    // 9. Render and post PR comment
    const markdown = renderReport(report, entities, patchAnalyses, aggregate);
    await postOrUpdateComment(githubToken, prContext, markdown);
    core.info('💬 PR comment posted');

    // 10. Workflow automation (reviewer requests, labels, notifications)
    const automationConfig = config.automation || {};

    // 10a. Request reviewers
    try {
      const reviewers = determineReviewers(entities, automationConfig);
      if (reviewers.length > 0) {
        const octokit = github.getOctokit(githubToken);
        await octokit.rest.pulls.requestReviewers({
          owner: prContext.owner,
          repo: prContext.repo,
          pull_number: prContext.pullNumber,
          reviewers,
        });
        core.info(`👥 Requested reviewers: ${reviewers.join(', ')}`);
      }
    } catch (err: any) {
      core.warning(`⚠️ Reviewer request failed (non-blocking): ${err.message}`);
    }

    // 10b. Apply labels
    try {
      const labels = determineLabels(report, entities, patchAnalyses, automationConfig);
      if (labels.length > 0) {
        const octokit = github.getOctokit(githubToken);
        await octokit.rest.issues.addLabels({
          owner: prContext.owner,
          repo: prContext.repo,
          issue_number: prContext.pullNumber,
          labels,
        });
        core.info(`🏷️  Applied labels: ${labels.join(', ')}`);
      }
    } catch (err: any) {
      core.warning(`⚠️ Label automation failed (non-blocking): ${err.message}`);
    }

    // 10c. Send webhook notifications
    const notifications = automationConfig.notifications;
    if (notifications) {
      const minLevel = notifications.minLevel || 'HIGH';
      const levelOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const reportLevelIdx = levelOrder.indexOf(report.overallLevel);
      const minLevelIdx = levelOrder.indexOf(minLevel);

      if (reportLevelIdx >= minLevelIdx) {
        const prUrl = `https://github.com/${prContext.owner}/${prContext.repo}/pull/${prContext.pullNumber}`;
        const payload = buildNotificationPayload(report, aggregate, prContext.pullNumber, prUrl);

        // Slack
        if (notifications.slackWebhookUrl) {
          const result = await sendWebhook(notifications.slackWebhookUrl, formatSlackMessage(payload));
          if (result.success) {
            core.info('📨 Slack notification sent');
          } else {
            core.warning(`⚠️ Slack notification failed (non-blocking): ${result.error}`);
          }
        }

        // Teams
        if (notifications.teamsWebhookUrl) {
          const result = await sendWebhook(notifications.teamsWebhookUrl, formatTeamsMessage(payload));
          if (result.success) {
            core.info('📨 Teams notification sent');
          } else {
            core.warning(`⚠️ Teams notification failed (non-blocking): ${result.error}`);
          }
        }

        // Generic webhook
        if (notifications.webhookUrl) {
          const result = await sendWebhook(notifications.webhookUrl, payload);
          if (result.success) {
            core.info('📨 Webhook notification sent');
          } else {
            core.warning(`⚠️ Webhook notification failed (non-blocking): ${result.error}`);
          }
        }
      }
    }

    // 11. Set outputs (use aggregate score for final decision)
    const finalScore = aggregate.aggregateScore;
    const finalDecision = aggregate.escalatedDecision;
    core.setOutput('risk_score', finalScore.toString());
    core.setOutput('risk_level', report.overallLevel);
    core.setOutput('decision', finalDecision);
    core.setOutput('changed_columns', totalChangedCols.toString());
    core.info(renderCompactSummary(report));

    // 12. Exit code based on decision
    if (finalDecision === 'fail') {
      core.setFailed(
        `🚫 LineageLock: Risk score ${finalScore}/100 exceeds fail threshold (${config.thresholds.fail}). ` +
        `Manual review required before merging.`
      );
    } else if (finalDecision === 'warn') {
      core.warning(
        `⚠️ LineageLock: Risk score ${finalScore}/100 exceeds warn threshold (${config.thresholds.warn}). ` +
        `Review recommended.`
      );
    }
  } catch (error: any) {
    core.setFailed(`LineageLock failed: ${error.message}`);
  }
}

run();
