import type { TimelineEvent } from '../lib/types';
import { Clock } from 'lucide-react';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="card animate-in animate-in-delay-4" id="timeline-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa' }}>
          <Clock size={14} />
        </div>
        <h3>Incident Timeline</h3>
      </div>

      <div className="timeline">
        {sorted.map((event) => (
          <div className="timeline-item" key={event.id}>
            <div className={`timeline-dot ${event.type}`} />
            <div className="timeline-content">{event.description}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="timeline-time">{formatTimestamp(event.timestamp)}</div>
              {event.actor && <div className="timeline-actor">{event.actor}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
