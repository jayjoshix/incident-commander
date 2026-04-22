/**
 * Tests for the Audit Trail module
 */

import { buildAuditTrail, renderAuditSummary } from '../../src/audit/audit-trail';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { scoreEntities } from '../../src/risk/scoring';
import { computePRAggregate } from '../../src/risk/pr-aggregate';
import { evaluatePolicies } from '../../src/policy/approval-engine';
import { DEMO_ENTITIES, DEMO_CHANGED_FILES } from '../../src/fixtures/demo-data';
import { parsePatch } from '../../src/diff/patch-parser';

const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
const aggregate = computePRAggregate(report, DEMO_ENTITIES, patches, DEFAULT_CONFIG);
const policyResult = evaluatePolicies(DEMO_ENTITIES, patches, DEFAULT_CONFIG);

describe('buildAuditTrail', () => {
  it('should produce a valid audit record', () => {
    const audit = buildAuditTrail({
      entities: DEMO_ENTITIES,
      report,
      aggregate,
      policyResult,
      patchAnalyses: patches,
      reviewerResult: { users: ['alice'], teams: ['data-platform'] },
      appliedLabels: ['lineagelock:high-risk'],
    });

    expect(audit.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(audit.version).toBe('2.0.0');
    expect(audit.entities).toHaveLength(DEMO_ENTITIES.length);
    expect(audit.aggregateScore).toBe(aggregate.aggregateScore);
    expect(audit.routing.requestedUsers).toContain('alice');
    expect(audit.routing.requestedTeams).toContain('data-platform');
    expect(audit.labels).toContain('lineagelock:high-risk');
  });

  it('should correctly map policy results to audit policies', () => {
    const audit = buildAuditTrail({
      entities: DEMO_ENTITIES,
      report,
      aggregate,
      policyResult,
      patchAnalyses: patches,
      reviewerResult: { users: [], teams: [] },
      appliedLabels: [],
    });

    expect(audit.policies).toHaveLength(policyResult.triggeredPolicies.length);
    if (audit.policies.length > 0) {
      expect(audit.policies[0]).toHaveProperty('policyId');
      expect(audit.policies[0]).toHaveProperty('policyName');
      expect(audit.policies[0]).toHaveProperty('severity');
      expect(audit.policies[0]).toHaveProperty('signals');
    }
  });

  it('should set decision to fail when blocked', () => {
    const audit = buildAuditTrail({
      entities: DEMO_ENTITIES,
      report,
      aggregate,
      policyResult: { ...policyResult, isBlocked: true },
      patchAnalyses: patches,
      reviewerResult: { users: [], teams: [] },
      appliedLabels: [],
    });
    expect(audit.decision).toBe('fail');
    expect(audit.isBlocked).toBe(true);
  });

  it('should include observability summary', () => {
    const audit = buildAuditTrail({
      entities: DEMO_ENTITIES,
      report,
      aggregate,
      policyResult,
      patchAnalyses: patches,
      reviewerResult: { users: [], teams: [] },
      appliedLabels: [],
    });
    expect(audit.observability).toHaveProperty('totalActiveQualityIssues');
    expect(audit.observability).toHaveProperty('affectedEntities');
  });

  it('should populate PR context when provided', () => {
    const audit = buildAuditTrail({
      entities: DEMO_ENTITIES,
      report,
      aggregate,
      policyResult,
      patchAnalyses: patches,
      reviewerResult: { users: [], teams: [] },
      appliedLabels: [],
      prContext: { owner: 'acme', repo: 'data-platform', pullNumber: 42 },
    });
    expect(audit.prContext.owner).toBe('acme');
    expect(audit.prContext.repo).toBe('data-platform');
    expect(audit.prContext.pullNumber).toBe(42);
  });
});

describe('renderAuditSummary', () => {
  it('should produce valid Markdown with key fields', () => {
    const audit = buildAuditTrail({
      entities: DEMO_ENTITIES,
      report,
      aggregate,
      policyResult,
      patchAnalyses: patches,
      reviewerResult: { users: ['alice'], teams: ['data-platform'] },
      appliedLabels: ['lineagelock:high-risk'],
    });
    const md = renderAuditSummary(audit);
    expect(md).toContain('<details>');
    expect(md).toContain('Governance Audit Trail');
    expect(md).toContain('Decision');
    expect(md).toContain('Score');
    expect(md).toContain('lineagelock-audit.json');
  });
});
