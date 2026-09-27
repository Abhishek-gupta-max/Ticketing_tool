import { PRI, ST_CLS, TST_CLS, CHG_CLS } from '../../constants';
import { initials } from '../../utils/format';
import { liveSla } from '../../utils/sla';

export const Chip = ({ cls = 'grey', children, title }) => <span className={`chip ${cls}`} title={title}>{children}</span>;
export const Badge = ({ children }) => <span className="badge">{children}</span>;

export const PriorityChip = ({ p }) => <span className={`chip p${p}`}>P{p} {PRI[p]}</span>;
export const StatusChip = ({ s }) => <span className={`chip ${ST_CLS[s] || 'grey'}`}>{s}</span>;
export const TaskChip = ({ s }) => <span className={`chip ${TST_CLS[s] || 'grey'}`}>{s}</span>;
export const RiskChip = ({ r }) => <span className={`chip ${r === 'High' ? 'bad' : r === 'Medium' ? 'warn' : 'ok'}`}>{r} risk</span>;
export const TypeChip = ({ t }) => <span className={`chip ${t === 'Emergency' ? 'bad' : t === 'Standard' ? 'info' : 'grey'}`}>{t}</span>;
export const CritChip = ({ c }) => <span className={`chip ${c === 'Critical' ? 'bad' : c === 'High' ? 'warn' : c === 'Medium' ? 'info' : 'grey'}`}>{c}</span>;
export const AssetStatusChip = ({ s }) => <span className={`chip ${s === 'In use' ? 'ok' : s === 'Retired' ? 'grey' : 'warn'}`}>{s}</span>;

export function ChangeChip({ c }) {
  const cls = c.status === 'Closed' && c.closeCode === 'Did not work' ? 'bad' : CHG_CLS[c.status] || 'grey';
  return <>
    <span className={`chip ${cls}`}>{c.status}</span>
    {c.status === 'Closed' && c.closeCode ? <> <span className="chip grey">{c.closeCode}</span></> : null}
  </>;
}

export function ProblemChip({ p }) {
  const cls = p.status === 'Logged' ? 'info' : p.status === 'Fixed' || p.status === 'Closed' ? 'grey' : p.status === 'Fix underway' ? 'ok' : 'violet';
  return <><span className={`chip ${cls}`}>{p.status}</span>{p.isKnownError ? <> <span className="chip warn">Known error</span></> : null}</>;
}

/** Live SLA text; re-computed on every render (pages tick with useNow). */
export function SlaText({ t }) {
  const s = liveSla(t);
  return <span className={`sla ${s.state}`}>{s.label}</span>;
}

export function Avatar({ user, mine }) {
  if (!user) return <span className="av" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>?</span>;
  return <span className={`av${mine ? ' mine' : ''}`} title={user.name}>{initials(user.name)}</span>;
}

export function OwnerCell({ user, meId }) {
  return <span className="who"><Avatar user={user} mine={user && user.id === meId} />{user ? (user.id === meId ? 'You' : user.name) : 'Unassigned'}</span>;
}
