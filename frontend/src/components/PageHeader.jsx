import { Link } from 'react-router-dom';

export default function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  return (
    <header className="page-header">
      <div className="stack-tight">
        {breadcrumbs && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.to || crumb.label}>
                {index > 0 && <span className="subtle"> / </span>}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span className="muted">{crumb.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
