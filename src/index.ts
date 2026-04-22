/**
 * LineageLock — Public API
 *
 * Re-exports all modules for use as a library.
 */

// Config
export { loadConfig, validateConfig } from './config/loader';
export type { LineageLockConfig } from './config/types';
export { DEFAULT_CONFIG } from './config/types';

// OpenMetadata
export { OpenMetadataClient } from './openmetadata/client';
export type { OpenMetadataClientConfig } from './openmetadata/client';
export type {
  TableEntity,
  LineageResponse,
  ResolvedEntity,
  DownstreamImpact,
  DataContract,
  Owner,
  TagLabel,
  Column,
} from './openmetadata/types';

// Resolver
export {
  resolveFiles,
  resolveFileToFQN,
  filterDataModelFiles,
  isDataModelFile,
  deriveEntityName,
} from './resolver/asset-resolver';

// Risk
export { scoreEntity, scoreEntities, scoreToLevel, computeDecision } from './risk/scoring';
export type { RiskAssessment, RiskReport, RiskFactor, RiskLevel, Decision } from './risk/types';
export { computePRAggregate } from './risk/pr-aggregate';
export type { PRAggregateRisk } from './risk/pr-aggregate';

// Diff / Patch
export { parsePatch } from './diff/patch-parser';
export type { PatchAnalysis, ChangedColumn } from './diff/patch-parser';

// Automation
export { determineReviewers, determineLabels, buildNotificationPayload } from './automation/workflow';
export type { ReviewerResult, AutomationConfig } from './automation/workflow';

// Report
export { renderReport, renderCompactSummary } from './report/renderer';
export type { RenderContext } from './report/renderer';

// Fixtures
export { DEMO_ENTITIES, DEMO_CHANGED_FILES } from './fixtures/demo-data';
