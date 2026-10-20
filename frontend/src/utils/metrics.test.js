import { describe, expect, it } from 'vitest';
import { formatDuration, formatMetric, metricLabel } from './format.js';
import { bestRunId, collectMetricNames, lowerIsBetter } from './metrics.js';

const runs = [
  { id: 1, metrics: { accuracy: 0.8, loss: 0.4, sample_size: 100, zeta: 1 } },
  { id: 2, metrics: { accuracy: 0.9, loss: 0.5, sample_size: 200 } },
];

describe('metric helpers', () => {
  it('knows which metrics are lower-is-better', () => {
    expect(lowerIsBetter('loss')).toBe(true);
    expect(lowerIsBetter('latency_p95_ms')).toBe(true);
    expect(lowerIsBetter('accuracy')).toBe(false);
  });

  it('picks the best run per metric direction and skips descriptive metrics', () => {
    expect(bestRunId(runs, 'accuracy')).toBe(2);
    expect(bestRunId(runs, 'loss')).toBe(1);
    expect(bestRunId(runs, 'sample_size')).toBeNull();
    expect(bestRunId(runs, 'zeta')).toBeNull(); // only one run reports it
  });

  it('lists standard metrics first', () => {
    expect(collectMetricNames(runs)).toEqual(['accuracy', 'loss', 'sample_size', 'zeta']);
  });

  it('formats values for display', () => {
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(null)).toBe('—');
    expect(formatMetric(0.123456)).toBe('0.1235');
    expect(metricLabel('f1_macro')).toBe('F1 macro');
  });
});
