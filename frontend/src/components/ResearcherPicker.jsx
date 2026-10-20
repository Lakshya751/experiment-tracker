import { useMemo, useState } from 'react';

/** Searchable checkbox list for choosing experiment team members. */
export default function ResearcherPicker({ researchers, selected, onChange, excludeId, id, className = '' }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return researchers.filter(
      (r) => r.id !== excludeId && (!q || r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q)),
    );
  }, [researchers, query, excludeId]);

  function toggle(researcherId) {
    onChange(selected.includes(researcherId) ? selected.filter((x) => x !== researcherId) : [...selected, researcherId]);
  }

  return (
    <div className={`picker ${className}`}>
      <input
        id={id}
        className="input"
        type="search"
        placeholder="Filter by name or team"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="picker-list">
        {visible.map((researcher) => (
          <li key={researcher.id}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={selected.includes(researcher.id)}
                onChange={() => toggle(researcher.id)}
              />
              <span>{researcher.name}</span>
              <span className="subtle">{researcher.team}</span>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="subtle picker-empty">No researchers match.</li>}
      </ul>
      <span className="hint">{selected.length} selected</span>
    </div>
  );
}
