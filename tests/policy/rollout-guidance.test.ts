/**
 * Rollout Guidance Tests
 *
 * Directly tests generateRolloutGuidance() for all three change types
 * (modified, renamed, removed) with and without downstream column impact.
 */

import { generateRolloutGuidance } from '../../src/policy/rollout-guidance';
import { ResolvedEntity } from '../../src/openmetadata/types';
import { PatchAnalysis } from '../../src/diff/patch-parser';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
    changeDescription: `${columns.length} column(s) affected`,
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
      tags: [],
    },
    downstream: {
      tables: [],
      dashboards: [
        { id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' },
      ],
      mlModels: [],
      pipelines: [],
      topics: [],
      total: 1,
      columnImpact: [
        {
          fromColumns: ['w.a.p.fact_orders.amount'],
          toColumn: 'w.a.p.agg_revenue.total_revenue',
          toEntity: 'w.a.p.agg_revenue',
        },
      ],
    },
    ...overrides,
  };
}

// ─── No column impact — should return empty ────────────────────────────────

describe('generateRolloutGuidance — no downstream column impact', () => {
  it('should return empty array when entity has no columnImpact', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const entity = makeEntity({
      downstream: { tables: [], dashboards: [], mlModels: [], pipelines: [], topics: [], total: 0, columnImpact: [] },
    });
    const result = generateRolloutGuidance(patch, entity);
    expect(result).toEqual([]);
  });

  it('should return empty array when patch has no changed columns', () => {
    const patch: PatchAnalysis = {
      filePath: 'models/fact_orders.sql',
      changedColumns: [],
      isStructuralChange: false,
      changeDescription: '',
    };
    const entity = makeEntity();
    const result = generateRolloutGuidance(patch, entity);
    expect(result).toEqual([]);
  });

  it('should return empty when changed column does not appear in columnImpact', () => {
    const patch = makePatch([{ name: 'unrelated_col', changeType: 'modified' }]);
    const entity = makeEntity(); // columnImpact has 'amount', not 'unrelated_col'
    const result = generateRolloutGuidance(patch, entity);
    expect(result).toEqual([]);
  });
});

// ─── Modified column ────────────────────────────────────────────────────────

describe('generateRolloutGuidance — modified column', () => {
  it('should produce 3-step guidance for modified column with downstream impact', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const entity = makeEntity();
    const result = generateRolloutGuidance(patch, entity);

    expect(result).toHaveLength(1);
    expect(result[0].columnName).toBe('amount');
    expect(result[0].changeType).toBe('modified');
    expect(result[0].steps).toHaveLength(3);
    expect(result[0].steps[0].action).toBe('Validate downstream impact');
    expect(result[0].steps[1].action).toBe('Test in staging');
    expect(result[0].steps[2].action).toBe('Update data contract');
    // Downstream assets should be listed
    expect(result[0].downstreamAssets.length).toBeGreaterThan(0);
  });

  it('should include dashboard names in downstreamAssets', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'modified' }]);
    const entity = makeEntity();
    const result = generateRolloutGuidance(patch, entity);

    expect(result[0].downstreamAssets.some(a => a.includes('Revenue Dashboard'))).toBe(true);
  });

  it('should generate guidance for multiple impacted columns', () => {
    const patch = makePatch([
      { name: 'amount', changeType: 'modified' },
      { name: 'customer_id', changeType: 'modified' },
    ]);
    const entity = makeEntity({
      downstream: {
        tables: [], dashboards: [], mlModels: [], pipelines: [], topics: [], total: 2,
        columnImpact: [
          { fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'w.a.p.agg_revenue.total_revenue', toEntity: 'w.a.p.agg_revenue' },
          { fromColumns: ['w.a.p.fact_orders.customer_id'], toColumn: 'w.a.p.agg_customer_ltv.customer_id', toEntity: 'w.a.p.agg_customer_ltv' },
        ],
      },
    });
    const result = generateRolloutGuidance(patch, entity);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.columnName)).toContain('amount');
    expect(result.map(r => r.columnName)).toContain('customer_id');
  });
});

// ─── Removed column ────────────────────────────────────────────────────────

describe('generateRolloutGuidance — removed column', () => {
  it('should produce 4-step deprecate-first guidance for removed column', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'removed' }]);
    const entity = makeEntity();
    const result = generateRolloutGuidance(patch, entity);

    expect(result).toHaveLength(1);
    expect(result[0].changeType).toBe('removed');
    expect(result[0].steps).toHaveLength(4);
    expect(result[0].steps[0].action).toBe('Audit consumers');
    expect(result[0].steps[1].action).toBe('Deprecate first');
    expect(result[0].steps[2].action).toBe('Migrate consumers');
    expect(result[0].steps[3].action).toBe('Remove in follow-up PR');
    // Deprecate step should mention OpenMetadata
    expect(result[0].steps[1].detail).toMatch(/OpenMetadata/i);
  });
});

// ─── Renamed column ────────────────────────────────────────────────────────

describe('generateRolloutGuidance — renamed column', () => {
  it('should produce 4-step dual-write guidance for renamed column', () => {
    const patch = makePatch([{ name: 'amount', changeType: 'renamed' }]);
    const entity = makeEntity();
    const result = generateRolloutGuidance(patch, entity);

    expect(result).toHaveLength(1);
    expect(result[0].changeType).toBe('renamed');
    expect(result[0].steps).toHaveLength(4);
    expect(result[0].steps[0].action).toBe('Add alias / dual-write');
    expect(result[0].steps[1].action).toBe('Migrate downstream');
    expect(result[0].steps[2].action).toBe('Update OpenMetadata');
    expect(result[0].steps[3].action).toBe('Remove the alias');
    // Migrate step should mention downstream assets
    expect(result[0].steps[1].detail.length).toBeGreaterThan(0);
  });
});

// ─── Added column — should NOT produce guidance ────────────────────────────

describe('generateRolloutGuidance — added column (skipped)', () => {
  it('should not produce guidance for added columns (no migration needed)', () => {
    const patch = makePatch([{ name: 'new_col', changeType: 'added' }]);
    const entity = makeEntity({
      downstream: {
        tables: [], dashboards: [], mlModels: [], pipelines: [], topics: [], total: 1,
        columnImpact: [
          // add a mapping for new_col so it's not filtered by column-name match
          { fromColumns: ['w.a.p.fact_orders.new_col'], toColumn: 'w.a.p.agg_revenue.new_col', toEntity: 'w.a.p.agg_revenue' },
        ],
      },
    });
    const result = generateRolloutGuidance(patch, entity);
    // 'added' type is not in the set that produces guidance
    expect(result).toHaveLength(0);
  });
});
