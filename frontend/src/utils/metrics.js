// Mirrors backend/app/run_service.py: metrics where a smaller value is better.
const LOWER_IS_BETTER_HINTS = [
  'loss', 'error', 'mape', 'rmse', 'mae', 'perplexity', 'latency', 'duration',
  'p_value', 'size_mb', 'trials_to_target', 'r_hat',
];

export const STANDARD_METRICS = ['accuracy', 'loss', 'duration_seconds', 'sample_size'];

export function isRanked(metric) {
  return !NOT_RANKED.includes(metric);
}

export function lowerIsBetter(metric) {
  return LOWER_IS_BETTER_HINTS.some((hint) => metric.includes(hint));
}

/** Union of metric names across runs, standard metrics first. */
export function collectMetricNames(runs) {
  const names = new Set();
  runs.forEach((run) => Object.keys(run.metrics || {}).forEach((name) => names.add(name)));
  const standard = STANDARD_METRICS.filter((name) => names.has(name));
  const custom = [...names].filter((name) => !STANDARD_METRICS.includes(name)).sort();
  return [...standard, ...custom];
}

// Descriptive metrics (not results), so no run is "best" at them.
const NOT_RANKED = ['sample_size'];

/** Returns the id of the run with the best value for `metric`, or null. */
export function bestRunId(runs, metric) {
  if (NOT_RANKED.includes(metric)) return null;
  const candidates = runs.filter((run) => typeof run.metrics?.[metric] === 'number');
  if (candidates.length < 2) return null;
  const pick = lowerIsBetter(metric)
    ? (a, b) => (b.metrics[metric] < a.metrics[metric] ? b : a)
    : (a, b) => (b.metrics[metric] > a.metrics[metric] ? b : a);
  return candidates.reduce(pick).id;
}
