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
    expect(markdown).toContain('### Overall Assessment');
    expect(markdown).toContain('### 💥 Blast Radius');
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

  it('should include owner notification', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS], DEFAULT_CONFIG);
    const markdown = renderReport(report, [DEMO_FACT_ORDERS]);

    expect(markdown).toContain('**Action:** Request review from **Data Engineering Team**');
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
