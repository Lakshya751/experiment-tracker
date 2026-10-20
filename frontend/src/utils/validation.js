import { fromDateTimeLocal } from './format.js';

// Client-side validation mirrors the server rules (backend/app/validation.py) so
// users get instant feedback. The server still validates everything.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
export const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
export const TAG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function validateResearcher(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Name is required.';
  else if (form.name.trim().length > 120) errors.name = 'Name must be 120 characters or fewer.';
  if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (!form.role.trim()) errors.role = 'Role is required.';
  if (!form.team.trim()) errors.team = 'Team is required.';
  return errors;
}

export function validateExperiment(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Name is required.';
  else if (form.name.length > 160) errors.name = 'Name must be 160 characters or fewer.';
  if (form.description.length > 5000) errors.description = 'Description must be 5,000 characters or fewer.';
  if (form.hypothesis.length > 2000) errors.hypothesis = 'Hypothesis must be 2,000 characters or fewer.';
  if (!form.owner_id) errors.owner_id = 'Choose an owner.';
  if (!form.start_date) errors.start_date = 'Start date is required.';
  if (form.end_date && form.start_date && form.end_date < form.start_date) {
    errors.end_date = 'End date must be on or after the start date.';
  }
  if (form.tags.length > 10) errors.tags = 'Use at most 10 tags.';
  return errors;
}

function parseNumber(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

/**
 * Validate the run form and build the request body.
 * Returns { errors, body } - body is only meaningful when errors is empty.
 */
export function validateRun(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Run name is required.';
  if (!form.started_at) errors.started_at = 'Start time is required.';
  if (form.status === 'running' && form.ended_at) {
    errors.ended_at = 'A running run cannot have an end time. Clear it or change the status.';
  }
  if (form.status !== 'running' && !form.ended_at) {
    errors.ended_at = `End time is required when the status is ${form.status}.`;
  }
  if (form.started_at && form.ended_at && form.ended_at < form.started_at) {
    errors.ended_at = 'End time must be after the start time.';
  }

  const metrics = {};
  const standard = {
    accuracy: { min: 0, max: 1, message: 'Accuracy must be between 0 and 1.' },
    loss: { min: 0, message: 'Loss cannot be negative.' },
    duration_seconds: { min: 0, message: 'Duration cannot be negative.' },
    sample_size: { min: 0, integer: true, message: 'Sample size must be a whole number ≥ 0.' },
  };
  Object.entries(standard).forEach(([name, rule]) => {
    const value = parseNumber(form.metrics[name]);
    if (value === null) return;
    if (Number.isNaN(value) || value < rule.min || (rule.max !== undefined && value > rule.max)
      || (rule.integer && !Number.isInteger(value))) {
      errors[`metrics.${name}`] = rule.message;
    } else {
      metrics[name] = value;
    }
  });

  form.customMetrics.forEach((row, index) => {
    if (!row.key.trim() && row.value === '') return;
    const key = row.key.trim();
    const value = parseNumber(row.value);
    if (!KEY_RE.test(key)) errors[`customMetrics.${index}`] = 'Use letters, numbers and underscores; start with a letter.';
    else if (key in standard) errors[`customMetrics.${index}`] = `Enter ${key} in the field above.`;
    else if (key in metrics) errors[`customMetrics.${index}`] = `Duplicate metric "${key}".`;
    else if (value === null || Number.isNaN(value)) errors[`customMetrics.${index}`] = 'Value must be a number.';
    else metrics[key] = value;
  });

  const parameters = {};
  form.parameters.forEach((row, index) => {
    if (!row.key.trim() && row.value === '') return;
    const key = row.key.trim();
    if (!KEY_RE.test(key)) errors[`parameters.${index}`] = 'Use letters, numbers and underscores; start with a letter.';
    else if (key in parameters) errors[`parameters.${index}`] = `Duplicate parameter "${key}".`;
    else parameters[key] = coerceParameter(row.value);
  });

  if (form.notes.length > 10000) errors.notes = 'Notes must be 10,000 characters or fewer.';

  const body = {
    name: form.name.trim(),
    status: form.status,
    started_at: fromDateTimeLocal(form.started_at),
    ended_at: fromDateTimeLocal(form.ended_at),
    notes: form.notes,
    parameters,
    metrics,
  };
  return { errors, body };
}

/** "0.001" -> 0.001, "true" -> true, "adamw" -> "adamw" */
export function coerceParameter(raw) {
  const text = String(raw).trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text !== '' && Number.isFinite(Number(text))) return Number(text);
  return text;
}

/** Map server error details ({"metrics.accuracy": "..."}) to a flat {field: message} object. */
export function serverFieldErrors(error) {
  if (!error?.details) return {};
  const result = {};
  Object.entries(error.details).forEach(([key, message]) => {
    result[key] = message;
    const top = key.split('.')[0];
    if (!(top in result)) result[top] = message;
  });
  return result;
}
