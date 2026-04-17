/**
 * Risk Scoring Types
 */

/** Individual risk factor contributing to the total score */
export interface RiskFactor {
  /** Human-readable name of the factor */
  name: string;
  /** Points contributed by this factor */
  points: number;
  /** Maximum possible points for this factor */
  maxPoints: number;
  /** Whether this factor was triggered */
  triggered: boolean;
  /** Additional detail about why this factor was triggered */
  detail?: string;
}

/** Risk severity levels */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Decision outcome for the PR */
export type Decision = 'pass' | 'warn' | 'fail';

/** Complete risk assessment for a single entity */
export interface RiskAssessment {
  /** OpenMetadata FQN */
  fqn: string;
  /** Original file path */
  filePath: string;
  /** Total risk score (0-100) */
  score: number;
  /** Risk level derived from score */
  level: RiskLevel;
  /** Individual risk factors */
  factors: RiskFactor[];
  /** Whether the entity was found in OpenMetadata */
  entityFound: boolean;
  /** Error message if the entity could not be resolved */
  error?: string;
}

/** Aggregate risk report across all changed entities */
export interface RiskReport {
  /** Individual entity assessments */
  assessments: RiskAssessment[];
  /** Highest risk score across all entities */
  maxScore: number;
  /** Overall risk level */
  overallLevel: RiskLevel;
  /** Overall decision */
  decision: Decision;
  /** Summary counts */
  summary: {
    totalEntities: number;
    resolvedEntities: number;
    unresolvedEntities: number;
    totalDownstream: number;
    totalDashboards: number;
    totalMlModels: number;
  };
}
