import { useState } from 'react';
import type { ChecklistItem } from '../lib/types';
import { ClipboardCheck } from 'lucide-react';

const categoryLabels: Record<string, string> = {
  investigate: '🔍 Investigate',
  communicate: '📢 Communicate',
  mitigate: '🛠️ Mitigate',
  resolve: '✅ Resolve',
};

const categoryOrder = ['investigate', 'communicate', 'mitigate', 'resolve'];

export default function ActionChecklist({ checklist: initial }: { checklist: ChecklistItem[] }) {
  const [items, setItems] = useState(initial);

  const toggle = (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const completed = items.filter(i => i.checked).length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);

  const grouped = categoryOrder.map(cat => ({
    category: cat,
    label: categoryLabels[cat],
    items: items.filter(i => i.category === cat),
  }));

  return (
    <div className="card animate-in animate-in-delay-5" id="action-checklist-panel">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--severity-low)' }}>
          <ClipboardCheck size={14} />
        </div>
        <h3>Resolution Checklist</h3>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: pct === 100 ? 'var(--severity-low)' : 'var(--text-muted)' }}>
          {completed}/{total} ({pct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 2,
        marginBottom: 16,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct === 100 ? 'var(--severity-low)' : 'var(--accent-primary)',
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {grouped.map(g => (
        <div key={g.category}>
          {g.items.length > 0 && (
            <>
              <div className="checklist-category">{g.label}</div>
              <ul className="checklist">
                {g.items.map(item => (
                  <li
                    key={item.id}
                    className={`checklist-item ${item.checked ? 'checked' : ''}`}
                    onClick={() => toggle(item.id)}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggle(item.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="checklist-label">{item.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
