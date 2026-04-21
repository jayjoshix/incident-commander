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
});
