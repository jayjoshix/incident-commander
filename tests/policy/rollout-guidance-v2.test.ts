/**
 * Tests for generateRolloutGuidanceV2 — strategy-specific patterns
 * and rollback trigger conditions.
 */

import {
  generateRolloutGuidanceV2,
  RolloutGuidanceV2,
} from '../../src/policy/rollout-guidance';
import { ResolvedEntity } from '../../src/openmetadata/types';
import { PatchAnalysis } from '../../src/diff/patch-parser';

function makePatch(columns: Array<{ name: string; changeType: string }>): PatchAnalysis {
  return {
    filePath: 'models/fact_orders.sql',
    changedColumns: columns.map(c => ({
      name: c.name,
      changeType: c.changeType as any,
      confidence: 'high',
      source: 'sql-select',
    })),
    isStructuralChange: true,
    changeDescription: '',
  };
}

function makeEntity(overrides: Partial<ResolvedEntity> = {}): ResolvedEntity {
  return {
    filePath: 'models/fact_orders.sql',
    fqn: 'w.a.p.fact_orders',
    found: true,
    entity: {
      id: 'eid-1',
      name: 'fact_orders',
      fullyQualifiedName: 'w.a.p.fact_orders',
      columns: [],
      tags: [{ tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      tier: 'Tier.Tier1',
    },
    downstream: {
      tables: [{ id: 't1', type: 'table', name: 'agg_revenue', fullyQualifiedName: 'w.a.p.agg_revenue' }],
      dashboards: [{ id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue' }],
      mlModels: [],
      pipelines: [],
      topics: [],
      total: 2,
      columnImpact: [
        { fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'w.a.p.agg_revenue.total_revenue', toEntity: 'w.a.p.agg_revenue' },
      ],
    },
    ...overrides,
  };
}

// ─── Strategy selection ──────────────────────────────────────────────────────

describe('generateRolloutGuidanceV2 — strategy selection', () => {
  it('should select dual-write for renamed columns', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'renamed' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity());
    expect(result.length).toBeGreaterThan(0);
    const g = result.find(r => r.columnName === 'amount')!;
    expect(g.strategy).toBe('dual-write');
    expect(g.steps.length).toBeGreaterThanOrEqual(4);
    expect(g.steps[0].action).toContain('both names');
  });

  it('should select deprecation-window for removed columns', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'removed' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity());
    expect(result.length).toBeGreaterThan(0);
    const g = result[0];
    expect(g.strategy).toBe('deprecation-window');
    expect(g.steps.some(s => s.action.toLowerCase().includes('deprecat'))).toBe(true);
  });

  it('should select contract-first when entity has a failing contract', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const entity = makeEntity({
      contract: { hasContract: true, failingTests: 1, totalTests: 4, testSuiteName: 'suite' },
    });
    const result = generateRolloutGuidanceV2(patch, entity);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].strategy).toBe('contract-first');
    expect(result[0].steps[0].action).toMatch(/contract/i);
  });

  it('should select rollback-ready when 3+ downstream entities with modified column', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const entity = makeEntity({
      downstream: {
        tables: [
          { id: 't1', type: 'table', name: 'a', fullyQualifiedName: 'w.a.p.a' },
          { id: 't2', type: 'table', name: 'b', fullyQualifiedName: 'w.a.p.b' },
          { id: 't3', type: 'table', name: 'c', fullyQualifiedName: 'w.a.p.c' },
        ],
        dashboards: [], mlModels: [], pipelines: [], topics: [],
        total: 3,
        columnImpact: [
          { fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'w.a.p.a.amount', toEntity: 'w.a.p.a' },
        ],
      },
    });
    const result = generateRolloutGuidanceV2(patch, entity);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].strategy).toBe('rollback-ready');
    expect(result[0].steps.some(s => s.action.toLowerCase().includes('rollback'))).toBe(true);
  });

  it('should skip added columns with no downstream column impact', () => {
    const patch = makePatch([{ name: 'new_col', changeType: 'added' }]);
    const entity = makeEntity({
      downstream: {
        tables: [], dashboards: [], mlModels: [], pipelines: [], topics: [], total: 0, columnImpact: [],
      },
    });
    const result = generateRolloutGuidanceV2(patch, entity);
    expect(result).toHaveLength(0);
  });
});

// ─── Rollback triggers ───────────────────────────────────────────────────────

describe('generateRolloutGuidanceV2 — rollback triggers', () => {
  it('should always include at least 2 rollback triggers', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity({
      contract: { hasContract: true, failingTests: 1, totalTests: 4, testSuiteName: 'suite' },
    }));
    expect(result[0].rollbackTriggers.length).toBeGreaterThanOrEqual(2);
  });

  it('should add dashboard trigger when entity has dashboards', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'renamed' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity());
    const g = result[0];
    const hasDashboardTrigger = g.rollbackTriggers.some(t =>
      t.condition.toLowerCase().includes('dashboard')
    );
    expect(hasDashboardTrigger).toBe(true);
  });

  it('should add removal-specific trigger for removed columns', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'removed' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity());
    const removalTrigger = result[0].rollbackTriggers.some(t =>
      t.condition.toLowerCase().includes('removed column')
    );
    expect(removalTrigger).toBe(true);
  });
});

// ─── Risk estimation ─────────────────────────────────────────────────────────

describe('generateRolloutGuidanceV2 — risk estimation', () => {
  it('should estimate high risk for removed columns', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'removed' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity());
    expect(result[0].estimatedRisk).toBe('high');
  });

  it('should estimate high risk for renamed columns', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'renamed' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity());
    expect(result[0].estimatedRisk).toBe('high');
  });

  it('should estimate medium risk for modified column with downstream', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const result = generateRolloutGuidanceV2(patch, makeEntity({
      // No contract, but has downstream
      downstream: {
        tables: [{ id: 't1', type: 'table', name: 'a', fullyQualifiedName: 'w.a.p.a' }],
        dashboards: [], mlModels: [], pipelines: [], topics: [],
        total: 1,
        columnImpact: [
          { fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'w.a.p.a.amount', toEntity: 'w.a.p.a' },
        ],
      },
    }));
    expect(result[0].estimatedRisk).toBe('medium');
  });
});

// ─── Consumer migration order ────────────────────────────────────────────────

describe('generateRolloutGuidanceV2 — consumer migration order', () => {
  it('should order: tables → pipelines → dashboards → ML models', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'renamed' }]);
    const entity = makeEntity({
      downstream: {
        tables: [{ id: 't1', type: 'table', name: 'agg', fullyQualifiedName: 'w.a.p.agg' }],
        dashboards: [{ id: 'd1', type: 'dashboard', name: 'Dash', fullyQualifiedName: 'sup.Dash' }],
        mlModels: [{ id: 'm1', type: 'mlmodel', name: 'Model', fullyQualifiedName: 'ml.Model' }],
        pipelines: [{ id: 'p1', type: 'pipeline', name: 'Pipe', fullyQualifiedName: 'pipe.Pipe' }],
        topics: [],
        total: 4,
        columnImpact: [
          { fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'w.a.p.agg.total', toEntity: 'w.a.p.agg' },
        ],
      },
    });
    const result = generateRolloutGuidanceV2(patch, entity);
    const order = result[0].consumerMigrationOrder;
    const tableIdx = order.findIndex(o => o.startsWith('table:'));
    const pipeIdx = order.findIndex(o => o.startsWith('pipeline:'));
    const dashIdx = order.findIndex(o => o.startsWith('dashboard:'));
    const mlIdx = order.findIndex(o => o.startsWith('ml-model:'));
    expect(tableIdx).toBeLessThan(pipeIdx);
    expect(pipeIdx).toBeLessThan(dashIdx);
    expect(dashIdx).toBeLessThan(mlIdx);
  });
});
