import { useState, useMemo } from 'react';
import { getMockIncidents } from '../data/mock-data';
import IncidentCard from '../components/IncidentCard';
import type { IncidentType, Severity, IncidentStatus } from '../lib/types';
import { AlertTriangle, Flame, Shield, CheckCircle2 } from 'lucide-react';

type Filter = 'all' | IncidentType | Severity | IncidentStatus;

export default function IncidentListPage() {
  const incidents = useMemo(() => getMockIncidents(), []);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return incidents;
    return incidents.filter(i =>
      i.type === filter || i.severity === filter || i.status === filter
    );
  }, [incidents, filter]);

  // Summary counts
  const counts = {
    total: incidents.length,
    critical: incidents.filter(i => i.severity === 'critical').length,
    high: incidents.filter(i => i.severity === 'high').length,
    open: incidents.filter(i => i.status === 'open' || i.status === 'investigating').length,
    resolved: incidents.filter(i => i.status === 'resolved').length,
  };

  return (
    <div className="animate-in">
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Incident Command Center</h1>
        <p className="page-subtitle">
          Active data incidents detected via OpenMetadata quality tests, schema monitoring, and pipeline health checks.
        </p>
      </div>

      {/* Summary stats */}
      <div className="summary-row animate-in animate-in-delay-1">
        <div className="summary-stat">
          <div className="value" style={{ color: 'var(--text-primary)' }}>{counts.total}</div>
          <div className="label">Total</div>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <div className="value" style={{ color: 'var(--severity-critical)' }}>
            <Flame size={20} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {counts.critical}
          </div>
          <div className="label">Critical</div>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <div className="value" style={{ color: 'var(--severity-high)' }}>
            <AlertTriangle size={20} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {counts.high}
          </div>
          <div className="label">High</div>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <div className="value" style={{ color: 'var(--severity-medium)' }}>
            <Shield size={20} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {counts.open}
          </div>
          <div className="label">Active</div>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <div className="value" style={{ color: 'var(--severity-low)' }}>
            <CheckCircle2 size={20} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {counts.resolved}
          </div>
          <div className="label">Resolved</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar animate-in animate-in-delay-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'data_quality', label: 'Data Quality' },
          { key: 'schema_drift', label: 'Schema Drift' },
          { key: 'pipeline_failure', label: 'Pipeline Failure' },
          { key: 'critical', label: '🔴 Critical' },
          { key: 'high', label: '🟠 High' },
          { key: 'medium', label: '🟡 Medium' },
        ].map(f => (
          <button
            key={f.key}
            className={`filter-chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key as Filter)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Incident list */}
      <div className="incident-list animate-in animate-in-delay-3">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <div className="empty-state-title">No incidents match this filter</div>
            <p>Try a different filter or check back later.</p>
          </div>
        ) : (
          filtered.map(incident => (
            <IncidentCard key={incident.id} incident={incident} />
          ))
        )}
      </div>
    </div>
  );
}
