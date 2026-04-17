import type { SeverityResult } from '../lib/types';

const severityColor: Record<string, string> = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
};

function signalBarColor(score: number): string {
  if (score >= 80) return 'var(--severity-critical)';
  if (score >= 55) return 'var(--severity-high)';
  if (score >= 30) return 'var(--severity-medium)';
  return 'var(--severity-low)';
}

export default function SeverityScore({ result }: { result: SeverityResult }) {
  const color = severityColor[result.overall] ?? 'var(--text-secondary)';
  const circumference = 2 * Math.PI * 54; // radius 54
  const offset = circumference - (result.numericScore / 100) * circumference;

  return (
    <div className="card animate-in animate-in-delay-2" id="severity-score-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'var(--severity-critical)' }}>⚡</div>
        <h3>Severity Analysis</h3>
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        {/* Gauge */}
        <div className="severity-meter">
          <div className="severity-gauge">
            <svg width="140" height="140" viewBox="0 0 120 120">
              <circle className="severity-gauge-track" cx="60" cy="60" r="54" />
              <circle
                className="severity-gauge-fill"
                cx="60" cy="60" r="54"
                stroke={color}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="severity-gauge-label">
              <span className="score" style={{ color }}>{result.numericScore}</span>
              <span className="label">{result.overall}</span>
            </div>
          </div>
        </div>

        {/* Signals */}
        <div className="signal-list" style={{ flex: 1 }}>
          {result.signals.map((sig, i) => (
            <div className="signal-item" key={i}>
              <div className="signal-header">
                <span className="signal-name">{sig.signal}</span>
                <span className="signal-score">{sig.score}/100 (×{sig.weight})</span>
              </div>
              <div className="signal-bar">
                <div
                  className="signal-bar-fill"
                  style={{
                    width: `${sig.score}%`,
                    background: signalBarColor(sig.score),
                  }}
                />
              </div>
              <span className="signal-desc">{sig.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
