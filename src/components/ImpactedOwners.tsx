import type { Owner } from '../lib/types';
import { Users } from 'lucide-react';

interface Props {
  owners: Owner[];
  teams: Owner[];
}

export default function ImpactedOwners({ owners, teams }: Props) {
  const all = [...teams, ...owners];

  return (
    <div className="card animate-in animate-in-delay-4" id="impacted-owners-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' }}>
          <Users size={14} />
        </div>
        <h3>Impacted Owners & Teams</h3>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {all.length} total
        </span>
      </div>

      {all.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '12px 0' }}>
          No owners or teams identified.
        </div>
      ) : (
        <div className="owners-grid">
          {all.map((o) => (
            <div className="owner-card" key={o.id}>
              <div className={`owner-avatar ${o.type}`}>
                {o.displayName.charAt(0)}
              </div>
              <div className="owner-info">
                <span className="owner-name">{o.displayName}</span>
                <span className="owner-type">
                  {o.type === 'team' ? '👥 Team' : '👤 User'}
                  {o.email ? ` · ${o.email}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
