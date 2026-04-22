/**
 * Demo Fixtures
 *
 * Realistic OpenMetadata responses for local demo and testing.
 * These are based on actual OpenMetadata API response shapes.
 *
 * HONESTY NOTE: These are fixture data for demo/testing purposes.
 * The real integration path uses the OpenMetadata REST API client.
 */

import { ResolvedEntity, TableEntity, LineageResponse, DownstreamImpact, DataContract } from '../openmetadata/types';

// ─── Sample Entities ──────────────────────────────────────────────────────

const FACT_ORDERS_TABLE: TableEntity = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'fact_orders',
  fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
  displayName: 'Fact Orders',
  description: 'Core orders fact table — joins customers, products, and transactions. Source of truth for revenue reporting.',
  tableType: 'Regular',
  columns: [
    { name: 'order_id', dataType: 'BIGINT', dataTypeDisplay: 'bigint', description: 'Primary key', constraint: 'PRIMARY_KEY' },
    { name: 'customer_id', dataType: 'BIGINT', dataTypeDisplay: 'bigint', description: 'FK to dim_customers' },
    { name: 'product_id', dataType: 'BIGINT', dataTypeDisplay: 'bigint', description: 'FK to dim_products' },
    { name: 'order_date', dataType: 'TIMESTAMP', dataTypeDisplay: 'timestamp', description: 'When the order was placed' },
    { name: 'amount', dataType: 'DECIMAL', dataTypeDisplay: 'decimal(18,2)', description: 'Order total in USD' },
    { name: 'status', dataType: 'VARCHAR', dataTypeDisplay: 'varchar(50)', description: 'Order status' },
    {
      name: 'customer_email',
      dataType: 'VARCHAR',
      dataTypeDisplay: 'varchar(255)',
      description: 'Customer email address',
      tags: [
        { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        { tagFQN: 'GDPR.Subject', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      ],
    },
    { name: 'shipping_address', dataType: 'VARCHAR', dataTypeDisplay: 'varchar(500)', description: 'Shipping address',
      tags: [{ tagFQN: 'PersonalData.Address', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
    },
  ],
  owner: {
    id: 'user-001',
    type: 'team',
    name: 'data-engineering',
    fullyQualifiedName: 'data-engineering',
    displayName: 'Data Engineering Team',
  },
  tags: [
    { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    { tagFQN: 'Domain.Revenue', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    { tagFQN: 'DataSensitivity.Confidential', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
  ],
  tier: 'Tier.Tier1',
  service: { id: 'svc-001', type: 'databaseService', name: 'warehouse', fullyQualifiedName: 'warehouse' },
  database: { id: 'db-001', type: 'database', name: 'analytics', fullyQualifiedName: 'warehouse.analytics' },
  databaseSchema: { id: 'sch-001', type: 'databaseSchema', name: 'public', fullyQualifiedName: 'warehouse.analytics.public' },
};

const STG_PAYMENTS_TABLE: TableEntity = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  name: 'stg_payments',
  fullyQualifiedName: 'warehouse.analytics.staging.stg_payments',
  displayName: 'Staging Payments',
  description: 'Staging model for raw payment data. Cleaned and deduplicated.',
  tableType: 'Regular',
  columns: [
    { name: 'payment_id', dataType: 'BIGINT', dataTypeDisplay: 'bigint', constraint: 'PRIMARY_KEY' },
    { name: 'order_id', dataType: 'BIGINT', dataTypeDisplay: 'bigint' },
    { name: 'payment_method', dataType: 'VARCHAR', dataTypeDisplay: 'varchar(50)' },
    { name: 'amount', dataType: 'DECIMAL', dataTypeDisplay: 'decimal(18,2)' },
    { name: 'created_at', dataType: 'TIMESTAMP', dataTypeDisplay: 'timestamp' },
  ],
  owner: undefined, // No owner — triggers risk factor
  tags: [],
  tier: undefined,
  service: { id: 'svc-001', type: 'databaseService', name: 'warehouse', fullyQualifiedName: 'warehouse' },
  database: { id: 'db-001', type: 'database', name: 'analytics', fullyQualifiedName: 'warehouse.analytics' },
  databaseSchema: { id: 'sch-002', type: 'databaseSchema', name: 'staging', fullyQualifiedName: 'warehouse.analytics.staging' },
};

// ─── Lineage Responses ────────────────────────────────────────────────────

const FACT_ORDERS_LINEAGE: LineageResponse = {
  entity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
  nodes: [
    // Upstream
    { id: 'up-001', type: 'table', name: 'raw_orders', fullyQualifiedName: 'warehouse.raw.public.raw_orders' },
    { id: 'up-002', type: 'table', name: 'raw_customers', fullyQualifiedName: 'warehouse.raw.public.raw_customers' },
    // Downstream tables
    { id: 'dn-001', type: 'table', name: 'agg_daily_revenue', fullyQualifiedName: 'warehouse.analytics.public.agg_daily_revenue' },
    { id: 'dn-002', type: 'table', name: 'agg_customer_ltv', fullyQualifiedName: 'warehouse.analytics.public.agg_customer_ltv' },
    { id: 'dn-003', type: 'table', name: 'dim_order_details', fullyQualifiedName: 'warehouse.analytics.public.dim_order_details' },
    // Downstream dashboards
    { id: 'dn-dash-001', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' },
    { id: 'dn-dash-002', type: 'dashboard', name: 'Executive KPIs', fullyQualifiedName: 'superset.Executive KPIs' },
    // Downstream ML model
    { id: 'dn-ml-001', type: 'mlmodel', name: 'churn_predictor', fullyQualifiedName: 'mlflow.churn_predictor' },
    // Downstream pipeline
    { id: 'dn-pipe-001', type: 'pipeline', name: 'nightly_reports', fullyQualifiedName: 'airflow.nightly_reports' },
  ],
  upstreamEdges: [
    {
      fromEntity: { id: 'up-001', type: 'table', name: 'raw_orders', fullyQualifiedName: 'warehouse.raw.public.raw_orders' },
      toEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
    },
    {
      fromEntity: { id: 'up-002', type: 'table', name: 'raw_customers', fullyQualifiedName: 'warehouse.raw.public.raw_customers' },
      toEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
    },
  ],
  downstreamEdges: [
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-001', type: 'table', name: 'agg_daily_revenue', fullyQualifiedName: 'warehouse.analytics.public.agg_daily_revenue' },
    },
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-002', type: 'table', name: 'agg_customer_ltv', fullyQualifiedName: 'warehouse.analytics.public.agg_customer_ltv' },
    },
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-003', type: 'table', name: 'dim_order_details', fullyQualifiedName: 'warehouse.analytics.public.dim_order_details' },
    },
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-dash-001', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' },
    },
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-dash-002', type: 'dashboard', name: 'Executive KPIs', fullyQualifiedName: 'superset.Executive KPIs' },
    },
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-ml-001', type: 'mlmodel', name: 'churn_predictor', fullyQualifiedName: 'mlflow.churn_predictor' },
    },
    {
      fromEntity: { id: FACT_ORDERS_TABLE.id, type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
      toEntity: { id: 'dn-pipe-001', type: 'pipeline', name: 'nightly_reports', fullyQualifiedName: 'airflow.nightly_reports' },
    },
  ],
};

const STG_PAYMENTS_LINEAGE: LineageResponse = {
  entity: { id: STG_PAYMENTS_TABLE.id, type: 'table', name: 'stg_payments', fullyQualifiedName: 'warehouse.analytics.staging.stg_payments' },
  nodes: [
    { id: 'up-pay-001', type: 'table', name: 'raw_payments', fullyQualifiedName: 'warehouse.raw.public.raw_payments' },
    { id: 'dn-pay-001', type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
  ],
  upstreamEdges: [
    {
      fromEntity: { id: 'up-pay-001', type: 'table', name: 'raw_payments', fullyQualifiedName: 'warehouse.raw.public.raw_payments' },
      toEntity: { id: STG_PAYMENTS_TABLE.id, type: 'table', name: 'stg_payments', fullyQualifiedName: 'warehouse.analytics.staging.stg_payments' },
    },
  ],
  downstreamEdges: [
    {
      fromEntity: { id: STG_PAYMENTS_TABLE.id, type: 'table', name: 'stg_payments', fullyQualifiedName: 'warehouse.analytics.staging.stg_payments' },
      toEntity: { id: 'dn-pay-001', type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
    },
  ],
};

// ─── Downstream Impact ────────────────────────────────────────────────────

const FACT_ORDERS_DOWNSTREAM: DownstreamImpact = {
  tables: [
    { id: 'dn-001', type: 'table', name: 'agg_daily_revenue', fullyQualifiedName: 'warehouse.analytics.public.agg_daily_revenue' },
    { id: 'dn-002', type: 'table', name: 'agg_customer_ltv', fullyQualifiedName: 'warehouse.analytics.public.agg_customer_ltv' },
    { id: 'dn-003', type: 'table', name: 'dim_order_details', fullyQualifiedName: 'warehouse.analytics.public.dim_order_details' },
  ],
  dashboards: [
    { id: 'dn-dash-001', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' },
    { id: 'dn-dash-002', type: 'dashboard', name: 'Executive KPIs', fullyQualifiedName: 'superset.Executive KPIs' },
  ],
  mlModels: [
    { id: 'dn-ml-001', type: 'mlmodel', name: 'churn_predictor', fullyQualifiedName: 'mlflow.churn_predictor' },
  ],
  pipelines: [
    { id: 'dn-pipe-001', type: 'pipeline', name: 'nightly_reports', fullyQualifiedName: 'airflow.nightly_reports' },
  ],
  topics: [],
  total: 7,
  columnImpact: [
    { fromColumns: ['warehouse.analytics.public.fact_orders.amount'], toColumn: 'warehouse.analytics.public.agg_daily_revenue.total_revenue', toEntity: 'warehouse.analytics.public.agg_daily_revenue' },
    { fromColumns: ['warehouse.analytics.public.fact_orders.customer_id'], toColumn: 'warehouse.analytics.public.agg_customer_ltv.customer_id', toEntity: 'warehouse.analytics.public.agg_customer_ltv' },
    { fromColumns: ['warehouse.analytics.public.fact_orders.order_id', 'warehouse.analytics.public.fact_orders.amount'], toColumn: 'warehouse.analytics.public.dim_order_details.order_total', toEntity: 'warehouse.analytics.public.dim_order_details' },
  ],
};

const STG_PAYMENTS_DOWNSTREAM: DownstreamImpact = {
  tables: [
    { id: 'dn-pay-001', type: 'table', name: 'fact_orders', fullyQualifiedName: 'warehouse.analytics.public.fact_orders' },
  ],
  dashboards: [],
  mlModels: [],
  pipelines: [],
  topics: [],
  total: 1,
  columnImpact: [],
};

// ─── Data Contracts ───────────────────────────────────────────────────────

const FACT_ORDERS_CONTRACT: DataContract = {
  hasContract: true,
  testSuiteName: 'fact_orders_contract_suite',
  failingTests: 1,
  totalTests: 4,
  tests: [
    { name: 'column_count_check', status: 'Success', description: 'Ensures column count matches expected schema' },
    { name: 'not_null_order_id', status: 'Success', description: 'order_id must not be null' },
    { name: 'amount_positive', status: 'Failed', description: 'All order amounts must be positive' },
    { name: 'freshness_check', status: 'Success', description: 'Data must be less than 24h old' },
  ],
};

const STG_PAYMENTS_CONTRACT: DataContract = {
  hasContract: false,
  failingTests: 0,
  totalTests: 0,
};

// ─── Public Demo Data ─────────────────────────────────────────────────────

/** Demo scenario: changing a Tier 1 fact table with PII and downstream dashboards */
export const DEMO_FACT_ORDERS: ResolvedEntity = {
  filePath: 'models/marts/fact_orders.sql',
  fqn: 'warehouse.analytics.public.fact_orders',
  found: true,
  entity: FACT_ORDERS_TABLE,
  lineage: FACT_ORDERS_LINEAGE,
  downstream: FACT_ORDERS_DOWNSTREAM,
  contract: FACT_ORDERS_CONTRACT,
  glossaryTerms: ['Glossary.Revenue', 'Glossary.CustomerData'],
  activeQualityIssues: [
    {
      name: 'amount_positive',
      status: 'Failed',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      failureReason: 'Found 142 rows where amount <= 0 (expected: all positive)',
      testSuite: 'fact_orders_contract_suite',
    },
    {
      name: 'freshness_check',
      status: 'Failed',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
      failureReason: 'Table not updated in 8 hours (SLA: 6 hours)',
      testSuite: 'fact_orders_contract_suite',
    },
  ],
};

/** Demo scenario: changing a staging table with no owner */
export const DEMO_STG_PAYMENTS: ResolvedEntity = {
  filePath: 'models/staging/stg_payments.sql',
  fqn: 'warehouse.analytics.staging.stg_payments',
  found: true,
  entity: STG_PAYMENTS_TABLE,
  lineage: STG_PAYMENTS_LINEAGE,
  downstream: STG_PAYMENTS_DOWNSTREAM,
  contract: STG_PAYMENTS_CONTRACT,
};

/** Demo scenario: unresolved entity */
export const DEMO_UNRESOLVED: ResolvedEntity = {
  filePath: 'models/staging/stg_inventory.sql',
  fqn: 'warehouse.analytics.staging.stg_inventory',
  found: false,
  error: 'Entity not found in OpenMetadata: warehouse.analytics.staging.stg_inventory',
};

/** All demo entities for the default demo scenario */
export const DEMO_ENTITIES: ResolvedEntity[] = [
  DEMO_FACT_ORDERS,
  DEMO_STG_PAYMENTS,
  DEMO_UNRESOLVED,
];

/** Demo changed files (simulating a PR) */
export const DEMO_CHANGED_FILES: string[] = [
  'models/marts/fact_orders.sql',
  'models/staging/stg_payments.sql',
  'models/staging/stg_inventory.sql',
  'README.md', // Should be filtered out
  'dbt_project.yml', // Should be filtered out
];
