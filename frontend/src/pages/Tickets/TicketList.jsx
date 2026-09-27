import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useAction, useMeta, useNow } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Seg, Views, Pagination } from '../../components/common/Controls';
import { Skeleton, ErrorState, EmptyState } from '../../components/common/Feedback';
import { Select } from '../../components/forms/Field';
import { PriorityChip, SlaText, Avatar } from '../../components/common/Chips';
import TicketTable from '../../components/tickets/TicketTable';
import TicketFilters from './TicketFilters';
import HoldDialog from './HoldDialog';
import ResolveDialog from './ResolveDialog';
import { QUICK_VIEWS, PAGE_SIZE } from '../../constants';

const EMPTY = { search: '', kind: '', priority: '', teamId: '', assignee: '', customerId: '', categoryId: '', dateFrom: '', dateTo: '' };

function TicketBoard({ params }) {
  const { user } = useAuth();
  const toast = useToast();
  const [drag, setDrag] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [dialog, setDialog] = useState(null);
  const q = useQuery({ queryKey: ['tickets', 'board', params], queryFn: () => ticketService.board(params) });
  const move = useAction(({ number, status }) => ticketService.setStatus(number, { status }), { invalidate: ['tickets'] });
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const drop = (status) => {
    setOverCol(null);
    const t = drag;
    if (!t || t.status === status) return;
    if (status === 'Awaiting approval') { toast('Use Approve or Reject on the request instead'); return; }
    if (status === 'Resolved') setDialog({ kind: 'resolve', t });
    else if (status === 'On Hold') setDialog({ kind: 'hold', t });
    else move.mutate({ number: t.number, status });
  };

  return (
    <>
      <div className="board">
        {q.data.columns.map((c) => (
          <div key={c.status} className={`col${overCol === c.status ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(c.status); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null); }}
            onDrop={(e) => { e.preventDefault(); drop(c.status); }}>
            <h3>{c.status}<span className="muted">{c.total}</span></h3>
            {c.items.map((t) => (
              <Link key={t.number} className="card" draggable onDragStart={() => setDrag(t)} to={`/tickets/${t.number}`}>
                <div className="f"><span className="id">{t.number}</span><PriorityChip p={t.priority} /></div>
                <div className="t">{t.title}</div>
                <div className="f"><span className="who"><Avatar user={t.assignee} mine={t.assignee?.id === user.id} /><span className="muted">{t.customer.name.split(' ')[0]}</span></span><SlaText t={t} /></div>
              </Link>
            ))}
            {!c.items.length ? <div className="empty" style={{ padding: '16px 4px' }}>Nothing here</div> : null}
            {c.total > 20 ? <p className="muted" style={{ marginTop: 8 }}>+{c.total - 20} more. Use filters to narrow.</p> : null}
          </div>
        ))}
      </div>
      <p className="sub" style={{ margin: '8px 0 0' }}>Drag a card to another column to change its status.</p>
      {dialog?.kind === 'resolve' ? <ResolveDialog ticket={dialog.t} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'hold' ? <HoldDialog ticket={dialog.t} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

export default function TicketList() {
  useNow();
  const { user, can } = useAuth();
  const meta = useMeta();
  const { openNewTicket } = useUI();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState('list');
  const [f, setF] = useState(() => ({ ...EMPTY, priority: sp.get('priority') || '', kind: sp.get('kind') || '' }));
  const [quick, setQuick] = useState(sp.get('quick') || (user.isStaff ? 'open' : 'all'));
  const [sort, setSort] = useState({ by: 'created', dir: 'DESC' });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(new Set());

  const params = useMemo(() => {
    const p = { quick, sortBy: sort.by, sortOrder: sort.dir, page, limit: PAGE_SIZE };
    Object.entries(f).forEach(([k, v]) => { if (v) p[k] = v; });
    if (p.dateTo) p.dateTo = new Date(new Date(p.dateTo).getTime() + 86400000).toISOString().slice(0, 10);
    return p;
  }, [f, quick, sort, page]);

  const q = useQuery({ queryKey: ['tickets', 'list', params], queryFn: () => ticketService.list(params), placeholderData: keepPreviousData, enabled: view === 'list' });
  const bulk = useAction((body) => ticketService.bulk({ numbers: [...sel], ...body }), { invalidate: ['tickets'], onSuccess: () => setSel(new Set()) });

  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(1); setSel(new Set()); };
  const setQ = (k) => { setQuick(k); setPage(1); setSel(new Set()); setSp(k === 'open' ? {} : { quick: k }, { replace: true }); };
  const onSort = (by) => setSort((s) => (s.by === by ? { by, dir: s.dir === 'ASC' ? 'DESC' : 'ASC' } : { by, dir: ['title', 'customer', 'assignee', 'sla'].includes(by) ? 'ASC' : 'DESC' }));
  const rows = q.data?.data || [];
  const meta2 = q.data?.meta;
  const counts = meta2?.counts;

  const exportCsv = async () => {
    try { const { page: _p, limit: _l, ...rest } = params; await ticketService.exportCsv(rest); toast('Download started'); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <div className="ph">
        <div><h1>{user.isStaff ? 'Tickets' : 'My tickets'}</h1><p>{meta2 ? `${meta2.total} ${meta2.total === 1 ? 'ticket' : 'tickets'} match the current filters.` : ' '}</p></div>
        <div className="tools">
          {user.isStaff ? <Seg label="View" value={view} onChange={setView} options={[['list', 'List', 'list'], ['board', 'Board', 'board']]} /> : null}
          {can('ticket:export') ? <button type="button" className="btn" onClick={exportCsv}><Icon name="download" />Export CSV</button> : null}
          <button type="button" className="btn primary" onClick={() => openNewTicket()}><Icon name="plus" />New ticket</button>
        </div>
      </div>
      {user.isStaff ? <Views value={quick} onChange={setQ} options={QUICK_VIEWS} counts={counts} /> : null}
      <TicketFilters f={f} set={set} onClear={() => { setF(EMPTY); setPage(1); }} />
      <section className="panel" style={{ padding: '12px 14px' }}>
        {view === 'board' ? <TicketBoard params={{ ...params, quick: undefined, page: undefined, limit: undefined }} /> : q.isLoading ? <Skeleton rows={10} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
          <>
            {rows.length ? (
              <TicketTable rows={rows} cols={user.isStaff && can('ticket:update') ? ['sel', 'id', 'title', 'cust', 'pri', 'status', 'owner', 'sla'] : ['id', 'title', 'pri', 'status', 'owner', 'upd']}
                sort={sort} onSort={onSort} selected={sel}
                onSelect={(n, on) => setSel((s) => { const x = new Set(s); if (on) x.add(n); else x.delete(n); return x; })}
                onSelectAll={(on) => setSel((s) => { const x = new Set(s); rows.forEach((t) => (on ? x.add(t.number) : x.delete(t.number))); return x; })} />
            ) : <EmptyState>No tickets match. Try clearing a filter.</EmptyState>}
            <Pagination meta={meta2} onPage={(p) => { setPage(p); setSel(new Set()); }} />
            {sel.size ? (
              <div className="bulk">
                <b>{sel.size} selected</b>
                <Select aria-label="Assign selected" blank="Assign to..." value="" options={(meta?.agents || []).map((a) => [a.id, a.id === user.id ? `You (${a.name})` : a.name])}
                  onChange={(e) => e.target.value && bulk.mutate({ assigneeId: Number(e.target.value) })} />
                <Select aria-label="Set state" blank="Set state..." value="" options={['In Progress', 'On Hold', 'Closed']} onChange={(e) => e.target.value && bulk.mutate({ status: e.target.value })} />
                <button type="button" className="btn sm" onClick={() => setSel(new Set())}>Clear selection</button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
