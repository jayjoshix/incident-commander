// ============================================================
// OpenMetadata Incident Commander — Core Types
// ============================================================

export type IncidentType = 'data_quality' | 'schema_drift' | 'pipeline_failure';
export type IncidentStatus = 'open' | 'investigating' | 'mitigating' | 'resolved';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type AssetType = 'table' | 'dashboard' | 'pipeline' | 'topic' | 'mlmodel';

// ---- OpenMetadata entities (simplified) ----

export interface Owner {
  id: string;
  name: string;
  displayName: string;
  type: 'user' | 'team';
  email?: string;
}

export interface Tag {
  tagFQN: string;
  labelType: 'Manual' | 'Propagated' | 'Automated';
  state: 'Confirmed' | 'Suggested';
  source: 'Classification' | 'Glossary';
}

export interface Asset {
  id: string;
  name: string;
  fullyQualifiedName: string;
  displayName: string;
  type: AssetType;
  description?: string;
  owner?: Owner;
  tags: Tag[];
  tier?: string;           // e.g. "Tier.Tier1"
  service?: string;
  database?: string;
  schema?: string;
  columns?: Column[];
}

export interface Column {
  name: string;
  dataType: string;
  description?: string;
  tags: Tag[];
}

// ---- Lineage ----

export interface LineageEdge {
  fromEntity: string;   // asset ID
  toEntity: string;     // asset ID
}

export interface LineageData {
  entity: Asset;
  nodes: Asset[];
  edges: LineageEdge[];
  upstreamEdges: LineageEdge[];
  downstreamEdges: LineageEdge[];
}

// ---- Test results ----

export interface TestCaseResult {
  id: string;
  testCaseName: string;
  testSuiteName: string;
  entityLink: string;
  status: 'Success' | 'Failed' | 'Aborted';
  timestamp: number;
  parameterValues?: { name: string; value: string }[];
  result?: string;
}

// ---- Incident model ----

export interface SeveritySignal {
  signal: string;
  description: string;
  score: number;          // 0-100
  weight: number;         // how much we weigh this
}

export interface SeverityResult {
  overall: Severity;
  numericScore: number;   // 0-100
  signals: SeveritySignal[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  category: 'investigate' | 'mitigate' | 'communicate' | 'resolve';
}

export interface Incident {
  id: string;
  title: string;
  type: IncidentType;
  status: IncidentStatus;
  severity: Severity;
  severityResult: SeverityResult;
  rootAsset: Asset;
  affectedAssets: Asset[];
  impactedOwners: Owner[];
  impactedTeams: Owner[];
  testResults: TestCaseResult[];
  checklist: ChecklistItem[];
  blastRadius: {
    tables: number;
    dashboards: number;
    pipelines: number;
    topics: number;
    mlmodels: number;
    total: number;
  };
  lineage: LineageData;
  createdAt: string;      // ISO timestamp
  updatedAt: string;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'created' | 'status_change' | 'severity_change' | 'owner_assigned' | 'comment' | 'test_result';
  description: string;
  actor?: string;
}
