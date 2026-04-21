/**
 * Workflow Automation Tests
 */

import {
  determineReviewers,
  determineLabels,
  buildNotificationPayload,
  formatSlackMessage,
  formatTeamsMessage,
  AutomationConfig,
} from '../../src/automation/workflow';
import { scoreEntities } from '../../src/risk/scoring';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { DEMO_ENTITIES, DEMO_FACT_ORDERS, DEMO_STG_PAYMENTS, DEMO_UNRESOLVED } from '../../src/fixtures/demo-data';
import { PatchAnalysis } from '../../src/diff/patch-parser';
import { computePRAggregate } from '../../src/risk/pr-aggregate';

const emptyPatches: PatchAnalysis[] = DEMO_ENTITIES.map(e => ({
  filePath: e.filePath,
  changedColumns: [],
  isStructuralChange: false,
  changeDescription: 'No patch',
}));

describe('determineReviewers', () => {
  it('should return empty when disabled', () => {
    const config: AutomationConfig = { reviewers: { enabled: false } };
    const result = determineReviewers(DEMO_ENTITIES, config);
    expect(result).toEqual({ users: [], teams: [] });
  });

  it('should return empty when no config provided', () => {
    const result = determineReviewers(DEMO_ENTITIES, {});
    expect(result).toEqual({ users: [], teams: [] });
  });

  it('should extract team reviewers from team owners', () => {
    const config: AutomationConfig = {
      reviewers: { enabled: true },
    };
    const result = determineReviewers([DEMO_FACT_ORDERS], config);
    // data-engineering is type:'team', so goes to teams
    expect(result.teams).toContain('data-engineering');
    expect(result.users).toHaveLength(0);
  });

  it('should use owner mapping when provided (maps to user)', () => {
    const config: AutomationConfig = {
      reviewers: {
        enabled: true,
        ownerMapping: { 'data-engineering': 'team-lead-github' },
      },
    };
    const result = determineReviewers([DEMO_FACT_ORDERS], config);
    // Mapped names go to users
    expect(result.users).toContain('team-lead-github');
    expect(result.teams).toHaveLength(0);
  });

  it('should respect maxReviewers limit', () => {
    const config: AutomationConfig = {
      reviewers: { enabled: true, maxReviewers: 1 },
    };
    const result = determineReviewers(DEMO_ENTITIES, config);
    expect(result.users.length + result.teams.length).toBeLessThanOrEqual(2); // max 1 each
  });

  it('should skip entities without owners', () => {
    const config: AutomationConfig = {
      reviewers: { enabled: true },
    };
    const result = determineReviewers([DEMO_STG_PAYMENTS], config);
    expect(result.users.length + result.teams.length).toBe(0);
  });
});

describe('determineLabels', () => {
  it('should return empty when disabled', () => {
    const config: AutomationConfig = { labels: { enabled: false } };
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const result = determineLabels(report, DEMO_ENTITIES, emptyPatches, config);
    expect(result).toEqual([]);
  });

  it('should add tier1-change label for Tier 1 assets', () => {
    const config: AutomationConfig = { labels: { enabled: true } };
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_FACT_ORDERS], emptyPatches.slice(0, 1), config);
    expect(result).toContain('lineagelock:tier1-change');
  });

  it('should add pii-impact label for PII-tagged entities', () => {
    const config: AutomationConfig = { labels: { enabled: true } };
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_FACT_ORDERS], emptyPatches.slice(0, 1), config);
    expect(result).toContain('lineagelock:pii-impact');
  });

  it('should add contract-risk label for failing contracts', () => {
    const config: AutomationConfig = { labels: { enabled: true } };
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_FACT_ORDERS], emptyPatches.slice(0, 1), config);
    expect(result).toContain('lineagelock:contract-risk');
  });

  it('should add high-risk label for high scores', () => {
    const config: AutomationConfig = { labels: { enabled: true } };
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_FACT_ORDERS], emptyPatches.slice(0, 1), config);
    expect(result).toContain('lineagelock:high-risk');
  });

  it('should add no-owner label when entity has no owner', () => {
    const config: AutomationConfig = { labels: { enabled: true } };
    const report = scoreEntities([DEMO_STG_PAYMENTS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_STG_PAYMENTS], emptyPatches.slice(1, 2), config);
    expect(result).toContain('lineagelock:no-owner');
  });

  it('should add column-breakage label for structural column changes', () => {
    const config: AutomationConfig = { labels: { enabled: true } };
    const patches: PatchAnalysis[] = [{
      filePath: 'models/fact_orders.sql',
      changedColumns: [{ name: 'amount', changeType: 'removed', confidence: 'high', source: 'sql-select' }],
      isStructuralChange: true,
      changeDescription: '1 column removed',
    }];
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_FACT_ORDERS], patches, config);
    expect(result).toContain('lineagelock:column-breakage');
  });

  it('should use custom label names when configured', () => {
    const config: AutomationConfig = {
      labels: { enabled: true, names: { highRisk: 'danger-zone' } },
    };
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const result = determineLabels(report, [DEMO_FACT_ORDERS], emptyPatches.slice(0, 1), config);
    expect(result).toContain('danger-zone');
    expect(result).not.toContain('lineagelock:high-risk');
  });
});

describe('notification formatting', () => {
  it('should build a valid notification payload', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const aggregate = computePRAggregate(report, DEMO_ENTITIES, emptyPatches, DEFAULT_CONFIG);
    const payload = buildNotificationPayload(report, aggregate, 42, 'https://github.com/org/repo/pull/42');

    expect(payload.project).toBe('LineageLock');
    expect(payload.prNumber).toBe(42);
    expect(payload.riskScore).toBeGreaterThan(0);
    expect(payload.summary).toContain('PR #42');
  });

  it('should format a valid Slack message', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const aggregate = computePRAggregate(report, DEMO_ENTITIES, emptyPatches, DEFAULT_CONFIG);
    const payload = buildNotificationPayload(report, aggregate, 42, 'https://github.com/org/repo/pull/42');
    const message = formatSlackMessage(payload) as any;

    expect(message.text).toContain('LineageLock');
    expect(message.blocks).toBeDefined();
    expect(message.blocks.length).toBeGreaterThan(0);
  });

  it('should format a valid Teams message', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const aggregate = computePRAggregate(report, DEMO_ENTITIES, emptyPatches, DEFAULT_CONFIG);
    const payload = buildNotificationPayload(report, aggregate, 42, 'https://github.com/org/repo/pull/42');
    const message = formatTeamsMessage(payload) as any;

    expect(message['@type']).toBe('MessageCard');
    expect(message.title).toContain('PR #42');
    expect(message.sections).toBeDefined();
  });
});
