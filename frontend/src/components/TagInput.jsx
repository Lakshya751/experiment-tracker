import { useState } from 'react';
import { TAG_RE } from '../utils/validation.js';

/** Type a tag and press Enter or comma to add it. Tags are lowercase slugs. */
export default function TagInput({ value, onChange, id, className = '', ...rest }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) return;
    if (!TAG_RE.test(tag)) {
      setError('Tags use lowercase letters, numbers and hyphens (max 40 characters).');
      return;
    }
    if (value.length >= 10) {
      setError('Use at most 10 tags.');
      return;
    }
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft('');
    setError('');
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="stack-tight">
      <div className={`tag-input ${className}`}>
        {value.map((tag) => (
          <span key={tag} className="tag tag-removable">
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          {...rest}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={value.length ? '' : 'e.g. nlp, baseline'}
        />
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
