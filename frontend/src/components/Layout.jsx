import { NavLink, Outlet } from 'react-router-dom';
import Notice from './Notice.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/experiments', label: 'Experiments' },
  { to: '/researchers', label: 'Researchers' },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⚗</span>
          <span>Experiment Tracker</span>
        </div>
        <nav aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">
          Local demo — no login. Anyone who can reach this server can view and edit data.
        </p>
      </aside>
      <main className="content">
        <Notice />
        <Outlet />
      </main>
    </div>
  );
}
