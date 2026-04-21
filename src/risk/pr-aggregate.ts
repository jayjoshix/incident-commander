/**
 * PR-Level Aggregate Risk
 *
 * Computes a holistic PR-level risk that goes beyond max-score-of-any-entity.
 * Multiple medium-risk changes can escalate overall review urgency.
 */

import { RiskReport, RiskAssessment, Decision } from './types';
import { ResolvedEntity } from '../openmetadata/types';
import { LineageLockConfig } from '../config/types';
import { PatchAnalysis } from '../diff/patch-parser';

export interface PRAggregateRisk {
  /** The original max-entity score */
  maxEntityScore: number;
  /** Aggregate PR-level score (can be higher than maxEntityScore) */
  aggregateScore: number;
  /** Breakdown of aggregate factors */
  factors: PRAggregateFactor[];
  /** Escalated decision (may override entity-level decision) */
  escalatedDecision: Decision;
}

export interface PRAggregateFactor {
  name: string;
  count: number;
  escalation: number;
  detail: string;
}

/**
 * Compute PR-level aggregate risk from individual entity assessments.
 */
export function computePRAggregate(
  report: RiskReport,
  entities: ResolvedEntity[],
  patchAnalyses: PatchAnalysis[],
  config: LineageLockConfig
): PRAggregateRisk {
  const factors: PRAggregateFactor[] = [];
  let escalation = 0;

  // 1. Multiple medium+ risk entities
  const mediumPlusCount = report.assessments.filter(a => a.score >= 30).length;
  if (mediumPlusCount >= 2) {
    const bump = Math.min((mediumPlusCount - 1) * 5, 15);
    escalation += bump;
    factors.push({
      name: 'Multiple at-risk entities',
      count: mediumPlusCount,
      escalation: bump,
      detail: `${mediumPlusCount} entities at MEDIUM+ risk — compound blast radius`,
    });
  }

  // 2. Multiple contract failures
  const contractFailures = entities.filter(e => e.contract?.hasContract && e.contract.failingTests > 0).length;
  if (contractFailures >= 2) {
    const bump = Math.min(contractFailures * 5, 10);
    escalation += bump;
    factors.push({
      name: 'Multiple contract failures',
      count: contractFailures,
      escalation: bump,
      detail: `${contractFailures} entities have failing data contracts`,
    });
  }

  // 3. Unresolved entities
  const unresolvedCount = entities.filter(e => !e.found).length;
  if (unresolvedCount > 0) {
    const bump = Math.min(unresolvedCount * 3, 10);
    escalation += bump;
    factors.push({
      name: 'Unresolved entities',
      count: unresolvedCount,
      escalation: bump,
      detail: `${unresolvedCount} changed files could not be resolved — blind spots in risk analysis`,
    });
  }

  // 4. Column-level changes detected
  const columnChanges = patchAnalyses.filter(p => p.changedColumns.length > 0);
  const totalChangedColumns = columnChanges.reduce((sum, p) => sum + p.changedColumns.length, 0);
  if (totalChangedColumns >= 3) {
    const bump = Math.min(Math.floor(totalChangedColumns / 2), 10);
    escalation += bump;
    factors.push({
      name: 'High column change count',
      count: totalChangedColumns,
      escalation: bump,
      detail: `${totalChangedColumns} columns changed across ${columnChanges.length} files`,
    });
  }

  // 5. Critical tier changes
  const criticalTierCount = entities.filter(e =>
    e.entity?.tier && config.criticalTiers.some(ct => e.entity!.tier!.includes(ct))
  ).length;
  if (criticalTierCount >= 2) {
    const bump = 10;
    escalation += bump;
    factors.push({
      name: 'Multiple critical-tier assets',
      count: criticalTierCount,
      escalation: bump,
      detail: `${criticalTierCount} Tier 1/Tier 2 assets changed in single PR`,
    });
  }

  const aggregateScore = Math.min(report.maxScore + escalation, 100);

  // Compute escalated decision
  let escalatedDecision = report.decision;
  if (aggregateScore >= config.thresholds.fail && report.decision !== 'fail') {
    escalatedDecision = 'fail';
  } else if (aggregateScore >= config.thresholds.warn && report.decision === 'pass') {
    escalatedDecision = 'warn';
  }

  return {
    maxEntityScore: report.maxScore,
    aggregateScore,
    factors,
    escalatedDecision,
  };
}
