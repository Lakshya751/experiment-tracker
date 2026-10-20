import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import MetricTrendChart from '../charts/MetricTrendChart.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { AsyncContent, EmptyState } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDate, formatDateTime, formatDuration, formatMetric, metricLabel } from '../utils/format.js';
import { collectMetricNames } from '../utils/metrics.js';

const MAX_COMPARE = 5;

function Overview({ experiment }) {
  return (
    <section className="card stack">
      <div className="detail-grid">
        <div>
          <h3>Description</h3>
          <p className="prewrap">{experiment.description || <span className="subtle">No description.</span>}</p>
        </div>
        <div>
          <h3>Hypothesis</h3>
          <p className="prewrap">{experiment.hypothesis || <span className="subtle">No hypothesis recorded.</span>}</p>
        </div>
      </div>
      <dl className="meta-list">
        <div>
          <dt>Owner</dt>
          <dd><Link to={`/researchers/${experiment.owner.id}`}>{experiment.owner.name}</Link></dd>
        </div>
        <div>
          <dt>Team members</dt>
          <dd>
            {experiment.members.length === 0 && <span className="subtle">None</span>}
            {experiment.members.map((member, index) => (
              <span key={member.id}>
                {index > 0 && ', '}
                <Link to={`/researchers/${member.id}`}>{member.name}</Link>
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Dates</dt>
          <dd>{formatDate(experiment.start_date)} → {experiment.end_date ? formatDate(experiment.end_date) : 'ongoing'}</dd>
        </div>
        <div>
          <dt>Tags</dt>
          <dd>
            {experiment.tags.length === 0 && <span className="subtle">None</span>}
            {experiment.tags.map((tag) => (
              <Link key={tag} to={`/experiments?tag=${encodeURIComponent(tag)}&status=all`} className="tag">{tag}</Link>
            ))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function LatestResult({ experiment }) {
  const run = experiment.latest_result;
  const counts = experiment.run_status_counts;
  return (
    <section className="card">
      <div className="card-header">
        <h2>Latest result</h2>
        <span className="muted">
          {experiment.run_count} runs · {counts.completed} completed · {counts.running} running · {counts.failed} failed
        </span>
      </div>
      {!run && <p className="muted">No completed runs yet.</p>}
      {run && (
        <div className="stack-tight">
          <p>
            <Link to={`/runs/${run.id}`}><strong>{run.name}</strong></Link>
            <span className="muted"> · finished {formatDateTime(run.ended_at)}</span>
          </p>
          {run.details_status === 'unavailable' ? (
            <p className="alert">Metrics are temporarily unavailable (MongoDB unreachable).</p>
          ) : (
            <div className="metric-tiles">
              {Object.entries(run.metrics).map(([name, value]) => (
                <div key={name} className="metric-tile">
                  <span className="stat-label">{metricLabel(name)}</span>
                  <span className="metric-value">{name === 'duration_seconds' ? formatDuration(value) : formatMetric(value)}</span>
                </div>
              ))}
              {Object.keys(run.metrics).length === 0 && <p className="muted">This run has no metrics recorded.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RunHistory({ experiment, runsResult, page, onPageChange }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [metric, setMetric] = useState(null);
  const runs = runsResult.data;
  const metricNames = collectMetricNames(runs);
  // Wall-clock duration already has its own column.
  const tableMetrics = metricNames.filter((name) => name !== 'duration_seconds').slice(0, 4);
  const chartMetric = metric && metricNames.includes(metric) ? metric : metricNames.find((m) => m !== 'sample_size' && m !== 'duration_seconds') || metricNames[0];

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev));
  }

  if (runs.length === 0) {
    return (
      <section className="card">
        <h2>Runs</h2>
        <EmptyState
          title="No runs yet"
          message={experiment.status === 'archived' ? 'This experiment is archived.' : 'Log the first run to start tracking results.'}
          action={experiment.status !== 'archived' && (
            <Link to={`/experiments/${experiment.id}/runs/new`} className="btn btn-primary">New run</Link>
          )}
        />
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Metric trend</h2>
            <p className="muted">Completed runs in order of start time.</p>
          </div>
          {metricNames.length > 0 && (
            <label className="inline-field">
              <span className="muted">Metric</span>
              <select className="select select-sm" value={chartMetric} onChange={(e) => setMetric(e.target.value)}>
                {metricNames.map((name) => <option key={name} value={name}>{metricLabel(name)}</option>)}
              </select>
            </label>
          )}
        </div>
        {!runsResult.meta?.details_available ? (
          <p className="alert">Metrics are temporarily unavailable (MongoDB unreachable).</p>
        ) : chartMetric ? (
          <MetricTrendChart runs={runs} metric={chartMetric} />
        ) : (
          <p className="muted">No metrics have been recorded for these runs.</p>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Run history</h2>
            <p className="muted">Select 2–{MAX_COMPARE} runs to compare them side by side.</p>
          </div>
          <button
            type="button"
            className="btn"
            disabled={selected.length < 2}
            onClick={() => navigate(`/experiments/${experiment.id}/compare?runs=${selected.join(',')}`)}
          >
            Compare selected ({selected.length})
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th><span className="sr-only">Select</span></th>
                <th>Run</th>
                <th>Status</th>
                <th>Started</th>
                <th className="num">Duration</th>
                {tableMetrics.map((name) => <th key={name} className="num">{metricLabel(name)}</th>)}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${run.name} for comparison`}
                      checked={selected.includes(run.id)}
                      disabled={!selected.includes(run.id) && selected.length >= MAX_COMPARE}
                      onChange={() => toggle(run.id)}
                    />
                  </td>
                  <td><Link to={`/runs/${run.id}`}>{run.name}</Link></td>
                  <td><StatusBadge status={run.status} /></td>
                  <td className="nowrap">{formatDateTime(run.started_at)}</td>
                  <td className="num">{formatDuration(run.duration_seconds)}</td>
                  {tableMetrics.map((name) => (
                    <td key={name} className="num">{formatMetric(run.metrics[name])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination meta={runsResult.meta} noun="runs" onPageChange={onPageChange} />
        {page > 1 && <p className="hint">The chart shows the runs on this page.</p>}
      </section>
    </>
  );
}

export default function ExperimentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const experiment = useApi((signal) => api.getExperiment(id, { signal }), [id]);
  const runs = useApi((signal) => api.listRuns(id, { per_page: 100, page }, { signal }), [id, page]);

  async function archive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      await api.archiveExperiment(id);
      setConfirmOpen(false);
      experiment.reload();
      navigate('.', { replace: true, state: { notice: 'Experiment archived. Its runs are kept for reference.' } });
    } catch (error) {
      setArchiveError(error.message);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <AsyncContent result={experiment} loadingLabel="Loading experiment…" errorTitle="Could not load this experiment">
      {(data) => (
        <div className="stack">
          <PageHeader
            breadcrumbs={[{ to: '/experiments', label: 'Experiments' }, { label: data.name }]}
            title={data.name}
            subtitle={<StatusBadge status={data.status} />}
            actions={
              <>
                {data.status !== 'archived' && (
                  <Link to={`/experiments/${id}/runs/new`} className="btn btn-primary">New run</Link>
                )}
                <Link to={`/experiments/${id}/edit`} className="btn">Edit</Link>
                {data.status !== 'archived' && (
                  <button type="button" className="btn btn-danger" onClick={() => setConfirmOpen(true)}>Archive</button>
                )}
              </>
            }
          />
          {data.status === 'archived' && (
            <p className="alert alert-info">
              This experiment is archived, so new runs cannot be added. To reactivate it, edit the experiment and change its status.
            </p>
          )}
          <Overview experiment={data} />
          <LatestResult experiment={data} />
          <AsyncContent result={runs} loadingLabel="Loading runs…" errorTitle="Could not load runs">
            {() => <RunHistory experiment={data} runsResult={runs} page={page} onPageChange={setPage} />}
          </AsyncContent>

          <Modal open={confirmOpen} title="Archive experiment?" onClose={() => setConfirmOpen(false)}>
            <p>
              <strong>{data.name}</strong> will be hidden from the default experiment list and no new runs can be added.
              Existing runs and results are kept. You can reactivate it later by editing its status.
            </p>
            {archiveError && <p className="alert">{archiveError}</p>}
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={archive} disabled={archiving}>
                {archiving ? 'Archiving…' : 'Archive experiment'}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmOpen(false)}>Cancel</button>
            </div>
          </Modal>
        </div>
      )}
    </AsyncContent>
  );
}
