import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatDate } from '../utils/format.js';

const STATUS_OPTIONS = [
  { value: '', label: 'All except archived' },
  { value: 'draft', label: 'Draft' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All statuses' },
];

const SORT_OPTIONS = [
  { value: '-start_date', label: 'Start date (newest)' },
  { value: 'start_date', label: 'Start date (oldest)' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: '-updated_at', label: 'Recently updated' },
  { value: 'status', label: 'Status' },
];

const SORTABLE_COLUMNS = { name: 'name', status: 'status', start_date: 'start_date' };

export default function ExperimentsPage() {
  // Filters live in the URL so a filtered view can be bookmarked or shared.
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const debouncedSearch = useDebouncedValue(search.trim());

  const filters = {
    q: params.get('q') || '',
    status: params.get('status') || '',
    tag: params.get('tag') || '',
    owner_id: params.get('owner_id') || '',
    sort: params.get('sort') || '-start_date',
    page: Number(params.get('page')) || 1,
  };

  function updateParams(changes, resetPage = true) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (debouncedSearch !== filters.q) updateParams({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const experiments = useApi(
    (signal) => api.listExperiments({ ...filters, per_page: 15 }, { signal }),
    [params.toString()],
  );
  const tags = useApi((signal) => api.listTags({ signal }), []);
  const researchers = useApi((signal) => api.listResearchers({ per_page: 100 }, { signal }), []);

  const hasFilters = Boolean(filters.q || filters.status || filters.tag || filters.owner_id);

  function sortBy(column) {
    const current = filters.sort.replace('-', '');
    const descending = filters.sort.startsWith('-');
    updateParams({ sort: current === column && !descending ? `-${column}` : column });
  }

  function sortIndicator(column) {
    if (filters.sort.replace('-', '') !== column) return '';
    return filters.sort.startsWith('-') ? ' ↓' : ' ↑';
  }

  return (
    <div className="stack">
      <PageHeader
        title="Experiments"
        subtitle="Search, filter and manage the team's experiments."
        actions={<Link to="/experiments/new" className="btn btn-primary">New experiment</Link>}
      />

      <section className="card">
        <div className="filters" role="search">
          <input
            className="input"
            type="search"
            aria-label="Search experiments"
            placeholder="Search name, description, hypothesis or tag"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="select" aria-label="Filter by status" value={filters.status} onChange={(e) => updateParams({ status: e.target.value })}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="select" aria-label="Filter by tag" value={filters.tag} onChange={(e) => updateParams({ tag: e.target.value })}>
            <option value="">All tags</option>
            {(tags.data || []).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <select className="select" aria-label="Filter by owner" value={filters.owner_id} onChange={(e) => updateParams({ owner_id: e.target.value })}>
            <option value="">All owners</option>
            {(researchers.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="select" aria-label="Sort experiments" value={filters.sort} onChange={(e) => updateParams({ sort: e.target.value })}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {experiments.loading && !experiments.data && <LoadingState label="Loading experiments…" />}
        {experiments.error && <ErrorState error={experiments.error} onRetry={experiments.reload} title="Could not load experiments" />}
        {experiments.data && !experiments.error && (
          experiments.data.length === 0 ? (
            <EmptyState
              title={hasFilters ? 'No experiments match these filters' : 'No experiments yet'}
              message={hasFilters ? 'Try a different search or clear the filters.' : 'Create the first experiment to get started.'}
              action={!hasFilters && <Link to="/experiments/new" className="btn btn-primary">New experiment</Link>}
            />
          ) : (
            <div className={experiments.loading ? 'is-refreshing' : undefined}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {Object.entries({ name: 'Name', status: 'Status' }).map(([key, label]) => (
                        <th key={key} className="sortable" aria-sort={ariaSort(filters.sort, key)}>
                          <button type="button" className="th-button" onClick={() => sortBy(SORTABLE_COLUMNS[key])}>
                            {label}{sortIndicator(key)}
                          </button>
                        </th>
                      ))}
                      <th>Owner</th>
                      <th>Tags</th>
                      <th className="num">Runs</th>
                      <th className="sortable" aria-sort={ariaSort(filters.sort, 'start_date')}>
                        <button type="button" className="th-button" onClick={() => sortBy('start_date')}>
                          Dates{sortIndicator('start_date')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiments.data.map((experiment) => (
                      <tr key={experiment.id}>
                        <td className="cell-main">
                          <Link to={`/experiments/${experiment.id}`}>{experiment.name}</Link>
                          <span className="subtle clamp">{experiment.description}</span>
                        </td>
                        <td><StatusBadge status={experiment.status} /></td>
                        <td className="nowrap">
                          <Link to={`/researchers/${experiment.owner.id}`}>{experiment.owner.name}</Link>
                        </td>
                        <td>
                          {experiment.tags.map((tag) => (
                            <button key={tag} type="button" className="tag tag-button" onClick={() => updateParams({ tag })}>
                              {tag}
                            </button>
                          ))}
                        </td>
                        <td className="num">{experiment.run_count}</td>
                        <td className="nowrap">
                          {formatDate(experiment.start_date)}
                          <span className="subtle"> → {experiment.end_date ? formatDate(experiment.end_date) : 'ongoing'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                meta={experiments.meta}
                noun="experiments"
                onPageChange={(page) => updateParams({ page: String(page) }, false)}
              />
            </div>
          )
        )}
      </section>
    </div>
  );
}

function ariaSort(sort, column) {
  if (sort.replace('-', '') !== column) return 'none';
  return sort.startsWith('-') ? 'descending' : 'ascending';
}
