import type { TestCaseResult } from '../lib/types';
import { FlaskConical, CheckCircle2, XCircle } from 'lucide-react';

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TestResults({ results }: { results: TestCaseResult[] }) {
  if (results.length === 0) {
    return (
      <div className="card animate-in animate-in-delay-3" id="test-results-panel">
        <div className="card-header">
          <div className="card-icon" style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#22d3ee' }}>
            <FlaskConical size={14} />
          </div>
          <h3>Test Results</h3>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '12px 0' }}>
          No test case results available for this asset.
        </div>
      </div>
    );
  }

  const failed = results.filter(r => r.status === 'Failed').length;
  const passed = results.filter(r => r.status === 'Success').length;

  return (
    <div className="card animate-in animate-in-delay-3" id="test-results-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#22d3ee' }}>
          <FlaskConical size={14} />
        </div>
        <h3>Recent Test Results</h3>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <XCircle size={14} style={{ color: 'var(--severity-critical)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--severity-critical)' }}>{failed} Failed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} style={{ color: 'var(--severity-low)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--severity-low)' }}>{passed} Passed</span>
        </div>
      </div>

      <div className="test-results-list">
        {results.map((r) => (
          <div className="test-result-item" key={r.id}>
            <div className={`test-result-icon ${r.status === 'Failed' ? 'failed' : 'success'}`}>
              {r.status === 'Failed' ? '✕' : '✓'}
            </div>
            <div className="test-result-info">
              <div className="test-result-name">{r.testCaseName}</div>
              {r.result && <div className="test-result-detail">{r.result}</div>}
              <div className="test-result-detail">{r.testSuiteName}</div>
            </div>
            <div className="test-result-time">{formatTime(r.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
