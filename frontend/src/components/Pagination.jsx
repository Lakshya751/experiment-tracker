export default function Pagination({ meta, onPageChange, noun = 'items' }) {
  if (!meta || meta.total === 0) return null;
  const { page, per_page: perPage, total, pages } = meta;
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">
        Showing {first}–{last} of {total} {noun}
      </span>
      <div className="row">
        <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span className="muted">
          Page {page} of {pages}
        </span>
        <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
