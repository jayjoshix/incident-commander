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
import { evaluatePolicies } from '../policy/approval-engine';
import { ResolvedEntity } from '../openmetadata/types';
import { getPRContext, getChangedFiles, postOrUpdateComment, createCheckRun } from './github';

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
        // Observability enrichment: fetch active quality issues (best-effort, non-blocking)
        if (entity.found && entity.fqn) {
          entity.activeQualityIssues = await client.getTestResults(entity.fqn);
          if (entity.activeQualityIssues.length > 0) {
            core.info(`  ⚠️  ${entity.activeQualityIssues.length} active quality issue(s) found on ${entity.fqn}`);
          }
        }
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

    // 9. Evaluate approval policies (metadata-driven, from OpenMetadata signals)
    const policyResult = evaluatePolicies(entities, patchAnalyses, config);
    if (policyResult.triggeredPolicies.length > 0) {
      core.info(`🏛️  ${policyResult.triggeredPolicies.length} approval policy(ies) triggered`);
      policyResult.triggeredPolicies.forEach(p =>
        core.info(`   ${p.severity === 'block' ? '🚫' : '⚠️'} ${p.name}: ${p.reason.slice(0, 80)}...`)
      );
    }

    // 10. Compute automation results (before rendering so we can include them in the comment)
    const automationConfig = config.automation || {};
    // Merge policy-required reviewers with owner-based reviewers
    const ownerReviewers = determineReviewers(entities, automationConfig);
    const reviewerResult = {
      users: [...new Set([...ownerReviewers.users, ...policyResult.allRequiredUsers])],
      teams: [...new Set([...ownerReviewers.teams, ...policyResult.allRequiredTeams])],
    };
    const appliedLabels = determineLabels(report, entities, patchAnalyses, automationConfig);

    // 11. Render and post PR comment (includes policy, automation, observability context)
    const renderContext = {
      reviewerResult: (reviewerResult.users.length > 0 || reviewerResult.teams.length > 0) ? reviewerResult : undefined,
      appliedLabels: appliedLabels.length > 0 ? appliedLabels : undefined,
      policyResult: policyResult.triggeredPolicies.length > 0 ? policyResult : undefined,
    };
    const markdown = renderReport(report, entities, patchAnalyses, aggregate, renderContext);
    await postOrUpdateComment(githubToken, prContext, markdown);
    core.info('💬 PR comment posted');

    // 12. Post GitHub Check Run (non-blocking)
    try {
      const decision = policyResult.isBlocked || aggregate.escalatedDecision === 'fail' ? 'failure'
        : aggregate.escalatedDecision === 'warn' ? 'neutral' : 'success';
      const topTriggers = policyResult.triggeredPolicies.slice(0, 3)
        .map(p => `- ${p.name}: ${p.signals.slice(0, 2).join(', ')}`).join('\n');
      await createCheckRun(githubToken, prContext, {
        conclusion: decision,
        title: `LineageLock: ${aggregate.escalatedLevel} (${aggregate.aggregateScore}/100)`,
        summary: renderCompactSummary(report, aggregate),
        details: topTriggers || undefined,
      });
      core.info('✅ GitHub Check Run created');
    } catch (err: any) {
      core.warning(`⚠️ Check run failed (non-blocking): ${err.message}`);
    }

    // 11. Execute automation (reviewer requests, labels, notifications)

    // 11a. Request reviewers
    try {
      if (reviewerResult.users.length > 0 || reviewerResult.teams.length > 0) {
        const octokit = github.getOctokit(githubToken);
        await octokit.rest.pulls.requestReviewers({
          owner: prContext.owner,
          repo: prContext.repo,
          pull_number: prContext.pullNumber,
          reviewers: reviewerResult.users,
          team_reviewers: reviewerResult.teams,
        });
        const all = [...reviewerResult.users, ...reviewerResult.teams.map(t => `team:${t}`)];
        core.info(`👥 Requested reviewers: ${all.join(', ')}`);
      }
    } catch (err: any) {
      core.warning(`⚠️ Reviewer request failed (non-blocking): ${err.message}`);
    }

    // 11b. Apply labels
    try {
      if (appliedLabels.length > 0) {
        const octokit = github.getOctokit(githubToken);
        await octokit.rest.issues.addLabels({
          owner: prContext.owner,
          repo: prContext.repo,
          issue_number: prContext.pullNumber,
          labels: appliedLabels,
        });
        core.info(`🏷️  Applied labels: ${appliedLabels.join(', ')}`);
      }
    } catch (err: any) {
      core.warning(`⚠️ Label automation failed (non-blocking): ${err.message}`);
    }

    // 10c. Send webhook notifications
    const notifications = automationConfig.notifications;
    if (notifications) {
      const minLevel = notifications.minLevel || 'HIGH';
      const levelOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const reportLevelIdx = levelOrder.indexOf(aggregate.escalatedLevel);
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

    // 13. Set outputs
    const finalScore = aggregate.aggregateScore;
    const finalDecision = policyResult.isBlocked ? 'fail' : aggregate.escalatedDecision;
    core.setOutput('risk_score', finalScore.toString());
    core.setOutput('risk_level', aggregate.escalatedLevel);
    core.setOutput('decision', finalDecision);
    core.setOutput('changed_columns', totalChangedCols.toString());
    core.setOutput('policies_triggered', policyResult.triggeredPolicies.length.toString());
    core.info(renderCompactSummary(report, aggregate));

    // 14. Exit code — policy block takes precedence over score threshold
    if (policyResult.isBlocked) {
      const blockingPolicies = policyResult.triggeredPolicies
        .filter(p => p.severity === 'block')
        .map(p => p.name)
        .join(', ');
      core.setFailed(
        `🚫 LineageLock: Merge blocked by approval policies: ${blockingPolicies}. ` +
        `Required approvals pending.`
      );
    } else if (finalDecision === 'fail') {
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
