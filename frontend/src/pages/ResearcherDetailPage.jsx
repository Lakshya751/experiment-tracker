import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { AsyncContent } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDate } from '../utils/format.js';

function ExperimentList({ experiments, empty }) {
  if (experiments.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="plain-list">
      {experiments.map((e) => (
        <li key={e.id} className="list-row">
          <div className="stack-tight">
            <Link to={`/experiments/${e.id}`}>{e.name}</Link>
            <span className="subtle">{formatDate(e.start_date)} → {e.end_date ? formatDate(e.end_date) : 'ongoing'}</span>
          </div>
          <StatusBadge status={e.status} />
        </li>
      ))}
    </ul>
  );
}

export default function ResearcherDetailPage() {
  const { id } = useParams();
  const researcher = useApi((signal) => api.getResearcher(id, { signal }), [id]);
  return (
    <AsyncContent result={researcher} loadingLabel="Loading researcher…" errorTitle="Could not load this researcher">
      {(r) => (
        <div className="stack">
          <PageHeader
            breadcrumbs={[{ to: '/researchers', label: 'Researchers' }, { label: r.name }]}
            title={r.name}
            subtitle={`${r.role} · ${r.team}`}
            actions={<Link className="btn" to={`/experiments?researcher_id=${r.id}&status=all`}>View in experiment list</Link>}
          />
          <section className="card">
            <dl className="meta-list">
              <div><dt>Email</dt><dd>{r.email}</dd></div>
              <div><dt>Role</dt><dd>{r.role}</dd></div>
              <div><dt>Team</dt><dd>{r.team}</dd></div>
              <div><dt>Experiments</dt><dd>{r.owned_experiments.length} owned · {r.member_experiments.length} as team member</dd></div>
            </dl>
          </section>
          <div className="grid-2">
            <section className="card">
              <h2 className="card-title">Owns</h2>
              <ExperimentList experiments={r.owned_experiments} empty="Doesn't own any experiments." />
            </section>
            <section className="card">
              <h2 className="card-title">Team member on</h2>
              <ExperimentList experiments={r.member_experiments} empty="Not a member of any other experiments." />
            </section>
          </div>
        </div>
      )}
    </AsyncContent>
  );
}
