import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { incidentService, ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAction, useMeta, useNow } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, Seg } from '../../components/common/Controls';
import { Chip, Avatar, StatusChip, SlaText } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, EmptyState, Skeleton } from '../../components/common/Feedback';
import { Field, Select, Textarea } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';
import Timeline from '../../components/tickets/Timeline';
import TicketTable from '../../components/tickets/TicketTable';
import { PRI, PRI_OPTIONS } from '../../constants';
import { dtime, dur, dshort, MIN } from '../../utils/format';

const CELL = { 1: ['var(--bad-bg)', 'var(--bad)'], 2: ['var(--warn-bg)', 'var(--warn)'], 3: ['var(--ok-bg)', 'var(--ok)'], 4: ['var(--info-bg)', 'var(--p4)'] };

function DeclareDialog({ candidates, onClose }) {
  const meta = useMeta();
  const { user } = useAuth();
  const [tk, setTk] = useState(candidates[0]?.number || '');
  const [impact, setImpact] = useState('');
  const [cmd, setCmd] = useState(user.id);
  const [err, setErr] = useState('');
  const act = useAction(() => incidentService.declare({ ticketNumber: tk, impact: impact.trim(), commanderId: Number(cmd) }), { invalidate: ['incidents', 'tickets', 'dashboard'], onSuccess: onClose });
  return (
    <Modal title="Declare a major incident" onClose={onClose} busy={act.isPending} onSubmit={() => (impact.trim().length < 5 ? setErr('Describe the impact in a few words.') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Declare major incident', variant: 'danger', type: 'submit' }]}>
      <Field label="Incident">{(id) => <Select id={id} options={candidates.map((t) => [t.number, `${t.number} (P${t.priority}): ${t.title}`])} value={tk} onChange={(e) => setTk(e.target.value)} />}</Field>
      <Field label="Customer impact" error={err}>{(id) => <Textarea id={id} placeholder="What are users experiencing?" value={impact} onChange={(e) => { setImpact(e.target.value); setErr(''); }} />}</Field>
      <Field label="Incident commander">{(id) => <Select id={id} options={(meta?.agents || []).map((a) => [a.id, a.name])} value={cmd} onChange={(e) => setCmd(e.target.value)} />}</Field>
    </Modal>
  );
}

function IncidentRoom({ m }) {
  const { user, can } = useAuth();
  const [text, setText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState('');
  const post = useAction(() => incidentService.postUpdate(m.id, text.trim()), { invalidate: ['incidents', 'ticket'], onSuccess: () => setText('') });
  const resolve = useAction(() => incidentService.resolve(m.id, summary.trim()), { invalidate: ['incidents', 'ticket', 'dashboard'], onSuccess: () => setResolving(false) });
  const t = m.ticket;
  return (
    <section className="panel" style={{ borderColor: 'var(--bad)' }}>
      <div className="head-row">
        <div>
          <div className="chips"><Chip cls="bad">Major incident {m.number}</Chip><Chip>Commander: {m.commander?.name}</Chip></div>
          <h2 className="lead" style={{ marginTop: 8 }}>{m.title}</h2>
        </div>
        <div className="tools">
          <Link className="btn sm" to={`/tickets/${m.ticketNumber}`}>Open ticket</Link>
          {can('major:declare') ? <button type="button" className="btn sm danger" onClick={() => setResolving(true)}>Resolve major incident</button> : null}
        </div>
      </div>
      <dl className="props" style={{ margin: '12px 0', gridTemplateColumns: '130px minmax(0,1fr)' }}>
        <dt>Started</dt><dd>{dtime(m.startedAt)} ({dur((Date.now() - new Date(m.startedAt)) / MIN)} ago)</dd>
        <dt>Customer impact</dt><dd>{m.impact}</dd>
        {m.asset ? <>
          <dt>Affected service</dt><dd><Link to={`/assets/${m.asset.tag}`}>{m.asset.name}</Link> ({m.asset.environment})</dd>
          <dt>{m.asset.ownerLabel}</dt><dd>{m.asset.owner?.name || 'Not set'}</dd>
          <dt>Support group</dt><dd>{m.asset.supportTeam?.name || 'None'}</dd>
        </> : null}
        {t ? <><dt>Ticket status</dt><dd><StatusChip s={t.status} /> <SlaText t={t} /></dd></> : null}
      </dl>
      <h3 style={{ fontSize: 13, marginBottom: 6 }}>Update timeline</h3>
      {can('major:declare') ? (
        <div className="composer" style={{ marginBottom: 14 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Post an update: what is known, what is being done, when the next update is due" aria-label="Post an update" />
          <div className="foot"><span className="muted">Updates are added to the ticket timeline.</span><button type="button" className="btn primary" disabled={!text.trim() || post.isPending} onClick={() => post.mutate()}>Post update</button></div>
        </div>
      ) : null}
      <Timeline entries={m.updates.map((u) => ({ ...u, type: 'comment' }))} meId={user.id} empty="No updates yet." />
      {resolving ? (
        <Modal title="Resolve major incident" onClose={() => setResolving(false)} busy={resolve.isPending} onSubmit={() => (summary.trim().length < 5 ? setErr('Add a short summary.') : resolve.mutate())}
          buttons={[{ label: 'Cancel', onClick: () => setResolving(false) }, { label: 'Resolve major incident', variant: 'primary', type: 'submit' }]}>
          <Field label="Final update" error={err}>{(id) => <Textarea id={id} placeholder="Summarise the cause and the fix" value={summary} onChange={(e) => { setSummary(e.target.value); setErr(''); }} />}</Field>
        </Modal>
      ) : null}
    </section>
  );
}

export default function Incidents() {
  useNow();
  const { can } = useAuth();
  const { openNewTicket } = useUI();
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [pri, setPri] = useState('');
  const [declaring, setDeclaring] = useState(false);
  const q = useQuery({ queryKey: ['incidents'], queryFn: incidentService.overview, refetchInterval: 60000 });
  const params = { kind: 'incident', quick: status === 'open' ? 'open' : status === 'resolved' ? 'resolved' : 'all', priority: pri || undefined, sortBy: status === 'open' ? 'sla' : 'updated', sortOrder: status === 'open' ? 'ASC' : 'DESC', limit: 12 };
  const list = useQuery({ queryKey: ['tickets', 'incidents', params], queryFn: () => ticketService.list(params) });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;

  return (
    <>
      <div className="ph">
        <div><h1>Incidents</h1><p>Restore service quickly. Something broken or degraded for a user or a service.</p></div>
        <div className="tools">
          {can('major:declare') ? <button type="button" className="btn" disabled={!!d.active} title={d.active ? 'A major incident is already active' : undefined} onClick={() => setDeclaring(true)}><Icon name="alert" />Declare major incident</button> : null}
          <button type="button" className="btn primary" onClick={() => openNewTicket()}><Icon name="plus" />New ticket</button>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Open incidents" value={d.kpis.open} sub={`${d.kpis.unassigned} unassigned`} />
        <Kpi label="Critical and high" value={d.kpis.high} sub="P1 and P2 open" />
        <Kpi label="SLA breached" value={d.kpis.breached} sub="open right now" />
        <Kpi label="Mean time to resolve" value={d.kpis.mttrHours ? d.kpis.mttrHours.toFixed(1) : '0'} sub="last 30 days" unit=" h" />
        <Kpi label="Major incidents" value={d.kpis.majorTotal} sub="all time" />
      </div>
      <div className="grid g-c" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {d.active ? <IncidentRoom m={d.active} /> : (
            <section className="panel">
              <h2>Incident room</h2><p className="sub">No major incident right now.</p>
              <p>When a critical service is down or many users are blocked, declare a major incident. This shows a banner to everyone, appoints a commander and keeps a timeline of customer updates.</p>
              {can('major:declare') ? <div style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setDeclaring(true)}>Declare major incident</button></div> : null}
            </section>
          )}
          <section className="panel">
            <div className="head-row">
              <div><h2>All incidents</h2><p className="sub">{list.data ? `${list.data.meta.total} incidents. Showing the first 12.` : ''}</p></div>
              <div className="tools">
                <Seg label="Status" value={status} onChange={setStatus} options={[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']]} />
                <Select aria-label="Priority" blank="Any priority" options={PRI_OPTIONS} value={pri} onChange={(e) => setPri(e.target.value)} />
              </div>
            </div>
            {list.isLoading ? <Skeleton /> : <TicketTable rows={list.data?.data || []} cols={['id', 'title', 'cust', 'pri', 'status', 'owner', 'sla']} />}
            {list.data?.meta.total > 12 ? <div className="pager"><span /><button type="button" className="btn sm" onClick={() => navigate(`/tickets?kind=incident&quick=${params.quick}`)}>Open all in Tickets</button></div> : null}
          </section>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="panel">
            <h2>Priority matrix</h2><p className="sub">Open incidents by impact and urgency. Priority comes from the matrix.</p>
            <div className="matrix">
              <span />{['High urgency', 'Medium urgency', 'Low urgency'].map((x) => <span key={x} className="lab">{x}</span>)}
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <span className="lab">{['High impact', 'Medium impact', 'Low impact'][i]}</span>
                  {[0, 1, 2].map((u) => {
                    const p = [[1, 2, 3], [2, 3, 4], [3, 4, 4]][i][u];
                    return <span key={u} className="c" style={{ background: CELL[p][0], color: CELL[p][1] }} data-tip={`P${p} ${PRI[p]}\n${d.matrix[i][u]} open`}>{d.matrix[i][u]}<div style={{ fontWeight: 400, fontSize: 12 }}>P{p}</div></span>;
                  })}
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>On call now</h2><p className="sub">P1 incidents are assigned to the on-call person of the assignment group.</p>
            {d.onCall.length ? (
              <ul className="plain">{d.onCall.map((x) => <li key={`${x.team.id}-${x.id}`}><span className="who"><Avatar user={x} /><span><b>{x.name}</b><span className="s">{x.team.name}</span></span></span><a className="link" href={`mailto:${x.email}`}>Contact</a></li>)}</ul>
            ) : <EmptyState>Nobody is on call. Set this in Settings.</EmptyState>}
            {can('team:manage') ? <Link className="btn sm" to="/settings?tab=teams">Manage on-call</Link> : null}
          </section>
          {d.past.length ? (
            <section className="panel"><h2>Past major incidents</h2>
              <ul className="plain">{d.past.map((m) => <li key={m.id}><div><b>{m.title}</b><span className="s">{m.number} · {dshort(m.startedAt)} · lasted {dur((new Date(m.resolvedAt) - new Date(m.startedAt)) / MIN)}</span></div><Link className="btn sm" to={`/tickets/${m.ticketNumber}`}>Open</Link></li>)}</ul>
            </section>
          ) : null}
        </div>
      </div>
      {declaring ? <DeclareDialog candidates={d.candidates} onClose={() => setDeclaring(false)} /> : null}
    </>
  );
}
