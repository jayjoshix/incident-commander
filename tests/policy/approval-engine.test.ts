/**
 * Approval Policy Engine Tests
 *
 * Tests that each built-in policy triggers correctly from OpenMetadata signals,
 * and that policy results are correctly merged into reviewer requirements.
 */

import { evaluatePolicies } from '../../src/policy/approval-engine';
import { ResolvedEntity } from '../../src/openmetadata/types';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { DEMO_FACT_ORDERS } from '../../src/fixtures/demo-data';
import { PatchAnalysis } from '../../src/diff/patch-parser';

// ─── Helper fixtures ─────────────────────────────────────────────────────────

const noPatch: PatchAnalysis = {
  filePath: 'test.sql',
  changedColumns: [],
  isStructuralChange: false,
  changeDescription: '',
};

const withPiiColumnPatch: PatchAnalysis = {
  filePath: 'test.sql',
  changedColumns: [
    { name: 'customer_id', changeType: 'modified', confidence: 'high', source: 'sql-select' },
  ],
  isStructuralChange: true,
  changeDescription: '1 column affected',
};

function makeEntity(overrides: Partial<ResolvedEntity> = {}): ResolvedEntity {
  return {
    filePath: 'models/fact_orders.sql',
    fqn: 'warehouse.analytics.public.fact_orders',
    found: true,
    entity: {
      id: 'test-id',
      name: 'fact_orders',
      fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
      columns: [],
      tags: [],
      tier: '',
    },
    ...overrides,
  };
}

// ─── Policy 1: TIER1_PII ─────────────────────────────────────────────────────

describe('Policy: TIER1_PII', () => {
  it('should trigger when entity is Tier1 + has PII tags', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        columns: [],
        tier: 'Tier.Tier1',
        tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'TIER1_PII')!;
    expect(policy.triggered).toBe(true);
    expect(policy.severity).toBe('block');
    expect(policy.requiredTeams.length).toBeGreaterThan(0);
    expect(result.isBlocked).toBe(true);
  });

  it('should NOT trigger for Tier1 without sensitive tags', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        columns: [],
        tier: 'Tier.Tier1',
        tags: [],
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'TIER1_PII')!;
    expect(policy.triggered).toBe(false);
  });

  it('should NOT trigger for PII without critical tier', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        columns: [],
        tier: 'Tier.Tier3',
        tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'TIER1_PII')!;
    expect(policy.triggered).toBe(false);
  });
});

// ─── Policy 2: CONTRACT_FAILURE_DASHBOARD ───────────────────────────────────

describe('Policy: CONTRACT_FAILURE_DASHBOARD', () => {
  it('should trigger when contract is failing AND dashboards downstream', () => {
    const entity = makeEntity({
      contract: { hasContract: true, failingTests: 2, totalTests: 4, testSuiteName: 'suite' },
      downstream: {
        tables: [], pipelines: [], topics: [], mlModels: [],
        dashboards: [{ id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' }],
        total: 1,
        columnImpact: [],
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'CONTRACT_FAILURE_DASHBOARD')!;
    expect(policy.triggered).toBe(true);
    expect(policy.severity).toBe('block');
    expect(policy.signals.some(s => s.includes('failing'))).toBe(true);
  });

  it('should NOT trigger when contract is passing', () => {
    const entity = makeEntity({
      contract: { hasContract: true, failingTests: 0, totalTests: 4, testSuiteName: 'suite' },
      downstream: {
        tables: [], pipelines: [], topics: [], mlModels: [],
        dashboards: [{ id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' }],
        total: 1,
        columnImpact: [],
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'CONTRACT_FAILURE_DASHBOARD')!;
    expect(policy.triggered).toBe(false);
  });

  it('should NOT trigger with failing contract but no dashboards', () => {
    const entity = makeEntity({
      contract: { hasContract: true, failingTests: 2, totalTests: 4, testSuiteName: 'suite' },
      downstream: { tables: [], pipelines: [], topics: [], mlModels: [], dashboards: [], total: 0, columnImpact: [] },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'CONTRACT_FAILURE_DASHBOARD')!;
    expect(policy.triggered).toBe(false);
  });
});

// ─── Policy 3: GLOSSARY_BUSINESS_CRITICAL ───────────────────────────────────

describe('Policy: GLOSSARY_BUSINESS_CRITICAL', () => {
  it('should trigger for entities with Revenue glossary terms', () => {
    const entity = makeEntity({ glossaryTerms: ['Glossary.Revenue'] });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'GLOSSARY_BUSINESS_CRITICAL')!;
    expect(policy.triggered).toBe(true);
    expect(policy.severity).toBe('warn');
  });

  it('should trigger for CustomerData glossary term', () => {
    const entity = makeEntity({ glossaryTerms: ['Glossary.CustomerData'] });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'GLOSSARY_BUSINESS_CRITICAL')!;
    expect(policy.triggered).toBe(true);
  });

  it('should NOT trigger for non-business glossary terms', () => {
    const entity = makeEntity({ glossaryTerms: ['Glossary.InternalMetrics'] });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'GLOSSARY_BUSINESS_CRITICAL')!;
    expect(policy.triggered).toBe(false);
  });
});

// ─── Policy 4: COLUMN_PII_BREAKAGE ───────────────────────────────────────────

describe('Policy: COLUMN_PII_BREAKAGE', () => {
  it('should trigger when changed column has PII tag', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        tier: '',
        columns: [
          {
            name: 'customer_id',
            dataType: 'VARCHAR',
            tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
          },
        ],
        tags: [],
      },
    });
    const result = evaluatePolicies([entity], [withPiiColumnPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'COLUMN_PII_BREAKAGE')!;
    expect(policy.triggered).toBe(true);
    expect(policy.severity).toBe('block');
    expect(policy.signals.some(s => s.includes('customer_id'))).toBe(true);
  });

  it('should NOT trigger when changed column has no PII tag', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        tier: '',
        columns: [{ name: 'customer_id', dataType: 'VARCHAR', tags: [] }],
        tags: [],
      },
    });
    const result = evaluatePolicies([entity], [withPiiColumnPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'COLUMN_PII_BREAKAGE')!;
    expect(policy.triggered).toBe(false);
  });
});

// ─── Policy 5: NO_OWNER ───────────────────────────────────────────────────────

describe('Policy: NO_OWNER', () => {
  it('should trigger when entity has no owner', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'stg_payments',
        fullyQualifiedName: 'warehouse.analytics.staging.stg_payments',
        columns: [],
        tags: [],
        owner: undefined,
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'NO_OWNER')!;
    expect(policy.triggered).toBe(true);
    expect(policy.severity).toBe('warn');
  });

  it('should NOT trigger when entity has an owner', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        columns: [],
        tags: [],
        owner: { id: 'u1', type: 'team', name: 'Data Engineering', fullyQualifiedName: 'team.data-engineering' },
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    const policy = result.policies.find(p => p.id === 'NO_OWNER')!;
    expect(policy.triggered).toBe(false);
  });
});

// ─── Reviewer merging ─────────────────────────────────────────────────────────

describe('Policy reviewer merging', () => {
  it('should deduplicate teams from multiple triggered policies', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'fact_orders',
        fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
        columns: [],
        tier: 'Tier.Tier1',
        tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      },
      contract: { hasContract: true, failingTests: 1, totalTests: 3, testSuiteName: 'suite' },
      downstream: {
        tables: [], pipelines: [], topics: [], mlModels: [],
        dashboards: [{ id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' }],
        total: 1,
        columnImpact: [],
      },
      glossaryTerms: ['Glossary.Revenue'],
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    // Multiple policies triggered — teams should be deduplicated
    expect(result.allRequiredTeams.length).toBeGreaterThan(0);
    expect(new Set(result.allRequiredTeams).size).toBe(result.allRequiredTeams.length);
    expect(result.isBlocked).toBe(true);
  });

  it('should return no block when no policies triggered', () => {
    const entity = makeEntity({
      entity: {
        id: 'test-id',
        name: 'stg_dim',
        fullyQualifiedName: 'warehouse.analytics.staging.stg_dim',
        columns: [],
        tier: 'Tier.Tier3',
        tags: [],
        owner: { id: 'u1', type: 'user', name: 'alice', fullyQualifiedName: 'user.alice' },
      },
    });
    const result = evaluatePolicies([entity], [noPatch], DEFAULT_CONFIG);
    expect(result.isBlocked).toBe(false);
    expect(result.triggeredPolicies.length).toBe(0);
  });
});

// ─── Full demo entity ─────────────────────────────────────────────────────────

describe('evaluatePolicies with full DEMO_FACT_ORDERS fixture', () => {
  it('should trigger multiple policies and block merge', () => {
    const demoPatch: PatchAnalysis = {
      filePath: 'models/marts/fact_orders.sql',
      changedColumns: [
        { name: 'amount', changeType: 'modified', confidence: 'high', source: 'sql-select' },
        { name: 'customer_id', changeType: 'modified', confidence: 'high', source: 'sql-select' },
      ],
      isStructuralChange: true,
      changeDescription: '2 columns affected',
    };
    const result = evaluatePolicies([DEMO_FACT_ORDERS], [demoPatch], DEFAULT_CONFIG);
    expect(result.triggeredPolicies.length).toBeGreaterThan(0);
    expect(result.isBlocked).toBe(true);
    expect(result.allRequiredTeams.length).toBeGreaterThan(0);
  });
});
