import type { Incident } from '../lib/types';
import { Database, LayoutDashboard, Workflow, Cpu, Radio, TrendingUp } from 'lucide-react';

export default function BlastRadius({ incident }: { incident: Incident }) {
  const br = incident.blastRadius;

  const items = [
    { label: 'Tables', value: br.tables, icon: <Database size={16} />, color: 'var(--asset-table)' },
    { label: 'Dashboards', value: br.dashboards, icon: <LayoutDashboard size={16} />, color: 'var(--asset-dashboard)' },
    { label: 'Pipelines', value: br.pipelines, icon: <Workflow size={16} />, color: 'var(--asset-pipeline)' },
    { label: 'ML Models', value: br.mlmodels, icon: <Cpu size={16} />, color: 'var(--asset-mlmodel)' },
    { label: 'Topics', value: br.topics, icon: <Radio size={16} />, color: 'var(--asset-topic)' },
  ].filter(i => i.value > 0);

  return (
    <div className="card animate-in animate-in-delay-3" id="blast-radius-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(249, 115, 22, 0.12)', color: 'var(--severity-high)' }}>
          <TrendingUp size={14} />
        </div>
        <h3>Blast Radius</h3>
        <span style={{ marginLeft: 'auto', fontSize: '1.2rem', fontWeight: 800, color: 'var(--severity-high)' }}>
          {br.total}
        </span>
      </div>

      <div className="stats-grid">
        {items.map((item) => (
          <div className="stat-card" key={item.label}>
            <div style={{ color: item.color, marginBottom: 6, opacity: 0.8 }}>{item.icon}</div>
            <div className="stat-value" style={{ color: item.color }}>{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Affected asset list */}
      {incident.affectedAssets.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">Downstream Assets</div>
          <div className="asset-list">
            {incident.affectedAssets.map((asset) => (
              <div className="asset-row" key={asset.id}>
                <span className={`badge badge-asset badge-asset-${asset.type}`}>{asset.type}</span>
                <div>
                  <div className="asset-name">{asset.displayName}</div>
                  <div className="asset-fqn">{asset.fullyQualifiedName}</div>
                </div>
                <span className="asset-owner">{asset.owner?.displayName ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
