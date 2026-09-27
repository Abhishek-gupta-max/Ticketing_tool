import { useId } from 'react';

/** Label + control + hint + error, as in the original forms. */
export function Field({ label, hint, error, children, id: given }) {
  const auto = useId();
  const id = given || auto;
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {child}
      {hint ? <span className="hint">{hint}</span> : null}
      <span className="err" role="alert">{error || ''}</span>
    </div>
  );
}

export const Input = ({ className = '', ...p }) => <input className={`inp ${className}`} {...p} />;
export const Textarea = ({ className = '', ...p }) => <textarea className={`inp ${className}`} {...p} />;

/** options: [value, label] pairs or plain strings. */
export function Select({ options = [], blank, className = '', ...p }) {
  return (
    <select className={`sel ${className}`} {...p}>
      {blank !== undefined ? <option value="">{blank}</option> : null}
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function DatePicker({ value, onChange, withTime = true, ...p }) {
  return <input className="inp" type={withTime ? 'datetime-local' : 'date'} value={value || ''} onChange={(e) => onChange(e.target.value)} {...p} />;
}

export function Switch({ on, onChange, label, disabled }) {
  return <button type="button" className="sw" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Checkbox({ checked, onChange, children }) {
  return <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> {children}</label>;
}
