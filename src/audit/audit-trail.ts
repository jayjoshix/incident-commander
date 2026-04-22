/**
 * Audit Trail
 *
 * Produces a structured, compliance-friendly audit record for every LineageLock run.
 * Written to artifacts/lineagelock-audit.json in CI and surfaced in the PR comment.
 */

import { ResolvedEntity } from '../openmetadata/types';
import { RiskReport } from '../risk/types';
import { PRAggregateRisk } from '../risk/pr-aggregate';
import { PolicyEvaluationResult } from '../policy/types';
import { PatchAnalysis } from '../diff/patch-parser';

export interface AuditPolicyRecord {
  policyId: string;
  policyName: string;
  severity: 'block' | 'warn';
  reason: string;
  signals: string[];
  requiredTeams: string[];
  requiredUsers: string[];
}

export interface AuditEntityRecord {
  filePath: string;
  fqn: string;
  found: boolean;
  score: number;
  level: string;
  tier: string | null;
  owner: string | null;
  ownerType: string | null;
  downstreamTotal: number;
  downstreamDashboards: number;
  downstreamMlModels: number;
  columnImpactCount: number;
  activeQualityIssues: number;
  contractStatus: string;
  glossaryTerms: string[];
  triggeredFactors: string[];
}

export interface AuditTrail {
  /** ISO 8601 timestamp of this run */
  timestamp: string;
  /** Version of LineageLock */
  version: string;
  /** PR context (populated in CI, null in local/demo) */
  prContext: {
    owner: string | null;
    repo: string | null;
    pullNumber: number | null;
    branch: string | null;
    sha: string | null;
  };
  /** Final governance decision */
  decision: 'pass' | 'warn' | 'fail';
  /** Whether any policy blocked the merge */
  isBlocked: boolean;
  /** Final aggregate risk score */
  aggregateScore: number;
  aggregateLevel: string;
  /** Per-entity analysis */
  entities: AuditEntityRecord[];
  /** Triggered approval policies */
  policies: AuditPolicyRecord[];
  /** Reviewer routing */
  routing: {
    requestedUsers: string[];
    requestedTeams: string[];
  };
  /** Labels applied */
  labels: string[];
  /** Observability summary */
  observability: {
    totalActiveQualityIssues: number;
    affectedEntities: string[];
  };
  /** Changed column summary */
  changedColumns: {
    filePath: string;
    columns: string[];
    changeTypes: string[];
  }[];
}

/**
 * Build a complete audit trail record from a LineageLock run.
 */
export function buildAuditTrail(params: {
  entities: ResolvedEntity[];
  report: RiskReport;
  aggregate: PRAggregateRisk;
  policyResult: PolicyEvaluationResult;
  patchAnalyses: PatchAnalysis[];
  reviewerResult: { users: string[]; teams: string[] };
  appliedLabels: string[];
  prContext?: {
    owner?: string;
    repo?: string;
    pullNumber?: number;
    branch?: string;
    sha?: string;
  };
}): AuditTrail {
  const {
    entities, report, aggregate, policyResult,
    patchAnalyses, reviewerResult, appliedLabels, prContext,
  } = params;

  const decision = policyResult.isBlocked ? 'fail'
    : aggregate.escalatedDecision === 'fail' ? 'fail'
    : aggregate.escalatedDecision === 'warn' ? 'warn' : 'pass';

  const auditEntities: AuditEntityRecord[] = entities.map((e, i) => {
    const assessment = report.assessments[i];
    const triggeredFactors = (assessment?.factors || [])
      .filter(f => f.triggered)
      .map(f => f.name);

    return {
      filePath: e.filePath,
      fqn: e.fqn,
      found: e.found,
      score: assessment?.score ?? 0,
      level: assessment?.level ?? 'LOW',
      tier: e.entity?.tier ?? null,
      owner: e.entity?.owner
        ? (e.entity.owner.displayName || e.entity.owner.name)
        : null,
      ownerType: e.entity?.owner?.type ?? null,
      downstreamTotal: e.downstream?.total ?? 0,
      downstreamDashboards: e.downstream?.dashboards?.length ?? 0,
      downstreamMlModels: e.downstream?.mlModels?.length ?? 0,
      columnImpactCount: e.downstream?.columnImpact?.length ?? 0,
      activeQualityIssues: e.activeQualityIssues?.length ?? 0,
      contractStatus: e.contract?.hasContract
        ? `${e.contract.failingTests}/${e.contract.totalTests} failing`
        : 'no-contract',
      glossaryTerms: e.glossaryTerms ?? [],
      triggeredFactors,
    };
  });

  const auditPolicies: AuditPolicyRecord[] = policyResult.triggeredPolicies.map(p => ({
    policyId: p.id,
    policyName: p.name,
    severity: p.severity,
    reason: p.reason,
    signals: p.signals,
    requiredTeams: p.requiredTeams,
    requiredUsers: p.requiredUsers,
  }));

  const affectedByQuality = entities
    .filter(e => (e.activeQualityIssues?.length ?? 0) > 0)
    .map(e => e.fqn);

  const changedColumns = patchAnalyses.map(p => ({
    filePath: p.filePath,
    columns: p.changedColumns.map(c => c.name),
    changeTypes: p.changedColumns.map(c => c.changeType),
  })).filter(c => c.columns.length > 0);

  return {
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    prContext: {
      owner: prContext?.owner ?? null,
      repo: prContext?.repo ?? null,
      pullNumber: prContext?.pullNumber ?? null,
      branch: prContext?.branch ?? null,
      sha: prContext?.sha ?? null,
    },
    decision,
    isBlocked: policyResult.isBlocked,
    aggregateScore: aggregate.aggregateScore,
    aggregateLevel: aggregate.escalatedLevel,
    entities: auditEntities,
    policies: auditPolicies,
    routing: {
      requestedUsers: reviewerResult.users,
      requestedTeams: reviewerResult.teams,
    },
    labels: appliedLabels,
    observability: {
      totalActiveQualityIssues: entities.reduce(
        (sum, e) => sum + (e.activeQualityIssues?.length ?? 0), 0
      ),
      affectedEntities: affectedByQuality,
    },
    changedColumns,
  };
}

/**
 * Render a compact markdown audit summary for inclusion in PR comments.
 */
export function renderAuditSummary(audit: AuditTrail): string {
  const decisionEmoji = audit.isBlocked ? '🚫' : audit.decision === 'fail' ? '🔴' : audit.decision === 'warn' ? '⚠️' : '✅';
  const lines: string[] = [];

  lines.push(`<details>`);
  lines.push(`<summary>📋 Governance Audit Trail — ${audit.timestamp}</summary>`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Decision** | ${decisionEmoji} ${audit.decision.toUpperCase()} |`);
  lines.push(`| **Score** | ${audit.aggregateScore}/100 (${audit.aggregateLevel}) |`);
  lines.push(`| **Policies Triggered** | ${audit.policies.length} |`);
  lines.push(`| **Reviewers Requested** | ${[...audit.routing.requestedUsers, ...audit.routing.requestedTeams.map(t => `team:${t}`)].join(', ') || 'none'} |`);
  lines.push(`| **Labels Applied** | ${audit.labels.join(', ') || 'none'} |`);
  lines.push(`| **Entities Analyzed** | ${audit.entities.length} (${audit.entities.filter(e => e.found).length} resolved) |`);
  lines.push(`| **Active Quality Issues** | ${audit.observability.totalActiveQualityIssues} |`);
  lines.push(`| **Changed Columns** | ${audit.changedColumns.reduce((s, c) => s + c.columns.length, 0)} across ${audit.changedColumns.length} file(s) |`);
  lines.push(`| **Run Timestamp** | \`${audit.timestamp}\` |`);

  if (audit.policies.length > 0) {
    lines.push('');
    lines.push('**Triggered Policies:**');
    for (const p of audit.policies) {
      lines.push(`- ${p.severity === 'block' ? '🚫' : '⚠️'} **${p.policyName}** — ${p.reason.slice(0, 100)}`);
      if (p.signals.length > 0) {
        lines.push(`  - Signals: \`${p.signals.slice(0, 4).join('` · `')}\``);
      }
    }
  }

  lines.push('');
  lines.push(`> 🔒 Full audit record: \`artifacts/lineagelock-audit.json\``);
  lines.push(`</details>`);

  return lines.join('\n');
}
