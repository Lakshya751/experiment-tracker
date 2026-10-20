import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ResearcherPicker from '../components/ResearcherPicker.jsx';
import { AsyncContent } from '../components/States.jsx';
import TagInput from '../components/TagInput.jsx';
import { useApi } from '../hooks/useApi.js';
import { serverFieldErrors, validateExperiment } from '../utils/validation.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  hypothesis: '',
  status: 'draft',
  owner_id: '',
  member_ids: [],
  tags: [],
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
};

function toForm(experiment) {
  return {
    name: experiment.name,
    description: experiment.description,
    hypothesis: experiment.hypothesis,
    status: experiment.status,
    owner_id: String(experiment.owner.id),
    member_ids: experiment.members.map((m) => m.id),
    tags: experiment.tags,
    start_date: experiment.start_date,
    end_date: experiment.end_date || '',
  };
}

export function ExperimentForm({ initial, researchers, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const clientErrors = validateExperiment(form);
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length) return;

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        owner_id: Number(form.owner_id),
        member_ids: form.member_ids.filter((id) => id !== Number(form.owner_id)),
        end_date: form.end_date || null,
      });
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setFormError(error.message);
      setSaving(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit} noValidate>
      {formError && <div className="alert full" role="alert">{formError}</div>}
      <FormField label="Name" required error={errors.name} className="full">
        <input className="input" value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <FormField label="Description" error={errors.description} className="full" hint="What is being tested and on which data.">
        <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
      </FormField>
      <FormField label="Hypothesis" error={errors.hypothesis} className="full" hint="A falsifiable statement, ideally with a target number.">
        <textarea className="textarea" value={form.hypothesis} onChange={(e) => set('hypothesis', e.target.value)} />
      </FormField>
      <FormField label="Status" required error={errors.status}>
        <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="draft">Draft</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </FormField>
      <FormField label="Owner" required error={errors.owner_id}>
        <select className="select" value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
          <option value="">Choose a researcher…</option>
          {researchers.map((r) => (
            <option key={r.id} value={r.id}>{r.name} — {r.team}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Start date" required error={errors.start_date}>
        <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
      </FormField>
      <FormField label="End date" error={errors.end_date} hint="Leave empty while the experiment is ongoing.">
        <input className="input" type="date" value={form.end_date} min={form.start_date} onChange={(e) => set('end_date', e.target.value)} />
      </FormField>
      <FormField label="Tags" error={errors.tags} hint="Press Enter or comma to add a tag.">
        <TagInput value={form.tags} onChange={(tags) => set('tags', tags)} />
      </FormField>
      <FormField label="Team members" error={errors.member_ids} hint="The owner is always included and doesn't need to be selected.">
        <ResearcherPicker
          researchers={researchers}
          selected={form.member_ids}
          excludeId={Number(form.owner_id)}
          onChange={(ids) => set('member_ids', ids)}
        />
      </FormField>
      <div className="row full form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

export default function ExperimentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const researchers = useApi((signal) => api.listResearchers({ per_page: 100 }, { signal }), []);
  const experiment = useApi(
    (signal) => (isEdit ? api.getExperiment(id, { signal }) : Promise.resolve({ data: null })),
    [id],
  );

  // Combine both requests so the form only renders once everything is loaded.
  const combined = {
    loading: researchers.loading || experiment.loading,
    error: researchers.error || experiment.error,
    data: researchers.data && (!isEdit || experiment.data) ? { researchers: researchers.data, experiment: experiment.data } : null,
    reload: () => { researchers.reload(); experiment.reload(); },
  };

  useEffect(() => {
    document.title = `${isEdit ? 'Edit' : 'New'} experiment · Experiment Tracker`;
  }, [isEdit]);

  async function handleSubmit(body) {
    if (isEdit) {
      await api.updateExperiment(id, body);
      navigate(`/experiments/${id}`, { state: { notice: 'Experiment updated.' } });
    } else {
      const created = await api.createExperiment(body);
      navigate(`/experiments/${created.data.id}`, { state: { notice: 'Experiment created.' } });
    }
  }

  return (
    <div className="stack narrow">
      <PageHeader
        title={isEdit ? 'Edit experiment' : 'New experiment'}
        breadcrumbs={[
          { to: '/experiments', label: 'Experiments' },
          ...(isEdit && experiment.data ? [{ to: `/experiments/${id}`, label: experiment.data.name }] : []),
          { label: isEdit ? 'Edit' : 'New' },
        ]}
      />
      <AsyncContent result={combined} loadingLabel="Loading form…">
        {(data) => (
          <ExperimentForm
            initial={data.experiment ? toForm(data.experiment) : EMPTY_FORM}
            researchers={data.researchers}
            submitLabel={isEdit ? 'Save changes' : 'Create experiment'}
            onSubmit={handleSubmit}
            onCancel={() => navigate(isEdit ? `/experiments/${id}` : '/experiments')}
          />
        )}
      </AsyncContent>
    </div>
  );
}
