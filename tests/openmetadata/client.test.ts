/**
 * OpenMetadata Client Tests
 *
 * Tests for response normalization and error handling.
 * Uses mocked axios to avoid requiring a live OpenMetadata instance.
 */

import axios from 'axios';
import { OpenMetadataClient } from '../../src/openmetadata/client';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenMetadataClient', () => {
  let client: OpenMetadataClient;

  beforeEach(() => {
    const mockInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockInstance as any);
    client = new OpenMetadataClient({
      baseUrl: 'http://localhost:8585',
      token: 'test-token',
    });
  });

  describe('getTableByFQN', () => {
    it('should normalize a table entity response', async () => {
      const mockResponse = {
        data: {
          id: 'test-id',
          name: 'fact_orders',
          fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
          displayName: 'Fact Orders',
          description: 'Orders fact table',
          tableType: 'Regular',
          columns: [
            {
              name: 'order_id',
              dataType: 'BIGINT',
              dataTypeDisplay: 'bigint',
              description: 'PK',
              tags: [],
            },
          ],
          owner: {
            id: 'owner-1',
            type: 'user',
            name: 'john',
            fullyQualifiedName: 'john',
            displayName: 'John Doe',
          },
          tags: [
            { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          ],
        },
      };

      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await client.getTableByFQN('warehouse.analytics.public.fact_orders');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('fact_orders');
      expect(result!.tier).toBe('Tier.Tier1');
      expect(result!.owner?.displayName).toBe('John Doe');
      expect(result!.columns).toHaveLength(1);
    });

    it('should return null for 404 responses', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });

      const result = await client.getTableByFQN('nonexistent.table');
      expect(result).toBeNull();
    });
  });

  describe('getTableLineage', () => {
    it('should normalize a lineage response', async () => {
      const mockResponse = {
        data: {
          entity: {
            id: 'test-id',
            type: 'table',
            name: 'fact_orders',
            fullyQualifiedName: 'warehouse.analytics.public.fact_orders',
          },
          nodes: [
            { id: 'node-1', type: 'table', name: 'downstream_table', fullyQualifiedName: 'w.a.p.downstream_table' },
          ],
          upstreamEdges: [],
          downstreamEdges: [
            {
              fromEntity: { id: 'test-id', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' },
              toEntity: { id: 'node-1', type: 'table', name: 'downstream_table', fullyQualifiedName: 'w.a.p.downstream_table' },
            },
          ],
        },
      };

      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await client.getTableLineage('test-id');

      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(1);
      expect(result!.downstreamEdges).toHaveLength(1);
    });

    it('should return null for 404 responses', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });

      const result = await client.getTableLineage('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getDataContract', () => {
    it('should return no contract when both endpoints return 404', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      // Call 1: official /api/v1/dataContracts → 404 (endpoint not available)
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      // Call 2: fallback /api/v1/dataQuality/testSuites → 404 (no suite found)
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });

      const result = await client.getDataContract('test.table');
      expect(result.hasContract).toBe(false);
      expect(result.failingTests).toBe(0);
    });

    it('should return contract from official API when available', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      // Call 1: official API returns a contract
      mockGet.mockResolvedValueOnce({
        data: {
          data: [{
            name: 'test_contract',
            status: 'Active',
            results: [
              { status: 'Success', name: 'row_count_check' },
              { status: 'Failed', name: 'null_check' },
            ],
          }],
        },
      });

      const result = await client.getDataContract('test.table');
      expect(result.hasContract).toBe(true);
      expect(result.contractSource).toBe('official');
      expect(result.failingTests).toBe(1);
      expect(result.totalTests).toBe(2);
    });

    it('should fall back to test-suite when official API is unavailable', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      // Call 1: official API → 404
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      // Call 2: test-suite proxy returns data
      mockGet.mockResolvedValueOnce({
        data: {
          data: [{
            name: 'test_suite',
            fullyQualifiedName: 'test.table.testSuite',
            tests: [
              { name: 'row_count', testCaseResult: { testCaseStatus: 'Success' } },
              { name: 'null_check', testCaseResult: { testCaseStatus: 'Failed' } },
            ],
          }],
        },
      });

      const result = await client.getDataContract('test.table');
      expect(result.hasContract).toBe(true);
      expect(result.contractSource).toBe('test-suite');
      expect(result.failingTests).toBe(1);
      expect(result.totalTests).toBe(2);
    });

    it('should throw on non-404 errors in the fallback path', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      // Call 1: official API → 404 (fall through)
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });
      // Call 2: test-suite proxy → 500 (should throw)
      mockGet.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal Server Error' } } });

      await expect(client.getDataContract('test.table')).rejects.toThrow();
    });
  });

  describe('constructor', () => {
    it('should create client with trailing slash stripped', () => {
      const client = new OpenMetadataClient({
        baseUrl: 'http://localhost:8585/',
        token: 'test',
      });
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:8585',
        })
      );
    });
  });

  // ─── getTestResults ───────────────────────────────────────────────────────

  describe('getTestResults', () => {
    it('should return only failing/aborted test cases', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              name: 'amount_positive',
              testCaseResult: { testCaseStatus: 'Failed', timestamp: 1745000000000, result: '142 rows where amount <= 0' },
              testSuite: { name: 'suite_a' },
            },
            {
              name: 'row_count_check',
              testCaseResult: { testCaseStatus: 'Success', timestamp: 1745000000000 },
              testSuite: { name: 'suite_a' },
            },
            {
              name: 'freshness_check',
              testCaseResult: { testCaseStatus: 'Aborted', timestamp: 1745000000000 },
              testSuite: { name: 'suite_a' },
            },
          ],
        },
      });

      const results = await client.getTestResults('warehouse.analytics.fact_orders');
      // Should only return Failed and Aborted, not Success
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('amount_positive');
      expect(results.map(r => r.name)).toContain('freshness_check');
      expect(results.map(r => r.name)).not.toContain('row_count_check');
      expect(results[0].status).toBe('Failed');
      expect(results[0].failureReason).toBe('142 rows where amount <= 0');
      expect(results[0].testSuite).toBe('suite_a');
    });

    it('should return empty array (not throw) on any API error', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockRejectedValueOnce(new Error('network timeout'));

      const results = await client.getTestResults('some.fqn');
      expect(results).toEqual([]);
    });

    it('should return empty array when no failing tests exist', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce({
        data: {
          data: [
            { name: 'row_count', testCaseResult: { testCaseStatus: 'Success' }, testSuite: { name: 's' } },
          ],
        },
      });

      const results = await client.getTestResults('clean.table');
      expect(results).toEqual([]);
    });

    it('should handle missing data array gracefully', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce({ data: {} }); // no data.data

      const results = await client.getTestResults('some.fqn');
      expect(results).toEqual([]);
    });
  });

  // ─── resolveEntity ────────────────────────────────────────────────────────

  describe('resolveEntity', () => {
    const entityResponse = {
      data: {
        id: 'eid-1',
        name: 'fact_orders',
        fullyQualifiedName: 'w.a.p.fact_orders',
        columns: [{ name: 'amount', dataType: 'DECIMAL', tags: [] }],
        tags: [
          { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'Glossary.Revenue', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
        ],
        owner: { id: 'u1', type: 'user', name: 'alice', fullyQualifiedName: 'user.alice', displayName: 'Alice' },
      },
    };

    const lineageResponse = {
      data: {
        entity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' },
        nodes: [
          { id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' },
        ],
        upstreamEdges: [],
        downstreamEdges: [
          {
            fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' },
            toEntity: { id: 'd1', type: 'dashboard', name: 'Revenue Dashboard', fullyQualifiedName: 'superset.Revenue Dashboard' },
            columnLineage: [{ fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'superset.Revenue Dashboard.total_rev' }],
          },
        ],
      },
    };

    const contractResponse = {
      data: { data: [{ name: 'suite', results: [{ status: 'Success', name: 'check' }] }] },
    };

    it('should fully resolve entity with lineage, downstream, contract, and glossary', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet
        .mockResolvedValueOnce(entityResponse)    // getTableByFQN
        .mockResolvedValueOnce(lineageResponse)   // getTableLineage
        .mockResolvedValueOnce(contractResponse); // getDataContract official

      const result = await client.resolveEntity('models/fact_orders.sql', 'w.a.p.fact_orders');

      expect(result.found).toBe(true);
      expect(result.entity?.name).toBe('fact_orders');
      expect(result.entity?.tier).toBe('Tier.Tier1');
      expect(result.glossaryTerms).toContain('Glossary.Revenue');
      expect(result.downstream?.dashboards).toHaveLength(1);
      expect(result.downstream?.dashboards[0].name).toBe('Revenue Dashboard');
      expect(result.downstream?.columnImpact).toHaveLength(1);
      expect(result.contract?.hasContract).toBe(true);
    });

    it('should return found:false when entity does not exist in OpenMetadata', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockRejectedValueOnce({ response: { status: 404 } }); // getTableByFQN → 404

      const result = await client.resolveEntity('models/missing.sql', 'w.a.p.missing');

      expect(result.found).toBe(false);
      expect(result.error).toContain('Entity not found');
    });

    it('should return found:false with error message on resolution exception', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockRejectedValueOnce({ response: { status: 500, data: { message: 'DB down' } } });

      const result = await client.resolveEntity('models/boom.sql', 'w.a.p.boom');

      expect(result.found).toBe(false);
      expect(result.error).toMatch(/Resolution error/);
    });

    it('should handle entity with no glossary terms (no Glossary-source tags)', async () => {
      const entityNoGlossary = {
        data: {
          id: 'eid-2',
          name: 'stg_orders',
          fullyQualifiedName: 'w.a.s.stg_orders',
          columns: [],
          tags: [{ tagFQN: 'Tier.Tier3', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
        },
      };
      const mockGet = (mockedAxios.create as any)().get;
      mockGet
        .mockResolvedValueOnce(entityNoGlossary)
        .mockResolvedValueOnce({ data: { entity: { id: 'eid-2', type: 'table', name: 'stg_orders', fullyQualifiedName: 'w.a.s.stg_orders' }, nodes: [], upstreamEdges: [], downstreamEdges: [] } })
        .mockResolvedValueOnce({ data: { data: [] } })  // official → empty
        .mockRejectedValueOnce({ response: { status: 404 } }); // fallback → 404

      const result = await client.resolveEntity('models/stg_orders.sql', 'w.a.s.stg_orders');

      expect(result.found).toBe(true);
      expect(result.glossaryTerms).toBeUndefined();
    });
  });

  // ─── categorizeDownstream via resolveEntity ───────────────────────────────

  describe('downstream categorisation', () => {
    it('should categorise mixed downstream nodes correctly', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet
        .mockResolvedValueOnce({
          data: {
            id: 'eid-1', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders',
            columns: [], tags: [],
          },
        })
        .mockResolvedValueOnce({
          data: {
            entity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' },
            nodes: [
              { id: 't1', type: 'table', name: 'agg_revenue', fullyQualifiedName: 'w.a.p.agg_revenue' },
              { id: 'd1', type: 'dashboard', name: 'Dash', fullyQualifiedName: 'superset.Dash' },
              { id: 'm1', type: 'mlmodel', name: 'churn', fullyQualifiedName: 'mlflow.churn' },
              { id: 'p1', type: 'pipeline', name: 'etl', fullyQualifiedName: 'airflow.etl' },
              { id: 'tp1', type: 'topic', name: 'events', fullyQualifiedName: 'kafka.events' },
            ],
            upstreamEdges: [],
            downstreamEdges: [
              { fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' }, toEntity: { id: 't1', type: 'table', name: 'agg_revenue', fullyQualifiedName: 'w.a.p.agg_revenue' }, columnLineage: [] },
              { fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' }, toEntity: { id: 'd1', type: 'dashboard', name: 'Dash', fullyQualifiedName: 'superset.Dash' }, columnLineage: [] },
              { fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' }, toEntity: { id: 'm1', type: 'mlmodel', name: 'churn', fullyQualifiedName: 'mlflow.churn' }, columnLineage: [] },
              { fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' }, toEntity: { id: 'p1', type: 'pipeline', name: 'etl', fullyQualifiedName: 'airflow.etl' }, columnLineage: [] },
              { fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' }, toEntity: { id: 'tp1', type: 'topic', name: 'events', fullyQualifiedName: 'kafka.events' }, columnLineage: [] },
            ],
          },
        })
        .mockResolvedValueOnce({ data: { data: [] } }) // contract official empty
        .mockRejectedValueOnce({ response: { status: 404 } }); // contract fallback 404

      const result = await client.resolveEntity('models/fact_orders.sql', 'w.a.p.fact_orders');

      expect(result.downstream?.tables).toHaveLength(1);
      expect(result.downstream?.dashboards).toHaveLength(1);
      expect(result.downstream?.mlModels).toHaveLength(1);
      expect(result.downstream?.pipelines).toHaveLength(1);
      expect(result.downstream?.topics).toHaveLength(1);
      expect(result.downstream?.total).toBe(5);
    });

    it('should extract column lineage from downstream edges', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet
        .mockResolvedValueOnce({
          data: { id: 'eid-1', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders', columns: [], tags: [] },
        })
        .mockResolvedValueOnce({
          data: {
            entity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' },
            nodes: [{ id: 't1', type: 'table', name: 'agg_rev', fullyQualifiedName: 'w.a.p.agg_rev' }],
            upstreamEdges: [],
            downstreamEdges: [
              {
                fromEntity: { id: 'eid-1', type: 'table', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders' },
                toEntity: { id: 't1', type: 'table', name: 'agg_rev', fullyQualifiedName: 'w.a.p.agg_rev' },
                columnLineage: [
                  { fromColumns: ['w.a.p.fact_orders.amount'], toColumn: 'w.a.p.agg_rev.total_revenue' },
                ],
              },
            ],
          },
        })
        .mockResolvedValueOnce({ data: { data: [] } })
        .mockRejectedValueOnce({ response: { status: 404 } });

      const result = await client.resolveEntity('models/fact_orders.sql', 'w.a.p.fact_orders');

      expect(result.downstream?.columnImpact).toHaveLength(1);
      expect(result.downstream?.columnImpact[0].fromColumns).toContain('w.a.p.fact_orders.amount');
      expect(result.downstream?.columnImpact[0].toColumn).toBe('w.a.p.agg_rev.total_revenue');
      expect(result.downstream?.columnImpact[0].toEntity).toBe('w.a.p.agg_rev');
    });
  });

  // ─── normalizeOwner: owners array (OM 1.12+) vs singular ─────────────────

  describe('normalizeOwner via getTableByFQN', () => {
    it('should use owners[] array (OM 1.12+) when present', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'eid-1', name: 'fact_orders', fullyQualifiedName: 'w.a.p.fact_orders',
          columns: [], tags: [],
          owners: [
            { id: 'team-1', type: 'team', name: 'data-eng', fullyQualifiedName: 'team.data-eng', displayName: 'Data Engineering' },
          ],
        },
      });

      const result = await client.getTableByFQN('w.a.p.fact_orders');
      expect(result?.owner?.name).toBe('data-eng');
      expect(result?.owner?.displayName).toBe('Data Engineering');
      expect(result?.owner?.type).toBe('team');
    });

    it('should fall back to singular owner field (older OM)', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'eid-2', name: 'stg_orders', fullyQualifiedName: 'w.a.s.stg_orders',
          columns: [], tags: [],
          owner: { id: 'u1', type: 'user', name: 'alice', fullyQualifiedName: 'user.alice' },
        },
      });

      const result = await client.getTableByFQN('w.a.s.stg_orders');
      expect(result?.owner?.name).toBe('alice');
    });

    it('should return undefined owner when neither owners nor owner is set', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'eid-3', name: 'orphan', fullyQualifiedName: 'w.a.p.orphan',
          columns: [], tags: [],
        },
      });

      const result = await client.getTableByFQN('w.a.p.orphan');
      expect(result?.owner).toBeUndefined();
    });
  });
});

