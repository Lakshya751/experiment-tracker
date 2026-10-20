import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import FormField from '../components/FormField.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { serverFieldErrors, validateResearcher } from '../utils/validation.js';

const EMPTY = { name: '', email: '', role: '', team: '' };

export function ResearcherForm({ teams, onSaved, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const clientErrors = validateResearcher(form);
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length) return;
    setSaving(true);
    try {
      const created = await api.createResearcher(form);
      onSaved(created.data);
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert" role="alert">{formError}</div>}
      <FormField label="Full name" required error={errors.name}>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <FormField label="Email" required error={errors.email} hint="Use a fictional address for demo data, e.g. name@example.org.">
        <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </FormField>
      <FormField label="Role" required error={errors.role}>
        <input className="input" value={form.role} placeholder="e.g. Research Scientist" onChange={(e) => set('role', e.target.value)} />
      </FormField>
      <FormField label="Team" required error={errors.team} hint="Pick an existing team or type a new one.">
        <input className="input" list="team-options" value={form.team} onChange={(e) => set('team', e.target.value)} />
      </FormField>
      <datalist id="team-options">
        {teams.map((team) => <option key={team} value={team} />)}
      </datalist>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add researcher'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

export default function ResearchersPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null);
  const debounced = useDebouncedValue(search.trim());
  const team = params.get('team') || '';
  const page = Number(params.get('page')) || 1;

  function update(changes, resetPage = true) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (debounced !== (params.get('q') || '')) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const researchers = useApi(
    (signal) => api.listResearchers({ q: params.get('q'), team, page, per_page: 12 }, { signal }),
    [params.toString()],
  );
  const teams = researchers.meta?.teams || [];

  return (
    <div className="stack">
      <PageHeader
        title="Researchers"
        subtitle="People on the research team and the experiments they work on."
        actions={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add researcher</button>}
      />
      {notice && <p className="alert alert-success" role="status">{notice}</p>}

      <div className="filters" role="search">
        <input
          className="input"
          type="search"
          aria-label="Search researchers"
          placeholder="Search name, email, role or team"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" aria-label="Filter by team" value={team} onChange={(e) => update({ team: e.target.value })}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {researchers.loading && !researchers.data && <LoadingState label="Loading researchers…" />}
      {researchers.error && <ErrorState error={researchers.error} onRetry={researchers.reload} title="Could not load researchers" />}
      {researchers.data && !researchers.error && (
        researchers.data.length === 0 ? (
          <EmptyState title="No researchers found" message="Try a different search or team." />
        ) : (
          <div className={researchers.loading ? 'is-refreshing' : undefined}>
            <ul className="card-grid">
              {researchers.data.map((r) => (
                <li key={r.id} className="card researcher-card">
                  <div className="row">
                    <span className="avatar" aria-hidden="true">{initials(r.name)}</span>
                    <div className="stack-tight">
                      <Link to={`/researchers/${r.id}`} className="strong">{r.name}</Link>
                      <span className="muted">{r.role}</span>
                    </div>
                  </div>
                  <dl className="meta-list compact">
                    <div><dt>Team</dt><dd>{r.team}</dd></div>
                    <div><dt>Email</dt><dd className="break">{r.email}</dd></div>
                    <div><dt>Experiments</dt><dd>{r.owned_experiment_count} owned · {r.member_experiment_count} member</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <Pagination meta={researchers.meta} noun="researchers" onPageChange={(p) => update({ page: String(p) }, false)} />
          </div>
        )
      )}

      <Modal open={adding} title="Add researcher" onClose={() => setAdding(false)}>
        <ResearcherForm
          teams={teams}
          onCancel={() => setAdding(false)}
          onSaved={(created) => {
            setAdding(false);
            setNotice(`${created.name} was added.`);
            researchers.reload();
          }}
        />
      </Modal>
    </div>
  );
}
