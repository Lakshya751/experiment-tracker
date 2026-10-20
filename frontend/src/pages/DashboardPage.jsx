import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import MetricComparisonChart from '../charts/MetricComparisonChart.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { AsyncContent, EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime, formatMetric, metricLabel } from '../utils/format.js';

const MAX_SELECTED = 10;

function SummaryCards({ counts }) {
  return (
    <section className="grid-4" aria-label="Summary">
      <StatCard
        label="Total experiments"
        value={counts.total_experiments}
        hint={`${counts.by_status.draft} draft · ${counts.by_status.archived} archived`}
      />
      <StatCard label="Active experiments" value={counts.active_experiments} hint="Status: Running" />
      <StatCard label="Completed experiments" value={counts.completed_experiments} hint={`${counts.total_runs} runs logged in total`} />
      <StatCard label="Researchers" value={counts.researchers} hint="Across all teams" />
    </section>
  );
}

function RecentRuns({ runs, detailsAvailable }) {
  if (runs.length === 0) {
    return <EmptyState title="No runs yet" message="Runs appear here once they are logged against an experiment." />;
  }
  return (
    <>
      {!detailsAvailable && (
        <p className="alert">Run metrics are temporarily unavailable (MongoDB unreachable). Run metadata is still shown.</p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Experiment</th>
              <th>Status</th>
              <th>Started</th>
              <th className="num">Accuracy</th>
              <th className="num">Loss</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td><Link to={`/runs/${run.id}`}>{run.name}</Link></td>
                <td><Link to={`/experiments/${run.experiment.id}`}>{run.experiment.name}</Link></td>
                <td><StatusBadge status={run.status} /></td>
                <td className="nowrap">{formatDateTime(run.started_at)}</td>
                <td className="num">{formatMetric(run.metrics.accuracy)}</td>
                <td className="num">{formatMetric(run.metrics.loss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExperimentSelector({ options, selected, onChange }) {
  const label = selected.length ? `${selected.length} selected` : 'Most completed runs (default)';
  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < MAX_SELECTED) onChange([...selected, id]);
  }
  return (
    <details className="dropdown">
      <summary className="btn btn-sm">Experiments: {label}</summary>
      <div className="dropdown-panel">
        <p className="hint">Choose up to {MAX_SELECTED} experiments with completed runs.</p>
        <ul className="picker-list">
          {options.map((experiment) => (
            <li key={experiment.id}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selected.includes(experiment.id)}
                  disabled={!selected.includes(experiment.id) && selected.length >= MAX_SELECTED}
                  onChange={() => toggle(experiment.id)}
                />
                <span>{experiment.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function ComparisonTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Experiment</th>
            <th className="num">Best</th>
            <th>Best run</th>
            <th className="num">Latest</th>
            <th>Latest run</th>
            <th className="num">Runs with metric</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.experiment.id}>
              <td><Link to={`/experiments/${row.experiment.id}`}>{row.experiment.name}</Link></td>
              <td className="num">{formatMetric(row.best_value)}</td>
              <td>{row.best_run || '—'}</td>
              <td className="num">{formatMetric(row.latest_value)}</td>
              <td>{row.latest_run || '—'}</td>
              <td className="num">{row.runs_with_metric} / {row.completed_runs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricComparison() {
  const [metric, setMetric] = useState('');
  const [selected, setSelected] = useState([]);
  const [showTable, setShowTable] = useState(false);
  const comparison = useApi(
    (signal) => api.metricComparison({ metric, experiment_ids: selected }, { signal }),
    [metric, selected.join(',')],
  );
  const experimentOptions = useApi(
    (signal) => api.listExperiments({ status: 'all', per_page: 100, sort: 'name' }, { signal }),
    [],
  );

  const data = comparison.data;
  const metricOptions = data ? Array.from(new Set([data.metric, ...data.available_metrics])) : [];
  const rows = data?.experiments || [];
  const hasValues = rows.some((row) => row.best_value !== null);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Compare experiment metrics</h2>
          <p className="muted">Best and latest value from completed runs.</p>
        </div>
        <div className="row">
          <label className="inline-field">
            <span className="muted">Metric</span>
            <select
              className="select select-sm"
              value={data?.metric || metric}
              onChange={(event) => setMetric(event.target.value)}
              disabled={!data}
            >
              {metricOptions.map((name) => (
                <option key={name} value={name}>{metricLabel(name)}</option>
              ))}
            </select>
          </label>
          {experimentOptions.data && (
            <ExperimentSelector options={experimentOptions.data} selected={selected} onChange={setSelected} />
          )}
          {selected.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setSelected([])}>Reset</button>
          )}
        </div>
      </div>

      {comparison.loading && !data && <LoadingState label="Loading comparison…" />}
      {comparison.error && <ErrorState error={comparison.error} onRetry={comparison.reload} title="Could not load the comparison" />}
      {data && !comparison.error && (
        <>
          {!data.details_available && (
            <p className="alert">Metrics are temporarily unavailable because MongoDB cannot be reached.</p>
          )}
          {data.details_available && !hasValues ? (
            <EmptyState
              title="Nothing to compare"
              message={`None of the selected experiments have completed runs that report ${metricLabel(data.metric)}.`}
            />
          ) : (
            data.details_available && (
              <div className={comparison.loading ? 'is-refreshing' : undefined}>
                <MetricComparisonChart rows={rows} metric={data.metric} lowerIsBetter={data.lower_is_better} />
                <button type="button" className="btn-link" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
                  {showTable ? 'Hide data table' : 'Show data table'}
                </button>
                {showTable && <ComparisonTable rows={rows} />}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const summary = useApi((signal) => api.dashboardSummary({ signal }), []);
  return (
    <div className="stack">
      <PageHeader title="Dashboard" subtitle="Overview of experiments and recent runs across the research team." />
      <AsyncContent result={summary} loadingLabel="Loading dashboard…" errorTitle="Could not load the dashboard">
        {(data) => (
          <>
            <SummaryCards counts={data.counts} />
            <MetricComparison />
            <section className="card">
              <div className="card-header">
                <h2>Recent runs</h2>
                <Link to="/experiments" className="btn btn-sm">All experiments</Link>
              </div>
              <RecentRuns runs={data.recent_runs} detailsAvailable={data.details_available} />
            </section>
          </>
        )}
      </AsyncContent>
    </div>
  );
}
