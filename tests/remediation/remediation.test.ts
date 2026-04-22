/**
 * Tests for Remediation Engine
 */

import { generateRemediations, renderRemediations } from '../../src/remediation/remediation';
import { DEFAULT_CONFIG } from '../../src/config/types';
import { scoreEntities } from '../../src/risk/scoring';
import { evaluatePolicies } from '../../src/policy/approval-engine';
import { DEMO_ENTITIES } from '../../src/fixtures/demo-data';
import { parsePatch } from '../../src/diff/patch-parser';
import { ResolvedEntity } from '../../src/openmetadata/types';

const patches = DEMO_ENTITIES.map(e => parsePatch(e.filePath, undefined));
const report = scoreEntities(DEMO_ENTITIES, DEFAULT_CONFIG);
const policyResult = evaluatePolicies(DEMO_ENTITIES, patches, DEFAULT_CONFIG);

describe('generateRemediations', () => {
  it('should generate at least one remediation for demo entities', () => {
    const plan = generateRemediations(DEMO_ENTITIES, patches, report, policyResult);
    expect(plan.totalItems).toBeGreaterThan(0);
    expect(plan.items.length).toBe(plan.totalItems);
    expect(plan.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('should generate an assign-owner remediation for unowned entity', () => {
    const unowned: ResolvedEntity[] = [{
      ...DEMO_ENTITIES[0],
      entity: DEMO_ENTITIES[0].entity
        ? { ...DEMO_ENTITIES[0].entity, owner: undefined }
        : undefined,
    }];
    const r = scoreEntities(unowned, DEFAULT_CONFIG);
    const p = evaluatePolicies(unowned, patches.slice(0, 1), DEFAULT_CONFIG);
    const plan = generateRemediations(unowned, patches.slice(0, 1), r, p);
    const ownerItem = plan.items.find(i => i.type === 'assign-owner');
    expect(ownerItem).toBeDefined();
    expect(ownerItem!.priority).toBe('high');
    expect(ownerItem!.steps.length).toBeGreaterThan(0);
  });

  it('should generate a contract remediation for failing tests', () => {
    const withFailingContract: ResolvedEntity[] = [{
      ...DEMO_ENTITIES[0],
      contract: {
        hasContract: true,
        failingTests: 2,
        totalTests: 5,
        testSuiteName: 'Test Suite A',
      },
    }];
    const r = scoreEntities(withFailingContract, DEFAULT_CONFIG);
    const p = evaluatePolicies(withFailingContract, patches.slice(0, 1), DEFAULT_CONFIG);
    const plan = generateRemediations(withFailingContract, patches.slice(0, 1), r, p);
    const contractItem = plan.items.find(i => i.type === 'contract-update');
    expect(contractItem).toBeDefined();
    expect(contractItem!.priority).toBe('critical');
  });

  it('should generate pii-access-review for entity with PII entity-level tag', () => {
    const piiEntity: ResolvedEntity = {
      ...DEMO_ENTITIES[0],
      entity: DEMO_ENTITIES[0].entity
        ? {
            ...DEMO_ENTITIES[0].entity,
            tags: [
              { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed', name: 'Sensitive' },
              { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed', name: 'Tier1' },
            ],
          }
        : undefined,
    };
    const r = scoreEntities([piiEntity], DEFAULT_CONFIG);
    const p = evaluatePolicies([piiEntity], patches.slice(0, 1), DEFAULT_CONFIG);
    const plan = generateRemediations([piiEntity], patches.slice(0, 1), r, p);
    const piiItem = plan.items.find(i => i.type === 'pii-access-review');
    expect(piiItem).toBeDefined();
    expect(piiItem!.priority).toBe('critical');
    expect(piiItem!.followUpPRScope).toBeDefined();
    expect(piiItem!.followUpPRScope!.length).toBeGreaterThan(0);
  });

  it('should sort items with critical priority first', () => {
    const plan = generateRemediations(DEMO_ENTITIES, patches, report, policyResult);
    if (plan.items.length > 1) {
      const priorities = plan.items.map(i => i.priority);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 0; i < priorities.length - 1; i++) {
        expect(order[priorities[i]]).toBeLessThanOrEqual(order[priorities[i + 1]]);
      }
    }
  });

  it('should return empty plan for empty entities', () => {
    const plan = generateRemediations([], [], scoreEntities([], DEFAULT_CONFIG), {
      policies: [], triggeredPolicies: [], isBlocked: false,
      hasWarnings: false, allRequiredTeams: [], allRequiredUsers: [],
    });
    expect(plan.totalItems).toBe(0);
    expect(plan.criticalCount).toBe(0);
  });
});

describe('renderRemediations', () => {
  it('should render Markdown with plan items', () => {
    const plan = generateRemediations(DEMO_ENTITIES, patches, report, policyResult);
    if (plan.totalItems > 0) {
      const md = renderRemediations(plan);
      expect(md).toContain('<details>');
      expect(md).toContain('Proposed Safe Fixes');
      expect(md).toContain('REM-');
      expect(md).toContain('Steps:');
    }
  });

  it('should return empty string for empty plan', () => {
    const md = renderRemediations({ generatedAt: '', totalItems: 0, criticalCount: 0, items: [] });
    expect(md).toBe('');
  });
});
