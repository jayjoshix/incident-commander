/**
 * Workflow Automation
 *
 * Extends GitHub integration with:
 * - Reviewer requests based on OpenMetadata owners
 * - PR labels based on risk conditions
 * - Webhook notifications (Slack, Teams, generic)
 *
 * All features are configurable and safe by default (disabled unless opted in).
 * Failures in optional automation do not fail the main action.
 */

import { ResolvedEntity } from '../openmetadata/types';
import { RiskReport, RiskAssessment } from '../risk/types';
import { PRAggregateRisk } from '../risk/pr-aggregate';
import { PatchAnalysis } from '../diff/patch-parser';

// ─── Configuration Types ────────────────────────────────────────────────────

export interface AutomationConfig {
  /** Reviewer routing */
  reviewers?: {
    enabled: boolean;
    /** Map OpenMetadata owner names → GitHub usernames */
    ownerMapping?: Record<string, string>;
    /** Maximum reviewers to request per PR */
    maxReviewers?: number;
  };
  /** Label automation */
  labels?: {
    enabled: boolean;
    /** Custom label names (defaults provided) */
    names?: Partial<LabelNames>;
  };
  /** Notification webhooks */
  notifications?: {
    /** Minimum risk level to trigger notifications */
    minLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    /** Generic webhook URL */
    webhookUrl?: string;
    /** Slack webhook URL */
    slackWebhookUrl?: string;
    /** Teams webhook URL */
    teamsWebhookUrl?: string;
  };
}

export interface LabelNames {
  tier1Change: string;
  piiImpact: string;
  contractRisk: string;
  columnBreakage: string;
  highRisk: string;
  noOwner: string;
}

const DEFAULT_LABELS: LabelNames = {
  tier1Change: 'lineagelock:tier1-change',
  piiImpact: 'lineagelock:pii-impact',
  contractRisk: 'lineagelock:contract-risk',
  columnBreakage: 'lineagelock:column-breakage',
  highRisk: 'lineagelock:high-risk',
  noOwner: 'lineagelock:no-owner',
};

/**
 * Reviewer result with separate users and teams.
 */
export interface ReviewerResult {
  users: string[];
  teams: string[];
}

/**
 * Determine GitHub reviewers from OpenMetadata entity owners.
 * Separates individual users from team owners for correct GitHub API usage.
 */
export function determineReviewers(
  entities: ResolvedEntity[],
  config: AutomationConfig
): ReviewerResult {
  if (!config.reviewers?.enabled) return { users: [], teams: [] };

  const ownerMapping = config.reviewers.ownerMapping || {};
  const maxReviewers = config.reviewers.maxReviewers || 3;
  const users = new Set<string>();
  const teams = new Set<string>();

  for (const entity of entities) {
    if (!entity.entity?.owner) continue;
    const owner = entity.entity.owner;
    const omName = owner.name;
    const mapped = ownerMapping[omName];

    // Determine if this is a team or user owner
    const isTeam = owner.type === 'team';

    if (mapped) {
      // Mapped names go to users (assumed GitHub username)
      users.add(mapped);
    } else if (isTeam) {
      // Team owners → team_reviewers (strip org prefix if present)
      const teamSlug = omName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      if (teamSlug && teamSlug !== 'unknown') {
        teams.add(teamSlug);
      }
    } else {
      // User owners → individual reviewers
      if (omName && omName !== 'unknown') {
        users.add(omName);
      }
    }
  }

  return {
    users: [...users].slice(0, maxReviewers),
    teams: [...teams].slice(0, maxReviewers),
  };
}

// ─── Label Detection ────────────────────────────────────────────────────────

/**
 * Determine PR labels based on risk analysis results.
 * Labels are idempotent — safe to apply on re-runs.
 */
export function determineLabels(
  report: RiskReport,
  entities: ResolvedEntity[],
  patchAnalyses: PatchAnalysis[],
  config: AutomationConfig
): string[] {
  if (!config.labels?.enabled) return [];

  const names = { ...DEFAULT_LABELS, ...config.labels.names };
  const labels: string[] = [];

  // Tier 1/2 change
  const hasCriticalTier = entities.some(e =>
    e.entity?.tier && (e.entity.tier.includes('Tier1') || e.entity.tier.includes('Tier2'))
  );
  if (hasCriticalTier) labels.push(names.tier1Change);

  // PII impact
  const hasPII = entities.some(e => {
    const allTags = [
      ...(e.entity?.tags || []),
      ...(e.entity?.columns || []).flatMap(c => c.tags || []),
    ];
    return allTags.some(t =>
      t.tagFQN.includes('PII.Sensitive') ||
      t.tagFQN.includes('GDPR') ||
      t.tagFQN.includes('PHI') ||
      t.tagFQN.includes('PCI')
    );
  });
  if (hasPII) labels.push(names.piiImpact);

  // Contract risk
  const hasContractFailure = entities.some(e =>
    e.contract?.hasContract && e.contract.failingTests > 0
  );
  if (hasContractFailure) labels.push(names.contractRisk);

  // Column breakage
  const hasColumnChanges = patchAnalyses.some(p => p.changedColumns.length > 0 && p.isStructuralChange);
  if (hasColumnChanges) labels.push(names.columnBreakage);

  // High risk
  if (report.maxScore >= 60) labels.push(names.highRisk);

  // No owner
  const hasNoOwner = entities.some(e => e.found && !e.entity?.owner);
  if (hasNoOwner) labels.push(names.noOwner);

  return labels;
}

// ─── Webhook Notifications ──────────────────────────────────────────────────

export interface NotificationPayload {
  project: string;
  prNumber: number;
  prUrl: string;
  riskScore: number;
  riskLevel: string;
  decision: string;
  entityCount: number;
  downstreamCount: number;
  summary: string;
}

/**
 * Build notification payload from analysis results.
 */
export function buildNotificationPayload(
  report: RiskReport,
  aggregate: PRAggregateRisk,
  prNumber: number,
  prUrl: string
): NotificationPayload {
  return {
    project: 'LineageLock',
    prNumber,
    prUrl,
    riskScore: aggregate.aggregateScore,
    riskLevel: aggregate.escalatedLevel,
    decision: aggregate.escalatedDecision,
    entityCount: report.summary.totalEntities,
    downstreamCount: report.summary.totalDownstream,
    summary: `PR #${prNumber}: ${aggregate.escalatedLevel} risk (${aggregate.aggregateScore}/100) — ${report.summary.totalEntities} entities, ${report.summary.totalDownstream} downstream`,
  };
}

/**
 * Format a Slack webhook message.
 */
export function formatSlackMessage(payload: NotificationPayload): object {
  const emoji = payload.riskLevel === 'CRITICAL' ? '🔴' :
    payload.riskLevel === 'HIGH' ? '🟠' :
    payload.riskLevel === 'MEDIUM' ? '🟡' : '🟢';

  return {
    text: `${emoji} LineageLock: ${payload.summary}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *LineageLock Risk Report*\n*PR #${payload.prNumber}*: ${payload.riskLevel} risk (${payload.riskScore}/100)\n*Decision:* ${payload.decision}\n*Entities:* ${payload.entityCount} analyzed, ${payload.downstreamCount} downstream`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View PR' },
            url: payload.prUrl,
          },
        ],
      },
    ],
  };
}

/**
 * Format a Teams webhook message.
 */
export function formatTeamsMessage(payload: NotificationPayload): object {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: payload.summary,
    themeColor: payload.riskLevel === 'CRITICAL' ? 'FF0000' :
      payload.riskLevel === 'HIGH' ? 'FF8C00' :
      payload.riskLevel === 'MEDIUM' ? 'FFD700' : '00FF00',
    title: `🔒 LineageLock: PR #${payload.prNumber}`,
    sections: [
      {
        facts: [
          { name: 'Risk Score', value: `${payload.riskScore}/100` },
          { name: 'Risk Level', value: payload.riskLevel },
          { name: 'Decision', value: payload.decision },
          { name: 'Entities', value: `${payload.entityCount}` },
          { name: 'Downstream', value: `${payload.downstreamCount}` },
        ],
      },
    ],
    potentialAction: [
      {
        '@type': 'OpenUri',
        name: 'View PR',
        targets: [{ os: 'default', uri: payload.prUrl }],
      },
    ],
  };
}

/**
 * Send webhook notification. Failures are caught and reported, never thrown.
 */
export async function sendWebhook(
  url: string,
  payload: object
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown webhook error' };
  }
}
