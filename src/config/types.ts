/**
 * LineageLock Configuration Types
 *
 * Defines the shape of .lineagelock.json and runtime config.
 */

/** Path glob patterns for detecting data-model changes in PRs */
export interface PathPatterns {
  /** SQL model files (e.g., dbt models) */
  sql: string[];
  /** Schema/YAML files (e.g., dbt schema.yml) */
  yaml: string[];
}

/** OpenMetadata naming convention for resolving files → entities */
export interface NamingConvention {
  /** OpenMetadata service name (e.g., "bigquery" or "snowflake") */
  service: string;
  /** Database name */
  database: string;
  /** Schema name */
  schema: string;
  /**
   * Strategy for deriving entity name from file path.
   * - "filename": use the file's basename without extension
   * - "path": use the relative path with "/" replaced by "."
   */
  nameStrategy: 'filename' | 'path';
  /** Optional prefix to strip from the resolved name */
  stripPrefix?: string;
}

/** Explicit file-to-entity mapping override */
export interface AssetMapping {
  /** Glob pattern matching repo files */
  filePattern: string;
  /** OpenMetadata FQN template. Supports {name} placeholder. */
  fqn: string;
}

/** Tags/classifications considered sensitive for risk scoring */
export interface SensitiveTagConfig {
  /** Tag FQNs or partial matches that flag sensitive data */
  keywords: string[];
}

/** Threshold configuration for pass/warn/fail decisions */
export interface ThresholdConfig {
  /** Score at or above which the result is WARN (default: 30) */
  warn: number;
  /** Score at or above which the result is FAIL (default: 70) */
  fail: number;
}

/** Weight configuration for risk score components */
export interface RiskWeights {
  contractViolation: number;
  criticalTier: number;
  sensitiveTags: number;
  downstreamDashboards: number;
  downstreamMlModels: number;
  highDownstreamCount: number;
  noOwner: number;
}

/** Root configuration file shape (.lineagelock.json) */
export interface LineageLockConfig {
  /** Path patterns to watch for changes */
  paths: PathPatterns;
  /** Default OpenMetadata naming convention */
  naming: NamingConvention;
  /** Explicit file → entity mappings (checked before convention) */
  mappings?: AssetMapping[];
  /** Sensitive tag configuration */
  sensitiveTags: SensitiveTagConfig;
  /** Tier values considered critical (e.g., ["Tier1", "Tier2"]) */
  criticalTiers: string[];
  /** Threshold for downstream count to be considered "high" */
  highDownstreamThreshold: number;
  /** Pass/warn/fail thresholds */
  thresholds: ThresholdConfig;
  /** Risk score weights */
  weights: RiskWeights;
  /** Whether to treat unresolved assets as errors in the report */
  failOnUnresolved: boolean;
}

/** Default configuration values */
export const DEFAULT_CONFIG: LineageLockConfig = {
  paths: {
    sql: ['models/**/*.sql', 'sql/**/*.sql'],
    yaml: ['models/**/*.yml', 'models/**/*.yaml', 'schemas/**/*.yml'],
  },
  naming: {
    service: 'default',
    database: 'default',
    schema: 'public',
    nameStrategy: 'filename',
  },
  mappings: [],
  sensitiveTags: {
    keywords: ['PII', 'GDPR', 'Confidential', 'Sensitive', 'PHI', 'PCI'],
  },
  criticalTiers: ['Tier1', 'Tier2', 'Tier.Tier1', 'Tier.Tier2'],
  highDownstreamThreshold: 5,
  thresholds: {
    warn: 30,
    fail: 70,
  },
  weights: {
    contractViolation: 40,
    criticalTier: 20,
    sensitiveTags: 20,
    downstreamDashboards: 10,
    downstreamMlModels: 10,
    highDownstreamCount: 10,
    noOwner: 10,
  },
  failOnUnresolved: false,
};
