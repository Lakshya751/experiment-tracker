import { useEffect, useRef } from 'react';

/** Accessible dialog built on the native <dialog> element (focus trapping and Esc handled by the browser). */
export default function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      {open && (
        <div className="stack">
          <div className="card-header">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close dialog">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
