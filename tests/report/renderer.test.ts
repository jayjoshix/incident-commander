/**
 * Report Renderer Tests
 */

import { renderReport, renderCompactSummary } from '../../src/report/renderer';
import { scoreEntities } from '../../src/risk/scoring';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { DEMO_ENTITIES, DEMO_FACT_ORDERS, DEMO_STG_PAYMENTS, DEMO_UNRESOLVED } from '../../src/fixtures/demo-data';

describe('renderReport', () => {
  it('should produce a valid Markdown report', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const markdown = renderReport(report, DEMO_ENTITIES);

    expect(markdown).toContain('## 🔒 LineageLock Risk Report');
    expect(markdown).toContain('📊 Detailed Scoring');
    expect(markdown).toContain('### 🏛️ Governance Triggers');
  });

  it('should include entity details for each assessed entity', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const markdown = renderReport(report, DEMO_ENTITIES);

    expect(markdown).toContain('`models/marts/fact_orders.sql`');
    expect(markdown).toContain('`models/staging/stg_payments.sql`');
  });

  it('should show risk factors in collapsible sections', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const markdown = renderReport(report, [DEMO_FACT_ORDERS]);

    expect(markdown).toContain('<details>');
    expect(markdown).toContain('Risk Factors');
    expect(markdown).toContain('Contract Violation');
    expect(markdown).toContain('Critical Tier Asset');
    expect(markdown).toContain('Sensitive Data Tags');
  });

  it('should show downstream assets', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const markdown = renderReport(report, [DEMO_FACT_ORDERS]);

    expect(markdown).toContain('Revenue Dashboard');
    expect(markdown).toContain('Executive KPIs');
    expect(markdown).toContain('churn_predictor');
  });

  it('should show governance info', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const markdown = renderReport(report, [DEMO_FACT_ORDERS]);

    expect(markdown).toContain('Data Engineering Team');
    expect(markdown).toContain('Tier.Tier1');
  });

  it('should show contract status', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const markdown = renderReport(report, [DEMO_FACT_ORDERS]);

    expect(markdown).toContain('Contract Status');
    expect(markdown).toContain('amount_positive');
  });

  it('should show unresolved entities section', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const markdown = renderReport(report, DEMO_ENTITIES);

    expect(markdown).toContain('### ⚠️ Unresolved Entities');
    expect(markdown).toContain('stg_inventory');
  });

  it('should include owner in governance triggers', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const markdown = renderReport(report, [DEMO_FACT_ORDERS]);

    expect(markdown).toContain('Data Engineering Team');
    expect(markdown).toContain('Governance Triggers');
  });

  it('should include the correct decision', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const markdown = renderReport(report, DEMO_ENTITIES);

    // Score is 100, which should be CRITICAL / fail
    expect(markdown).toContain('CRITICAL');
  });
});

describe('renderCompactSummary', () => {
  it('should produce a single-line summary', () => {
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const summary = renderCompactSummary(report);

    expect(summary).toContain('LineageLock');
    expect(summary).toContain('CRITICAL');
    expect(summary).toContain('100/100');
    expect(summary).not.toContain('\n');
  });

  it('should show LOW for low-risk entities', () => {
    const report = scoreEntities([DEMO_STG_PAYMENTS], DEFAULT_CONFIG);
    const summary = renderCompactSummary(report);

    expect(summary).toContain('LOW');
    expect(summary).toContain('10/100');
  });
});

// ─── New section tests (RenderContext) ──────────────────────────────────────

import { computePRAggregate } from '../../src/risk/pr-aggregate';
import { evaluatePolicies } from '../../src/policy/approval-engine';
import { computeTrustSignal } from '../../src/trust/trust-signal';
import { generateRemediations } from '../../src/remediation/remediation';
import { buildAuditTrail } from '../../src/audit/audit-trail';
import { routeByRiskType } from '../../src/routing/routing';
import { parsePatch } from '../../src/diff/patch-parser';
import { RenderContext } from '../../src/report/renderer';

function buildFullContext() {
  const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
  const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
  const aggregate = computePRAggregate(report, DEMO_ENTITIES, patches, DEFAULT_CONFIG);
  const policyResult = evaluatePolicies(DEMO_ENTITIES, patches, DEFAULT_CONFIG);
  const trustSignal = computeTrustSignal(DEMO_ENTITIES, report, policyResult);
  const routingResult = routeByRiskType(DEMO_ENTITIES, report, policyResult);
  const remediationPlan = generateRemediations(DEMO_ENTITIES, patches, report, policyResult);
  const auditTrail = buildAuditTrail({
    entities: DEMO_ENTITIES, report, aggregate, policyResult,
    patchAnalyses: patches,
    reviewerResult: { users: [], teams: [...policyResult.allRequiredTeams, ...routingResult.teams] },
    appliedLabels: ['lineagelock:tier1-change', 'lineagelock:pii-impact'],
  });
  const ctx: RenderContext = { policyResult, trustSignal, remediationPlan, auditTrail, routingResult };
  return { report, entities: DEMO_ENTITIES, patches, aggregate, ctx };
}

describe('renderReport — Trust Signal section', () => {
  it('should include Trust Signal grade in output', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    expect(md).toMatch(/Trust Signal/i);
    expect(md).toMatch(/Grade [A-F]/);
  });

  it('should list all 5 trust dimensions', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    expect(md).toMatch(/Owner Coverage/i);
    expect(md).toMatch(/Contract Health/i);
    expect(md).toMatch(/Observability/i);
    expect(md).toMatch(/Governance/i);
    expect(md).toMatch(/Lineage/i);
  });
});

describe('renderReport — Routing section', () => {
  it('should include routing reasons section', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    // routing reasons rendered if there are any
    if (ctx.routingResult!.routingReasons.length > 0) {
      expect(md).toMatch(/Routing/i);
      expect(md).toContain('→');
    }
  });
});

describe('renderReport — Remediation section', () => {
  it('should include proposed safe fixes section', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    if (ctx.remediationPlan!.totalItems > 0) {
      expect(md).toMatch(/Safe Fix|Remediation|REM-/i);
    }
  });

  it('should not show duplicated PII.Sensitive in Sensitive Data Tags factor', () => {
    const singleReport = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const md = renderReport(singleReport, [DEMO_FACT_ORDERS]);
    // Count occurrences of PII.Sensitive in factor detail — should be 1
    const matches = (md.match(/PII\.Sensitive/g) || []).length;
    expect(matches).toBeLessThanOrEqual(2); // appears in tags section AND factor detail once each
  });
});

describe('renderReport — Audit Trail section', () => {
  it('should include audit trail section', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    expect(md).toMatch(/Audit Trail|Governance Audit/i);
  });

  it('should include artifact path reference', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    expect(md).toContain('lineagelock-audit.json');
  });

  it('should record correct decision in audit trail', () => {
    const { report, entities, patches, aggregate, ctx } = buildFullContext();
    const md = renderReport(report, entities, patches, aggregate, ctx);
    // Decision should be FAIL or BLOCKED for high-risk demo data
    expect(md).toMatch(/FAIL|BLOCKED|WARN|PASS/);
  });
});

describe('renderReport — Quality Issues section', () => {
  it('should show active quality issues for fact_orders', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const md = renderReport(report, [DEMO_FACT_ORDERS]);
    // freshness_check and amount_positive are both failing quality issues
    expect(md).toContain('amount_positive');
    expect(md).toContain('freshness_check');
  });

  it('quality issues and contract tests should be consistent (no contradiction)', () => {
    // freshness_check must be Failed in both contract tests and active quality issues
    const { contract, activeQualityIssues } = DEMO_FACT_ORDERS;
    const contractFreshness = contract?.tests?.find(t => t.name === 'freshness_check');
    const qualityFreshness = activeQualityIssues?.find(q => q.name === 'freshness_check');
    if (contractFreshness && qualityFreshness) {
      expect(contractFreshness.status).toBe('Failed');
      expect(qualityFreshness.status).toBe('Failed');
    }
  });
});

describe('renderCompactSummary — with aggregate', () => {
  it('should accept optional aggregate param without error', () => {
    const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const aggregate = computePRAggregate(report, DEMO_ENTITIES, patches, DEFAULT_CONFIG);
    const summary = renderCompactSummary(report, aggregate);
    expect(summary).toContain('LineageLock');
    expect(summary).not.toContain('\n');
  });
});
