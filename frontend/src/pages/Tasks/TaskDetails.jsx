import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../context/AuthContext';
import { useAction, useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Chip, TaskChip, PriorityChip } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, NotFound } from '../../components/common/Feedback';
import { Select } from '../../components/forms/Field';
import Timeline from '../../components/tickets/Timeline';
import AttachmentsPanel from '../../components/tickets/AttachmentsPanel';
import TaskCloseDialog from '../../components/modals/TaskCloseDialog';
import { PRI_OPTIONS, TASK_DONE } from '../../constants';
import { dtime, toLocalInput, fromLocalInput } from '../../utils/format';

export default function TaskDetails() {
  const { number } = useParams();
  const { user, can } = useAuth();
  const meta = useMeta();
  const qc = useQueryClient();
  const [closing, setClosing] = useState(null);
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['task', number], queryFn: () => taskService.get(number) });
  const inv = ['task', 'tasks', 'ticket', 'problem', 'change', 'dashboard'];
  const upd = useAction((body) => taskService.update(number, body), { invalidate: inv });
  const state = useAction((s) => taskService.setState(number, s), { invalidate: inv });
  const addNote = useAction(() => taskService.addNote(number, note.trim()), { invalidate: ['task'], onSuccess: () => setNote('') });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Task ${number}`} back="/tasks" backLabel="Back to tasks" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const t = q.data;
  const ro = TASK_DONE.includes(t.state) || !can('task:update');
  const pool = (meta?.agents || []).filter((a) => a.teamIds.includes(t.team?.id) || a.id === t.assignee?.id);
  const onState = (v) => (['Done', 'Not done', 'Not needed'].includes(v) ? setClosing(v) : state.mutate(v));

  return (
    <>
      <div className="crumb"><Link to="/tasks">Tasks</Link> / {t.number}</div>
      <div className="ph" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="chips"><span className="id">{t.number}</span><Chip>{t.type}</Chip><TaskChip s={t.state} /><PriorityChip p={t.priority} /></div>
          <h1 className="dtitle">{t.title}</h1>
        </div>
        <div className="tools">
          {!ro && t.state === 'Ready' ? <button type="button" className="btn" onClick={() => state.mutate('In progress')}>Start work</button> : null}
          {!ro && t.state !== 'Waiting' ? <button type="button" className="btn primary" onClick={() => setClosing('Done')}><Icon name="check" />Close complete</button> : null}
          {!ro && t.assignee?.id !== user.id ? <button type="button" className="btn" onClick={() => upd.mutate({ assigneeId: user.id })}>Assign to me</button> : null}
        </div>
      </div>
      {TASK_DONE.includes(t.state) ? <div className="banner info"><div><b>This task is closed and read-only.</b></div></div> : null}
      {t.waitingFor ? <div className="banner warn"><div><b>Waiting for an earlier step.</b> This task opens when <Link to={`/tasks/${t.waitingFor.number}`}>{t.waitingFor.number}: {t.waitingFor.title}</Link> is closed.</div></div> : null}
      <div className="dgrid">
        <div>
          {t.parent ? (
            <section className="panel"><h2>Parent record</h2>
              <div className="linkrow"><span><Link to={`/${t.parent.route}/${t.parent.number}`}><b>{t.parent.number}</b></Link> {t.parent.title}</span>{t.parent.status ? <Chip>{t.parent.status}</Chip> : null}</div>
            </section>
          ) : null}
          <section className="panel" style={t.parent ? { marginTop: 16 } : undefined}>
            <h2>Description</h2>
            <p className="desc" style={{ marginTop: 8 }}>{t.description || <span className="muted">No description.</span>}</p>
            {t.closeNotes ? <dl className="props" style={{ marginTop: 14 }}><dt>Close notes</dt><dd className="desc">{t.closeNotes}</dd></dl> : null}
          </section>
          {t.siblings.length ? (
            <section className="panel" style={{ marginTop: 16 }}><h2>Other tasks on {t.parent?.number}</h2>
              {t.siblings.map((x) => <div className="linkrow" key={x.number}><span><Link to={`/tasks/${x.number}`}>{x.number}</Link> {x.title}</span><TaskChip s={x.state} /></div>)}
            </section>
          ) : null}
          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Internal notes</h2><p className="sub">Notes are visible to agents only.</p>
            {ro ? null : (
              <div className="composer">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a work note" aria-label="Add a work note" />
                <div className="foot"><span /><button type="button" className="btn primary" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Post work note</button></div>
              </div>
            )}
            <div style={{ marginTop: 12 }}><Timeline entries={t.timeline} meId={user.id} /></div>
          </section>
        </div>
        <div className="side-col">
          <section className="panel"><h2>Details</h2>
            <dl className="props" style={{ marginTop: 12 }}>
              <dt>State</dt><dd><Select aria-label="State" disabled={ro} value={t.state} options={t.allowedStates} onChange={(e) => onState(e.target.value)} /></dd>
              <dt>Priority</dt><dd><Select aria-label="Priority" disabled={ro} value={t.priority} options={PRI_OPTIONS} onChange={(e) => upd.mutate({ priority: Number(e.target.value) })} /></dd>
              <dt>Team</dt><dd><Select aria-label="Team" disabled={ro} value={t.team?.id || ''} options={(meta?.teams || []).map((x) => [x.id, x.name])} onChange={(e) => upd.mutate({ teamId: Number(e.target.value) })} /></dd>
              <dt>Assigned to</dt><dd><Select aria-label="Assigned to" disabled={ro} value={t.assignee?.id || ''} blank="Unassigned" options={pool.map((a) => [a.id, a.id === user.id ? `You (${a.name})` : a.name])} onChange={(e) => upd.mutate({ assigneeId: e.target.value ? Number(e.target.value) : null })} /></dd>
              <dt>Due</dt><dd><input className="inp" type="datetime-local" disabled={ro} aria-label="Due" defaultValue={t.dueAt ? toLocalInput(t.dueAt) : ''} onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v !== (t.dueAt ? new Date(t.dueAt).toISOString() : null)) upd.mutate({ dueAt: v }); }} /></dd>
              <dt>Type</dt><dd>{t.type}</dd>
              <dt>Sequence</dt><dd>{t.isSequential ? `Step ${t.sortOrder + 1}, starts after the previous step` : 'Runs in parallel with other tasks'}</dd>
              <dt>Created</dt><dd>{dtime(t.createdAt)}</dd>
              {t.closedAt ? <><dt>Closed</dt><dd>{dtime(t.closedAt)}</dd></> : null}
            </dl>
          </section>
          <AttachmentsPanel files={t.attachments} readOnly={ro || !can('attachment:upload')} onUpload={async (files) => { await taskService.attach(number, files); qc.invalidateQueries({ queryKey: ['task', number] }); }} onChanged={() => qc.invalidateQueries({ queryKey: ['task', number] })} />
        </div>
      </div>
      {closing ? <TaskCloseDialog task={t} state={closing} onClose={() => setClosing(null)} invalidate={inv} /> : null}
    </>
  );
}
