import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { changeService } from '../../services/changeService';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/common/Icon';
import { Kpi, Seg, Views } from '../../components/common/Controls';
import { TypeChip, RiskChip, ChangeChip, OwnerCell, Chip } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, Skeleton } from '../../components/common/Feedback';
import DataTable from '../../components/tables/DataTable';
import ChangeDialog from '../../components/modals/ChangeDialog';
import { dtime, tshort, DAY } from '../../utils/format';

function Calendar() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = month.getFullYear(), mo = month.getMonth();
  const from = new Date(y, mo, 1), to = new Date(y, mo + 1, 1);
  const q = useQuery({ queryKey: ['changes', 'cal', from.toISOString()], queryFn: () => changeService.list({ view: 'all', from: from.toISOString(), to: to.toISOString() }) });
  const lead = (from.getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const items = (q.data?.items || []).filter((c) => c.status !== 'Canceled');
  return (
    <section className="panel">
      <div className="head-row" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18 }}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <div className="tools">
          <button type="button" className="btn sm icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(y, mo - 1, 1))}><Icon name="chevL" /></button>
          <button type="button" className="btn sm" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
          <button type="button" className="btn sm icon-btn" aria-label="Next month" onClick={() => setMonth(new Date(y, mo + 1, 1))}><Icon name="chevR" /></button>
        </div>
      </div>
      {q.isLoading ? <Skeleton /> : (
        <div className="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="d dim" />;
            const s = new Date(y, mo, d).getTime(), e = s + DAY;
            const ev = items.filter((c) => { const t = new Date(c.plannedStart).getTime(); return t >= s && t < e; }).sort((a, b) => new Date(a.plannedStart) - new Date(b.plannedStart));
            const isT = today.getFullYear() === y && today.getMonth() === mo && today.getDate() === d;
            return (
              <div key={d} className={`d${isT ? ' today' : ''}`}>
                <b>{d}</b>
                {ev.slice(0, 3).map((c) => <Link key={c.number} className={`cev ${c.risk.toLowerCase()}`} to={`/changes/${c.number}`} title={c.title}>{tshort(c.plannedStart)} {c.title}</Link>)}
                {ev.length > 3 ? <span className="muted" style={{ fontSize: 12 }}>+{ev.length - 3} more</span> : null}
              </div>
            );
          })}
        </div>
      )}
      <div className="legend"><span><u style={{ background: 'var(--ok)' }} />Low risk</span><span><u style={{ background: 'var(--warn)' }} />Medium risk</span><span><u style={{ background: 'var(--bad)' }} />High risk</span><span>Changes appear on the day they start.</span></div>
    </section>
  );
}

export default function ChangeList() {
  const { user, can } = useAuth();
  const [view, setView] = useState('list');
  const [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['changes', status], queryFn: () => changeService.list({ view: status }) });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const k = q.data.kpis;
  return (
    <>
      <div className="ph">
        <div><h1>Changes</h1><p>Check the risk, get approval and schedule changes so they do not cause incidents.</p></div>
        <div className="tools">
          <Seg label="View" value={view} onChange={setView} options={[['list', 'List', 'list'], ['cal', 'Calendar', 'cal']]} />
          {can('change:create') ? <button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />New change</button> : null}
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Scheduled next 7 days" value={k.next7} sub="planned windows" />
        <Kpi label="Awaiting approval" value={k.awaiting} sub="CAB decision needed" />
        <Kpi label="Change success rate" value={k.successRate ?? '-'} sub="closed in last 90 days" unit={k.successRate != null ? '%' : ''} />
        <Kpi label="Emergency changes" value={k.emergency} sub="all time" />
        <Kpi label="Schedule conflicts" value={k.conflicts} sub={k.conflicts ? 'overlap on the same asset' : 'none found'} />
      </div>
      {view === 'cal' ? <Calendar /> : (
        <>
          <Views value={status} onChange={setStatus} options={[['active', 'Active'], ['Approval', 'Awaiting approval'], ['Closed', 'Closed'], ['all', 'All']]} />
          <section className="panel" style={{ padding: '12px 14px' }}>
            <DataTable rows={q.data.items} rowKey={(c) => c.number} rowTo={(c) => `/changes/${c.number}`} empty="No changes here."
              columns={[
                { key: 'n', header: 'ID', className: 'id', render: (c) => c.number },
                { key: 't', header: 'Summary', className: 'title', render: (c) => <>{c.title}<small>{c.customer?.name}</small></> },
                { key: 'ty', header: 'Type', render: (c) => <TypeChip t={c.type} /> },
                { key: 'r', header: 'Risk', render: (c) => <RiskChip r={c.risk} /> },
                { key: 's', header: 'State', render: (c) => <ChangeChip c={c} /> },
                { key: 'a', header: 'Approval', className: 'muted', render: (c) => c.approvalSummary },
                { key: 'o', header: 'Assigned to', render: (c) => <OwnerCell user={c.owner} meId={user.id} /> },
                { key: 'st', header: 'Planned start', render: (c) => <span style={{ whiteSpace: 'nowrap' }}>{dtime(c.plannedStart)}{c.conflicts.length ? <> <span data-tip={`Overlaps with ${c.conflicts.join(', ')} on a shared asset`}><Chip cls="bad">Conflict</Chip></span></> : null}</span> },
              ]} />
          </section>
        </>
      )}
      {adding ? <ChangeDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}
