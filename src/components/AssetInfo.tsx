import type { Asset } from '../lib/types';
import { Database, LayoutDashboard, Workflow, Cpu, Radio } from 'lucide-react';

function assetIcon(type: string) {
  switch (type) {
    case 'table': return <Database size={14} />;
    case 'dashboard': return <LayoutDashboard size={14} />;
    case 'pipeline': return <Workflow size={14} />;
    case 'mlmodel': return <Cpu size={14} />;
    case 'topic': return <Radio size={14} />;
    default: return <Database size={14} />;
  }
}

const sensitiveKeywords = ['pii', 'sensitive', 'gdpr', 'hipaa', 'confidential'];

interface Props {
  asset: Asset;
  isRoot?: boolean;
}

export default function AssetInfo({ asset, isRoot }: Props) {
  return (
    <div className="card animate-in animate-in-delay-1" id="root-asset-panel">
      <div className="card-header">
        <div className="card-icon" style={{
          background: isRoot ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
          color: isRoot ? 'var(--severity-critical)' : 'var(--asset-table)',
        }}>
          {assetIcon(asset.type)}
        </div>
        <h3>{isRoot ? 'Root Affected Asset' : 'Asset Details'}</h3>
        <span className={`badge badge-asset badge-asset-${asset.type}`} style={{ marginLeft: 'auto' }}>
          {asset.type}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{asset.displayName}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {asset.fullyQualifiedName}
        </div>
      </div>

      {asset.description && (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          {asset.description}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {asset.tier && (
          <span className="tag-chip" style={{ background: 'rgba(124, 58, 237, 0.1)', color: 'var(--accent-primary-light)', borderColor: 'rgba(124, 58, 237, 0.2)' }}>
            {asset.tier}
          </span>
        )}
        {asset.service && <span className="tag-chip">🔌 {asset.service}</span>}
        {asset.database && <span className="tag-chip">🗄️ {asset.database}</span>}
        {asset.schema && <span className="tag-chip">📋 {asset.schema}</span>}
      </div>

      {/* Tags */}
      {asset.tags.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="section-title">Classifications</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {asset.tags.map((t, i) => (
              <span
                key={i}
                className={`tag-chip ${sensitiveKeywords.some(k => t.tagFQN.toLowerCase().includes(k)) ? 'sensitive' : ''}`}
              >
                {t.tagFQN}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Owner */}
      {asset.owner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <div className={`owner-avatar ${asset.owner.type}`}>
            {asset.owner.displayName.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{asset.owner.displayName}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{asset.owner.email ?? asset.owner.type}</div>
          </div>
        </div>
      )}

      {!asset.owner && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: '#fca5a5' }}>
          ⚠️ No owner assigned to this asset
        </div>
      )}

      {/* Columns */}
      {asset.columns && asset.columns.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">Schema ({asset.columns.length} columns)</div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            <table className="columns-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Type</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {asset.columns.map((col, i) => (
                  <tr key={i}>
                    <td>{col.name}</td>
                    <td>{col.dataType}</td>
                    <td>
                      {col.tags.map((t, j) => (
                        <span key={j} className={`tag-chip ${sensitiveKeywords.some(k => t.tagFQN.toLowerCase().includes(k)) ? 'sensitive' : ''}`} style={{ marginRight: 4 }}>
                          {t.tagFQN}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
