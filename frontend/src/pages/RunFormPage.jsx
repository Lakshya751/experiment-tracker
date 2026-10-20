import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import FormField from '../components/FormField.jsx';
import KeyValueEditor from '../components/KeyValueEditor.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { AsyncContent } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime, toDateTimeLocal } from '../utils/format.js';
import { STANDARD_METRICS } from '../utils/metrics.js';
import { serverFieldErrors, validateRun } from '../utils/validation.js';

const row = (key = '', value = '') => ({ id: crypto.randomUUID(), key, value: String(value) });

function emptyForm() {
  return {
    name: '',
    status: 'running',
    started_at: toDateTimeLocal(new Date().toISOString()),
    ended_at: '',
    notes: '',
    metrics: { accuracy: '', loss: '', duration_seconds: '', sample_size: '' },
    customMetrics: [],
    parameters: [row('learning_rate', '0.001'), row('batch_size', '32')],
  };
}

function formFromRun(run) {
  const metrics = Object.fromEntries(STANDARD_METRICS.map((name) => [name, run.metrics[name] ?? '']));
  return {
    name: run.name,
    status: run.status,
    started_at: toDateTimeLocal(run.started_at),
    ended_at: run.ended_at ? toDateTimeLocal(run.ended_at) : '',
    notes: run.notes,
    metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, String(v)])),
    customMetrics: Object.entries(run.metrics).filter(([k]) => !STANDARD_METRICS.includes(k)).map(([k, v]) => row(k, v)),
    parameters: Object.entries(run.parameters).map(([k, v]) => row(k, v)),
  };
}

const METRIC_FIELDS = [
  { name: 'accuracy', label: 'Accuracy', hint: 'Proportion between 0 and 1.', step: '0.0001', min: 0, max: 1 },
  { name: 'loss', label: 'Loss', hint: '0 or greater.', step: 'any', min: 0 },
  { name: 'duration_seconds', label: 'Duration (seconds)', hint: 'Defaults to end − start time if left empty.', step: 'any', min: 0 },
  { name: 'sample_size', label: 'Sample size', hint: 'Number of samples (whole number).', step: '1', min: 0 },
];

function RunForm({ initial, existingLogs, experimentName, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [logMessage, setLogMessage] = useState('');
  const [logLevel, setLogLevel] = useState('info');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function setStatus(status) {
    // Help the user: finishing a run usually means it ended now; running runs have no end time.
    setForm((prev) => ({
      ...prev,
      status,
      ended_at: status === 'running' ? '' : prev.ended_at || toDateTimeLocal(new Date().toISOString()),
    }));
    setErrors((prev) => ({ ...prev, ended_at: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const { errors: clientErrors, body } = validateRun(form);
    if (logMessage.length > 2000) clientErrors.logs = 'Log messages must be 2,000 characters or fewer.';
    setErrors(clientErrors);
    setFormError(Object.keys(clientErrors).length ? 'Please fix the highlighted fields.' : null);
    if (Object.keys(clientErrors).length) return;

    const logs = existingLogs.map(({ timestamp, level, message }) => ({ timestamp, level, message }));
    if (logMessage.trim()) logs.push({ level: logLevel, message: logMessage.trim() });
    setSaving(true);
    try {
      await onSubmit({ ...body, logs });
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setFormError(error.message);
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert" role="alert">{formError}</div>}
      <section className="card form-grid">
        <h2 className="full">Run details <span className="muted">· {experimentName}</span></h2>
        <FormField label="Run name" required error={errors.name} hint="e.g. r05-lower-lr">
          <input className="input" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
        </FormField>
        <FormField label="Status" required error={errors.status}>
          <select className="select" value={form.status} onChange={(e) => setStatus(e.target.value)}>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </FormField>
        <FormField label="Start time" required error={errors.started_at} hint="Your local time.">
          <input className="input" type="datetime-local" value={form.started_at} onChange={(e) => set('started_at', e.target.value)} />
        </FormField>
        <FormField
          label="End time"
          required={form.status !== 'running'}
          error={errors.ended_at}
          hint={form.status === 'running' ? 'Not used while the run is running.' : 'Required for completed and failed runs.'}
        >
          <input
            className="input"
            type="datetime-local"
            value={form.ended_at}
            disabled={form.status === 'running'}
            min={form.started_at}
            onChange={(e) => set('ended_at', e.target.value)}
          />
        </FormField>
      </section>

      <section className="card form-grid">
        <h2 className="full">Metrics</h2>
        {METRIC_FIELDS.map((field) => (
          <FormField key={field.name} label={field.label} hint={field.hint} error={errors[`metrics.${field.name}`]}>
            <input
              className="input"
              type="number"
              step={field.step}
              min={field.min}
              max={field.max}
              value={form.metrics[field.name]}
              onChange={(e) => {
                set('metrics', { ...form.metrics, [field.name]: e.target.value });
                setErrors((prev) => ({ ...prev, [`metrics.${field.name}`]: undefined }));
              }}
            />
          </FormField>
        ))}
        <div className="full field">
          <span className="field-label">Custom metrics</span>
          <span className="hint">Any other numeric results, e.g. f1_macro or latency_p95_ms.</span>
          <KeyValueEditor
            rows={form.customMetrics}
            onChange={(rows) => set('customMetrics', rows)}
            errors={errors}
            errorPrefix="customMetrics"
            keyPlaceholder="Metric name"
            valuePlaceholder="Value"
            valueType="number"
            addLabel="Add metric"
          />
        </div>
      </section>

      <section className="card stack-tight">
        <h2>Parameters</h2>
        <span className="hint">Numbers and true/false are stored as such; anything else is stored as text.</span>
        <KeyValueEditor
          rows={form.parameters}
          onChange={(rows) => set('parameters', rows)}
          errors={errors}
          errorPrefix="parameters"
          keyPlaceholder="Parameter name"
          valuePlaceholder="Value"
          addLabel="Add parameter"
        />
      </section>

      <section className="card stack-tight">
        <FormField label="Notes" error={errors.notes} hint="Observations, decisions, links to write-ups.">
          <textarea className="textarea" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>
        <div className="field">
          <span className="field-label">Logs</span>
          {existingLogs.length > 0 && (
            <ol className="log-list">
              {existingLogs.map((entry, index) => (
                <li key={index} className={`log-entry log-${entry.level}`}>
                  <span className="mono subtle">{formatDateTime(entry.timestamp)}</span>
                  <span className="log-level">{entry.level}</span>
                  <span>{entry.message}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="kv-row">
            <select className="select" aria-label="Log level" value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
              <option value="debug">debug</option>
            </select>
            <input
              className="input"
              aria-label="New log message"
              placeholder="Optional: add a log entry (saved with the current time)"
              value={logMessage}
              onChange={(e) => setLogMessage(e.target.value)}
            />
          </div>
          {(errors.logs) && <span className="field-error">{errors.logs}</span>}
        </div>
      </section>

      <div className="row form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

export function NewRunPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const experiment = useApi((signal) => api.getExperiment(id, { signal }), [id]);

  return (
    <AsyncContent result={experiment} loadingLabel="Loading experiment…">
      {(data) => (
        <div className="stack narrow">
          <PageHeader
            title="New run"
            breadcrumbs={[
              { to: '/experiments', label: 'Experiments' },
              { to: `/experiments/${id}`, label: data.name },
              { label: 'New run' },
            ]}
          />
          {data.status === 'archived' ? (
            <p className="alert">This experiment is archived. Change its status before adding runs.</p>
          ) : (
            <RunForm
              initial={emptyForm()}
              existingLogs={[]}
              experimentName={data.name}
              submitLabel="Create run"
              onCancel={() => navigate(`/experiments/${id}`)}
              onSubmit={async (body) => {
                const created = await api.createRun(id, body);
                navigate(`/runs/${created.data.id}`, { state: { notice: 'Run created.' } });
              }}
            />
          )}
        </div>
      )}
    </AsyncContent>
  );
}

export function EditRunPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const run = useApi((signal) => api.getRun(id, { signal }), [id]);

  return (
    <AsyncContent result={run} loadingLabel="Loading run…">
      {(data) => (
        <div className="stack narrow">
          <PageHeader
            title={`Edit ${data.name}`}
            breadcrumbs={[
              { to: '/experiments', label: 'Experiments' },
              { to: `/experiments/${data.experiment.id}`, label: data.experiment.name },
              { to: `/runs/${id}`, label: data.name },
              { label: 'Edit' },
            ]}
          />
          {data.details_status === 'unavailable' ? (
            <p className="alert">
              Run details cannot be loaded because MongoDB is unreachable. Editing is disabled so existing metrics are not overwritten.
            </p>
          ) : (
            <RunForm
              initial={formFromRun(data)}
              existingLogs={data.logs || []}
              experimentName={data.experiment.name}
              submitLabel="Save changes"
              onCancel={() => navigate(`/runs/${id}`)}
              onSubmit={async (body) => {
                await api.updateRun(id, body);
                navigate(`/runs/${id}`, { state: { notice: 'Run updated.' } });
              }}
            />
          )}
        </div>
      )}
    </AsyncContent>
  );
}
