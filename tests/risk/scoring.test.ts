/**
 * Risk Scoring Tests
 */

import { scoreEntity, scoreEntities, scoreToLevel, computeDecision } from '../../src/risk/scoring';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { ResolvedEntity } from '../../src/openmetadata/types';
import { DEMO_FACT_ORDERS, DEMO_STG_PAYMENTS, DEMO_UNRESOLVED } from '../../src/fixtures/demo-data';

describe('scoreToLevel', () => {
  it('should return LOW for scores 0-29', () => {
    expect(scoreToLevel(0)).toBe('LOW');
    expect(scoreToLevel(15)).toBe('LOW');
    expect(scoreToLevel(29)).toBe('LOW');
  });

  it('should return MEDIUM for scores 30-59', () => {
    expect(scoreToLevel(30)).toBe('MEDIUM');
    expect(scoreToLevel(45)).toBe('MEDIUM');
    expect(scoreToLevel(59)).toBe('MEDIUM');
  });

  it('should return HIGH for scores 60-79', () => {
    expect(scoreToLevel(60)).toBe('HIGH');
    expect(scoreToLevel(70)).toBe('HIGH');
    expect(scoreToLevel(79)).toBe('HIGH');
  });

  it('should return CRITICAL for scores 80-100', () => {
    expect(scoreToLevel(80)).toBe('CRITICAL');
    expect(scoreToLevel(90)).toBe('CRITICAL');
    expect(scoreToLevel(100)).toBe('CRITICAL');
  });
});

describe('computeDecision', () => {
  it('should return pass below warn threshold', () => {
    expect(computeDecision(0, DEFAULT_CONFIG)).toBe('pass');
    expect(computeDecision(29, DEFAULT_CONFIG)).toBe('pass');
  });

  it('should return warn between warn and fail thresholds', () => {
    expect(computeDecision(30, DEFAULT_CONFIG)).toBe('warn');
    expect(computeDecision(50, DEFAULT_CONFIG)).toBe('warn');
    expect(computeDecision(69, DEFAULT_CONFIG)).toBe('warn');
  });

  it('should return fail at or above fail threshold', () => {
    expect(computeDecision(70, DEFAULT_CONFIG)).toBe('fail');
    expect(computeDecision(85, DEFAULT_CONFIG)).toBe('fail');
    expect(computeDecision(100, DEFAULT_CONFIG)).toBe('fail');
  });
});

describe('scoreEntity', () => {
  it('should score an unresolved entity as 0', () => {
    const result = scoreEntity(DEMO_UNRESOLVED, DEFAULT_CONFIG);
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.entityFound).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should score the high-risk fact_orders entity highly', () => {
    const result = scoreEntity(DEMO_FACT_ORDERS, DEFAULT_CONFIG);
    // Expected triggered factors:
    // - Contract violation: 40 (1 failing test)
    // - Critical tier (Tier1): 20
    // - Sensitive tags (PII, GDPR): 20
    // - Downstream dashboards: 10
    // - Downstream ML models: 10
    // - High downstream count (7 >= 5): 10
    // Total raw: 110, capped at 100
    expect(result.score).toBe(100);
    expect(result.level).toBe('CRITICAL');
    expect(result.entityFound).toBe(true);
    expect(result.factors.filter(f => f.triggered).length).toBeGreaterThanOrEqual(6);
  });

  it('should score the stg_payments entity with no owner risk', () => {
    const result = scoreEntity(DEMO_STG_PAYMENTS, DEFAULT_CONFIG);
    // Expected: no owner (10)
    // No contract, no tier, no sensitive tags, no dashboards, no ML
    // Low downstream count (1 < 5)
    expect(result.score).toBe(10);
    expect(result.level).toBe('LOW');
    expect(result.factors.find(f => f.name === 'No Clear Owner')?.triggered).toBe(true);
  });

  it('should produce exactly 8 risk factors', () => {
    const result = scoreEntity(DEMO_FACT_ORDERS, DEFAULT_CONFIG);
    expect(result.factors).toHaveLength(8);
  });

  it('should cap score at 100', () => {
    const result = scoreEntity(DEMO_FACT_ORDERS, DEFAULT_CONFIG);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should detect contract violations', () => {
    const result = scoreEntity(DEMO_FACT_ORDERS, DEFAULT_CONFIG);
    const contractFactor = result.factors.find(f => f.name === 'Contract Violation');
    expect(contractFactor?.triggered).toBe(true);
    expect(contractFactor?.points).toBe(40);
  });

  it('should detect sensitive tags across columns', () => {
    const result = scoreEntity(DEMO_FACT_ORDERS, DEFAULT_CONFIG);
    const tagFactor = result.factors.find(f => f.name === 'Sensitive Data Tags');
    expect(tagFactor?.triggered).toBe(true);
    expect(tagFactor?.detail).toContain('PII');
  });
});

describe('scoreEntities', () => {
  it('should produce an aggregate report', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS, DEMO_STG_PAYMENTS], DEFAULT_CONFIG);
    expect(report.assessments).toHaveLength(2);
    expect(report.maxScore).toBe(100);
    expect(report.overallLevel).toBe('CRITICAL');
    expect(report.decision).toBe('fail');
  });

  it('should count downstream entities correctly', () => {
    const report = scoreEntities([DEMO_FACT_ORDERS, DEMO_STG_PAYMENTS], DEFAULT_CONFIG);
    expect(report.summary.totalDownstream).toBe(8); // 7 + 1
    expect(report.summary.totalDashboards).toBe(2);
    expect(report.summary.totalMlModels).toBe(1);
  });

  it('should track resolved vs unresolved', () => {
    const report = scoreEntities(
      [DEMO_FACT_ORDERS, DEMO_UNRESOLVED],
      DEFAULT_CONFIG
    );
    expect(report.summary.resolvedEntities).toBe(1);
    expect(report.summary.unresolvedEntities).toBe(1);
    expect(report.summary.totalEntities).toBe(2);
  });

  it('should handle empty entity list', () => {
    const report = scoreEntities([], DEFAULT_CONFIG);
    expect(report.maxScore).toBe(0);
    expect(report.overallLevel).toBe('LOW');
    expect(report.decision).toBe('pass');
  });
});

describe('sensitive tag false positive fix', () => {
  it('should NOT flag PII.None as sensitive', () => {
    const entity: ResolvedEntity = {
      filePath: 'test.sql',
      fqn: 'test.table',
      found: true,
      entity: {
        id: 'test-1',
        name: 'test_table',
        fullyQualifiedName: 'test.table',
        columns: [{
          name: 'address',
          dataType: 'VARCHAR',
          tags: [{ tagFQN: 'PII.None', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
        }],
        tags: [],
      },
    };
    const result = scoreEntity(entity, DEFAULT_CONFIG);
    const tagFactor = result.factors.find(f => f.name === 'Sensitive Data Tags');
    expect(tagFactor?.triggered).toBe(false);
  });

  it('should NOT flag PII.NonSensitive as sensitive', () => {
    const entity: ResolvedEntity = {
      filePath: 'test.sql',
      fqn: 'test.table',
      found: true,
      entity: {
        id: 'test-2',
        name: 'test_table',
        fullyQualifiedName: 'test.table',
        columns: [{
          name: 'public_id',
          dataType: 'VARCHAR',
          tags: [{ tagFQN: 'PII.NonSensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
        }],
        tags: [],
      },
    };
    const result = scoreEntity(entity, DEFAULT_CONFIG);
    const tagFactor = result.factors.find(f => f.name === 'Sensitive Data Tags');
    expect(tagFactor?.triggered).toBe(false);
  });

  it('should still flag PII.Sensitive correctly', () => {
    const entity: ResolvedEntity = {
      filePath: 'test.sql',
      fqn: 'test.table',
      found: true,
      entity: {
        id: 'test-3',
        name: 'test_table',
        fullyQualifiedName: 'test.table',
        columns: [{
          name: 'email',
          dataType: 'VARCHAR',
          tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
        }],
        tags: [],
      },
    };
    const result = scoreEntity(entity, DEFAULT_CONFIG);
    const tagFactor = result.factors.find(f => f.name === 'Sensitive Data Tags');
    expect(tagFactor?.triggered).toBe(true);
  });
});
