import { Link } from 'react-router-dom';
import { Select } from '../../components/forms/Field';
import { PriorityChip, Chip } from '../../components/common/Chips';
import { useAction, useMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { ticketService } from '../../services/ticketService';
import { IU_OPTIONS } from '../../constants';
import { dur, dtime, ago } from '../../utils/format';
import { liveSla } from '../../utils/sla';

const stageCls = (s) => (s === 'Breached' ? 'bad' : s === 'Achieved' ? 'ok' : s === 'Paused' ? 'info' : 'grey');
const INV = ['tickets', 'ticket', 'dashboard'];

/** Details (state, impact, urgency, team, assignee...), time targets and related records. */
export default function TicketSidePanel({ t, onState, dialogs }) {
  const meta = useMeta();
  const { user, can } = useAuth();
  const ro = t.status === 'Closed' || !can('ticket:update');
  const upd = useAction((body) => ticketService.update(t.number, body), { invalidate: INV, success: (r) => (r?.priority && r.priority !== t.priority ? `Priority is now P${r.priority} ${r.priorityName}` : 'Saved') });
  const assign = useAction((id) => ticketService.assign(t.number, id), { invalidate: INV, success: 'Assignment updated' });
  if (!meta) return null;
  const pool = (meta.agents || []).filter((a) => a.teamIds.includes(t.team?.id) || a.id === t.assignee?.id);
  const sla = liveSla(t);
  const sub = (l, v) => <><dt>{l}</dt><dd>{v}</dd></>;

  return (
    <>
      <section className="panel">
        <h2>Details</h2>
        <dl className="props" style={{ marginTop: 12 }}>
          {user.isStaff ? sub('State', <Select aria-label="State" disabled={ro || t.status === 'Awaiting approval'} value={t.status} options={t.allowedStates} onChange={(e) => onState(e.target.value)} />) : sub('State', t.status)}
          {t.status === 'On Hold' && user.isStaff ? sub('On hold reason', <Select aria-label="On hold reason" disabled={ro} value={t.holdReason || ''} options={meta.holdReasons} onChange={(e) => upd.mutate({ holdReason: e.target.value })} />) : null}
          {user.isStaff ? sub('Impact', <Select aria-label="Impact" disabled={ro} value={t.impact} options={IU_OPTIONS} onChange={(e) => upd.mutate({ impact: Number(e.target.value) })} />) : null}
          {user.isStaff ? sub('Urgency', <Select aria-label="Urgency" disabled={ro} value={t.urgency} options={IU_OPTIONS} onChange={(e) => upd.mutate({ urgency: Number(e.target.value) })} />) : null}
          {sub('Priority', <><PriorityChip p={t.priority} /><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Calculated from impact and urgency</div></>)}
          {user.isStaff ? sub('Team', <Select aria-label="Team" disabled={ro} value={t.team?.id || ''} options={meta.teams.filter((x) => x.type === 'Support' && (x.isActive || x.id === t.team?.id)).map((x) => [x.id, x.name])} onChange={(e) => upd.mutate({ teamId: Number(e.target.value) })} />) : null}
          {user.isStaff ? sub('Assigned to', <Select aria-label="Assigned to" disabled={ro || t.status === 'Awaiting approval' || !can('ticket:assign')} value={t.assignee?.id || ''} blank="Unassigned"
            options={pool.map((a) => [a.id, a.id === user.id ? `You (${a.name})` : a.name])} onChange={(e) => assign.mutate(e.target.value ? Number(e.target.value) : null)} />) : sub('Assigned to', t.assignee?.name || 'Not yet assigned')}
          {user.isStaff ? sub('Category', <Select aria-label="Category" disabled={ro} value={t.category.id} options={meta.categories.map((c) => [c.id, c.name])} onChange={(e) => upd.mutate({ categoryId: Number(e.target.value) })} />) : sub('Category', t.category.name)}
          {sub('Customer', t.customer.name)}
          {sub('Requester', <>{t.requester.name}{t.requester.vip ? <> <Chip cls="violet">VIP</Chip></> : null}<div className="muted" style={{ fontSize: 12 }}>{t.requester.email}</div></>)}
          {sub('Channel', t.channel)}
        </dl>
      </section>

      <section className="panel">
        <h2>Time targets</h2>
        {t.slaRows.map((r) => {
          const color = r.stage === 'Breached' || r.pct > 100 ? 'var(--bad)' : r.stage === 'Achieved' ? 'var(--ok)' : r.pct > 75 ? 'var(--warn)' : 'var(--ok)';
          return (
            <div className="slarow" key={r.name}>
              <div className="head-row"><b style={{ fontWeight: 500 }}>{r.name}</b><Chip cls={stageCls(r.stage)}>{r.stage}</Chip></div>
              <div className="bar2" style={{ margin: '6px 0 4px' }}><i style={{ width: `${Math.min(100, Math.max(2, r.pct))}%`, background: color }} /></div>
              <div className="muted" style={{ fontSize: 12.5 }}>{Math.round(r.pct)}% of {dur(r.target)} used{r.stage === 'In progress' ? ` · ${dur(Math.max(0, r.target - r.elapsed))} left` : ''}</div>
            </div>
          );
        })}
        <dl className="props" style={{ marginTop: 14 }}>
          <dt>Resolve by</dt><dd>{dtime(t.resolveBy)}</dd>
          <dt>Status</dt><dd><span className={`sla ${sla.state}`}>{sla.label}</span></dd>
          <dt>Created</dt><dd>{dtime(t.createdAt)}</dd>
          <dt>Updated</dt><dd>{ago(t.updatedAt)}</dd>
        </dl>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>The resolution clock pauses when the ticket is On Hold with the reason Waiting for requester.</p>
      </section>

      {dialogs.attachments}

      {user.isStaff ? (
        <section className="panel">
          <h2>Related records</h2>
          <div className="linkrow"><span className="muted">Affected asset</span><span>{t.asset ? <Link to={`/assets/${t.asset.tag}`}>{t.asset.name}</Link> : 'None'} {ro ? null : <button type="button" className="link" onClick={() => dialogs.open('asset')}>{t.asset ? 'Change' : 'Link'}</button>}</span></div>
          {t.asset ? <>
            <div className="linkrow"><span className="muted">{t.asset.ownerLabel}</span><span>{t.asset.owner?.name || 'Not set'}</span></div>
            <div className="linkrow"><span className="muted">Support group</span><span>{t.asset.supportTeam?.name || 'None'}</span></div>
          </> : null}
          {t.request ? <div className="linkrow"><span className="muted">Request</span><Link to={`/requests/${t.request.number}`}>{t.request.number}</Link></div> : null}
          <div className="linkrow"><span className="muted">Problem</span><span>{t.problem ? <><Link to={`/problems/${t.problem.number}`}>{t.problem.number}</Link> {ro ? null : <button type="button" className="link" onClick={() => dialogs.unlinkProblem()}>Unlink</button>}</> : <>None {ro ? null : <button type="button" className="link" onClick={() => dialogs.open('linkProblem')}>Link</button>}</>}</span></div>
          <div className="linkrow"><span className="muted">Change request</span><span>{t.change ? <Link to={`/changes/${t.change.number}`}>{t.change.number}</Link> : 'None'}</span></div>
          {t.parent ? <div className="linkrow"><span className="muted">Parent</span><Link to={`/tickets/${t.parent.number}`}>{t.parent.number}</Link></div> : null}
          {t.children.length ? <div className="linkrow"><span className="muted">Linked tickets</span><span>{t.children.map((k, i) => <span key={k.number}>{i ? ', ' : ''}<Link to={`/tickets/${k.number}`}>{k.number}</Link></span>)}</span></div> : null}
          <div className="linkrow"><span className="muted">Tags</span><span>{ro ? null : <button type="button" className="link" onClick={() => dialogs.open('tags')}>{t.tags.length ? 'Edit tags' : 'Add tags'}</button>}</span></div>
        </section>
      ) : null}

      {t.suggestedArticles?.length && !ro ? (
        <section className="panel">
          <h2>Suggested articles</h2><p className="sub">Matches from the knowledge base.</p>
          {t.suggestedArticles.map((a) => (
            <div className="linkrow" key={a.number}><Link to={`/kb/${a.number}`}>{a.title}</Link><button type="button" className="link" onClick={() => dialogs.insert(`This article should help: ${a.title} (${a.number}).`)}>Insert link</button></div>
          ))}
        </section>
      ) : null}
    </>
  );
}
