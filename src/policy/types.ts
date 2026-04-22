/**
 * Approval Policy Types
 *
 * Types for the metadata-driven approval policy engine.
 * Policies are evaluated from OpenMetadata entity signals —
 * tier, tags, glossary terms, contracts, ownership, and lineage.
 */

/** A single triggered or evaluated approval policy */
export interface ApprovalPolicy {
  /** Unique identifier for this policy */
  id: string;
  /** Human-readable policy name */
  name: string;
  /** Explanation of what triggered this policy */
  reason: string;
  /** Whether this policy was triggered for the current PR */
  triggered: boolean;
  /** Severity: 'block' requires explicit approval, 'warn' is advisory */
  severity: 'block' | 'warn';
  /** GitHub team slugs that must approve (e.g. 'data-platform') */
  requiredTeams: string[];
  /** GitHub usernames that must approve */
  requiredUsers: string[];
  /** The OpenMetadata signals that caused this policy to trigger */
  signals: string[];
}

/** Result of evaluating all policies against the PR entities */
export interface PolicyEvaluationResult {
  /** All policies that were evaluated */
  policies: ApprovalPolicy[];
  /** Policies that were triggered */
  triggeredPolicies: ApprovalPolicy[];
  /** Whether any block-severity policy was triggered */
  isBlocked: boolean;
  /** Whether any warn-severity policy was triggered */
  hasWarnings: boolean;
  /** Merged deduplicated list of all required team slugs */
  allRequiredTeams: string[];
  /** Merged deduplicated list of all required user logins */
  allRequiredUsers: string[];
}
