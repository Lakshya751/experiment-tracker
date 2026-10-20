/** Editable list of name/value rows, used for run parameters and custom metrics. */
export default function KeyValueEditor({ rows, onChange, errors = {}, errorPrefix, keyPlaceholder, valuePlaceholder, valueType = 'text', addLabel }) {
  function update(index, field, value) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  return (
    <div className="stack-tight">
      {rows.map((row, index) => {
        const error = errors[`${errorPrefix}.${index}`];
        return (
          <div key={row.id} className="kv-row">
            <input
              className={`input${error ? ' has-error' : ''}`}
              aria-label={`${keyPlaceholder} ${index + 1}`}
              placeholder={keyPlaceholder}
              value={row.key}
              onChange={(event) => update(index, 'key', event.target.value)}
            />
            <input
              className={`input${error ? ' has-error' : ''}`}
              aria-label={`${valuePlaceholder} ${index + 1}`}
              placeholder={valuePlaceholder}
              type={valueType}
              step="any"
              value={row.value}
              onChange={(event) => update(index, 'value', event.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm"
              aria-label={`Remove row ${index + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove
            </button>
            {error && <span className="field-error kv-error">{error}</span>}
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...rows, { id: crypto.randomUUID(), key: '', value: '' }])}
        >
          + {addLabel}
        </button>
      </div>
    </div>
  );
}
