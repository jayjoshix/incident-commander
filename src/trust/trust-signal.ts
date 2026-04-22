/**
 * Trust Signal
 *
 * Computes a lightweight, honest repo/run trust summary from available metadata.
 * No historical database required — works from a single analysis run.
 */

import { ResolvedEntity } from '../openmetadata/types';
import { RiskReport } from '../risk/types';
import { PolicyEvaluationResult } from '../policy/types';

export type TrustGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface TrustDimension {
  name: string;
  score: number;        // 0–100
  grade: TrustGrade;
  detail: string;
}

export interface TrustSignal {
  overallScore: number;
  overallGrade: TrustGrade;
  dimensions: TrustDimension[];
  summary: string;
  /** Top risks driving a low trust score */
  topRisks: string[];
}

/**
 * Compute trust signal from the current analysis run.
 */
export function computeTrustSignal(
  entities: ResolvedEntity[],
  report: RiskReport,
  policyResult: PolicyEvaluationResult
): TrustSignal {
  const resolved = entities.filter(e => e.found);
  if (resolved.length === 0) {
    return {
      overallScore: 0,
      overallGrade: 'F',
      dimensions: [],
      summary: 'No entities resolved — cannot compute trust signal.',
      topRisks: ['All entities unresolved in OpenMetadata'],
    };
  }

  // Dimension 1: Owner coverage
  const owned = resolved.filter(e => !!e.entity?.owner).length;
  const ownerScore = Math.round((owned / resolved.length) * 100);
  const ownerDim: TrustDimension = {
    name: 'Owner Coverage',
    score: ownerScore,
    grade: scoreToGrade(ownerScore),
    detail: `${owned}/${resolved.length} entities have an assigned owner`,
  };

  // Dimension 2: Contract health
  const withContract = resolved.filter(e => e.contract?.hasContract);
  const contractScore = withContract.length === 0
    ? 50  // no contracts defined = neutral, not penalised
    : Math.round(
        withContract.reduce((sum, e) => {
          const total = e.contract!.totalTests || 1;
          const passing = total - (e.contract!.failingTests || 0);
          return sum + (passing / total);
        }, 0) / withContract.length * 100
      );
  const contractDim: TrustDimension = {
    name: 'Contract Health',
    score: contractScore,
    grade: scoreToGrade(contractScore),
    detail: withContract.length === 0
      ? 'No data contracts defined (define contracts for stronger governance)'
      : `${withContract.filter(e => (e.contract?.failingTests ?? 0) === 0).length}/${withContract.length} contracts passing`,
  };

  // Dimension 3: Observability (quality issues)
  const withQualityIssues = resolved.filter(e => (e.activeQualityIssues?.length ?? 0) > 0);
  const qualityScore = Math.round(
    ((resolved.length - withQualityIssues.length) / resolved.length) * 100
  );
  const qualityDim: TrustDimension = {
    name: 'Quality Observability',
    score: qualityScore,
    grade: scoreToGrade(qualityScore),
    detail: withQualityIssues.length === 0
      ? 'No active quality issues'
      : `${withQualityIssues.length}/${resolved.length} entities have active quality issues`,
  };

  // Dimension 4: Governance trigger density
  const totalPolicies = policyResult.triggeredPolicies.length;
  const blockPolicies = policyResult.triggeredPolicies.filter(p => p.severity === 'block').length;
  // 0 policies → 100, each policy reduces score proportionally
  const govScore = Math.max(0, 100 - (blockPolicies * 30) - ((totalPolicies - blockPolicies) * 10));
  const govDim: TrustDimension = {
    name: 'Governance Posture',
    score: govScore,
    grade: scoreToGrade(govScore),
    detail: totalPolicies === 0
      ? 'No governance policies triggered'
      : `${blockPolicies} blocking + ${totalPolicies - blockPolicies} warning policies triggered`,
  };

  // Dimension 5: Lineage coverage
  // Proxy: entities that have downstream info were successfully lineage-resolved
  const withDownstreamInfo = resolved.filter(e => e.downstream !== undefined);
  const lineageScore = withDownstreamInfo.length === 0 ? 40
    : Math.round((withDownstreamInfo.length / resolved.length) * 100);
  const lineageDim: TrustDimension = {
    name: 'Lineage Coverage',
    score: lineageScore,
    grade: scoreToGrade(lineageScore),
    detail: `${withDownstreamInfo.length}/${resolved.length} entities have lineage data in OpenMetadata`,
  };

  const dimensions = [ownerDim, contractDim, qualityDim, govDim, lineageDim];
  const overallScore = Math.round(
    dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length
  );
  const overallGrade = scoreToGrade(overallScore);

  const topRisks: string[] = [];
  if (ownerScore < 60) topRisks.push(`Low owner coverage (${owned}/${resolved.length} entities owned)`);
  if (contractScore < 60 && withContract.length > 0) topRisks.push(`Contract failures in data quality suite`);
  if (withQualityIssues.length > 0) topRisks.push(`${withQualityIssues.length} entity(ies) with active quality issues`);
  if (blockPolicies > 0) topRisks.push(`${blockPolicies} blocking governance policy(ies) triggered`);
  if (lineageScore < 60) topRisks.push(`Incomplete lineage coverage`);

  const gradeMessages: Record<TrustGrade, string> = {
    A: 'Strong governance posture — well-owned, contracted, and observable.',
    B: 'Good posture with minor gaps. Review flagged items before merging.',
    C: 'Moderate risks present. Policy review and owner assignment recommended.',
    D: 'Significant governance gaps. Address before merging to production.',
    F: 'Critical governance failures. Merge blocked or strongly discouraged.',
  };

  return {
    overallScore,
    overallGrade,
    dimensions,
    summary: gradeMessages[overallGrade],
    topRisks,
  };
}

function scoreToGrade(score: number): TrustGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * Render trust signal as a compact Markdown block for PR comments.
 */
export function renderTrustSignal(trust: TrustSignal): string {
  const gradeColor: Record<TrustGrade, string> = {
    A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '🔴',
  };

  const lines: string[] = [];
  lines.push(`### ${gradeColor[trust.overallGrade]} Trust Signal — Grade ${trust.overallGrade} (${trust.overallScore}/100)`);
  lines.push('');
  lines.push(`> ${trust.summary}`);
  lines.push('');
  lines.push('| Dimension | Score | Grade |');
  lines.push('|-----------|-------|-------|');
  for (const d of trust.dimensions) {
    lines.push(`| ${d.name} | ${d.score}/100 | ${gradeColor[d.grade]} ${d.grade} — ${d.detail} |`);
  }

  if (trust.topRisks.length > 0) {
    lines.push('');
    lines.push('**Top risks:**');
    trust.topRisks.forEach(r => lines.push(`- ⚠️ ${r}`));
  }

  return lines.join('\n');
}
