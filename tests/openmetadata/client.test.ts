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
    it('should return no contract when endpoint returns 404', async () => {
      const mockGet = (mockedAxios.create as any)().get;
      mockGet.mockRejectedValueOnce({ response: { status: 404 } });

      const result = await client.getDataContract('test.table');
      expect(result.hasContract).toBe(false);
      expect(result.failingTests).toBe(0);
    });

    it('should throw on non-404 errors (auth, network, server)', async () => {
      const mockGet = (mockedAxios.create as any)().get;
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
