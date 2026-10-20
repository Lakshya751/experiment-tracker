import { useCallback, useEffect, useState } from 'react';

/**
 * Load data from the API and track loading/error state.
 *
 *   const { data, meta, error, loading, reload } = useApi((signal) => api.getRun(id, { signal }), [id]);
 *
 * Requests are aborted when the dependencies change or the component unmounts,
 * so a slow old response can never overwrite a newer one.
 */
export function useApi(fetcher, deps) {
  const [state, setState] = useState({ data: null, meta: null, error: null, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcher(controller.signal)
      .then((payload) => {
        setState({ data: payload.data, meta: payload.meta ?? null, error: null, loading: false });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState((prev) => ({ ...prev, error, loading: false }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { ...state, reload };
}
