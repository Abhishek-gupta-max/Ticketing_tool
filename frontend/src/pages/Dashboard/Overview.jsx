import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../../services/adminService';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAction, useNow } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi } from '../../components/common/Controls';
import { PriorityChip, SlaText, Chip } from '../../components/common/Chips';
import { EmptyState, PageSkeleton, ErrorState } from '../../components/common/Feedback';
import TicketTable from '../../components/tickets/TicketTable';
import { HealthStrip, BarList, LoadBar } from '../../components/charts/Charts';
import { ago, dlong, dshort, dtime, greeting } from '../../utils/format';
import { PRI } from '../../constants';

const CHG_CHIP = { Approval: 'warn', Doing: 'bad', Verify: 'violet' };

export default function Overview() {
  useNow();
  const { user } = useAuth();
  const { openNewTicket } = useUI();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: dashboardService.overview, refetchInterval: 60000 });
  const take = useAction((n) => ticketService.assign(n, user.id), { invalidate: ['dashboard', 'tickets'], success: (_, n) => `${n} assigned to you` });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const sla = d.sla.compliance;
  const maxLoad = Math.max(1, ...d.workload.map((a) => a.openTickets));

  return (
    <>
      <div className="ph">
        <div><h1>{greeting()}</h1><p>{dlong(Date.now())}. {d.totals.open} open tickets across all customers.</p></div>
        <div className="tools">
          <Link className="btn" to="/requests"><Icon name="inbox" />Browse service catalog</Link>
          <button type="button" className="btn primary" onClick={() => openNewTicket()}><Icon name="plus" />New ticket</button>
        </div>
      </div>

      {d.majorIncident ? (
        <div className="banner">
          <div><b>Major incident in progress:</b> {d.majorIncident.title}<div className="muted">Started {ago(d.majorIncident.startedAt)}. Commander: {d.majorIncident.commander}.</div></div>
          <Link className="btn" to="/incidents">Open incident room</Link>
        </div>
      ) : null}

      <div className="kpis">
        <Kpi label="My open tickets" value={d.kpis.mine} sub={`${d.kpis.mineBreached} breached`} to="/tickets?quick=mine" />
        <Kpi label="Unassigned" value={d.kpis.unassigned} sub={`${d.kpis.unassignedHigh} high priority`} to="/tickets?quick=unassigned" />
        <Kpi label="Breached" value={d.kpis.breached} sub="need action now" to="/tickets?quick=breached" />
        <Kpi label="At risk" value={d.kpis.risk} sub="due soon" to="/tickets?quick=risk" />
        <Kpi label="On hold" value={d.kpis.onHold} sub={`${d.kpis.paused} with SLA paused`} to="/tickets?quick=onhold" />
        <Kpi label="Resolved today" value={d.kpis.resolvedToday} sub="since midnight" to="/reports" />
      </div>

      <div className="grid g2" style={{ marginTop: 0 }}>
        <section className="panel">
          <div className="head-row"><div><h2>My queue</h2><p className="sub">Sorted by the least time left.</p></div><Link className="btn sm" to="/tickets?quick=mine">View all</Link></div>
          {d.myQueue.length ? <TicketTable rows={d.myQueue} cols={['title', 'pri', 'sla']} compact /> : <EmptyState>Nothing assigned to you. Pick up a ticket from the queue.</EmptyState>}
        </section>
        <section className="panel">
          <div className="head-row"><div><h2>Team queue</h2><p className="sub">Unassigned tickets, highest priority first.</p></div></div>
          {d.teamQueue.length ? (
            <ul className="plain">
              {d.teamQueue.map((t) => (
                <li key={t.number}>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/tickets/${t.number}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}><b>{t.title}</b></Link>
                    <span className="s">{t.number} · {t.customer.name} · <SlaText t={t} /></span>
                  </div>
                  <div className="who" style={{ gap: 8 }}><PriorityChip p={t.priority} /><button type="button" className="btn sm" disabled={take.isPending} onClick={() => take.mutate(t.number)}>Take</button></div>
                </li>
              ))}
            </ul>
          ) : <EmptyState>The queue is clear.</EmptyState>}
        </section>
      </div>

      <div className="grid g2">
        <section className="panel">
          <div className="head-row"><div><h2>My tasks</h2><p className="sub">Open tasks assigned to you, soonest due first.</p></div><Link className="btn sm" to="/tasks">All tasks</Link></div>
          {d.myTasks.length ? (
            <ul className="plain">
              {d.myTasks.map((x) => {
                const late = x.dueAt && new Date(x.dueAt) < Date.now();
                return (
                  <li key={x.number}>
                    <div style={{ minWidth: 0 }}><Link to={`/tasks/${x.number}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}><b>{x.title}</b></Link><span className="s">{x.number} · {x.type}{x.parent ? ` · ${x.parent.number}` : ''}</span></div>
                    <Chip cls={late ? 'bad' : 'grey'}>{x.dueAt ? (late ? 'Overdue' : `Due ${dshort(x.dueAt)}`) : 'No due date'}</Chip>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState>You have no open tasks.</EmptyState>}
        </section>
        <section className="panel">
          <div className="head-row"><div><h2>Waiting for your approval</h2><p className="sub">Requests and changes that need a decision.</p></div><Link className="btn sm" to="/approvals">All approvals</Link></div>
          {d.approvals.length ? (
            <ul className="plain">
              {d.approvals.map((x) => (
                <li key={`${x.kind}${x.record.number}${x.role}`}>
                  <div style={{ minWidth: 0 }}><Link to={`/${x.record.route}/${x.record.number}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}><b>{x.record.title}</b></Link><span className="s">{x.record.number} · {x.kind === 'change' ? `Change, ${x.role}` : 'Order item'}</span></div>
                  <Chip cls="warn">{ago(x.waitingSince)}</Chip>
                </li>
              ))}
            </ul>
          ) : <EmptyState>Nothing is waiting for you.</EmptyState>}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="lead">{sla == null ? 'No tickets resolved yet.' : `SLA compliance over the last 30 days is ${sla.toFixed(1)}%, ${Math.abs(sla - 95).toFixed(1)} points ${sla >= 95 ? 'above' : 'below'} the 95% target. ${d.sla.lowDays ? `${d.sla.lowDays} days fell below 90%.` : 'No day fell below 90%.'}`}</h2>
        <p className="sub" style={{ marginTop: 8, marginBottom: 0 }}>Each bar is one day. <Link to="/reports">Open full reports</Link></p>
        <HealthStrip days={d.sla.daily} />
      </section>

      <div className="kpis six" style={{ marginTop: 16 }}>
        <Kpi label="Total tickets" value={d.totals.total} sub="all time" to="/tickets?quick=all" />
        <Kpi label="Open tickets" value={d.totals.open} sub="not resolved" to="/tickets?quick=open" />
        <Kpi label="Critical open" value={d.totals.critical} sub="P1 right now" to="/tickets?quick=open&priority=1" />
        <Kpi label="Pending approvals" value={d.totals.awaitingApproval} sub="order items" to="/approvals" />
        <Kpi label="Resolved" value={d.totals.resolved} sub="awaiting close" to="/tickets?quick=resolved" />
        <Kpi label="Closed" value={d.totals.closed} sub="all time" to="/tickets?quick=resolved" />
      </div>

      <div className="grid g3" style={{ marginTop: 0 }}>
        <section className="panel"><h2>Open tickets by priority</h2><p className="sub">Right now.</p>
          <BarList rows={d.byPriority.map((p) => ({ name: `P${p.priority} ${PRI[p.priority]}`, count: p.count }))} />
        </section>
        <section className="panel"><h2>Open tickets by category</h2><p className="sub">Right now.</p>
          <BarList rows={d.byCategory.map((c) => ({ name: c.name, count: c.count }))} />
        </section>
        <section className="panel"><h2>Agent workload</h2><p className="sub">Open tickets and tasks per agent.</p>
          <ul className="plain">
            {d.workload.map((a) => (
              <li key={a.id}><div style={{ minWidth: 0 }}><b>{a.name}</b><span className="s">{a.team || 'No team'} · {a.openTasks} open tasks</span></div><LoadBar value={a.openTickets} max={maxLoad} /></li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid g2">
        <section className="panel"><h2>Upcoming changes</h2><p className="sub">Next 7 days.</p>
          {d.upcomingChanges.length ? (
            <ul className="plain">
              {d.upcomingChanges.map((c) => (
                <li key={c.number}><div><Link to={`/changes/${c.number}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}><b>{c.title}</b></Link><span className="s">{c.number} · {dtime(c.plannedStart)} · {c.type}</span></div><Chip cls={CHG_CHIP[c.status] || 'ok'}>{c.status}</Chip></li>
              ))}
            </ul>
          ) : <EmptyState>No changes scheduled this week.</EmptyState>}
        </section>
        <section className="panel"><h2>Recent activity</h2><p className="sub">Latest actions across the desk.</p>
          <ul className="plain">
            {d.recentActivity.map((a) => (
              <li key={a.id}><div><b>{a.action}</b><span className="s">{a.userName} · {a.entityRef || a.entityType}</span></div><span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{ago(a.createdAt)}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
