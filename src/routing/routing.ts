/**
 * Risk-Type Routing
 *
 * Routes different risk types to different reviewers/teams based on
 * the nature of the risk detected in OpenMetadata metadata.
 */

import { ResolvedEntity } from '../openmetadata/types';
import { PolicyEvaluationResult } from '../policy/types';
import { RiskReport } from '../risk/types';

export interface RoutingRule {
  /** Human-readable name of this routing rule */
  name: string;
  /** Risk type this rule handles */
  riskType: 'pii' | 'contract' | 'dashboard' | 'no-owner' | 'tier1' | 'quality' | 'glossary';
  /** GitHub team slugs to request review from */
  teams?: string[];
  /** GitHub usernames to request review from */
  users?: string[];
  /** Explanation for why this routing was applied */
  reason: string;
}

export interface RoutingResult {
  users: string[];
  teams: string[];
  routingReasons: Array<{
    riskType: string;
    ruleName: string;
    reason: string;
    assignedTo: string[];
  }>;
}

/** Default routing rules (can be overridden via config) */
export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    name: 'PII / Privacy Governance',
    riskType: 'pii',
    teams: ['privacy-team', 'security'],
    reason: 'Asset contains PII/sensitive classifications — requires privacy team review',
  },
  {
    name: 'Data Contract Quality',
    riskType: 'contract',
    teams: ['data-quality'],
    reason: 'Data contract tests failing — requires data quality team sign-off',
  },
  {
    name: 'Dashboard / BI Impact',
    riskType: 'dashboard',
    teams: ['bi-owners', 'analytics'],
    reason: 'Downstream dashboards affected — requires BI owner review',
  },
  {
    name: 'Unowned Asset',
    riskType: 'no-owner',
    teams: ['platform-admin'],
    reason: 'No owner assigned in OpenMetadata — platform admin must review',
  },
  {
    name: 'Tier-1 Critical Asset',
    riskType: 'tier1',
    teams: ['data-platform'],
    reason: 'Tier 1/2 critical asset — requires data platform team review',
  },
  {
    name: 'Active Quality Issues',
    riskType: 'quality',
    teams: ['data-quality'],
    reason: 'Asset has active failing quality tests — data quality team must resolve first',
  },
  {
    name: 'Business Glossary Impact',
    riskType: 'glossary',
    teams: ['business-owners'],
    reason: 'Business-critical glossary terms affected — business owner review required',
  },
];

/**
 * Determine routing based on detected risk types.
 * Merges with policy-required reviewers and deduplicates.
 */
export function routeByRiskType(
  entities: ResolvedEntity[],
  report: RiskReport,
  policyResult: PolicyEvaluationResult,
  rules: RoutingRule[] = DEFAULT_ROUTING_RULES
): RoutingResult {
  const allUsers = new Set<string>();
  const allTeams = new Set<string>();
  const routingReasons: RoutingResult['routingReasons'] = [];

  // Apply policy-required reviewers first
  policyResult.allRequiredUsers.forEach(u => allUsers.add(u));
  policyResult.allRequiredTeams.forEach(t => allTeams.add(t));

  for (const entity of entities) {
    if (!entity.found) continue;

    // Check each risk type
    const riskTypes = detectRiskTypes(entity, report);

    for (const riskType of riskTypes) {
      const rule = rules.find(r => r.riskType === riskType);
      if (!rule) continue;

      const assignedTo: string[] = [];
      rule.teams?.forEach(t => { allTeams.add(t); assignedTo.push(`team:${t}`); });
      rule.users?.forEach(u => { allUsers.add(u); assignedTo.push(u); });

      // Avoid duplicate routing reason entries for same rule
      const alreadyAdded = routingReasons.some(r => r.riskType === riskType && r.ruleName === rule.name);
      if (!alreadyAdded && assignedTo.length > 0) {
        routingReasons.push({
          riskType,
          ruleName: rule.name,
          reason: rule.reason,
          assignedTo,
        });
      }
    }
  }

  return {
    users: Array.from(allUsers),
    teams: Array.from(allTeams),
    routingReasons,
  };
}

function detectRiskTypes(entity: ResolvedEntity, report: RiskReport): string[] {
  const types: string[] = [];
  const assessment = report.assessments.find(a => a.fqn === entity.fqn);

  // PII detection
  const hasPII = (entity.entity?.tags || []).some(t =>
    ['pii', 'gdpr', 'sensitive', 'confidential'].some(kw =>
      t.tagFQN.toLowerCase().includes(kw)
    )
  );
  if (hasPII) types.push('pii');

  // Contract failure
  if (entity.contract?.hasContract && (entity.contract.failingTests ?? 0) > 0) {
    types.push('contract');
  }

  // Downstream dashboards
  if ((entity.downstream?.dashboards?.length ?? 0) > 0) {
    types.push('dashboard');
  }

  // No owner
  if (!entity.entity?.owner) {
    types.push('no-owner');
  }

  // Tier-1/2
  const tier = entity.entity?.tier ?? '';
  if (tier.includes('Tier1') || tier.includes('Tier2') || tier.includes('Tier.Tier1') || tier.includes('Tier.Tier2')) {
    types.push('tier1');
  }

  // Active quality issues
  if ((entity.activeQualityIssues?.length ?? 0) > 0) {
    types.push('quality');
  }

  // Glossary terms
  if ((entity.glossaryTerms?.length ?? 0) > 0) {
    types.push('glossary');
  }

  return types;
}

/**
 * Render routing reasons as a compact Markdown block.
 */
export function renderRoutingReasons(routing: RoutingResult): string {
  if (routing.routingReasons.length === 0) return '';

  const lines: string[] = [
    '**Routing Reasons:**',
  ];

  for (const r of routing.routingReasons) {
    lines.push(`- 🔀 **${r.ruleName}** → ${r.assignedTo.join(', ')}: *${r.reason}*`);
  }

  return lines.join('\n');
}
