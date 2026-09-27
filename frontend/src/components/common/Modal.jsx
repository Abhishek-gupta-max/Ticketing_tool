import { useEffect, useRef } from 'react';

/**
 * Native <dialog> modal with the original styling. `buttons` is a list of
 * { label, onClick, variant, disabled, type }.
 */
export default function Modal({ title, children, buttons = [], onClose, wide = false, busy = false, onSubmit }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const first = d?.querySelector('.mb input:not([type=hidden]):not([type=checkbox]),.mb select,.mb textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }, []);

  const close = () => { if (!busy) onClose?.(); };

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}`}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      aria-labelledby="modal-title"
    >
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} noValidate>
        <div className="mh">
          <h2 id="modal-title">{title}</h2>
          <button type="button" onClick={close} aria-label="Close">&times;</button>
        </div>
        <div className="mb">{children}</div>
        {buttons.length > 0 && (
          <div className="mf">
            {buttons.map((b) => (
              <button
                key={b.label}
                type={b.type || 'button'}
                className={`btn ${b.variant || ''}`}
                disabled={b.disabled || (busy && b.type === 'submit')}
                onClick={b.onClick}
              >
                {busy && b.type === 'submit' ? <span className="spinner" aria-hidden="true" /> : null}{b.label}
              </button>
            ))}
          </div>
        )}
      </form>
    </dialog>
  );
}
