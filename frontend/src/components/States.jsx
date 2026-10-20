// Loading, error and empty states shared by every page.

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{title}</strong>
      <p className="muted">{error?.message || 'An unexpected error occurred.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}

/** Renders the right state for a useApi() result, or `children(data)` when loaded. */
export function AsyncContent({ result, children, loadingLabel, errorTitle }) {
  if (result.loading && !result.data) return <LoadingState label={loadingLabel} />;
  if (result.error && !result.data) return <ErrorState error={result.error} onRetry={result.reload} title={errorTitle} />;
  return children(result.data, result.meta);
}
