const dateFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Dates without a time ("2026-03-01") are calendar dates; parse them as local dates
// so they do not shift by a day in timezones west of UTC.
function parse(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function formatDate(value) {
  const date = parse(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatShortDate(value) {
  const date = parse(value);
  return date ? shortDateFormatter.format(date) : '—';
}

export function formatDateTime(value) {
  const date = parse(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatMetric(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return String(value);
  if (Number.isInteger(value)) return value.toLocaleString();
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** "f1_macro" -> "F1 macro" */
export function metricLabel(name) {
  if (!name) return '';
  if (name === 'duration_seconds') return 'Duration';
  const words = name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Unit shown on chart axes. */
export function metricUnit(name) {
  if (!name) return '';
  if (name === 'accuracy' || /precision|recall|f1|auroc|_rate$|exact_match|iou|rouge/.test(name)) return 'proportion, 0–1';
  if (name === 'duration_seconds') return 'seconds';
  if (name === 'sample_size') return 'samples';
  if (name.endsWith('_pct')) return '%';
  if (name.endsWith('_ms')) return 'ms';
  if (name.endsWith('_mb')) return 'MB';
  return 'value';
}

export function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** "2026-03-02T10:00:00Z" -> value for <input type="datetime-local"> in local time. */
export function toDateTimeLocal(value) {
  const date = parse(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) -> ISO string in UTC. */
export function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
