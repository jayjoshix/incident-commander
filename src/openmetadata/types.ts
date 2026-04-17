/**
 * OpenMetadata Type Definitions
 *
 * Types representing OpenMetadata API responses used by LineageLock.
 * Based on OpenMetadata REST API v1.
 */

/** Entity reference — lightweight pointer to any OM entity */
export interface EntityReference {
  id: string;
  type: string;
  name: string;
  fullyQualifiedName: string;
  displayName?: string;
  description?: string;
}

/** Owner info attached to an entity */
export interface Owner {
  id: string;
  type: 'user' | 'team';
  name: string;
  fullyQualifiedName: string;
  displayName?: string;
}

/** Tag label on an entity or column */
export interface TagLabel {
  tagFQN: string;
  name?: string;
  description?: string;
  source: 'Classification' | 'Glossary' | string;
  labelType: 'Manual' | 'Propagated' | 'Automated' | 'Derived' | string;
  state: 'Confirmed' | 'Suggested' | string;
}

/** Column definition within a table */
export interface Column {
  name: string;
  dataType: string;
  dataTypeDisplay?: string;
  fullyQualifiedName?: string;
  description?: string;
  tags?: TagLabel[];
  constraint?: string;
}

/** Data contract / test suite summary */
export interface DataContract {
  /** Whether a contract/test suite exists */
  hasContract: boolean;
  /** Name or FQN of the test suite if present */
  testSuiteName?: string;
  /** Number of tests that are currently failing */
  failingTests: number;
  /** Total number of tests */
  totalTests: number;
  /** Individual test results summary */
  tests?: DataContractTest[];
}

export interface DataContractTest {
  name: string;
  status: 'Success' | 'Failed' | 'Aborted' | string;
  description?: string;
}

/** Table entity from OpenMetadata */
export interface TableEntity {
  id: string;
  name: string;
  fullyQualifiedName: string;
  displayName?: string;
  description?: string;
  tableType?: string;
  columns: Column[];
  owner?: Owner;
  tags?: TagLabel[];
  service?: EntityReference;
  database?: EntityReference;
  databaseSchema?: EntityReference;
  /** Tier tag if present */
  tier?: string;
}

/** Lineage edge between two entities */
export interface LineageEdge {
  fromEntity: EntityReference;
  toEntity: EntityReference;
  /** Column-level lineage mappings */
  columnLineage?: Array<{
    fromColumns: string[];
    toColumn: string;
  }>;
}

/** Lineage node in the graph */
export interface LineageNode {
  id: string;
  type: string;
  name: string;
  fullyQualifiedName: string;
  displayName?: string;
}

/** Full lineage response from OpenMetadata */
export interface LineageResponse {
  entity: EntityReference;
  nodes: LineageNode[];
  upstreamEdges: LineageEdge[];
  downstreamEdges: LineageEdge[];
}

/** Categorized downstream impacts */
export interface DownstreamImpact {
  tables: LineageNode[];
  dashboards: LineageNode[];
  mlModels: LineageNode[];
  pipelines: LineageNode[];
  topics: LineageNode[];
  total: number;
}

/** Fully resolved entity context for risk scoring */
export interface ResolvedEntity {
  /** The original file path that triggered this */
  filePath: string;
  /** OpenMetadata FQN used for lookup */
  fqn: string;
  /** Whether the entity was found in OpenMetadata */
  found: boolean;
  /** Table entity metadata (if found) */
  entity?: TableEntity;
  /** Lineage data (if found) */
  lineage?: LineageResponse;
  /** Categorized downstream impact */
  downstream?: DownstreamImpact;
  /** Data contract / test status */
  contract?: DataContract;
  /** Error message if resolution failed */
  error?: string;
}
