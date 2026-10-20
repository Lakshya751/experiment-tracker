import { capitalize } from '../utils/format.js';

/** Status pill. The text label always accompanies the color, so it never relies on color alone. */
export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" aria-hidden="true" />
      {capitalize(status)}
    </span>
  );
}
