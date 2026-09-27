import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

export function Kpi({ label, value, sub, to, unit }) {
  const inner = <><span>{label}</span><div className="row"><b>{value}<small>{unit || ''}</small></b></div><em className="muted">{sub}</em></>;
  return to ? <Link className="kpi" to={to}>{inner}</Link> : <div className="kpi">{inner}</div>;
}

/** Segmented control (List / Board, date ranges). */
export function Seg({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l, icon]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{icon ? <Icon name={icon} /> : null}{l}</button>
      ))}
    </div>
  );
}

/** Pill filters with optional counts. */
export function Views({ value, onChange, options, counts }) {
  return (
    <div className="views">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}{counts ? <small>{counts[v] ?? 0}</small> : null}</button>
      ))}
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Steps({ steps, current, failAt }) {
  const idx = steps.indexOf(current);
  return (
    <ol className="steps">
      {steps.map((s, i) => <li key={s} className={failAt === i ? 'fail' : i < idx ? 'done' : i === idx ? 'cur' : ''}>{s}</li>)}
    </ol>
  );
}

export function Stars({ value, onRate, disabled }) {
  return (
    <div className="stars" role="group" aria-label="Rate satisfaction">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={value >= n ? 'on' : ''} disabled={disabled} onClick={() => onRate(n)} aria-label={`${n} of 5`}>&#9733;</button>
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta) return null;
  const { page, pages, limit, total } = meta;
  const from = total ? (page - 1) * limit + 1 : 0;
  return (
    <div className="pager">
      <span>Showing {from} to {Math.min(total, page * limit)} of {total}</span>
      <span className="tools">
        <button type="button" className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevL" />Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<Icon name="chevR" /></button>
      </span>
    </div>
  );
}

/** Search input that reports its value after the user pauses typing. */
export function SearchBox({ value, onChange, placeholder, label, delay = 300 }) {
  const [v, setV] = useState(value || '');
  const first = useRef(true);
  useEffect(() => { setV(value || ''); }, [value]);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const t = setTimeout(() => { if (v !== (value || '')) onChange(v); }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <input className="inp q" type="search" placeholder={placeholder} aria-label={label || placeholder} value={v} onChange={(e) => setV(e.target.value)} />;
}

/** Dropdown menu that closes on outside click or Escape. */
export function Menu({ label, children, className = 'btn', up = false, align }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="menuwrap" ref={ref}>
      <button type="button" className={className} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open ? <div className={`menu${up ? ' up' : ''}`} style={align} onClick={(e) => { if (e.target.closest('button,a')) setOpen(false); }}>{children}</div> : null}
    </div>
  );
}

export const Panel = ({ title, sub, actions, children, className = '', style }) => (
  <section className={`panel ${className}`} style={style}>
    {title || actions ? (
      <div className="head-row"><div>{title ? <h2>{title}</h2> : null}{sub ? <p className="sub">{sub}</p> : null}</div>{actions}</div>
    ) : null}
    {children}
  </section>
);
