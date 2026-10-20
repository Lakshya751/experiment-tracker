import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { AsyncContent } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime, formatDuration, formatMetric, metricLabel } from '../utils/format.js';
import { collectMetricNames } from '../utils/metrics.js';

function KeyValueTable({ entries, empty, renderValue = (v) => String(v) }) {
  if (entries.length === 0) return <p className="muted">{empty}</p>;
  return (
    <table className="table table-compact">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th scope="row" className="kv-key">{key}</th>
            <td className="mono">{renderValue(value, key)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RunDetailPage() {
  const { id } = useParams();
  const run = useApi((signal) => api.getRun(id, { signal }), [id]);

  return (
    <AsyncContent result={run} loadingLabel="Loading run…" errorTitle="Could not load this run">
      {(data) => {
        const metricEntries = collectMetricNames([data]).map((name) => [name, data.metrics[name]]);
        const archived = data.experiment.status === 'archived';
        return (
          <div className="stack">
            <PageHeader
              breadcrumbs={[
                { to: '/experiments', label: 'Experiments' },
                { to: `/experiments/${data.experiment.id}`, label: data.experiment.name },
                { label: data.name },
              ]}
              title={data.name}
              subtitle={<StatusBadge status={data.status} />}
              actions={<Link to={`/runs/${id}/edit`} className="btn">Edit run</Link>}
            />
            {data.details_status === 'unavailable' && (
              <p className="alert">Parameters, metrics, notes and logs are temporarily unavailable because MongoDB cannot be reached.</p>
            )}
            {data.details_status === 'missing' && (
              <p className="alert alert-info">No details document exists for this run. Editing the run will create one.</p>
            )}
            {archived && <p className="alert alert-info">This run belongs to an archived experiment.</p>}

            <section className="card">
              <dl className="meta-list">
                <div><dt>Started</dt><dd>{formatDateTime(data.started_at)}</dd></div>
                <div><dt>Ended</dt><dd>{data.ended_at ? formatDateTime(data.ended_at) : 'Still running'}</dd></div>
                <div><dt>Wall-clock duration</dt><dd>{formatDuration(data.duration_seconds)}</dd></div>
                <div><dt>Run ID</dt><dd className="mono">{data.id}</dd></div>
              </dl>
            </section>

            <div className="grid-2">
              <section className="card">
                <h2 className="card-title">Metrics</h2>
                <KeyValueTable
                  entries={metricEntries.map(([k, v]) => [metricLabel(k), { key: k, value: v }])}
                  empty="No metrics recorded."
                  renderValue={({ key, value }) => (key === 'duration_seconds' ? `${formatMetric(value)} s (${formatDuration(value)})` : formatMetric(value))}
                />
              </section>
              <section className="card">
                <h2 className="card-title">Parameters</h2>
                <KeyValueTable entries={Object.entries(data.parameters)} empty="No parameters recorded." />
              </section>
            </div>

            <section className="card">
              <h2 className="card-title">Notes</h2>
              <p className="prewrap">{data.notes || <span className="subtle">No notes.</span>}</p>
            </section>

            <section className="card">
              <h2 className="card-title">Logs</h2>
              {(data.logs || []).length === 0 ? (
                <p className="muted">No log entries.</p>
              ) : (
                <ol className="log-list">
                  {data.logs.map((entry, index) => (
                    <li key={index} className={`log-entry log-${entry.level}`}>
                      <span className="mono subtle">{formatDateTime(entry.timestamp)}</span>
                      <span className="log-level">{entry.level}</span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        );
      }}
    </AsyncContent>
  );
}
