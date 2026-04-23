/**
 * Risk Scoring Engine
 *
 * Computes a deterministic risk score (0-100) for each changed entity
 * based on lineage, governance metadata, and contract status.
 */

import { LineageLockConfig } from '../config/types';
import { ResolvedEntity, TagLabel } from '../openmetadata/types';
import {
  RiskAssessment,
  RiskFactor,
  RiskLevel,
  RiskReport,
  Decision,
} from './types';

/**
 * Score a single resolved entity.
 */
export function scoreEntity(
  entity: ResolvedEntity,
  config: LineageLockConfig
): RiskAssessment {
  const factors: RiskFactor[] = [];
  const w = config.weights;

  if (!entity.found) {
    return {
      fqn: entity.fqn,
      filePath: entity.filePath,
      score: 0,
      level: 'LOW',
      factors: [],
      entityFound: false,
      error: entity.error,
    };
  }

  // Factor 1: Contract violation / breaking schema change
  const contractFactor = evaluateContract(entity, w.contractViolation);
  factors.push(contractFactor);

  // Factor 2: Critical tier
  const tierFactor = evaluateTier(entity, config.criticalTiers, w.criticalTier);
  factors.push(tierFactor);

  // Factor 3: Sensitive tags
  const tagFactor = evaluateSensitiveTags(
    entity,
    config.sensitiveTags.keywords,
    w.sensitiveTags
  );
  factors.push(tagFactor);

  // Factor 4: Downstream dashboards
  const dashboardFactor = evaluateDownstreamDashboards(
    entity,
    w.downstreamDashboards
  );
  factors.push(dashboardFactor);

  // Factor 5: Downstream ML models
  const mlFactor = evaluateDownstreamMlModels(entity, w.downstreamMlModels);
  factors.push(mlFactor);

  // Factor 6: High downstream count
  const highDownstreamFactor = evaluateHighDownstream(
    entity,
    config.highDownstreamThreshold,
    w.highDownstreamCount
  );
  factors.push(highDownstreamFactor);

  // Factor 7: No clear owner
  const ownerFactor = evaluateOwnership(entity, w.noOwner);
  factors.push(ownerFactor);

  // Factor 8: Active quality issues (observability escalation)
  const qualityFactor = evaluateActiveQualityIssues(
    entity,
    w.activeQualityIssues ?? 15
  );
  factors.push(qualityFactor);

  // Sum and cap
  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.min(rawScore, 100);
  const level = scoreToLevel(score);

  return {
    fqn: entity.fqn,
    filePath: entity.filePath,
    score,
    level,
    factors,
    entityFound: true,
  };
}

/**
 * Score multiple entities and produce an aggregate report.
 */
export function scoreEntities(
  entities: ResolvedEntity[],
  config: LineageLockConfig
): RiskReport {
  const assessments = entities.map((e) => scoreEntity(e, config));

  const maxScore = assessments.length > 0
    ? Math.max(...assessments.map((a) => a.score))
    : 0;

  const unresolvedCount = entities.filter((e) => !e.found).length;
  const overallLevel = scoreToLevel(maxScore);
  let decision = computeDecision(maxScore, config);

  // If failOnUnresolved is enabled and there are unresolved entities, escalate to fail
  if (config.failOnUnresolved && unresolvedCount > 0) {
    decision = 'fail';
  }

  // Aggregate summary
  let totalDownstream = 0;
  let totalDashboards = 0;
  let totalMlModels = 0;

  for (const entity of entities) {
    if (entity.downstream) {
      totalDownstream += entity.downstream.total;
      totalDashboards += entity.downstream.dashboards.length;
      totalMlModels += entity.downstream.mlModels.length;
    }
  }

  return {
    assessments,
    maxScore,
    overallLevel,
    decision,
    summary: {
      totalEntities: entities.length,
      resolvedEntities: entities.filter((e) => e.found).length,
      unresolvedEntities: entities.filter((e) => !e.found).length,
      totalDownstream,
      totalDashboards,
      totalMlModels,
    },
  };
}

/**
 * Convert a numeric score to a risk level.
 */
export function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Compute pass/warn/fail decision based on thresholds.
 */
export function computeDecision(
  score: number,
  config: LineageLockConfig
): Decision {
  if (score >= config.thresholds.fail) return 'fail';
  if (score >= config.thresholds.warn) return 'warn';
  return 'pass';
}

// ─── Individual Factor Evaluators ──────────────────────────────────────────

function evaluateContract(
  entity: ResolvedEntity,
  maxPoints: number
): RiskFactor {
  const contract = entity.contract;
  if (contract && contract.hasContract && contract.failingTests > 0) {
    return {
      name: 'Contract Violation',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `${contract.failingTests}/${contract.totalTests} tests failing in ${contract.testSuiteName || 'test suite'}`,
    };
  }
  return {
    name: 'Contract Violation',
    points: 0,
    maxPoints,
    triggered: false,
    detail: contract?.hasContract
      ? `All ${contract.totalTests} tests passing`
      : 'No data contract defined',
  };
}

function evaluateTier(
  entity: ResolvedEntity,
  criticalTiers: string[],
  maxPoints: number
): RiskFactor {
  const tier = entity.entity?.tier;
  if (tier && criticalTiers.some((ct) => tier.includes(ct))) {
    return {
      name: 'Critical Tier Asset',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `Asset is classified as ${tier}`,
    };
  }
  return {
    name: 'Critical Tier Asset',
    points: 0,
    maxPoints,
    triggered: false,
    detail: tier ? `Asset tier: ${tier}` : 'No tier assigned',
  };
}

function evaluateSensitiveTags(
  entity: ResolvedEntity,
  keywords: string[],
  maxPoints: number
): RiskFactor {
  const tags = collectAllTags(entity);
  // Explicit exclusions: tags that look like sensitive keywords but are not
  const NON_SENSITIVE_FQNS = new Set([
    'pii.none', 'pii.nonsensitive', 'pii.non-sensitive', 'pii.public',
  ]);
  // Use segment-boundary matching: split tagFQN on '.' and match each segment
  // This prevents false positives like PII.NonSensitive matching 'PII' keyword
  const sensitiveMatches = tags.filter((tag) => {
    // Exclude known non-sensitive tags
    if (NON_SENSITIVE_FQNS.has(tag.tagFQN.toLowerCase())) return false;
    const segments = tag.tagFQN.split('.');
    return keywords.some((kw) =>
      segments.some((seg) => seg.toLowerCase() === kw.toLowerCase())
    );
  });

  if (sensitiveMatches.length > 0) {
    return {
      name: 'Sensitive Data Tags',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `Found sensitive tags: ${sensitiveMatches.map((t) => t.tagFQN).join(', ')}`,
    };
  }
  return {
    name: 'Sensitive Data Tags',
    points: 0,
    maxPoints,
    triggered: false,
    detail: tags.length > 0
      ? `${tags.length} tags found, none flagged as sensitive`
      : 'No tags on this asset',
  };
}

function evaluateDownstreamDashboards(
  entity: ResolvedEntity,
  maxPoints: number
): RiskFactor {
  const count = entity.downstream?.dashboards.length || 0;
  if (count > 0) {
    return {
      name: 'Downstream Dashboards',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `${count} dashboard(s) depend on this asset`,
    };
  }
  return {
    name: 'Downstream Dashboards',
    points: 0,
    maxPoints,
    triggered: false,
    detail: 'No downstream dashboards detected',
  };
}

function evaluateDownstreamMlModels(
  entity: ResolvedEntity,
  maxPoints: number
): RiskFactor {
  const count = entity.downstream?.mlModels.length || 0;
  if (count > 0) {
    return {
      name: 'Downstream ML Models',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `${count} ML model(s) depend on this asset`,
    };
  }
  return {
    name: 'Downstream ML Models',
    points: 0,
    maxPoints,
    triggered: false,
    detail: 'No downstream ML models detected',
  };
}

function evaluateHighDownstream(
  entity: ResolvedEntity,
  threshold: number,
  maxPoints: number
): RiskFactor {
  const total = entity.downstream?.total || 0;
  if (total >= threshold) {
    return {
      name: 'High Downstream Count',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `${total} downstream entities (threshold: ${threshold})`,
    };
  }
  return {
    name: 'High Downstream Count',
    points: 0,
    maxPoints,
    triggered: false,
    detail: `${total} downstream entities (threshold: ${threshold})`,
  };
}

function evaluateOwnership(
  entity: ResolvedEntity,
  maxPoints: number
): RiskFactor {
  const owner = entity.entity?.owner;
  if (!owner) {
    return {
      name: 'No Clear Owner',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: 'No owner assigned — changes may go unreviewed',
    };
  }
  return {
    name: 'No Clear Owner',
    points: 0,
    maxPoints,
    triggered: false,
    detail: `Owner: ${owner.displayName || owner.name} (${owner.type})`,
  };
}

function evaluateActiveQualityIssues(
  entity: ResolvedEntity,
  maxPoints: number
): RiskFactor {
  const issues = entity.activeQualityIssues || [];
  const count = issues.length;
  if (count > 0) {
    const names = issues.slice(0, 3).map(i => i.name).join(', ');
    return {
      name: 'Active Quality Issues',
      points: maxPoints,
      maxPoints,
      triggered: true,
      detail: `${count} active failing test(s): ${names}${count > 3 ? ` (+${count - 3} more)` : ''}`,
    };
  }
  return {
    name: 'Active Quality Issues',
    points: 0,
    maxPoints,
    triggered: false,
    detail: 'No active quality issues detected',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Collect all tags from entity-level and column-level, deduplicated by tagFQN.
 */
function collectAllTags(entity: ResolvedEntity): TagLabel[] {
  const seen = new Map<string, TagLabel>();
  if (entity.entity?.tags) {
    for (const tag of entity.entity.tags) {
      seen.set(tag.tagFQN, tag);
    }
  }
  if (entity.entity?.columns) {
    for (const col of entity.entity.columns) {
      if (col.tags) {
        for (const tag of col.tags) {
          if (!seen.has(tag.tagFQN)) {
            seen.set(tag.tagFQN, tag);
          }
        }
      }
    }
  }
  return Array.from(seen.values());
}
