/**
 * Tests for the Trust Signal module
 */

import { computeTrustSignal, renderTrustSignal } from '../../src/trust/trust-signal';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { scoreEntities } from '../../src/risk/scoring';
import { evaluatePolicies } from '../../src/policy/approval-engine';
import { DEMO_ENTITIES } from '../../src/fixtures/demo-data';
import { parsePatch } from '../../src/diff/patch-parser';
import { ResolvedEntity } from '../../src/openmetadata/types';

const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
const policyResult = evaluatePolicies(DEMO_ENTITIES, patches, DEFAULT_CONFIG);

describe('computeTrustSignal', () => {
  it('should produce a trust signal with 5 dimensions', () => {
    const trust = computeTrustSignal(DEMO_ENTITIES, report, policyResult);
    expect(trust.dimensions).toHaveLength(5);
    expect(trust.overallScore).toBeGreaterThanOrEqual(0);
    expect(trust.overallScore).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(trust.overallGrade);
  });

  it('should return F grade for empty entities', () => {
    const trust = computeTrustSignal([], report, policyResult);
    expect(trust.overallGrade).toBe('F');
    expect(trust.overallScore).toBe(0);
  });

  it('should report low owner coverage when no owners assigned', () => {
    const noOwnerEntities: ResolvedEntity[] = DEMO_ENTITIES.map(e => ({
      ...e,
      entity: e.entity ? { ...e.entity, owner: undefined } : undefined,
    }));
    const noOwnerReport = scoreEntities(noOwnerEntities, DEFAULT_CONFIG);
    const trust = computeTrustSignal(noOwnerEntities, noOwnerReport, policyResult);
    const ownerDim = trust.dimensions.find(d => d.name === 'Owner Coverage');
    expect(ownerDim?.score).toBe(0);
    expect(trust.topRisks.some(r => r.toLowerCase().includes('owner'))).toBe(true);
  });

  it('should have summary string', () => {
    const trust = computeTrustSignal(DEMO_ENTITIES, report, policyResult);
    expect(typeof trust.summary).toBe('string');
    expect(trust.summary.length).toBeGreaterThan(0);
  });

  it('should penalise governance posture when blocking policies triggered', () => {
    const blockedPolicy = {
      ...policyResult,
      triggeredPolicies: policyResult.triggeredPolicies.map(p => ({ ...p, severity: 'block' as const })),
      isBlocked: true,
    };
    const trust = computeTrustSignal(DEMO_ENTITIES, report, blockedPolicy);
    const govDim = trust.dimensions.find(d => d.name === 'Governance Posture');
    expect(govDim!.score).toBeLessThan(100);
  });
});

describe('renderTrustSignal', () => {
  it('should render a Markdown trust signal block', () => {
    const trust = computeTrustSignal(DEMO_ENTITIES, report, policyResult);
    const md = renderTrustSignal(trust);
    expect(md).toContain('Trust Signal');
    expect(md).toContain('Owner Coverage');
    expect(md).toContain('Contract Health');
    expect(md).toContain('Governance Posture');
    expect(md).toContain('/100');
  });
});
