// ============================================================
// Mock / Seed Data for Demo Mode
// ============================================================
// Realistic, interconnected metadata that makes the demo
// look strong even without a live OpenMetadata instance.

import type {
  Asset, ChecklistItem, Incident, LineageData, LineageEdge,
  Owner, TestCaseResult, TimelineEvent,
} from '../lib/types';
import { calculateSeverity } from '../lib/severity-engine';

// ================================================================
//  OWNERS & TEAMS
// ================================================================

const owners: Record<string, Owner> = {
  alice: { id: 'u-1', name: 'alice_johnson', displayName: 'Alice Johnson', type: 'user', email: 'alice@acme.io' },
  bob: { id: 'u-2', name: 'bob_chen', displayName: 'Bob Chen', type: 'user', email: 'bob@acme.io' },
  carol: { id: 'u-3', name: 'carol_martinez', displayName: 'Carol Martinez', type: 'user', email: 'carol@acme.io' },
  dave: { id: 'u-4', name: 'dave_kumar', displayName: 'Dave Kumar', type: 'user', email: 'dave@acme.io' },
  dataEng: { id: 't-1', name: 'data-engineering', displayName: 'Data Engineering', type: 'team' },
  analytics: { id: 't-2', name: 'analytics', displayName: 'Analytics', type: 'team' },
  mlTeam: { id: 't-3', name: 'ml-team', displayName: 'ML Team', type: 'team' },
  compliance: { id: 't-4', name: 'compliance', displayName: 'Compliance & Governance', type: 'team' },
  product: { id: 't-5', name: 'product', displayName: 'Product', type: 'team' },
};

// ================================================================
//  ASSETS
// ================================================================

const assets: Record<string, Asset> = {
  // ---- Raw layer ----
  rawOrders: {
    id: 'a-1', name: 'raw_orders', fullyQualifiedName: 'warehouse.raw.orders',
    displayName: 'Raw Orders', type: 'table',
    description: 'Ingested order events from the transactional database. Contains customer PII.',
    owner: owners.alice, service: 'Snowflake', database: 'warehouse', schema: 'raw',
    tier: 'Tier.Tier1',
    tags: [
      { tagFQN: 'PII.Sensitive', labelType: 'Manual', state: 'Confirmed', source: 'Classification' },
      { tagFQN: 'Finance', labelType: 'Manual', state: 'Confirmed', source: 'Classification' },
    ],
    columns: [
      { name: 'order_id', dataType: 'BIGINT', description: 'Primary key', tags: [] },
      { name: 'customer_id', dataType: 'BIGINT', description: 'FK to customers', tags: [] },
      { name: 'customer_email', dataType: 'VARCHAR', description: 'Customer email address',
        tags: [{ tagFQN: 'PII.Sensitive', labelType: 'Manual', state: 'Confirmed', source: 'Classification' }] },
      { name: 'order_total', dataType: 'DECIMAL(12,2)', description: 'Total order value', tags: [] },
      { name: 'order_date', dataType: 'TIMESTAMP', description: 'When order was placed', tags: [] },
      { name: 'status', dataType: 'VARCHAR', description: 'Order status', tags: [] },
    ],
  },

  rawCustomers: {
    id: 'a-2', name: 'raw_customers', fullyQualifiedName: 'warehouse.raw.customers',
    displayName: 'Raw Customers', type: 'table',
    description: 'Customer master data from CRM sync.',
    owner: owners.alice, service: 'Snowflake', database: 'warehouse', schema: 'raw',
    tier: 'Tier.Tier1',
    tags: [
      { tagFQN: 'PII.Sensitive', labelType: 'Manual', state: 'Confirmed', source: 'Classification' },
      { tagFQN: 'GDPR.SubjectData', labelType: 'Manual', state: 'Confirmed', source: 'Classification' },
    ],
    columns: [
      { name: 'customer_id', dataType: 'BIGINT', tags: [] },
      { name: 'full_name', dataType: 'VARCHAR', tags: [{ tagFQN: 'PII.Sensitive', labelType: 'Manual', state: 'Confirmed', source: 'Classification' }] },
      { name: 'email', dataType: 'VARCHAR', tags: [{ tagFQN: 'PII.Sensitive', labelType: 'Manual', state: 'Confirmed', source: 'Classification' }] },
      { name: 'signup_date', dataType: 'DATE', tags: [] },
      { name: 'country', dataType: 'VARCHAR', tags: [] },
    ],
  },

  // ---- Staging / transformed ----
  stgOrders: {
    id: 'a-3', name: 'stg_orders', fullyQualifiedName: 'warehouse.staging.stg_orders',
    displayName: 'Staging Orders', type: 'table',
    description: 'Cleaned and validated order records.',
    owner: owners.bob, service: 'Snowflake', database: 'warehouse', schema: 'staging',
    tier: 'Tier.Tier2',
    tags: [{ tagFQN: 'Finance', labelType: 'Propagated', state: 'Confirmed', source: 'Classification' }],
    columns: [
      { name: 'order_id', dataType: 'BIGINT', tags: [] },
      { name: 'customer_id', dataType: 'BIGINT', tags: [] },
      { name: 'order_total', dataType: 'DECIMAL(12,2)', tags: [] },
      { name: 'order_date', dataType: 'DATE', tags: [] },
      { name: 'status', dataType: 'VARCHAR', tags: [] },
    ],
  },

  stgCustomers: {
    id: 'a-4', name: 'stg_customers', fullyQualifiedName: 'warehouse.staging.stg_customers',
    displayName: 'Staging Customers', type: 'table',
    description: 'Deduplicated customer dimension.',
    owner: owners.bob, service: 'Snowflake', database: 'warehouse', schema: 'staging',
    tier: 'Tier.Tier2',
    tags: [],
    columns: [
      { name: 'customer_id', dataType: 'BIGINT', tags: [] },
      { name: 'full_name', dataType: 'VARCHAR', tags: [] },
      { name: 'country', dataType: 'VARCHAR', tags: [] },
      { name: 'signup_date', dataType: 'DATE', tags: [] },
    ],
  },

  // ---- Analytics / mart layer ----
  dimCustomers: {
    id: 'a-5', name: 'dim_customers', fullyQualifiedName: 'warehouse.analytics.dim_customers',
    displayName: 'Dim Customers', type: 'table',
    description: 'Customer dimension table for analytics.',
    owner: owners.carol, service: 'Snowflake', database: 'warehouse', schema: 'analytics',
    tier: 'Tier.Tier2',
    tags: [],
    columns: [
      { name: 'customer_key', dataType: 'BIGINT', tags: [] },
      { name: 'customer_name', dataType: 'VARCHAR', tags: [] },
      { name: 'country', dataType: 'VARCHAR', tags: [] },
      { name: 'customer_segment', dataType: 'VARCHAR', tags: [] },
    ],
  },

  factOrders: {
    id: 'a-6', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.fact_orders',
    displayName: 'Fact Orders', type: 'table',
    description: 'Order fact table joining orders with customer dimension.',
    owner: owners.carol, service: 'Snowflake', database: 'warehouse', schema: 'analytics',
    tier: 'Tier.Tier1',
    tags: [{ tagFQN: 'Finance', labelType: 'Propagated', state: 'Confirmed', source: 'Classification' }],
    columns: [
      { name: 'order_id', dataType: 'BIGINT', tags: [] },
      { name: 'customer_key', dataType: 'BIGINT', tags: [] },
      { name: 'order_total', dataType: 'DECIMAL(12,2)', tags: [] },
      { name: 'order_date', dataType: 'DATE', tags: [] },
    ],
  },

  revenueMetrics: {
    id: 'a-7', name: 'revenue_daily', fullyQualifiedName: 'warehouse.analytics.revenue_daily',
    displayName: 'Daily Revenue Metrics', type: 'table',
    description: 'Aggregated daily revenue metrics.',
    owner: owners.carol, service: 'Snowflake', database: 'warehouse', schema: 'analytics',
    tier: 'Tier.Tier1',
    tags: [{ tagFQN: 'Finance', labelType: 'Propagated', state: 'Confirmed', source: 'Classification' }],
    columns: [
      { name: 'date', dataType: 'DATE', tags: [] },
      { name: 'total_revenue', dataType: 'DECIMAL(18,2)', tags: [] },
      { name: 'order_count', dataType: 'INT', tags: [] },
      { name: 'avg_order_value', dataType: 'DECIMAL(12,2)', tags: [] },
    ],
  },

  // ---- Dashboards ----
  revenueDashboard: {
    id: 'a-8', name: 'revenue_dashboard', fullyQualifiedName: 'metabase.Revenue Overview',
    displayName: 'Revenue Overview Dashboard', type: 'dashboard',
    description: 'Executive revenue dashboard shared weekly with C-suite.',
    owner: owners.dave, service: 'Metabase',
    tier: 'Tier.Tier1',
    tags: [{ tagFQN: 'Finance', labelType: 'Manual', state: 'Confirmed', source: 'Classification' }],
    columns: [],
  },

  customerDashboard: {
    id: 'a-9', name: 'customer_insights', fullyQualifiedName: 'metabase.Customer Insights',
    displayName: 'Customer Insights Dashboard', type: 'dashboard',
    description: 'Customer behavior and segmentation dashboard.',
    owner: owners.dave, service: 'Metabase',
    tier: 'Tier.Tier2',
    tags: [],
    columns: [],
  },

  // ---- Pipelines ----
  ingestPipeline: {
    id: 'a-10', name: 'orders_ingestion', fullyQualifiedName: 'airflow.orders_ingestion',
    displayName: 'Orders Ingestion Pipeline', type: 'pipeline',
    description: 'Airflow DAG that ingests order data from source DB to raw layer.',
    owner: owners.alice, service: 'Airflow',
    tier: 'Tier.Tier1',
    tags: [],
    columns: [],
  },

  transformPipeline: {
    id: 'a-11', name: 'dbt_transform', fullyQualifiedName: 'airflow.dbt_transform',
    displayName: 'dbt Transform Pipeline', type: 'pipeline',
    description: 'Runs dbt models to build staging and analytics layers.',
    owner: owners.bob, service: 'Airflow',
    tier: 'Tier.Tier2',
    tags: [],
    columns: [],
  },

  // ---- ML model ----
  churnModel: {
    id: 'a-12', name: 'churn_predictor', fullyQualifiedName: 'mlflow.churn_predictor',
    displayName: 'Customer Churn Predictor', type: 'mlmodel',
    description: 'Binary classification model predicting 30-day customer churn.',
    owner: undefined,  // intentionally missing owner
    service: 'MLflow',
    tier: 'Tier.Tier2',
    tags: [],
    columns: [],
  },
};

// ================================================================
//  LINEAGE EDGES
// ================================================================

const lineageEdges: LineageEdge[] = [
  // ingest -> raw
  { fromEntity: assets.ingestPipeline.id, toEntity: assets.rawOrders.id },
  { fromEntity: assets.ingestPipeline.id, toEntity: assets.rawCustomers.id },
  // raw -> staging
  { fromEntity: assets.rawOrders.id, toEntity: assets.stgOrders.id },
  { fromEntity: assets.rawCustomers.id, toEntity: assets.stgCustomers.id },
  // staging -> analytics
  { fromEntity: assets.stgOrders.id, toEntity: assets.factOrders.id },
  { fromEntity: assets.stgCustomers.id, toEntity: assets.dimCustomers.id },
  { fromEntity: assets.dimCustomers.id, toEntity: assets.factOrders.id },
  // analytics -> metrics
  { fromEntity: assets.factOrders.id, toEntity: assets.revenueMetrics.id },
  // analytics -> dashboards
  { fromEntity: assets.revenueMetrics.id, toEntity: assets.revenueDashboard.id },
  { fromEntity: assets.factOrders.id, toEntity: assets.revenueDashboard.id },
  { fromEntity: assets.dimCustomers.id, toEntity: assets.customerDashboard.id },
  // fact -> ml
  { fromEntity: assets.factOrders.id, toEntity: assets.churnModel.id },
  { fromEntity: assets.dimCustomers.id, toEntity: assets.churnModel.id },
  // transform pipeline
  { fromEntity: assets.transformPipeline.id, toEntity: assets.stgOrders.id },
  { fromEntity: assets.transformPipeline.id, toEntity: assets.stgCustomers.id },
];

function buildLineage(rootAsset: Asset): LineageData {
  const nodeIds = new Set<string>([rootAsset.id]);
  const ups: LineageEdge[] = [];
  const downs: LineageEdge[] = [];

  // BFS downstream
  const downQueue = [rootAsset.id];
  while (downQueue.length) {
    const current = downQueue.shift()!;
    for (const e of lineageEdges) {
      if (e.fromEntity === current && !nodeIds.has(e.toEntity)) {
        nodeIds.add(e.toEntity);
        downs.push(e);
        downQueue.push(e.toEntity);
      }
    }
  }

  // BFS upstream
  const upQueue = [rootAsset.id];
  const visitedUp = new Set<string>([rootAsset.id]);
  while (upQueue.length) {
    const current = upQueue.shift()!;
    for (const e of lineageEdges) {
      if (e.toEntity === current && !visitedUp.has(e.fromEntity)) {
        visitedUp.add(e.fromEntity);
        nodeIds.add(e.fromEntity);
        ups.push(e);
        upQueue.push(e.fromEntity);
      }
    }
  }

  const allAssets = Object.values(assets);
  const nodes = allAssets.filter(a => nodeIds.has(a.id));

  return {
    entity: rootAsset,
    nodes,
    edges: [...ups, ...downs],
    upstreamEdges: ups,
    downstreamEdges: downs,
  };
}

// ================================================================
//  TEST CASE RESULTS
// ================================================================

const now = Date.now();
const hour = 3_600_000;
const day = 86_400_000;

const testResults: Record<string, TestCaseResult[]> = {
  'a-1': [
    { id: 'tr-1', testCaseName: 'column_values_not_null(order_id)', testSuiteName: 'raw_orders_suite',
      entityLink: '<#E::table::warehouse.raw.orders>', status: 'Failed', timestamp: now - 2 * hour,
      result: '14 null values found in order_id column' },
    { id: 'tr-2', testCaseName: 'column_values_not_null(customer_email)', testSuiteName: 'raw_orders_suite',
      entityLink: '<#E::table::warehouse.raw.orders>', status: 'Failed', timestamp: now - 3 * hour,
      result: '238 null values found in customer_email column' },
    { id: 'tr-3', testCaseName: 'table_row_count_between(1000, 1000000)', testSuiteName: 'raw_orders_suite',
      entityLink: '<#E::table::warehouse.raw.orders>', status: 'Success', timestamp: now - 4 * hour },
    { id: 'tr-4', testCaseName: 'column_values_not_null(order_id)', testSuiteName: 'raw_orders_suite',
      entityLink: '<#E::table::warehouse.raw.orders>', status: 'Failed', timestamp: now - 1 * day,
      result: '3 null values found in order_id column' },
    { id: 'tr-5', testCaseName: 'column_values_unique(order_id)', testSuiteName: 'raw_orders_suite',
      entityLink: '<#E::table::warehouse.raw.orders>', status: 'Failed', timestamp: now - 2 * day,
      result: '7 duplicate order_id values detected' },
  ],
  'a-6': [
    { id: 'tr-6', testCaseName: 'table_row_count_between(10000, 50000000)', testSuiteName: 'fact_orders_suite',
      entityLink: '<#E::table::warehouse.analytics.fact_orders>', status: 'Success', timestamp: now - 6 * hour },
    { id: 'tr-7', testCaseName: 'column_values_in_set(status, [completed, pending, cancelled])', testSuiteName: 'fact_orders_suite',
      entityLink: '<#E::table::warehouse.analytics.fact_orders>', status: 'Success', timestamp: now - 6 * hour },
  ],
};

// ================================================================
//  BUILD INCIDENTS
// ================================================================

function getDownstreamAssets(rootId: string): Asset[] {
  const visited = new Set<string>();
  const queue = [rootId];
  const result: Asset[] = [];
  const allAssets = Object.values(assets);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of lineageEdges) {
      if (e.fromEntity === id && !visited.has(e.toEntity)) {
        visited.add(e.toEntity);
        const a = allAssets.find(x => x.id === e.toEntity);
        if (a) { result.push(a); queue.push(a.id); }
      }
    }
  }
  return result;
}

function gatherImpactedOwners(affectedAssets: Asset[]): { owners: Owner[]; teams: Owner[] } {
  const ownersMap = new Map<string, Owner>();
  const teamsMap = new Map<string, Owner>();
  for (const a of affectedAssets) {
    if (a.owner) {
      if (a.owner.type === 'team') teamsMap.set(a.owner.id, a.owner);
      else ownersMap.set(a.owner.id, a.owner);
    }
  }
  return { owners: [...ownersMap.values()], teams: [...teamsMap.values()] };
}

function blastRadius(affected: Asset[]) {
  const br = { tables: 0, dashboards: 0, pipelines: 0, topics: 0, mlmodels: 0, total: 0 };
  for (const a of affected) {
    if (a.type === 'table') br.tables++;
    else if (a.type === 'dashboard') br.dashboards++;
    else if (a.type === 'pipeline') br.pipelines++;
    else if (a.type === 'topic') br.topics++;
    else if (a.type === 'mlmodel') br.mlmodels++;
  }
  br.total = affected.length;
  return br;
}

function makeChecklist(type: string): ChecklistItem[] {
  const base: ChecklistItem[] = [
    { id: 'c-1', label: 'Identify root cause of the failure', checked: false, category: 'investigate' },
    { id: 'c-2', label: 'Check upstream pipeline logs for errors', checked: false, category: 'investigate' },
    { id: 'c-3', label: 'Verify data freshness in source system', checked: false, category: 'investigate' },
    { id: 'c-4', label: 'Notify impacted data owners', checked: false, category: 'communicate' },
    { id: 'c-5', label: 'Post incident update in #data-incidents Slack channel', checked: false, category: 'communicate' },
    { id: 'c-6', label: 'Apply hotfix or re-run affected pipeline', checked: false, category: 'mitigate' },
    { id: 'c-7', label: 'Validate downstream data after fix', checked: false, category: 'mitigate' },
    { id: 'c-8', label: 'Re-run failed test cases to confirm resolution', checked: false, category: 'resolve' },
    { id: 'c-9', label: 'Update incident status and close', checked: false, category: 'resolve' },
    { id: 'c-10', label: 'Document lessons learned', checked: false, category: 'resolve' },
  ];

  if (type === 'schema_drift') {
    base.splice(2, 0, {
      id: 'c-sd-1', label: 'Compare current schema with last known schema version', checked: false, category: 'investigate',
    });
    base.splice(6, 0, {
      id: 'c-sd-2', label: 'Update downstream dbt models / transformations', checked: false, category: 'mitigate',
    });
  }

  if (type === 'pipeline_failure') {
    base.splice(1, 0, {
      id: 'c-pf-1', label: 'Check Airflow task instance logs', checked: false, category: 'investigate',
    });
  }

  return base;
}

function makeTimeline(type: string, createdAt: string): TimelineEvent[] {
  const created = new Date(createdAt).getTime();
  return [
    { id: 'te-1', timestamp: new Date(created).toISOString(), type: 'created',
      description: `Incident auto-created from ${type.replace('_', ' ')} detection`, actor: 'system' },
    { id: 'te-2', timestamp: new Date(created + 5 * 60_000).toISOString(), type: 'severity_change',
      description: 'Severity calculated by scoring engine', actor: 'system' },
    { id: 'te-3', timestamp: new Date(created + 12 * 60_000).toISOString(), type: 'owner_assigned',
      description: 'Routed to asset owner based on metadata', actor: 'system' },
    { id: 'te-4', timestamp: new Date(created + 30 * 60_000).toISOString(), type: 'status_change',
      description: 'Status changed to Investigating', actor: 'On-call engineer' },
    { id: 'te-5', timestamp: new Date(created + 90 * 60_000).toISOString(), type: 'comment',
      description: 'Root cause identified: upstream CDC connector dropped records due to timeout', actor: 'Alice Johnson' },
  ];
}

// ---- Build the three demo incidents ----

function buildIncident1(): Incident {
  const root = assets.rawOrders;
  const affected = getDownstreamAssets(root.id);
  const allAffected = [root, ...affected];
  const { owners: io, teams: it } = gatherImpactedOwners(allAffected);
  const tr = testResults['a-1'] ?? [];
  const severity = calculateSeverity({
    rootAsset: root,
    downstreamAssets: affected,
    testResults: tr,
    impactedOwners: io,
    impactedTeams: it,
  });
  const created = new Date(now - 2 * hour).toISOString();

  return {
    id: 'inc-1',
    title: 'Null values detected in raw_orders.order_id',
    type: 'data_quality',
    status: 'investigating',
    severity: severity.overall,
    severityResult: severity,
    rootAsset: root,
    affectedAssets: affected,
    impactedOwners: io,
    impactedTeams: it,
    testResults: tr,
    checklist: makeChecklist('data_quality'),
    blastRadius: blastRadius(affected),
    lineage: buildLineage(root),
    createdAt: created,
    updatedAt: new Date(now - 30 * 60_000).toISOString(),
    timeline: makeTimeline('data_quality', created),
  };
}

function buildIncident2(): Incident {
  const root = assets.stgCustomers;
  const affected = getDownstreamAssets(root.id);
  const allAffected = [root, ...affected];
  const { owners: io, teams: it } = gatherImpactedOwners(allAffected);
  const severity = calculateSeverity({
    rootAsset: root,
    downstreamAssets: affected,
    testResults: [],
    impactedOwners: io,
    impactedTeams: it,
  });
  const created = new Date(now - 5 * hour).toISOString();

  return {
    id: 'inc-2',
    title: 'Schema drift detected in stg_customers — column "loyalty_tier" added',
    type: 'schema_drift',
    status: 'open',
    severity: severity.overall,
    severityResult: severity,
    rootAsset: root,
    affectedAssets: affected,
    impactedOwners: io,
    impactedTeams: it,
    testResults: [],
    checklist: makeChecklist('schema_drift'),
    blastRadius: blastRadius(affected),
    lineage: buildLineage(root),
    createdAt: created,
    updatedAt: created,
    timeline: [
      { id: 'te-sd-1', timestamp: created, type: 'created',
        description: 'Schema change detected by OpenMetadata profiler', actor: 'system' },
      { id: 'te-sd-2', timestamp: new Date(new Date(created).getTime() + 10 * 60_000).toISOString(),
        type: 'comment', description: 'New column loyalty_tier (VARCHAR) appeared in source', actor: 'system' },
    ],
  };
}

function buildIncident3(): Incident {
  const root = assets.ingestPipeline;
  const affected = getDownstreamAssets(root.id);
  const allAffected = [root, ...affected];
  const { owners: io, teams: it } = gatherImpactedOwners(allAffected);
  const allTestResults = [...(testResults['a-1'] ?? []), ...(testResults['a-6'] ?? [])];
  const severity = calculateSeverity({
    rootAsset: root,
    downstreamAssets: affected,
    testResults: allTestResults,
    impactedOwners: io,
    impactedTeams: it,
  });
  const created = new Date(now - 12 * hour).toISOString();

  return {
    id: 'inc-3',
    title: 'Orders ingestion pipeline failed — Airflow DAG timeout',
    type: 'pipeline_failure',
    status: 'mitigating',
    severity: severity.overall,
    severityResult: severity,
    rootAsset: root,
    affectedAssets: affected,
    impactedOwners: io,
    impactedTeams: it,
    testResults: allTestResults,
    checklist: (() => {
      const cl = makeChecklist('pipeline_failure');
      cl[0].checked = true;
      cl[1].checked = true;
      cl[2].checked = true;
      return cl;
    })(),
    blastRadius: blastRadius(affected),
    lineage: buildLineage(root),
    createdAt: created,
    updatedAt: new Date(now - 1 * hour).toISOString(),
    timeline: [
      ...makeTimeline('pipeline_failure', created),
      { id: 'te-pf-6', timestamp: new Date(new Date(created).getTime() + 3 * hour).toISOString(),
        type: 'status_change', description: 'Status changed to Mitigating — pipeline restarted with increased timeout', actor: 'Alice Johnson' },
    ],
  };
}

// ================================================================
//  EXPORTS
// ================================================================

export function getMockIncidents(): Incident[] {
  return [buildIncident1(), buildIncident2(), buildIncident3()];
}

export function getMockIncident(id: string): Incident | undefined {
  return getMockIncidents().find(i => i.id === id);
}

export { assets as mockAssets, owners as mockOwners };
