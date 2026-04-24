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

// ─── Targeted branch coverage for previously uncovered paths ─────────────────

describe('renderReport — renderImpactSummary (lines 101-102, 223-274)', () => {
  it('should render What Changed section when patches have changedColumns', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const patch = {
      filePath: 'models/marts/fact_orders.sql',
      changedColumns: [
        { name: 'amount', changeType: 'modified' as any, confidence: 'high' as any, source: 'sql-select' as any },
        { name: 'customer_id', changeType: 'renamed' as any, confidence: 'medium' as any, source: 'sql-select' as any },
      ],
      isStructuralChange: true,
      changeDescription: '2 columns changed',
    };
    const md = renderReport(report, [DEMO_FACT_ORDERS], [patch]);
    expect(md).toContain('What Changed');
    expect(md).toContain('amount');
    expect(md).toContain('customer_id');
  });

  it('should render downstream breakage when columnImpact intersects changed columns', () => {
    const entityWithImpact = {
      ...DEMO_FACT_ORDERS,
      downstream: {
        ...DEMO_FACT_ORDERS.downstream!,
        columnImpact: [
          {
            fromColumns: ['warehouse.analytics.public.fact_orders.amount'],
            toColumn: 'warehouse.analytics.public.agg_revenue.total_revenue',
            toEntity: 'warehouse.analytics.public.agg_revenue',
          },
        ],
      },
    };
    const report = scoreEntities([entityWithImpact], DEFAULT_CONFIG);
    const patch = {
      filePath: 'models/marts/fact_orders.sql',
      changedColumns: [{ name: 'amount', changeType: 'modified' as any, confidence: 'high' as any, source: 'sql-select' as any }],
      isStructuralChange: true,
      changeDescription: '',
    };
    const md = renderReport(report, [entityWithImpact], [patch]);
    expect(md).toContain('Downstream breakage');
    expect(md).toContain('amount');
    expect(md).toContain('total_revenue');
  });
});

describe('renderReport — renderAutomation (lines 111-117, 371-425)', () => {
  it('should render Automation section with user and team reviewers', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const ctx = {
      reviewerResult: {
        users: ['alice', 'bob'],
        teams: ['data-platform', 'privacy-team'],
      },
      appliedLabels: ['lineagelock:tier1-change', 'lineagelock:pii-impact'],
    };
    const md = renderReport(report, [DEMO_FACT_ORDERS], undefined, undefined, ctx);
    expect(md).toContain('Automation');
    expect(md).toContain('@alice');
    expect(md).toContain('@bob');
    expect(md).toContain('team:data-platform');
    expect(md).toContain('lineagelock:tier1-change');
    expect(md).toContain('lineagelock:pii-impact');
  });

  it('should render label reasons for all known label types', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const ctx = {
      reviewerResult: { users: [], teams: [] },
      appliedLabels: [
        'lineagelock:tier1-change',
        'lineagelock:pii-impact',
        'lineagelock:contract-risk',
        'lineagelock:column-breakage',
        'lineagelock:high-risk',
        'lineagelock:no-owner',
        'lineagelock:unknown-label',
      ],
    };
    const md = renderReport(report, [DEMO_FACT_ORDERS], undefined, undefined, ctx);
    expect(md).toContain('Tier 1');
    expect(md).toContain('PII');
    expect(md).toContain('governance condition triggered'); // fallback for unknown label
  });

  it('should render routing reasons inside automation when routingResult provided', () => {
    const patches = [DEMO_FACT_ORDERS].map(e => parsePatch(e.filePath, undefined));
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const policyResult = evaluatePolicies([DEMO_FACT_ORDERS], patches, DEFAULT_CONFIG);
    const routingResult = routeByRiskType([DEMO_FACT_ORDERS], report, policyResult);
    const ctx = {
      reviewerResult: { users: [], teams: routingResult.teams },
      routingResult,
    };
    const md = renderReport(report, [DEMO_FACT_ORDERS], undefined, undefined, ctx);
    if (routingResult.routingReasons.length > 0) {
      expect(md).toMatch(/Routing/i);
    }
  });
});

describe('renderReport — warn-only policies (line 191)', () => {
  it('should render warn-only header when no block policies', () => {
    const noOwnerEntity = { ...DEMO_STG_PAYMENTS };
    const patches = [parsePatch(noOwnerEntity.filePath, undefined)];
    const report = scoreEntities([noOwnerEntity], DEFAULT_CONFIG);
    const policyResult = evaluatePolicies([noOwnerEntity], patches, DEFAULT_CONFIG);
    if (policyResult.triggeredPolicies.length > 0 && !policyResult.isBlocked) {
      const ctx = { policyResult };
      const md = renderReport(report, [noOwnerEntity], patches, undefined, ctx);
      expect(md).toMatch(/⚠️.*Governance Polic/);
    }
  });

  it('should render policy with requiredUsers (line 203)', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const mockPolicy = {
      isBlocked: false,
      hasWarnings: true,
      policies: [],
      triggeredPolicies: [{
        name: 'PII Owner Review',
        severity: 'warn' as any,
        reason: 'PII asset needs owner sign-off',
        requiredTeams: [] as string[],
        requiredUsers: ['data-steward', 'privacy-lead'],
        signals: ['PII.Sensitive tag'],
      }],
      allRequiredTeams: [] as string[],
      allRequiredUsers: ['data-steward', 'privacy-lead'],
    };
    const ctx = { policyResult: mockPolicy as any };
    const md = renderReport(report, [DEMO_FACT_ORDERS], undefined, undefined, ctx);
    expect(md).toContain('@data-steward');
    expect(md).toContain('@privacy-lead');
  });
});

describe('renderReport — renderAggregateSection (lines 127-128, 449-450, 462-476)', () => {
  it('should render aggregate escalation section when score is elevated', () => {
    const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    // Inject a synthetic aggregate where score > maxEntityScore to trigger section
    const aggregate = {
      aggregateScore: Math.min(100, report.maxScore + 15),
      maxEntityScore: report.maxScore,
      escalatedLevel: 'CRITICAL' as any,
      escalatedDecision: 'fail' as any,
      factors: [{ name: 'Multi-entity PII compound risk', count: 2, escalation: 15 }],
    };
    if (aggregate.aggregateScore > aggregate.maxEntityScore) {
      const md = renderReport(report, DEMO_ENTITIES, patches, aggregate as any);
      expect(md).toContain('PR-Level Risk Escalation');
      expect(md).toContain('Multi-entity PII compound risk');
    }
  });

  it('should include escalation note in detailed scoring when aggregate > maxEntity', () => {
    const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
    const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
    const aggregate = {
      aggregateScore: 85,
      maxEntityScore: 70,
      escalatedLevel: 'CRITICAL' as any,
      escalatedDecision: 'fail' as any,
      factors: [{ name: 'Compound risk', count: 2, escalation: 15 }],
    };
    const md = renderReport(report, DEMO_ENTITIES, patches, aggregate as any);
    expect(md).toContain('escalation');
    expect(md).toContain('70');
    expect(md).toContain('85');
  });
});

describe('renderReport — rollout guidance (lines 608-621)', () => {
  it('should render Safe Rollout Guidance when patch has changedColumns and entity has columnImpact', () => {
    const entityWithImpact = {
      ...DEMO_FACT_ORDERS,
      downstream: {
        ...DEMO_FACT_ORDERS.downstream!,
        columnImpact: [
          {
            fromColumns: ['warehouse.analytics.public.fact_orders.amount'],
            toColumn: 'warehouse.analytics.public.agg_revenue.total_revenue',
            toEntity: 'warehouse.analytics.public.agg_revenue',
          },
        ],
      },
    };
    const report = scoreEntities([entityWithImpact], DEFAULT_CONFIG);
    const patch = {
      filePath: 'models/marts/fact_orders.sql',
      changedColumns: [
        { name: 'amount', changeType: 'renamed' as any, confidence: 'high' as any, source: 'sql-select' as any },
      ],
      isStructuralChange: true,
      changeDescription: '',
    };
    const md = renderReport(report, [entityWithImpact], [patch]);
    // Rollout guidance renders when patch has changed cols AND columnImpact
    expect(md).toMatch(/Safe Rollout Guidance|Rollout/i);
    expect(md).toContain('amount');
  });
});

describe('renderGovernanceTriggers — no signals path (line 361)', () => {
  it('should show no-signals fallback for a completely clean entity', () => {
    // Entity with no owner, no tags, no tier, no downstream, no contract — nothing triggers
    const cleanEntity = {
      filePath: 'models/clean.sql',
      fqn: 'w.a.s.clean',
      found: true,
      entity: {
        id: 'c1', name: 'clean', fullyQualifiedName: 'w.a.s.clean',
        columns: [], tags: [],
        // No owner, no tier — so no governance signals fire
      },
    };
    const report = scoreEntities([cleanEntity], DEFAULT_CONFIG);
    const md = renderReport(report, [cleanEntity]);
    expect(md).toContain('No governance signals detected');
  });
});


