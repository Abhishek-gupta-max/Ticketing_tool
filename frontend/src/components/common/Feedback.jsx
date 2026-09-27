import { Link } from 'react-router-dom';

// Loading, empty and error states.
export function LoadingSpinner({ label = 'Loading' }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}...</div>;
}

export function Skeleton({ rows = 6 }) {
  return (
    <div className="skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ width: `${95 - (i % 3) * 12}%`, height: 16 }} />)}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skel" style={{ width: 240, height: 30, marginBottom: 18 }} />
      <div className="kpis">{Array.from({ length: 5 }, (_, i) => <div key={i} className="kpi"><div className="skel" style={{ height: 44 }} /></div>)}</div>
      <section className="panel"><Skeleton rows={8} /></section>
    </div>
  );
}

export const EmptyState = ({ children }) => <div className="empty">{children}</div>;

export function ErrorState({ error, onRetry }) {
  return (
    <div className="panel errbox" role="alert">
      <h2>Something went wrong</h2>
      <p>{error?.message || 'The data could not be loaded.'}</p>
      {onRetry ? <button type="button" className="btn" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function NotFound({ what, back, backLabel }) {
  return (
    <div className="panel">
      <EmptyState>{what} was not found.</EmptyState>
      {back ? <div style={{ textAlign: 'center' }}><Link className="btn" to={back}>{backLabel}</Link></div> : null}
    </div>
  );
}
