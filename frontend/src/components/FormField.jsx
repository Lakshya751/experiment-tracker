import { cloneElement, useId } from 'react';

/** Label + input + hint + error, wired together with ids for screen readers. */
export default function FormField({ label, error, hint, required, className = '', children }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const control = cloneElement(children, {
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    className: `${children.props.className || ''}${error ? ' has-error' : ''}`,
  });
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required" aria-hidden="true"> *</span>}
      </label>
      {control}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}
