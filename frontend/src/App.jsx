import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState({ state: 'loading' });

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((body) => setHealth({ state: 'done', data: body.data }))
      .catch(() => setHealth({ state: 'error' }));
  }, []);

  return (
    <main style={{ padding: 32 }} className="stack">
      <h1>Experiment Tracker</h1>
      <div className="card">
        <h2>API health</h2>
        {health.state === 'loading' && <p className="muted">Checking…</p>}
        {health.state === 'error' && <p className="alert">Could not reach the API on port 5001.</p>}
        {health.state === 'done' && <pre>{JSON.stringify(health.data, null, 2)}</pre>}
      </div>
    </main>
  );
}
