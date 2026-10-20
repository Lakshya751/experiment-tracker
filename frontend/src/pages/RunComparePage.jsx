import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import RunComparisonChart from '../charts/RunComparisonChart.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { AsyncContent, EmptyState } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDuration, formatMetric, metricLabel } from '../utils/format.js';
import { bestRunId, collectMetricNames, isRanked, lowerIsBetter } from '../utils/metrics.js';

export default function RunComparePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const selectedIds = (params.get('runs') || '').split(',').map(Number).filter(Boolean);
  const [metric, setMetric] = useState(null);
  const experiment = useApi((signal) => api.getExperiment(id, { signal }), [id]);
  const runs = useApi((signal) => api.listRuns(id, { per_page: 100 }, { signal }), [id]);

  const combined = {
    loading: experiment.loading || runs.loading,
    error: experiment.error || runs.error,
    data: experiment.data && runs.data ? { experiment: experiment.data, runs: runs.data, meta: runs.meta } : null,
    reload: () => { experiment.reload(); runs.reload(); },
  };

  return (
    <AsyncContent result={combined} loadingLabel="Loading runs…" errorTitle="Could not load runs">
      {({ experiment: exp, runs: allRuns, meta }) => {
        const selected = allRuns.filter((run) => selectedIds.includes(run.id));
        const metricNames = collectMetricNames(selected);
        const paramNames = [...new Set(selected.flatMap((run) => Object.keys(run.parameters)))].sort();
        const chartMetric = metric && metricNames.includes(metric) ? metric : metricNames[0];

        return (
          <div className="stack">
            <PageHeader
              title="Compare runs"
              breadcrumbs={[
                { to: '/experiments', label: 'Experiments' },
                { to: `/experiments/${id}`, label: exp.name },
                { label: 'Compare runs' },
              ]}
              subtitle={`${selected.length} runs from ${exp.name}`}
            />
            {selected.length < 2 ? (
              <EmptyState
                title="Select at least two runs"
                message="Go back to the experiment and tick the runs you want to compare."
                action={<Link className="btn" to={`/experiments/${id}`}>Back to experiment</Link>}
              />
            ) : (
              <>
                {!meta.details_available && <p className="alert">Metrics and parameters are unavailable (MongoDB unreachable).</p>}
                <section className="card">
                  <div className="card-header">
                    <h2>{chartMetric ? metricLabel(chartMetric) : 'Metric'} by run</h2>
                    {metricNames.length > 0 && (
                      <label className="inline-field">
                        <span className="muted">Metric</span>
                        <select className="select select-sm" value={chartMetric} onChange={(e) => setMetric(e.target.value)}>
                          {metricNames.map((name) => <option key={name} value={name}>{metricLabel(name)}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  {chartMetric ? <RunComparisonChart runs={selected} metric={chartMetric} /> : <p className="muted">No metrics recorded for these runs.</p>}
                </section>

                <section className="card">
                  <h2 className="card-title">Side-by-side</h2>
                  <p className="hint">★ marks the best value in each metric row ({'lower is better for loss, error, latency and duration metrics'}).</p>
                  <div className="table-wrap">
                    <table className="table compare-table">
                      <thead>
                        <tr>
                          <th scope="col">Field</th>
                          {selected.map((run) => (
                            <th key={run.id} scope="col"><Link to={`/runs/${run.id}`}>{run.name}</Link></th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th scope="row">Status</th>
                          {selected.map((run) => <td key={run.id}><StatusBadge status={run.status} /></td>)}
                        </tr>
                        <tr>
                          <th scope="row">Wall-clock duration</th>
                          {selected.map((run) => <td key={run.id}>{formatDuration(run.duration_seconds)}</td>)}
                        </tr>
                        <tr className="section-row"><th colSpan={selected.length + 1}>Metrics</th></tr>
                        {metricNames.map((name) => {
                          const best = bestRunId(selected, name);
                          return (
                            <tr key={name}>
                              <th scope="row">
                                {metricLabel(name)}{' '}
                                {isRanked(name) && <span className="subtle" title={lowerIsBetter(name) ? 'Lower is better' : 'Higher is better'}>{lowerIsBetter(name) ? '↓' : '↑'}</span>}
                              </th>
                              {selected.map((run) => (
                                <td key={run.id} className={`num${run.id === best ? ' best-cell' : ''}`}>
                                  {formatMetric(run.metrics[name])}
                                  {run.id === best && <span aria-label="best"> ★</span>}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        <tr className="section-row"><th colSpan={selected.length + 1}>Parameters</th></tr>
                        {paramNames.map((name) => {
                          const values = selected.map((run) => run.parameters[name]);
                          const differs = new Set(values.map((v) => JSON.stringify(v))).size > 1;
                          return (
                            <tr key={name} className={differs ? 'differs' : undefined}>
                              <th scope="row">{name}{differs && <span className="subtle"> (differs)</span>}</th>
                              {values.map((value, index) => (
                                <td key={selected[index].id} className="mono">{value === undefined ? '—' : String(value)}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </div>
        );
      }}
    </AsyncContent>
  );
}
