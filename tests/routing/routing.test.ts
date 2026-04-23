/**
 * Tests for Risk-Type Routing module
 */

import { routeByRiskType, renderRoutingReasons } from '../../src/routing/routing';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { scoreEntities } from '../../src/risk/scoring';
import { evaluatePolicies } from '../../src/policy/approval-engine';
import { DEMO_ENTITIES, DEMO_FACT_ORDERS, DEMO_STG_PAYMENTS } from '../../src/fixtures/demo-data';
import { parsePatch } from '../../src/diff/patch-parser';
import { ResolvedEntity } from '../../src/openmetadata/types';

const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
const policyResult = evaluatePolicies(DEMO_ENTITIES, patches, DEFAULT_CONFIG);

describe('routeByRiskType', () => {
  it('should produce routing reasons and reviewer assignments', () => {
    const result = routeByRiskType(DEMO_ENTITIES, report, policyResult);
    expect(result).toHaveProperty('users');
    expect(result).toHaveProperty('teams');
    expect(result).toHaveProperty('routingReasons');
    expect(Array.isArray(result.users)).toBe(true);
    expect(Array.isArray(result.teams)).toBe(true);
    expect(Array.isArray(result.routingReasons)).toBe(true);
  });

  it('should route PII entity to privacy-team', () => {
    const piiEntity: ResolvedEntity = {
      ...DEMO_FACT_ORDERS,
      entity: DEMO_FACT_ORDERS.entity
        ? {
            ...DEMO_FACT_ORDERS.entity,
            tags: [
              { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
            ],
          }
        : undefined,
    };
    const r = scoreEntities([piiEntity], DEFAULT_CONFIG);
    const p = evaluatePolicies([piiEntity], [parsePatch(piiEntity.filePath, undefined)], DEFAULT_CONFIG);
    const result = routeByRiskType([piiEntity], r, p);
    const piiReason = result.routingReasons.find(rr => rr.riskType === 'pii');
    expect(piiReason).toBeDefined();
    expect(piiReason!.assignedTo.some(t => t.includes('privacy'))).toBe(true);
  });

  it('should route contract-failing entity to data-quality team', () => {
    const contractEntity: ResolvedEntity = {
      ...DEMO_FACT_ORDERS,
      contract: { hasContract: true, failingTests: 2, totalTests: 4, testSuiteName: 'suite' },
    };
    const r = scoreEntities([contractEntity], DEFAULT_CONFIG);
    const p = evaluatePolicies([contractEntity], [parsePatch(contractEntity.filePath, undefined)], DEFAULT_CONFIG);
    const result = routeByRiskType([contractEntity], r, p);
    const contractReason = result.routingReasons.find(rr => rr.riskType === 'contract');
    expect(contractReason).toBeDefined();
    expect(contractReason!.assignedTo.some(t => t.includes('data-quality') || t.includes('quality'))).toBe(true);
  });

  it('should route no-owner entity to platform-admin', () => {
    const noOwnerEntity: ResolvedEntity = {
      ...DEMO_STG_PAYMENTS,
      entity: DEMO_STG_PAYMENTS.entity
        ? { ...DEMO_STG_PAYMENTS.entity, owner: undefined }
        : undefined,
    };
    const r = scoreEntities([noOwnerEntity], DEFAULT_CONFIG);
    const p = evaluatePolicies([noOwnerEntity], [parsePatch(noOwnerEntity.filePath, undefined)], DEFAULT_CONFIG);
    const result = routeByRiskType([noOwnerEntity], r, p);
    const noOwnerReason = result.routingReasons.find(rr => rr.riskType === 'no-owner');
    expect(noOwnerReason).toBeDefined();
    expect(noOwnerReason!.assignedTo.length).toBeGreaterThan(0);
  });

  it('should route Tier1 entity to data-platform team', () => {
    const tier1Entity: ResolvedEntity = {
      ...DEMO_FACT_ORDERS,
      entity: DEMO_FACT_ORDERS.entity
        ? { ...DEMO_FACT_ORDERS.entity, tier: 'Tier.Tier1' }
        : undefined,
    };
    const r = scoreEntities([tier1Entity], DEFAULT_CONFIG);
    const p = evaluatePolicies([tier1Entity], [parsePatch(tier1Entity.filePath, undefined)], DEFAULT_CONFIG);
    const result = routeByRiskType([tier1Entity], r, p);
    const tier1Reason = result.routingReasons.find(rr => rr.riskType === 'tier1');
    expect(tier1Reason).toBeDefined();
    expect(tier1Reason!.assignedTo.some(t => t.includes('data-platform') || t.includes('platform'))).toBe(true);
  });

  it('should route glossary entity to business-owners', () => {
    const glossaryEntity: ResolvedEntity = {
      ...DEMO_FACT_ORDERS,
      glossaryTerms: ['Glossary.Revenue', 'Glossary.CustomerData'],
    };
    const r = scoreEntities([glossaryEntity], DEFAULT_CONFIG);
    const p = evaluatePolicies([glossaryEntity], [parsePatch(glossaryEntity.filePath, undefined)], DEFAULT_CONFIG);
    const result = routeByRiskType([glossaryEntity], r, p);
    const glossaryReason = result.routingReasons.find(rr => rr.riskType === 'glossary');
    expect(glossaryReason).toBeDefined();
    expect(glossaryReason!.assignedTo.some(t => t.includes('business') || t.includes('owner'))).toBe(true);
  });

  it('should return empty routing for low-risk untagged entity', () => {
    const lowRisk: ResolvedEntity = {
      filePath: 'models/staging/stg_simple.sql',
      fqn: 'w.a.staging.stg_simple',
      found: true,
      entity: {
        id: 'lr-1', name: 'stg_simple', fullyQualifiedName: 'w.a.staging.stg_simple',
        columns: [], tags: [], owner: { id: 'u1', type: 'user', name: 'alice', fullyQualifiedName: 'alice' },
      },
    };
    const r = scoreEntities([lowRisk], DEFAULT_CONFIG);
    const p = evaluatePolicies([lowRisk], [parsePatch(lowRisk.filePath, undefined)], DEFAULT_CONFIG);
    const result = routeByRiskType([lowRisk], r, p);
    // No special routing for clean entity
    expect(result.routingReasons.every(rr => rr.riskType !== 'pii')).toBe(true);
    expect(result.routingReasons.every(rr => rr.riskType !== 'contract')).toBe(true);
  });

  it('should deduplicate reviewer assignments across multiple risk types', () => {
    const result = routeByRiskType(DEMO_ENTITIES, report, policyResult);
    const unique = new Set(result.teams);
    expect(unique.size).toBe(result.teams.length); // no duplicates
    const uniqueU = new Set(result.users);
    expect(uniqueU.size).toBe(result.users.length);
  });

  it('each routing reason should have a non-empty reason string', () => {
    const result = routeByRiskType(DEMO_ENTITIES, report, policyResult);
    for (const rr of result.routingReasons) {
      expect(typeof rr.reason).toBe('string');
      expect(rr.reason.length).toBeGreaterThan(0);
      expect(rr.assignedTo.length).toBeGreaterThan(0);
    }
  });
});

describe('renderRoutingReasons', () => {
  it('should render Markdown with routing info', () => {
    const result = routeByRiskType(DEMO_ENTITIES, report, policyResult);
    if (result.routingReasons.length > 0) {
      const md = renderRoutingReasons(result);
      expect(md).toContain('Routing Reasons');
      expect(md).toContain('→');
      expect(md).toMatch(/team:|@/); // at least one reviewer reference
    }
  });

  it('should return empty string when no routing reasons', () => {
    const md = renderRoutingReasons({ users: [], teams: [], routingReasons: [] });
    expect(md).toBe('');
  });
});
