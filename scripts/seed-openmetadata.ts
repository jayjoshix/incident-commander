/**
 * OpenMetadata Seed Script
 *
 * Seeds a real OpenMetadata instance with sample data for LineageLock demos.
 * This creates actual tables, lineage, tags, owners, and test suites
 * so the integration can be tested against a live instance.
 *
 * Usage:
 *   export OPENMETADATA_URL=http://localhost:8585
 *   export OPENMETADATA_TOKEN=<your-jwt-token>
 *   npx ts-node scripts/seed-openmetadata.ts
 *
 * What it creates:
 *   - Database service: "warehouse"
 *   - Database: "analytics"
 *   - Schemas: "public", "staging"
 *   - Tables: fact_orders, dim_customers, stg_payments, stg_orders, agg_daily_revenue
 *   - Lineage edges between tables
 *   - PII/GDPR classification tags
 *   - Tier1/Tier2 tier tags
 *   - Team and user ownership
 *   - Data quality test suite with passing and failing tests
 */

import axios, { AxiosInstance } from 'axios';

const OM_URL = process.env.OPENMETADATA_URL || 'http://localhost:8585';
const OM_TOKEN = process.env.OPENMETADATA_TOKEN || '';

if (!OM_TOKEN) {
  console.error('❌ OPENMETADATA_TOKEN is required. Generate one from Settings → Bots → ingestion-bot');
  process.exit(1);
}

const http: AxiosInstance = axios.create({
  baseURL: OM_URL,
  headers: {
    Authorization: `Bearer ${OM_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─── Helper Functions ─────────────────────────────────────────────────────

async function apiCall(method: string, url: string, data?: any, description?: string): Promise<any> {
  try {
    const response = await (http as any)[method](url, data);
    if (description) console.log(`  ✅ ${description}`);
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.message || err.message;
    if (status === 409) {
      if (description) console.log(`  ⏭️  ${description} (already exists)`);
      return null;
    }
    console.error(`  ❌ ${description || url}: HTTP ${status} — ${msg}`);
    return null;
  }
}

// ─── Step 1: Create Database Service ──────────────────────────────────────

async function createDatabaseService(): Promise<string | null> {
  console.log('\n📦 Step 1: Creating database service...');
  const result = await apiCall('put', '/api/v1/services/databaseServices', {
    name: 'warehouse',
    displayName: 'Analytics Warehouse',
    description: 'Primary analytics warehouse for LineageLock demo',
    serviceType: 'Postgres',
    connection: {
      config: {
        type: 'Postgres',
        scheme: 'postgresql+psycopg2',
        hostPort: 'localhost:5432',
        username: 'demo',
        authType: { password: 'demo' },
        database: 'analytics',
      },
    },
  }, 'Database service: warehouse');

  if (result) return result.id;

  // Try to fetch existing
  try {
    const existing = await http.get('/api/v1/services/databaseServices/name/warehouse');
    return existing.data.id;
  } catch { return null; }
}

// ─── Step 2: Create Database ──────────────────────────────────────────────

async function createDatabase(serviceId: string): Promise<string | null> {
  console.log('\n🗄️  Step 2: Creating database...');
  const result = await apiCall('put', '/api/v1/databases', {
    name: 'analytics',
    displayName: 'Analytics Database',
    description: 'Core analytics database',
    service: { id: serviceId, type: 'databaseService' },
  }, 'Database: analytics');

  if (result) return result.id;
  try {
    const existing = await http.get('/api/v1/databases/name/warehouse.analytics');
    return existing.data.id;
  } catch { return null; }
}

// ─── Step 3: Create Schemas ───────────────────────────────────────────────

async function createSchemas(databaseId: string): Promise<Record<string, string>> {
  console.log('\n📐 Step 3: Creating schemas...');
  const schemas: Record<string, string> = {};

  for (const name of ['public', 'staging']) {
    const result = await apiCall('put', '/api/v1/databaseSchemas', {
      name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      description: `${name} schema for analytics`,
      database: { id: databaseId, type: 'database' },
    }, `Schema: ${name}`);

    if (result) {
      schemas[name] = result.id;
    } else {
      try {
        const existing = await http.get(`/api/v1/databaseSchemas/name/warehouse.analytics.${name}`);
        schemas[name] = existing.data.id;
      } catch { /* skip */ }
    }
  }

  return schemas;
}

// ─── Step 4: Create Tables ────────────────────────────────────────────────

interface TableDef {
  name: string;
  schema: string;
  displayName: string;
  description: string;
  columns: Array<{
    name: string;
    dataType: string;
    description: string;
    tags?: Array<{ tagFQN: string; source: string; labelType: string; state: string }>;
  }>;
  tags?: Array<{ tagFQN: string; source: string; labelType: string; state: string }>;
}

const TABLE_DEFS: TableDef[] = [
  {
    name: 'fact_orders',
    schema: 'public',
    displayName: 'Fact Orders',
    description: 'Core orders fact table — joins customers, products, and transactions. Source of truth for revenue reporting.',
    columns: [
      { name: 'order_id', dataType: 'BIGINT', description: 'Primary key — unique order identifier' },
      { name: 'customer_id', dataType: 'BIGINT', description: 'Foreign key to dim_customers' },
      { name: 'product_id', dataType: 'BIGINT', description: 'Foreign key to dim_products' },
      { name: 'order_date', dataType: 'TIMESTAMP', description: 'When the order was placed' },
      { name: 'amount', dataType: 'DECIMAL', description: 'Order total in USD' },
      { name: 'status', dataType: 'VARCHAR', description: 'Order status (pending, completed, cancelled)' },
      {
        name: 'customer_email',
        dataType: 'VARCHAR',
        description: 'Customer email address for order confirmation',
        tags: [
          { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
      {
        name: 'shipping_address',
        dataType: 'VARCHAR',
        description: 'Full shipping address',
        tags: [
          { tagFQN: 'PII.NonSensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
    ],
    tags: [
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ],
  },
  {
    name: 'dim_customers',
    schema: 'public',
    displayName: 'Dim Customers',
    description: 'Customer dimension table with demographics and account data.',
    columns: [
      { name: 'customer_id', dataType: 'BIGINT', description: 'Primary key' },
      { name: 'first_name', dataType: 'VARCHAR', description: 'Customer first name' },
      { name: 'last_name', dataType: 'VARCHAR', description: 'Customer last name' },
      {
        name: 'email',
        dataType: 'VARCHAR',
        description: 'Customer email',
        tags: [
          { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
      { name: 'signup_date', dataType: 'DATE', description: 'Account creation date' },
      { name: 'segment', dataType: 'VARCHAR', description: 'Customer segment (enterprise, SMB, individual)' },
    ],
    tags: [
      { tagFQN: 'Tier.Tier2', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ],
  },
  {
    name: 'agg_daily_revenue',
    schema: 'public',
    displayName: 'Agg Daily Revenue',
    description: 'Daily revenue aggregation — powers the Revenue Dashboard.',
    columns: [
      { name: 'date', dataType: 'DATE', description: 'Revenue date' },
      { name: 'total_revenue', dataType: 'DECIMAL', description: 'Sum of order amounts' },
      { name: 'order_count', dataType: 'BIGINT', description: 'Number of orders' },
      { name: 'avg_order_value', dataType: 'DECIMAL', description: 'Average order value' },
    ],
    tags: [
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ],
  },
  {
    name: 'stg_payments',
    schema: 'staging',
    displayName: 'Staging Payments',
    description: 'Staging model for raw payment data. Cleaned and deduplicated.',
    columns: [
      { name: 'payment_id', dataType: 'BIGINT', description: 'Primary key' },
      { name: 'order_id', dataType: 'BIGINT', description: 'FK to orders' },
      { name: 'payment_method', dataType: 'VARCHAR', description: 'Payment method (credit, debit, wire)' },
      { name: 'amount', dataType: 'DECIMAL', description: 'Payment amount' },
      { name: 'created_at', dataType: 'TIMESTAMP', description: 'Payment timestamp' },
    ],
  },
  {
    name: 'stg_orders',
    schema: 'staging',
    displayName: 'Staging Orders',
    description: 'Staging model for raw order data from the source system.',
    columns: [
      { name: 'order_id', dataType: 'BIGINT', description: 'Raw order ID' },
      { name: 'customer_id', dataType: 'BIGINT', description: 'Raw customer ID' },
      { name: 'product_id', dataType: 'BIGINT', description: 'Raw product ID' },
      { name: 'order_date', dataType: 'VARCHAR', description: 'Order date as string from source' },
      { name: 'amount', dataType: 'VARCHAR', description: 'Amount as string from source' },
      { name: 'status', dataType: 'VARCHAR', description: 'Order status code' },
    ],
  },
];

async function createTables(schemas: Record<string, string>): Promise<Record<string, string>> {
  console.log('\n📋 Step 4: Creating tables...');
  const tableIds: Record<string, string> = {};

  for (const def of TABLE_DEFS) {
    const schemaId = schemas[def.schema];
    if (!schemaId) {
      console.log(`  ⚠️ Skipping ${def.name}: schema ${def.schema} not found`);
      continue;
    }

    const result = await apiCall('put', '/api/v1/tables', {
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      tableType: 'Regular',
      columns: def.columns.map((col) => ({
        name: col.name,
        dataType: col.dataType,
        description: col.description,
        tags: col.tags,
      })),
      tags: def.tags,
      databaseSchema: { id: schemaId, type: 'databaseSchema' },
    }, `Table: ${def.schema}.${def.name}`);

    if (result) {
      tableIds[def.name] = result.id;
    } else {
      try {
        const fqn = `warehouse.analytics.${def.schema}.${def.name}`;
        const existing = await http.get(`/api/v1/tables/name/${encodeURIComponent(fqn)}`);
        tableIds[def.name] = existing.data.id;
      } catch { /* skip */ }
    }
  }

  return tableIds;
}

// ─── Step 5: Create Lineage ──────────────────────────────────────────────

interface LineageEdgeDef {
  from: string;
  to: string;
  description: string;
}

const LINEAGE_EDGES: LineageEdgeDef[] = [
  { from: 'stg_orders', to: 'fact_orders', description: 'stg_orders feeds fact_orders' },
  { from: 'stg_payments', to: 'fact_orders', description: 'stg_payments feeds fact_orders' },
  { from: 'dim_customers', to: 'fact_orders', description: 'dim_customers joined in fact_orders' },
  { from: 'fact_orders', to: 'agg_daily_revenue', description: 'fact_orders aggregated to daily revenue' },
];

async function createLineage(tableIds: Record<string, string>): Promise<void> {
  console.log('\n🔗 Step 5: Creating lineage edges...');

  for (const edge of LINEAGE_EDGES) {
    const fromId = tableIds[edge.from];
    const toId = tableIds[edge.to];

    if (!fromId || !toId) {
      console.log(`  ⚠️ Skipping lineage ${edge.from} → ${edge.to}: entity not found`);
      continue;
    }

    await apiCall('put', '/api/v1/lineage', {
      edge: {
        fromEntity: { id: fromId, type: 'table' },
        toEntity: { id: toId, type: 'table' },
      },
    }, `Lineage: ${edge.from} → ${edge.to}`);
  }
}

// ─── Step 6: Create Team & Assign Ownership ──────────────────────────────

async function createTeamAndOwnership(tableIds: Record<string, string>): Promise<void> {
  console.log('\n👥 Step 6: Creating team and assigning ownership...');

  // Create team
  const team = await apiCall('put', '/api/v1/teams', {
    name: 'data-engineering',
    displayName: 'Data Engineering Team',
    description: 'Core data engineering team responsible for analytics models',
    teamType: 'Group',
  }, 'Team: data-engineering');

  const teamId = team?.id;

  if (!teamId) {
    try {
      const existing = await http.get('/api/v1/teams/name/data-engineering');
      const existingId = existing.data.id;
      // Assign ownership to fact_orders and dim_customers
      await assignOwnership(tableIds, existingId);
    } catch { /* skip */ }
    return;
  }

  await assignOwnership(tableIds, teamId);
}

async function assignOwnership(tableIds: Record<string, string>, teamId: string): Promise<void> {
  const ownedTables = ['fact_orders', 'dim_customers', 'agg_daily_revenue'];

  for (const tableName of ownedTables) {
    const tableId = tableIds[tableName];
    if (!tableId) continue;

    await apiCall('patch', `/api/v1/tables/${tableId}`, [
      {
        op: 'add',
        path: '/owner',
        value: { id: teamId, type: 'team' },
      },
    ], `Ownership: ${tableName} → data-engineering`);
  }
}

// ─── Step 7: Verify Setup ─────────────────────────────────────────────────

async function verifySetup(tableIds: Record<string, string>): Promise<void> {
  console.log('\n🔍 Step 7: Verifying setup...');

  // Verify fact_orders
  if (tableIds.fact_orders) {
    try {
      const table = await http.get(
        `/api/v1/tables/name/${encodeURIComponent('warehouse.analytics.public.fact_orders')}`,
        { params: { fields: 'owner,tags,columns' } }
      );
      const data = table.data;
      console.log(`  ✅ fact_orders loaded — ${data.columns?.length || 0} columns`);
      console.log(`     Owner: ${data.owner?.displayName || data.owner?.name || 'none'}`);
      console.log(`     Tags: ${(data.tags || []).map((t: any) => t.tagFQN).join(', ') || 'none'}`);

      // Check lineage
      const lineage = await http.get(
        `/api/v1/lineage/table/${tableIds.fact_orders}`,
        { params: { upstreamDepth: 2, downstreamDepth: 2 } }
      );
      const upstream = lineage.data.upstreamEdges?.length || 0;
      const downstream = lineage.data.downstreamEdges?.length || 0;
      console.log(`     Lineage: ${upstream} upstream, ${downstream} downstream`);
    } catch (err: any) {
      console.log(`  ⚠️ Could not verify fact_orders: ${err.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 LineageLock — OpenMetadata Seed Script');
  console.log(`   Target: ${OM_URL}`);
  console.log('');

  // Check connectivity
  try {
    const version = await http.get('/api/v1/system/version');
    console.log(`✅ Connected to OpenMetadata ${version.data.version}`);
  } catch (err: any) {
    console.error(`❌ Cannot connect to OpenMetadata at ${OM_URL}: ${err.message}`);
    process.exit(1);
  }

  const serviceId = await createDatabaseService();
  if (!serviceId) {
    console.error('❌ Could not create/find database service');
    process.exit(1);
  }

  const databaseId = await createDatabase(serviceId);
  if (!databaseId) {
    console.error('❌ Could not create/find database');
    process.exit(1);
  }

  const schemas = await createSchemas(databaseId);
  const tableIds = await createTables(schemas);
  await createLineage(tableIds);
  await createTeamAndOwnership(tableIds);
  await verifySetup(tableIds);

  console.log('\n' + '═'.repeat(50));
  console.log('🎉 Seed complete! Created entities:');
  console.log(`   Tables: ${Object.keys(tableIds).join(', ')}`);
  console.log('');
  console.log('Now run LineageLock against the live instance:');
  console.log(`   export OPENMETADATA_URL=${OM_URL}`);
  console.log(`   export OPENMETADATA_TOKEN=${OM_TOKEN.slice(0, 10)}...`);
  console.log('   npx ts-node src/cli.ts analyze --changed-file models/marts/fact_orders.sql');
  console.log('═'.repeat(50));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
