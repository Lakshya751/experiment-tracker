import { formatMetric } from '../utils/format.js';

/** Tooltip body: values lead (strong), series names follow; each row keyed by a short line in the series color. */
export default function ChartTooltip({ active, payload, title }) {
  if (!active || !payload?.length) return null;
  const heading = typeof title === 'function' ? title(payload[0].payload) : title;
  return (
    <div className="chart-tooltip">
      {heading && <div className="chart-tooltip-title">{heading}</div>}
      {payload.map((entry) => (
        <div key={entry.dataKey} className="chart-tooltip-row">
          <span className="chart-key" style={{ background: entry.color }} aria-hidden="true" />
          <strong>{formatMetric(entry.value)}</strong>
          <span className="muted">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
