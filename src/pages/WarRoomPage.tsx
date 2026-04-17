import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMockIncident } from '../data/mock-data';
import AssetInfo from '../components/AssetInfo';
import SeverityScore from '../components/SeverityScore';
import BlastRadius from '../components/BlastRadius';
import ImpactedOwners from '../components/ImpactedOwners';
import TestResults from '../components/TestResults';
import ActionChecklist from '../components/ActionChecklist';
import IncidentTimeline from '../components/IncidentTimeline';
import LineageGraph from '../components/LineageGraph';
import { ArrowLeft, Clock } from 'lucide-react';

function typeLabel(type: string) {
  switch (type) {
    case 'data_quality': return 'Data Quality';
    case 'schema_drift': return 'Schema Drift';
    case 'pipeline_failure': return 'Pipeline Failure';
    default: return type;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WarRoomPage() {
  const { id } = useParams<{ id: string }>();
  const incident = useMemo(() => getMockIncident(id ?? ''), [id]);

  if (!incident) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔍</div>
        <div className="empty-state-title">Incident Not Found</div>
        <p style={{ marginTop: 8 }}>
          <Link to="/">← Back to incidents</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Back link */}
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        All Incidents
      </Link>

      {/* Incident header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className={`badge badge-severity-${incident.severity}`}>{incident.severity}</span>
          <span className={`badge badge-status-${incident.status}`}>{incident.status}</span>
          <span className="badge badge-type">{typeLabel(incident.type)}</span>
        </div>
        <h1 className="page-title" style={{ fontSize: '1.5rem' }}>{incident.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Clock size={14} />
            Created {formatDate(incident.createdAt)}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Updated {formatDate(incident.updatedAt)}
          </span>
        </div>
      </div>

      {/* Severity score — full width */}
      <SeverityScore result={incident.severityResult} />

      {/* Lineage graph — full width */}
      <div style={{ marginTop: 20 }}>
        <LineageGraph lineage={incident.lineage} rootId={incident.rootAsset.id} />
      </div>

      {/* War Room grid */}
      <div className="warroom-grid">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <AssetInfo asset={incident.rootAsset} isRoot />
          <ImpactedOwners owners={incident.impactedOwners} teams={incident.impactedTeams} />
          <IncidentTimeline events={incident.timeline} />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <BlastRadius incident={incident} />
          <TestResults results={incident.testResults} />
          <ActionChecklist checklist={incident.checklist} />
        </div>
      </div>
    </div>
  );
}
