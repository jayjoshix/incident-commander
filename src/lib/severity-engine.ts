// ============================================================
// Deterministic Severity Scoring Engine
// ============================================================
// Produces a severity score from 0-100 using only metadata
// signals — no LLM, no paid service.

import type { Asset, Severity, SeverityResult, SeveritySignal, TestCaseResult, Owner } from './types';

interface ScoringInput {
  rootAsset: Asset;
  downstreamAssets: Asset[];
  testResults: TestCaseResult[];
  impactedOwners: Owner[];
  impactedTeams: Owner[];
}

/** Map numeric score to severity bucket */
function toSeverity(score: number): Severity {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/** Check if asset or its columns carry sensitive / PII tags */
function hasSensitiveTags(asset: Asset): boolean {
  const sensitive = ['PII', 'Sensitive', 'PersonalData', 'Confidential', 'GDPR', 'HIPAA'];
  const allTags = [
    ...asset.tags.map(t => t.tagFQN),
    ...(asset.columns?.flatMap(c => c.tags.map(t => t.tagFQN)) ?? []),
  ];
  return allTags.some(t => sensitive.some(s => t.toLowerCase().includes(s.toLowerCase())));
}

/** Extract tier number (1 = most critical).  Returns 5 if unset. */
function tierNumber(asset: Asset): number {
  if (!asset.tier) return 5;
  const m = asset.tier.match(/(\d)/);
  return m ? parseInt(m[1], 10) : 5;
}

/** Count recent failures (last 7 days) */
function recentFailures(results: TestCaseResult[]): number {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return results.filter(r => r.status === 'Failed' && r.timestamp >= sevenDaysAgo).length;
}

/** Does the blast radius include dashboards? */
function feedsDashboards(downstreamAssets: Asset[]): boolean {
  return downstreamAssets.some(a => a.type === 'dashboard');
}

/** Does the blast radius include ML models? */
function feedsMLModels(downstreamAssets: Asset[]): boolean {
  return downstreamAssets.some(a => a.type === 'mlmodel');
}

// ---- Scoring functions ----

function scoreDownstreamCount(count: number): SeveritySignal {
  let score = 0;
  if (count >= 20) score = 100;
  else if (count >= 10) score = 80;
  else if (count >= 5) score = 60;
  else if (count >= 2) score = 40;
  else if (count >= 1) score = 20;
  return {
    signal: 'Downstream count',
    description: `${count} downstream asset${count !== 1 ? 's' : ''} affected`,
    score,
    weight: 20,
  };
}

function scoreTier(asset: Asset): SeveritySignal {
  const t = tierNumber(asset);
  const score = Math.max(0, (5 - t) * 25); // Tier1=100, Tier2=75, …
  return {
    signal: 'Asset tier / criticality',
    description: asset.tier ? `Asset is ${asset.tier}` : 'No tier assigned (unknown criticality)',
    score,
    weight: 20,
  };
}

function scoreSensitivity(asset: Asset): SeveritySignal {
  const s = hasSensitiveTags(asset);
  return {
    signal: 'Sensitive / PII data',
    description: s ? 'Asset carries sensitive or PII classifications' : 'No sensitive classifications detected',
    score: s ? 100 : 0,
    weight: 15,
  };
}

function scoreMissingOwner(asset: Asset): SeveritySignal {
  const missing = !asset.owner;
  return {
    signal: 'Owner assignment',
    description: missing ? 'No owner assigned — incident may go unnoticed' : `Owner: ${asset.owner!.displayName}`,
    score: missing ? 80 : 0,
    weight: 10,
  };
}

function scoreRecentFailures(results: TestCaseResult[]): SeveritySignal {
  const count = recentFailures(results);
  let score = 0;
  if (count >= 5) score = 100;
  else if (count >= 3) score = 75;
  else if (count >= 1) score = 40;
  return {
    signal: 'Recent test failures',
    description: `${count} test failure${count !== 1 ? 's' : ''} in last 7 days`,
    score,
    weight: 10,
  };
}

function scoreImpactedTeams(teams: Owner[]): SeveritySignal {
  const count = teams.length;
  let score = 0;
  if (count >= 4) score = 100;
  else if (count >= 2) score = 60;
  else if (count >= 1) score = 30;
  return {
    signal: 'Impacted teams',
    description: `${count} team${count !== 1 ? 's' : ''} impacted`,
    score,
    weight: 15,
  };
}

function scoreDashboardImpact(downstreamAssets: Asset[]): SeveritySignal {
  const feeds = feedsDashboards(downstreamAssets);
  const feedsML = feedsMLModels(downstreamAssets);
  let score = 0;
  const parts: string[] = [];
  if (feeds) { score += 50; parts.push('dashboards'); }
  if (feedsML) { score += 50; parts.push('ML models'); }
  return {
    signal: 'Critical asset impact',
    description: parts.length ? `Feeds into ${parts.join(' and ')}` : 'No dashboards or ML models impacted',
    score,
    weight: 10,
  };
}

// ---- Main scoring function ----

export function calculateSeverity(input: ScoringInput): SeverityResult {
  const signals: SeveritySignal[] = [
    scoreDownstreamCount(input.downstreamAssets.length),
    scoreTier(input.rootAsset),
    scoreSensitivity(input.rootAsset),
    scoreMissingOwner(input.rootAsset),
    scoreRecentFailures(input.testResults),
    scoreImpactedTeams(input.impactedTeams),
    scoreDashboardImpact(input.downstreamAssets),
  ];

  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const weightedSum = signals.reduce((s, sig) => s + sig.score * sig.weight, 0);
  const numericScore = Math.round(weightedSum / totalWeight);

  return {
    overall: toSeverity(numericScore),
    numericScore,
    signals,
  };
}
