/**
 * OpenMetadata API Client
 *
 * Handles all communication with the OpenMetadata REST API.
 * Supports both live and demo (fixture) modes.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  TableEntity,
  LineageResponse,
  ResolvedEntity,
  DownstreamImpact,
  LineageNode,
  DataContract,
  Owner,
  TagLabel,
} from './types';

export interface OpenMetadataClientConfig {
  /** Base URL of the OpenMetadata server */
  baseUrl: string;
  /** JWT token for authentication */
  token: string;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
}

export class OpenMetadataClient {
  private http: AxiosInstance;

  constructor(config: OpenMetadataClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl.replace(/\/+$/, ''),
      timeout: config.timeout || 10000,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch a table entity by its fully qualified name.
   * Includes owner, tags, columns, and tier data.
   */
  async getTableByFQN(fqn: string): Promise<TableEntity | null> {
    try {
      const response = await this.http.get(
        `/api/v1/tables/name/${encodeURIComponent(fqn)}`,
        {
          params: {
            fields: 'owners,tags,columns,dataModel,testSuite',
          },
        }
      );
      return this.normalizeTableEntity(response.data);
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw this.wrapError('getTableByFQN', fqn, err);
    }
  }

  /**
   * Fetch lineage for a table entity.
   */
  async getTableLineage(
    tableId: string,
    upstreamDepth: number = 1,
    downstreamDepth: number = 3
  ): Promise<LineageResponse | null> {
    try {
      const response = await this.http.get(
        `/api/v1/lineage/table/${encodeURIComponent(tableId)}`,
        {
          params: { upstreamDepth, downstreamDepth },
        }
      );
      return this.normalizeLineageResponse(response.data);
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw this.wrapError('getTableLineage', tableId, err);
    }
  }

  /**
   * Fetch test suite / data contract info for a table.
   * Uses the testSuite field if available, otherwise returns a default.
   */
  async getDataContract(tableFQN: string): Promise<DataContract> {
    try {
      const response = await this.http.get(
        `/api/v1/dataQuality/testSuites/search/list`,
        {
          params: {
            fields: 'tests',
            testSuiteType: 'logical',
            q: tableFQN,
            limit: 1,
          },
        }
      );

      const suites = response.data?.data || [];
      if (suites.length === 0) {
        return { hasContract: false, failingTests: 0, totalTests: 0 };
      }

      const suite = suites[0];
      const tests = suite.tests || [];
      const failingTests = tests.filter(
        (t: any) => t.testCaseResult?.testCaseStatus === 'Failed'
      ).length;

      return {
        hasContract: true,
        testSuiteName: suite.fullyQualifiedName || suite.name,
        failingTests,
        totalTests: tests.length,
        tests: tests.map((t: any) => ({
          name: t.name,
          status: t.testCaseResult?.testCaseStatus || 'Unknown',
          description: t.description,
        })),
      };
    } catch (err) {
      // Fallback: contract endpoint not available in this version
      return { hasContract: false, failingTests: 0, totalTests: 0 };
    }
  }

  /**
   * Fully resolve an entity: metadata + lineage + downstream impact + contracts.
   */
  async resolveEntity(filePath: string, fqn: string): Promise<ResolvedEntity> {
    const result: ResolvedEntity = { filePath, fqn, found: false };

    try {
      // 1. Fetch entity metadata
      const entity = await this.getTableByFQN(fqn);
      if (!entity) {
        result.error = `Entity not found in OpenMetadata: ${fqn}`;
        return result;
      }

      result.found = true;
      result.entity = entity;

      // 2. Fetch lineage
      const lineage = await this.getTableLineage(entity.id);
      result.lineage = lineage || undefined;

      // 3. Categorize downstream impact
      if (lineage) {
        result.downstream = this.categorizeDownstream(lineage);
      }

      // 4. Fetch contract / data quality info
      result.contract = await this.getDataContract(fqn);

      return result;
    } catch (err: any) {
      result.error = `Resolution error: ${err.message || err}`;
      return result;
    }
  }

  /**
   * Categorize downstream lineage nodes by entity type.
   */
  private categorizeDownstream(lineage: LineageResponse): DownstreamImpact {
    const impact: DownstreamImpact = {
      tables: [],
      dashboards: [],
      mlModels: [],
      pipelines: [],
      topics: [],
      total: 0,
    };

    const seenIds = new Set<string>();

    // Collect all downstream entity IDs from edges
    const downstreamIds = new Set(
      lineage.downstreamEdges.map((e) => e.toEntity.id)
    );

    for (const node of lineage.nodes) {
      if (!downstreamIds.has(node.id) || seenIds.has(node.id)) continue;
      seenIds.add(node.id);

      const type = node.type.toLowerCase();
      if (type === 'table' || type === 'view') {
        impact.tables.push(node);
      } else if (type === 'dashboard') {
        impact.dashboards.push(node);
      } else if (type === 'mlmodel') {
        impact.mlModels.push(node);
      } else if (type === 'pipeline') {
        impact.pipelines.push(node);
      } else if (type === 'topic') {
        impact.topics.push(node);
      }
    }

    impact.total =
      impact.tables.length +
      impact.dashboards.length +
      impact.mlModels.length +
      impact.pipelines.length +
      impact.topics.length;

    return impact;
  }

  /**
   * Normalize raw API response to our TableEntity shape.
   */
  private normalizeTableEntity(raw: any): TableEntity {
    // Extract tier from tags
    let tier: string | undefined;
    const tags: TagLabel[] = raw.tags || [];
    for (const tag of tags) {
      if (tag.tagFQN?.startsWith('Tier.') || tag.tagFQN?.startsWith('Tier')) {
        tier = tag.tagFQN;
        break;
      }
    }

    return {
      id: raw.id,
      name: raw.name,
      fullyQualifiedName: raw.fullyQualifiedName,
      displayName: raw.displayName,
      description: raw.description,
      tableType: raw.tableType,
      columns: (raw.columns || []).map((col: any) => ({
        name: col.name,
        dataType: col.dataType,
        dataTypeDisplay: col.dataTypeDisplay,
        fullyQualifiedName: col.fullyQualifiedName,
        description: col.description,
        tags: col.tags,
        constraint: col.constraint,
      })),
      owner: this.normalizeOwner(raw),
      tags,
      service: raw.service,
      database: raw.database,
      databaseSchema: raw.databaseSchema,
      tier,
    };
  }

  /**
   * Normalize owner from either `owner` (singular, older OM) or `owners` (array, OM 1.12+).
   */
  private normalizeOwner(raw: any): Owner | undefined {
    // OM 1.12+ uses `owners` (array)
    if (raw.owners && Array.isArray(raw.owners) && raw.owners.length > 0) {
      const o = raw.owners[0];
      return {
        id: o.id,
        type: o.type,
        name: o.name,
        fullyQualifiedName: o.fullyQualifiedName,
        displayName: o.displayName || o.name,
      };
    }
    // Older OM uses `owner` (singular)
    if (raw.owner) {
      return {
        id: raw.owner.id,
        type: raw.owner.type,
        name: raw.owner.name,
        fullyQualifiedName: raw.owner.fullyQualifiedName,
        displayName: raw.owner.displayName || raw.owner.name,
      };
    }
    return undefined;
  }

  /**
   * Normalize raw lineage API response.
   */
  private normalizeLineageResponse(raw: any): LineageResponse {
    return {
      entity: raw.entity,
      nodes: (raw.nodes || []).map((n: any) => ({
        id: n.id,
        type: n.type || 'table',
        name: n.name,
        fullyQualifiedName: n.fullyQualifiedName,
        displayName: n.displayName,
      })),
      upstreamEdges: (raw.upstreamEdges || []).map((e: any) => ({
        fromEntity: e.fromEntity,
        toEntity: e.toEntity,
        columnLineage: e.columnLineage,
      })),
      downstreamEdges: (raw.downstreamEdges || []).map((e: any) => ({
        fromEntity: e.fromEntity,
        toEntity: e.toEntity,
        columnLineage: e.columnLineage,
      })),
    };
  }

  /**
   * Check if an axios error is a 404 Not Found.
   */
  private isNotFound(err: any): boolean {
    return err?.response?.status === 404;
  }

  /**
   * Wrap an error with context.
   */
  private wrapError(method: string, identifier: string, err: any): Error {
    const status = err?.response?.status;
    const message = err?.response?.data?.message || err.message || 'Unknown error';
    return new Error(
      `OpenMetadata API error in ${method}(${identifier}): ${status ? `HTTP ${status} — ` : ''}${message}`
    );
  }
}
