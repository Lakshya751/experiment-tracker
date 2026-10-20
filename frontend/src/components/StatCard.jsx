export default function StatCard({ label, value, hint }) {
  return (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="subtle">{hint}</span>}
    </div>
  );
}
