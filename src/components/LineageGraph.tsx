import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LineageData, Asset } from '../lib/types';
import { GitBranch } from 'lucide-react';

// ---- Dagre-free auto-layout (simple layered) ----

function typeColor(type: string) {
  switch (type) {
    case 'table': return 'var(--asset-table)';
    case 'dashboard': return 'var(--asset-dashboard)';
    case 'pipeline': return 'var(--asset-pipeline)';
    case 'mlmodel': return 'var(--asset-mlmodel)';
    case 'topic': return 'var(--asset-topic)';
    default: return 'var(--text-secondary)';
  }
}

interface CustomNodeData {
  label: string;
  assetType: string;
  isRoot: boolean;
  owner?: string;
  [key: string]: unknown;
}

function CustomNode({ data }: { data: CustomNodeData }) {
  return (
    <div className={`react-flow__node-custom ${data.isRoot ? 'is-root' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--text-muted)', border: 'none', width: 6, height: 6 }} />
      <div className="node-type" style={{ color: typeColor(data.assetType) }}>
        {data.assetType}
      </div>
      <div className="node-name">{data.label}</div>
      {data.owner && (
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 4 }}>
          👤 {data.owner}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: 'var(--text-muted)', border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

function layoutNodes(lineage: LineageData, rootId: string): { nodes: Node[]; edges: Edge[] } {
  const assetMap = new Map<string, Asset>();
  for (const n of lineage.nodes) assetMap.set(n.id, n);

  // Build adjacency for BFS layering
  const adj = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>();
  for (const e of lineage.edges) {
    if (!adj.has(e.fromEntity)) adj.set(e.fromEntity, []);
    adj.get(e.fromEntity)!.push(e.toEntity);
    if (!reverseAdj.has(e.toEntity)) reverseAdj.set(e.toEntity, []);
    reverseAdj.get(e.toEntity)!.push(e.fromEntity);
  }

  // Find roots (nodes with no incoming edges in our graph)
  const allIds = new Set(lineage.nodes.map(n => n.id));
  const hasIncoming = new Set(lineage.edges.map(e => e.toEntity));
  const roots = [...allIds].filter(id => !hasIncoming.has(id));
  if (roots.length === 0) roots.push(rootId);

  // BFS from all roots to assign layers
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const r of roots) {
    layer.set(r, 0);
    queue.push(r);
  }

  while (queue.length) {
    const current = queue.shift()!;
    const currentLayer = layer.get(current)!;
    for (const child of (adj.get(current) ?? [])) {
      if (!layer.has(child) || layer.get(child)! < currentLayer + 1) {
        layer.set(child, currentLayer + 1);
        queue.push(child);
      }
    }
  }

  // Position nodes
  const layerGroups = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(id);
  }

  // Also add any orphan nodes
  for (const n of lineage.nodes) {
    if (!layer.has(n.id)) {
      const l = 0;
      layer.set(n.id, l);
      if (!layerGroups.has(l)) layerGroups.set(l, []);
      layerGroups.get(l)!.push(n.id);
    }
  }

  const X_GAP = 260;
  const Y_GAP = 100;

  const nodes: Node[] = [];
  for (const [l, ids] of layerGroups) {
    const totalHeight = (ids.length - 1) * Y_GAP;
    ids.forEach((id, i) => {
      const asset = assetMap.get(id);
      nodes.push({
        id,
        type: 'custom',
        position: { x: l * X_GAP, y: i * Y_GAP - totalHeight / 2 },
        data: {
          label: asset?.displayName ?? id,
          assetType: asset?.type ?? 'table',
          isRoot: id === rootId,
          owner: asset?.owner?.displayName,
        },
      });
    });
  }

  const edges: Edge[] = lineage.edges.map((e, i) => ({
    id: `edge-${i}`,
    source: e.fromEntity,
    target: e.toEntity,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255,255,255,0.3)' },
    style: { strokeWidth: 2 },
  }));

  return { nodes, edges };
}

export default function LineageGraph({ lineage, rootId }: { lineage: LineageData; rootId: string }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutNodes(lineage, rootId),
    [lineage, rootId]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback((instance: any) => {
    setTimeout(() => instance.fitView({ padding: 0.2 }), 100);
  }, []);

  return (
    <div className="card warroom-full animate-in animate-in-delay-2" id="lineage-graph-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(124, 58, 237, 0.12)', color: 'var(--accent-primary-light)' }}>
          <GitBranch size={14} />
        </div>
        <h3>Data Lineage</h3>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {lineage.nodes.length} nodes · {lineage.edges.length} edges
        </span>
      </div>

      <div className="lineage-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.04)" gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
