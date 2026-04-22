/**
 * Approval Policy Engine
 *
 * Evaluates OpenMetadata-driven approval policies against PR entities.
 * Each policy is derived entirely from OpenMetadata signals:
 * tier, tags, glossary terms, contracts, ownership, and column lineage.
 *
 * This is the core governance logic:
 * "Who must approve this PR, and why — according to OpenMetadata?"
 */

import { ResolvedEntity } from '../openmetadata/types';
import { PatchAnalysis } from '../diff/patch-parser';
import { ApprovalPolicy, PolicyEvaluationResult } from './types';
import { LineageLockConfig } from '../config/types';

// ─── Policy Configuration ────────────────────────────────────────────────────

export interface PolicyConfig {
  /** Team slug to notify when Tier1 + PII policy triggers */
  tier1PiiTeam?: string;
  /** Team slug for data quality / contract issues */
  dataQualityTeam?: string;
  /** Team slug or username for business owner sign-off */
  businessOwnerTeam?: string;
  /** Team slug for security review on PII column breakage */
  securityTeam?: string;
}

// ─── Sensitive tag helpers ────────────────────────────────────────────────────

const SENSITIVE_TAG_PREFIXES = [
  'PII.Sensitive', 'GDPR', 'PHI', 'PCI', 'PersonalData',
  'DataSensitivity.Highly', 'DataSensitivity.Confidential',
];

function hasSensitiveTags(entity: ResolvedEntity): boolean {
  const allTags = [
    ...(entity.entity?.tags || []),
    ...(entity.entity?.columns || []).flatMap(c => c.tags || []),
  ];
  return allTags.some(t =>
    SENSITIVE_TAG_PREFIXES.some(prefix => t.tagFQN.includes(prefix))
  );
}

function isTierCritical(entity: ResolvedEntity): boolean {
  const tier = entity.entity?.tier || '';
  return tier.includes('Tier1') || tier.includes('Tier2');
}

function hasGlossaryMatch(entity: ResolvedEntity, terms: string[]): boolean {
  const entityTerms = entity.glossaryTerms || [];
  return terms.some(t => entityTerms.some(et => et.toLowerCase().includes(t.toLowerCase())));
}

function hasFailingContract(entity: ResolvedEntity): boolean {
  return !!(entity.contract?.hasContract && entity.contract.failingTests > 0);
}

function hasDownstreamDashboard(entity: ResolvedEntity): boolean {
  return (entity.downstream?.dashboards?.length ?? 0) > 0;
}

function hasColumnPIIBreakage(entity: ResolvedEntity, patch?: PatchAnalysis): boolean {
  if (!patch || patch.changedColumns.length === 0) return false;
  const changedNames = new Set(patch.changedColumns.map(c => c.name.toLowerCase()));
  const piiColumns = (entity.entity?.columns || []).filter(col =>
    (col.tags || []).some(t => SENSITIVE_TAG_PREFIXES.some(p => t.tagFQN.includes(p)))
  );
  return piiColumns.some(col => changedNames.has(col.name.toLowerCase()));
}

// ─── Built-in Policy Evaluators ───────────────────────────────────────────────

/**
 * Policy 1: TIER1_PII
 * Tier 1/2 asset + sensitive data tags → requires Data Platform + Business Owner
 */
function evaluateTier1Pii(
  entities: ResolvedEntity[],
  policyConfig: PolicyConfig
): ApprovalPolicy {
  const triggered = entities.some(e => isTierCritical(e) && hasSensitiveTags(e));
  const signals: string[] = [];
  if (triggered) {
    entities.forEach(e => {
      if (isTierCritical(e)) signals.push(`${e.entity?.tier} (critical tier)`);
      if (hasSensitiveTags(e)) {
        const tags = [...(e.entity?.tags || []), ...(e.entity?.columns || []).flatMap(c => c.tags || [])]
          .filter(t => SENSITIVE_TAG_PREFIXES.some(p => t.tagFQN.includes(p)))
          .map(t => t.tagFQN);
        signals.push(...[...new Set(tags)]);
      }
    });
  }
  return {
    id: 'TIER1_PII',
    name: 'Critical tier asset with sensitive data',
    reason: triggered
      ? `Asset is classified as ${entities.find(e => isTierCritical(e))?.entity?.tier} and contains sensitive data columns. Changes require Data Platform sign-off.`
      : '',
    triggered,
    severity: 'block',
    requiredTeams: triggered ? [policyConfig.tier1PiiTeam || 'data-platform', policyConfig.businessOwnerTeam || 'business-owners'] : [],
    requiredUsers: [],
    signals: [...new Set(signals)],
  };
}

/**
 * Policy 2: CONTRACT_FAILURE_DASHBOARD
 * Failing data contract + downstream dashboard → requires Data Quality team
 */
function evaluateContractDashboard(
  entities: ResolvedEntity[],
  policyConfig: PolicyConfig
): ApprovalPolicy {
  const triggered = entities.some(e => hasFailingContract(e) && hasDownstreamDashboard(e));
  const signals: string[] = [];
  if (triggered) {
    entities.forEach(e => {
      if (hasFailingContract(e)) {
        signals.push(`${e.contract!.failingTests} failing test(s) in ${e.contract!.testSuiteName || 'contract suite'}`);
      }
      if (hasDownstreamDashboard(e)) {
        signals.push(...e.downstream!.dashboards.map(d => `Dashboard: ${d.name}`));
      }
    });
  }
  return {
    id: 'CONTRACT_FAILURE_DASHBOARD',
    name: 'Failing contract with downstream dashboards',
    reason: triggered
      ? 'Data quality tests are currently failing AND downstream dashboards depend on this asset. Merging now risks breaking live dashboards.'
      : '',
    triggered,
    severity: 'block',
    requiredTeams: triggered ? [policyConfig.dataQualityTeam || 'data-quality'] : [],
    requiredUsers: [],
    signals: [...new Set(signals)],
  };
}

/**
 * Policy 3: GLOSSARY_BUSINESS_CRITICAL
 * Entity linked to Revenue/CustomerData/Finance glossary terms → Business Owner
 */
function evaluateGlossaryBusinessCritical(
  entities: ResolvedEntity[],
  policyConfig: PolicyConfig
): ApprovalPolicy {
  const BUSINESS_TERMS = ['Revenue', 'CustomerData', 'Customer', 'Finance', 'LTV', 'Churn'];
  const triggered = entities.some(e => hasGlossaryMatch(e, BUSINESS_TERMS));
  const signals: string[] = [];
  if (triggered) {
    entities.forEach(e => {
      const matched = (e.glossaryTerms || []).filter(t =>
        BUSINESS_TERMS.some(b => t.toLowerCase().includes(b.toLowerCase()))
      );
      signals.push(...matched);
    });
  }
  return {
    id: 'GLOSSARY_BUSINESS_CRITICAL',
    name: 'Business-critical glossary terms affected',
    reason: triggered
      ? `Entity is linked to business-critical glossary terms (${[...new Set(signals)].join(', ')}). Business owners must approve changes.`
      : '',
    triggered,
    severity: 'warn',
    requiredTeams: triggered ? [policyConfig.businessOwnerTeam || 'business-owners'] : [],
    requiredUsers: [],
    signals: [...new Set(signals)],
  };
}

/**
 * Policy 4: COLUMN_PII_BREAKAGE
 * A changed column has PII tags + flows downstream → Security review
 */
function evaluateColumnPIIBreakage(
  entities: ResolvedEntity[],
  patches: PatchAnalysis[],
  policyConfig: PolicyConfig
): ApprovalPolicy {
  const triggered = entities.some((e, i) => hasColumnPIIBreakage(e, patches[i]));
  const signals: string[] = [];
  if (triggered) {
    entities.forEach((e, i) => {
      const patch = patches[i];
      if (!patch) return;
      const changedNames = new Set(patch.changedColumns.map(c => c.name.toLowerCase()));
      (e.entity?.columns || [])
        .filter(col =>
          changedNames.has(col.name.toLowerCase()) &&
          (col.tags || []).some(t => SENSITIVE_TAG_PREFIXES.some(p => t.tagFQN.includes(p)))
        )
        .forEach(col => signals.push(`column \`${col.name}\` has ${(col.tags || []).map(t => t.tagFQN).join(', ')}`));
    });
  }
  return {
    id: 'COLUMN_PII_BREAKAGE',
    name: 'PII-tagged column changed and flows downstream',
    reason: triggered
      ? `Changed column(s) carry PII/sensitive tags and flow into downstream systems. Security team must validate data exposure risk.`
      : '',
    triggered,
    severity: 'block',
    requiredTeams: triggered ? [policyConfig.securityTeam || 'security'] : [],
    requiredUsers: [],
    signals: [...new Set(signals)],
  };
}

/**
 * Policy 5: NO_OWNER
 * Entity has no owner in OpenMetadata → hard block (no one to approve)
 */
function evaluateNoOwner(entities: ResolvedEntity[]): ApprovalPolicy {
  const noOwnerEntities = entities.filter(e => e.found && !e.entity?.owner);
  const triggered = noOwnerEntities.length > 0;
  return {
    id: 'NO_OWNER',
    name: 'Asset has no owner in OpenMetadata',
    reason: triggered
      ? `${noOwnerEntities.map(e => e.entity?.name || e.fqn).join(', ')} has no owner assigned in OpenMetadata. Assign an owner before this PR can be approved.`
      : '',
    triggered,
    severity: 'warn',
    requiredTeams: [],
    requiredUsers: [],
    signals: triggered ? noOwnerEntities.map(e => `${e.entity?.name || e.fqn}: no owner`) : [],
  };
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate all built-in approval policies against the PR entities.
 * Returns a full result with triggered policies and merged reviewer requirements.
 */
export function evaluatePolicies(
  entities: ResolvedEntity[],
  patches: PatchAnalysis[],
  config: LineageLockConfig
): PolicyEvaluationResult {
  const policyConfig: PolicyConfig = (config as any).policyConfig || {};

  const all: ApprovalPolicy[] = [
    evaluateTier1Pii(entities, policyConfig),
    evaluateContractDashboard(entities, policyConfig),
    evaluateGlossaryBusinessCritical(entities, policyConfig),
    evaluateColumnPIIBreakage(entities, patches, policyConfig),
    evaluateNoOwner(entities),
  ];

  const triggered = all.filter(p => p.triggered);
  const isBlocked = triggered.some(p => p.severity === 'block');
  const hasWarnings = triggered.some(p => p.severity === 'warn');

  const allRequiredTeams = [...new Set(triggered.flatMap(p => p.requiredTeams))];
  const allRequiredUsers = [...new Set(triggered.flatMap(p => p.requiredUsers))];

  return { policies: all, triggeredPolicies: triggered, isBlocked, hasWarnings, allRequiredTeams, allRequiredUsers };
}
