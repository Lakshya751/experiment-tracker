// Thin wrapper around fetch that understands the API's JSON envelope:
//   success -> { data, meta? }      error -> { error: { code, message, details? } }
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown_error', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildUrl(path, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  const qs = query.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

export async function request(path, { method = 'GET', body, params, signal } = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the API server. Is the Flask backend running on port 5001?', {
      code: 'network_error',
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (e.g. proxy error page) - handled below.
  }

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(error?.message || `Request failed with status ${response.status}.`, {
      status: response.status,
      code: error?.code,
      details: error?.details,
    });
  }
  if (!payload) {
    throw new ApiError('The server returned an unexpected response.', { status: response.status });
  }
  return payload;
}

export const api = {
  health: (opts) => request('/health', opts),

  listResearchers: (params, opts) => request('/researchers', { ...opts, params }),
  getResearcher: (id, opts) => request(`/researchers/${id}`, opts),
  createResearcher: (body) => request('/researchers', { method: 'POST', body }),

  listExperiments: (params, opts) => request('/experiments', { ...opts, params }),
  listTags: (opts) => request('/experiments/tags', opts),
  getExperiment: (id, opts) => request(`/experiments/${id}`, opts),
  createExperiment: (body) => request('/experiments', { method: 'POST', body }),
  updateExperiment: (id, body) => request(`/experiments/${id}`, { method: 'PUT', body }),
  archiveExperiment: (id) => request(`/experiments/${id}`, { method: 'DELETE' }),

  listRuns: (experimentId, params, opts) => request(`/experiments/${experimentId}/runs`, { ...opts, params }),
  createRun: (experimentId, body) => request(`/experiments/${experimentId}/runs`, { method: 'POST', body }),
  getRun: (id, opts) => request(`/runs/${id}`, opts),
  updateRun: (id, body) => request(`/runs/${id}`, { method: 'PUT', body }),

  dashboardSummary: (opts) => request('/dashboard/summary', opts),
  metricComparison: (params, opts) => request('/dashboard/metric-comparison', { ...opts, params }),
};
