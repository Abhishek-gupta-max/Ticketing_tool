import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { problemService } from '../../services/problemService';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useAction, useMeta, useNow } from '../../hooks';
import { Chip, PriorityChip } from '../../components/common/Chips';
import { Steps } from '../../components/common/Controls';
import { PageSkeleton, ErrorState, NotFound, EmptyState } from '../../components/common/Feedback';
import { Field, Select, Textarea, Switch, Checkbox } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';
import Timeline from '../../components/tickets/Timeline';
import TicketTable from '../../components/tickets/TicketTable';
import TasksPanel from '../../components/tickets/TasksPanel';
import AttachmentsPanel from '../../components/tickets/AttachmentsPanel';
import ChangeDialog from '../../components/modals/ChangeDialog';
import { PRI_OPTIONS } from '../../constants';
import { dtime } from '../../utils/format';

const NEXT = { Logged: 'Start investigating', Investigating: 'Start finding the cause', 'Finding cause': 'Move to fix underway', 'Fix underway': 'Mark as fixed', Fixed: 'Close problem' };

function FixDialog({ p, onClose }) {
  const meta = useMeta();
  const [code, setCode] = useState('Fixed permanently');
  const [notes, setNotes] = useState('');
  const [all, setAll] = useState(true);
  const [err, setErr] = useState('');
  const act = useAction(() => problemService.setStatus(p.number, { status: 'Fixed', resolutionCode: code, fixNotes: notes.trim(), resolveLinked: all }), { invalidate: ['problem', 'problems', 'tickets'], onSuccess: onClose });
  return (
    <Modal title="Mark problem as fixed" onClose={onClose} busy={act.isPending} onSubmit={() => (notes.trim().length < 5 ? setErr('Fix notes are required (at least 5 characters).') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Mark as fixed', variant: 'primary', type: 'submit' }]}>
      <p style={{ marginBottom: 12 }}>Mark <b>{p.title}</b> as fixed.</p>
      <Field label="Resolution code *">{(id) => <Select id={id} options={meta?.problemCodes || []} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
      <Field label="Fix notes *" error={err}>{(id) => <Textarea id={id} placeholder="What fixed it?" value={notes} onChange={(e) => { setNotes(e.target.value); setErr(''); }} />}</Field>
      {p.openIncidentCount ? <Checkbox checked={all} onChange={setAll}>Also resolve the {p.openIncidentCount} linked open incidents</Checkbox> : null}
    </Modal>
  );
}

function LinkIncident({ p, onClose }) {
  const { data } = useQuery({ queryKey: ['tickets', 'link-candidates'], queryFn: () => ticketService.list({ kind: 'incident', withoutProblem: true, quick: 'all', sortBy: 'created', sortOrder: 'DESC', limit: 80 }) });
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const rows = (data?.data || []).filter((t) => t.status !== 'Closed');
  const act = useAction(() => problemService.linkIncident(p.number, v), { invalidate: ['problem', 'tickets'], onSuccess: onClose });
  return (
    <Modal title="Link an incident" onClose={onClose} busy={act.isPending} onSubmit={() => (v ? act.mutate() : setErr('Choose an incident.'))}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Link incident', variant: 'primary', type: 'submit' }]}>
      <Field label="Incident" hint="Showing the 80 most recent incidents without a problem." error={err}>{(id) => <Select id={id} blank="Choose an incident" options={rows.map((t) => [t.number, `${t.number}: ${t.title}`])} value={v} onChange={(e) => { setV(e.target.value); setErr(''); }} />}</Field>
    </Modal>
  );
}

/** Text area that saves when it loses focus. */
function AutoSaveText({ value, onSave, disabled, placeholder, label }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea className="inp" value={v} disabled={disabled} placeholder={placeholder} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v); }} />;
}

export default function ProblemDetails() {
  useNow();
  const { number } = useParams();
  const { user, can } = useAuth();
  const meta = useMeta();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['problem', number], queryFn: () => problemService.get(number) });
  const inv = ['problem', 'problems', 'nav'];
  const upd = useAction((body) => problemService.update(number, body), { invalidate: inv });
  const setStatus = useAction((status) => problemService.setStatus(number, { status }), { invalidate: inv });
  const known = useAction(() => problemService.toggleKnownError(number), { invalidate: inv });
  const addNote = useAction(() => problemService.addNote(number, note.trim()), { invalidate: ['problem'], onSuccess: () => setNote('') });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Problem ${number}`} back="/problems" backLabel="Back to problems" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const p = q.data;
  const ro = p.status === 'Closed' || !can('problem:update');
  const steps = meta?.problemSteps || ['Logged', 'Investigating', 'Finding cause', 'Fix underway', 'Fixed', 'Closed'];
  const idx = steps.indexOf(p.status);
  const go = (to) => (to === 'Fixed' ? setDialog('fix') : setStatus.mutate(to));

  return (
    <>
      <div className="crumb"><Link to="/problems">Problems</Link> / {p.number}</div>
      <div className="ph" style={{ marginBottom: 8 }}>
        <div>
          <div className="chips"><span className="id">{p.number}</span><PriorityChip p={p.priority} />{p.isKnownError ? <Chip cls="warn">Known error</Chip> : null}<Chip>Assigned to: {p.owner?.name || 'Nobody'}</Chip></div>
          <h1 className="dtitle">{p.title}</h1>
        </div>
        <div className="tools">
          {NEXT[p.status] && can('problem:update') ? <button type="button" className="btn primary" onClick={() => go(steps[idx + 1])}>{NEXT[p.status]}</button> : null}
          {p.status === 'Fixed' && can('problem:update') ? <button type="button" className="btn" onClick={() => setStatus.mutate('Finding cause')}>Reopen</button> : null}
          {!ro && can('change:create') ? <button type="button" className="btn" onClick={() => setDialog('change')}>Create change for the fix</button> : null}
        </div>
      </div>
      <Steps steps={steps} current={p.status} />
      {p.status === 'Closed' ? <div className="banner info"><div><b>This problem is closed and read-only.</b></div></div> : null}
      <div className="dgrid">
        <div>
          <section className="panel"><h2>Cause notes (root cause)</h2><p className="sub">Required before the problem can move to Fix underway.</p>
            <AutoSaveText value={p.rootCause} disabled={ro} placeholder="Not identified yet" label="Root cause" onSave={(v) => upd.mutate({ rootCause: v })} /></section>
          <section className="panel" style={{ marginTop: 16 }}><h2>Workaround</h2><p className="sub">Steps agents can give requesters until the fix is in place. Required to mark a known error.</p>
            <AutoSaveText value={p.workaround} disabled={ro} placeholder="No workaround recorded" label="Workaround" onSave={(v) => upd.mutate({ workaround: v })} /></section>
          <TasksPanel tasks={p.tasks} readOnly={ro || !can('task:create')} invalidate={['problem']} parent={{ number: p.number, kind: 'problem', label: 'Problem tasks', title: p.title, teamId: meta?.agents.find((a) => a.id === p.owner?.id)?.primaryTeamId }} />
          {idx >= 4 ? (
            <section className="panel" style={{ marginTop: 16 }}><h2>Resolution information</h2>
              <dl className="props" style={{ marginTop: 10 }}><dt>Resolution code</dt><dd>{p.resolutionCode || '-'}</dd><dt>Resolved</dt><dd>{dtime(p.resolvedAt)}</dd><dt>Fix notes</dt><dd className="desc">{p.fixNotes || '-'}</dd></dl>
            </section>
          ) : null}
          <section className="panel" style={{ marginTop: 16 }}>
            <div className="head-row"><div><h2>Related incidents</h2><p className="sub">{p.incidentCount} linked, {p.openIncidentCount} still open.</p></div>{ro ? null : <button type="button" className="btn sm" onClick={() => setDialog('link')}>Link an incident</button>}</div>
            {p.incidents.length ? <TicketTable rows={p.incidents} cols={['id', 'title', 'pri', 'status', 'sla']} /> : <EmptyState>No incidents linked yet.</EmptyState>}
            {p.incidentTotal > 15 ? <p className="muted">Showing 15 of {p.incidentTotal}.</p> : null}
          </section>
          <section className="panel" style={{ marginTop: 16 }}><h2>Activity</h2>
            <div style={{ marginTop: 10 }}><Timeline entries={p.activity} meId={user.id} /></div>
            {ro ? null : (
              <div className="composer">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a work note about the investigation" aria-label="Add a work note" />
                <div className="foot"><span /><button type="button" className="btn primary" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Post work note</button></div>
              </div>
            )}
          </section>
        </div>
        <div className="side-col">
          <section className="panel"><h2>Details</h2>
            <dl className="props" style={{ marginTop: 12 }}>
              <dt>State</dt><dd><Select aria-label="State" disabled={ro} value={p.status} options={steps} onChange={(e) => go(e.target.value)} /></dd>
              <dt>Priority</dt><dd><Select aria-label="Priority" disabled={ro} value={p.priority} options={PRI_OPTIONS} onChange={(e) => upd.mutate({ priority: Number(e.target.value) })} /></dd>
              <dt>Assigned to</dt><dd><Select aria-label="Assigned to" disabled={ro} value={p.owner?.id || ''} options={(meta?.agents || []).map((a) => [a.id, a.name])} onChange={(e) => upd.mutate({ ownerId: Number(e.target.value) })} /></dd>
              <dt>Known error</dt><dd><Switch on={p.isKnownError} label="Known error" disabled={ro} onChange={() => known.mutate()} /></dd>
              <dt>Created</dt><dd>{dtime(p.createdAt)}</dd>
            </dl>
          </section>
          <AttachmentsPanel files={p.attachments} readOnly={ro || !can('attachment:upload')} onUpload={async (files) => { await problemService.attach(number, files); qc.invalidateQueries({ queryKey: ['problem', number] }); }} onChanged={() => qc.invalidateQueries({ queryKey: ['problem', number] })} />
          <section className="panel"><h2>Related changes</h2>
            {p.changes.length ? p.changes.map((c) => <div className="linkrow" key={c.number}><Link to={`/changes/${c.number}`}>{c.number}: {c.title}</Link><Chip>{c.status}</Chip></div>) : <p className="muted" style={{ marginTop: 8 }}>No changes yet.</p>}
          </section>
        </div>
      </div>
      {dialog === 'fix' ? <FixDialog p={p} onClose={() => setDialog(null)} /> : null}
      {dialog === 'link' ? <LinkIncident p={p} onClose={() => setDialog(null)} /> : null}
      {dialog === 'change' ? <ChangeDialog pre={{ title: `Fix for ${p.title}`, problemNumber: p.number, ticketNumbers: p.incidents.filter((t) => ['New', 'In Progress', 'On Hold'].includes(t.status)).slice(0, 5).map((t) => t.number) }} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
