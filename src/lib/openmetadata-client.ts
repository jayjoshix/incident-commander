// ============================================================
// OpenMetadata REST API Client Layer
// ============================================================
// When VITE_OPENMETADATA_URL is set, makes real API calls.
// Otherwise falls back to mock data automatically.

import type { Asset, LineageData, Owner, Tag, TestCaseResult } from './types';

const BASE = import.meta.env.VITE_OPENMETADATA_URL as string | undefined;
const TOKEN = import.meta.env.VITE_OPENMETADATA_TOKEN as string | undefined;

function headers(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

async function apiFetch<T>(path: string): Promise<T> {
  if (!BASE) throw new Error('OpenMetadata URL not configured');
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`OpenMetadata API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ---- Public API ----

export const omClient = {
  isLive: () => !!BASE,

  /** Fetch table details by FQN */
  async getTable(fqn: string): Promise<Asset> {
    const raw = await apiFetch<any>(`/tables/name/${encodeURIComponent(fqn)}?fields=owner,tags,columns,lineage`);
    return mapAsset(raw, 'table');
  },

  /** Fetch dashboard details by FQN */
  async getDashboard(fqn: string): Promise<Asset> {
    const raw = await apiFetch<any>(`/dashboards/name/${encodeURIComponent(fqn)}?fields=owner,tags`);
    return mapAsset(raw, 'dashboard');
  },

  /** Fetch pipeline details by FQN */
  async getPipeline(fqn: string): Promise<Asset> {
    const raw = await apiFetch<any>(`/pipelines/name/${encodeURIComponent(fqn)}?fields=owner,tags`);
    return mapAsset(raw, 'pipeline');
  },

  /** Fetch lineage for any entity */
  async getLineage(entityType: string, fqn: string): Promise<LineageData> {
    const raw = await apiFetch<any>(
      `/${entityType}s/name/${encodeURIComponent(fqn)}/lineage?upstreamDepth=3&downstreamDepth=3`
    );
    return mapLineage(raw);
  },

  /** Fetch test case results for a table */
  async getTestResults(tableFqn: string): Promise<TestCaseResult[]> {
    const raw = await apiFetch<any>(
      `/dataQuality/testCases?entityLink=<#E::table::${encodeURIComponent(tableFqn)}>&limit=20`
    );
    return (raw.data ?? []).map(mapTestResult);
  },

  /** Search entities */
  async search(query: string, index = 'table'): Promise<Asset[]> {
    const raw = await apiFetch<any>(`/search/query?q=${encodeURIComponent(query)}&index=${index}_search_index&size=20`);
    return (raw.hits?.hits ?? []).map((h: any) => mapAsset(h._source, index as any));
  },
};

// ---- Mappers ----

function mapAsset(raw: any, type: string): Asset {
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? '',
    fullyQualifiedName: raw.fullyQualifiedName ?? raw.name ?? '',
    displayName: raw.displayName ?? raw.name ?? '',
    type: type as any,
    description: raw.description,
    owner: raw.owner ? mapOwner(raw.owner) : undefined,
    tags: (raw.tags ?? []).map(mapTag),
    tier: extractTier(raw),
    service: raw.service?.name,
    database: raw.database?.name,
    schema: raw.databaseSchema?.name,
    columns: (raw.columns ?? []).map((c: any) => ({
      name: c.name,
      dataType: c.dataType ?? c.dataTypeDisplay ?? 'UNKNOWN',
      description: c.description,
      tags: (c.tags ?? []).map(mapTag),
    })),
  };
}

function mapOwner(raw: any): Owner {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    displayName: raw.displayName ?? raw.name ?? '',
    type: raw.type === 'team' ? 'team' : 'user',
    email: raw.email,
  };
}

function mapTag(raw: any): Tag {
  return {
    tagFQN: raw.tagFQN ?? '',
    labelType: raw.labelType ?? 'Manual',
    state: raw.state ?? 'Confirmed',
    source: raw.source ?? 'Classification',
  };
}

function extractTier(raw: any): string | undefined {
  const tags: any[] = raw.tags ?? [];
  const tierTag = tags.find((t: any) => (t.tagFQN ?? '').startsWith('Tier'));
  return tierTag?.tagFQN;
}

function mapTestResult(raw: any): TestCaseResult {
  return {
    id: raw.id ?? crypto.randomUUID(),
    testCaseName: raw.name ?? raw.testCaseName ?? '',
    testSuiteName: raw.testSuite?.name ?? '',
    entityLink: raw.entityLink ?? '',
    status: raw.testCaseResult?.testCaseStatus ?? 'Success',
    timestamp: raw.testCaseResult?.timestamp ?? Date.now(),
    result: raw.testCaseResult?.result,
  };
}

function mapLineage(raw: any): LineageData {
  const entity = mapAsset(raw.entity, raw.entity?.entityType ?? 'table');
  const nodes = (raw.nodes ?? []).map((n: any) => mapAsset(n, n.entityType ?? 'table'));
  const upstreamEdges = (raw.upstreamEdges ?? []).map((e: any) => ({
    fromEntity: e.fromEntity?.id ?? e.fromEntity,
    toEntity: e.toEntity?.id ?? e.toEntity,
  }));
  const downstreamEdges = (raw.downstreamEdges ?? []).map((e: any) => ({
    fromEntity: e.fromEntity?.id ?? e.fromEntity,
    toEntity: e.toEntity?.id ?? e.toEntity,
  }));
  return {
    entity,
    nodes: [entity, ...nodes],
    edges: [...upstreamEdges, ...downstreamEdges],
    upstreamEdges,
    downstreamEdges,
  };
}
