import { Link } from 'react-router-dom';
import type { Incident } from '../lib/types';
import { Clock, Database, LayoutDashboard, Workflow, Cpu, MessageSquare } from 'lucide-react';

function typeLabel(type: string) {
  switch (type) {
    case 'data_quality': return 'Data Quality';
    case 'schema_drift': return 'Schema Drift';
    case 'pipeline_failure': return 'Pipeline Failure';
    default: return type;
  }
}

function assetIcon(type: string) {
  switch (type) {
    case 'table': return <Database size={14} />;
    case 'dashboard': return <LayoutDashboard size={14} />;
    case 'pipeline': return <Workflow size={14} />;
    case 'mlmodel': return <Cpu size={14} />;
    default: return <MessageSquare size={14} />;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <Link
      to={`/incident/${incident.id}`}
      className="card incident-card"
      data-severity={incident.severity}
      id={`incident-card-${incident.id}`}
    >
      <div className="incident-card-body">
        <div className="incident-card-title">{incident.title}</div>
        <div className="incident-card-meta">
          <span className="badge badge-type">{typeLabel(incident.type)}</span>
          <span className="incident-card-asset">
            {assetIcon(incident.rootAsset.type)}
            {incident.rootAsset.fullyQualifiedName}
          </span>
        </div>
        <div className="incident-card-meta">
          <span className={`badge badge-severity-${incident.severity}`}>
            {incident.severity}
          </span>
          <span className={`badge badge-status-${incident.status}`}>
            {incident.status}
          </span>
          <span className="incident-card-time">
            <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {timeAgo(incident.createdAt)}
          </span>
        </div>
      </div>
      <div className="incident-card-right">
        <div style={{ textAlign: 'right' }}>
          <div className="stat-value" style={{ fontSize: '1.25rem', color: `var(--severity-${incident.severity})` }}>
            {incident.severityResult.numericScore}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Score
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {incident.blastRadius.total > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {incident.blastRadius.total} downstream
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
