/**
 * ImpactPreview — Before/after comparison when a policy is applied.
 */

// No default React import needed for modern JSX runtime

export default function ImpactPreview({ impact }) {
  if (!impact?.changes) return null;

  const LABELS = {
    avg_speed: 'Avg Speed',
    avg_congestion: 'Congestion',
    total_vehicles: 'Vehicles',
    avg_pollution: 'Pollution',
    avg_noise: 'Noise',
    avg_honking_rate: 'Honking Rate',
  };

  const entries = Object.entries(impact.changes).filter(
    ([key]) => LABELS[key]
  );

  return (
    <div className="impact-preview animate-fade-in">
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
        📊 Policy Impact
      </div>

      {entries.map(([key, data]) => {
        const pct = data.change_pct;
        const colorClass = pct < -1 ? 'positive' : pct > 1 ? 'negative' : 'neutral';
        const arrow = pct < 0 ? '↓' : pct > 0 ? '↑' : '→';

        return (
          <div className="impact-row" key={key}>
            <span className="impact-label">{LABELS[key]}</span>
            <div>
              <span className="impact-value neutral" style={{ fontSize: 'var(--text-xs)' }}>
                {typeof data.before === 'number' ? data.before.toFixed(1) : data.before}
              </span>
              <span className="impact-arrow">{arrow}</span>
              <span className={`impact-value ${colorClass}`}>
                {typeof data.after === 'number' ? data.after.toFixed(1) : data.after}
              </span>
              <span className={`impact-value ${colorClass}`} style={{ fontSize: 'var(--text-xs)', marginLeft: '4px' }}>
                ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
              </span>
            </div>
          </div>
        );
      })}

      {impact.summary && (
        <div style={{ marginTop: '8px', fontSize: 'var(--text-xs)', color: 'var(--accent-cyan)', fontStyle: 'italic' }}>
          {impact.summary}
        </div>
      )}
    </div>
  );
}
