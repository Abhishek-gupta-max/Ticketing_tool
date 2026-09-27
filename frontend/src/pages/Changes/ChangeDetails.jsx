import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changeService } from '../../services/changeService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useAction, useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { TypeChip, RiskChip, ChangeChip, Avatar, Chip } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, NotFound } from '../../components/common/Feedback';
import { Field, Select, Textarea } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';
import Timeline from '../../components/tickets/Timeline';
import TasksPanel from '../../components/tickets/TasksPanel';
import AttachmentsPanel from '../../components/tickets/AttachmentsPanel';
import ChangeDialog from '../../components/modals/ChangeDialog';
import { toLocalInput, fromLocalInput } from '../../utils/format';

const NEXT = { Draft: null, 'Risk review': ['Approval', 'Request approval'], Scheduled: ['Doing', 'Start work'], Doing: ['Verify', 'Move to verify'], Verify: ['Closed', 'Close change'] };

function PlanField({ c, field, label, sub, placeholder, disabled }) {
  const [v, setV] = useState(c[field]);
  useEffect(() => setV(c[field]), [c, field]);
  const save = useAction((val) => changeService.updatePlans(c.number, { [field]: val }), { invalidate: ['change'], success: 'Saved' });
  return (
    <section className="panel" style={{ marginTop: 16 }}><h2>{label}</h2><p className="sub">{sub}</p>
      <textarea className="inp" aria-label={label} placeholder={placeholder} disabled={disabled} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== c[field]) save.mutate(v); }} />
    </section>
  );
}

function CloseDialog({ c, onClose }) {
  const meta = useMeta();
  const [code, setCode] = useState('Worked as planned');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const act = useAction(() => changeService.transition(c.number, { to: 'Closed', closeCode: code, closeNotes: notes.trim() }), { invalidate: ['change', 'changes'], onSuccess: onClose });
  return (
    <Modal title={`Close ${c.number}`} onClose={onClose} busy={act.isPending} onSubmit={() => (notes.trim().length < 5 ? setErr('Close notes are required (at least 5 characters).') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Close change', variant: 'primary', type: 'submit' }]}>
      <Field label="Close code *">{(id) => <Select id={id} options={meta?.changeCloseCodes || []} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
      <Field label="Close notes *" error={err}>{(id) => <Textarea id={id} placeholder="Outcome, issues found, lessons learned" value={notes} onChange={(e) => { setNotes(e.target.value); setErr(''); }} />}</Field>
    </Modal>
  );
}

export default function ChangeDetails() {
  const { number } = useParams();
  const { user, can } = useAuth();
  const meta = useMeta();
  const { confirm } = useUI();
  const toast = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const q = useQuery({ queryKey: ['change', number], queryFn: () => changeService.get(number) });
  const inv = ['change', 'changes', 'approvals', 'dashboard', 'tasks'];
  const move = useAction((body) => changeService.transition(number, body), {
    invalidate: inv,
    onError: (e, body) => {
      if (e.errorCode === 'SCHEDULE_CONFLICT') {
        confirm({ title: 'Schedule conflict', message: e.message, confirmLabel: 'Start implementation' }).then((ok) => ok && move.mutate({ ...body, force: true }));
        return false;
      }
      return true;
    },
  });
  const vote = useAction(({ id, decision }) => changeService.decide(number, id, decision), { invalidate: inv, success: 'Decision recorded' });
  const owner = useAction((id) => changeService.setOwner(number, id), { invalidate: ['change'] });
  const sched = useAction((body) => changeService.reschedule(number, body), { invalidate: ['change', 'changes'] });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Change ${number}`} back="/changes" backLabel="Back to changes" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const c = q.data;
  const done = ['Closed', 'Canceled'].includes(c.status);
  const ro = done || !can('change:update');
  const lock = ['Doing', 'Verify', 'Closed', 'Canceled'].includes(c.status);
  const idx = c.steps.indexOf(c.status);
  const next = c.status === 'Draft' ? (c.type === 'Standard' ? ['Scheduled', 'Schedule change'] : ['Risk review', 'Request risk review']) : NEXT[c.status];

  const go = async (to) => {
    if (to === 'Closed') return setDialog('close');
    if (to === 'Canceled' && !(await confirm({ title: 'Cancel change', message: 'This stops the change and frees up its window.', confirmLabel: 'Cancel change', danger: true }))) return;
    move.mutate({ to });
  };
  const canDecide = (a) => a.status === 'Pending' && c.status === 'Approval' && (a.approver?.id === user.id || can('approval:override'));

  return (
    <>
      <div className="crumb"><Link to="/changes">Changes</Link> / {c.number}</div>
      <div className="ph" style={{ marginBottom: 8 }}>
        <div><div className="chips"><span className="id">{c.number}</span><TypeChip t={c.type} /><RiskChip r={c.risk} /><ChangeChip c={c} /></div><h1 className="dtitle">{c.title}</h1></div>
        <div className="tools">
          {!ro && next ? <button type="button" className="btn primary" disabled={move.isPending} onClick={() => go(next[0])}>{next[1]}</button> : null}
          {!ro && ['Draft', 'Risk review', 'Approval', 'Scheduled'].includes(c.status) ? <button type="button" className="btn" onClick={() => go('Canceled')}>Cancel change</button> : null}
          {!ro ? <button type="button" className="btn" onClick={() => setDialog('edit')}><Icon name="edit" />Edit</button> : null}
        </div>
      </div>
      <ol className="steps">
        {c.steps.map((s, i) => <li key={s} className={c.status === 'Closed' && c.closeCode === 'Did not work' && s === 'Closed' ? 'fail' : c.status === 'Canceled' ? '' : i < idx ? 'done' : i === idx ? 'cur' : ''}>{s}</li>)}
      </ol>
      {c.status === 'Canceled' ? <div className="banner info"><div><b>This change was canceled.</b></div></div> : null}
      {c.conflicts.length ? <div className="banner warn"><div><b>Schedule conflict.</b> This window overlaps with {c.conflicts.map((x, i) => <span key={x}>{i ? ', ' : ''}<Link to={`/changes/${x}`}>{x}</Link></span>)} on a shared asset. Consider moving one of them.</div></div> : null}
      {!c.backoutPlan && !done ? <div className="banner warn"><div><b>No backout plan.</b> A backout plan is required before this change can be approved.</div></div> : null}
      {c.approvalSummary === 'Rejected' && c.status === 'Risk review' ? <div className="banner"><div><b>Approval was rejected.</b> Update the plans, then request approval again.</div></div> : null}
      <div className="dgrid">
        <div>
          <section className="panel"><h2>Description</h2><p className="desc" style={{ marginTop: 8 }}>{c.description || <span className="muted">No description.</span>}</p></section>
          <PlanField c={c} field="implementationPlan" label="Implementation plan" sub="The steps to carry out the change." placeholder="Add the steps" disabled={ro} />
          <PlanField c={c} field="backoutPlan" label="Backout plan" sub="How to return to the previous state if it goes wrong." placeholder="Add a backout plan" disabled={ro} />
          <PlanField c={c} field="testPlan" label="Test plan and evidence" sub="How you tested it, and how you will check it worked." placeholder="Add test evidence" disabled={ro} />
          <TasksPanel tasks={c.tasks} readOnly={ro || !can('task:create')} invalidate={['change']} parent={{ number: c.number, kind: 'change', label: 'Change tasks', title: c.title, teamId: meta?.agents.find((a) => a.id === c.owner?.id)?.primaryTeamId }} />
          {c.status === 'Closed' ? <section className="panel" style={{ marginTop: 16 }}><h2>Closure information</h2><dl className="props" style={{ marginTop: 10 }}><dt>Close code</dt><dd>{c.closeCode}</dd><dt>Close notes</dt><dd className="desc">{c.closeNotes}</dd></dl></section> : null}
          <section className="panel" style={{ marginTop: 16 }}><h2>Activity</h2><div style={{ marginTop: 10 }}><Timeline entries={c.activity} meId={user.id} /></div></section>
        </div>
        <div className="side-col">
          <section className="panel"><h2>Schedule and assignment</h2>
            <dl className="props" style={{ marginTop: 12 }}>
              <dt>Planned start</dt><dd><input className="inp" type="datetime-local" aria-label="Planned start" disabled={lock || ro} defaultValue={toLocalInput(c.plannedStart)} key={`s${c.plannedStart}`}
                onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v && v !== new Date(c.plannedStart).toISOString()) sched.mutate({ plannedStart: v }); }} /></dd>
              <dt>Planned end</dt><dd><input className="inp" type="datetime-local" aria-label="Planned end" disabled={lock || ro} defaultValue={toLocalInput(c.plannedEnd)} key={`e${c.plannedEnd}`}
                onBlur={(e) => { const v = fromLocalInput(e.target.value); if (!v || v === new Date(c.plannedEnd).toISOString()) return; if (new Date(v) <= new Date(c.plannedStart)) { toast('The end must be after the start'); return; } sched.mutate({ plannedEnd: v }); }} /></dd>
              <dt>Assigned to</dt><dd><Select aria-label="Assigned to" disabled={ro} value={c.owner?.id || ''} options={(meta?.agents || []).map((a) => [a.id, a.name])} onChange={(e) => owner.mutate(Number(e.target.value))} /></dd>
              <dt>Customer</dt><dd>{c.customer?.name || '-'}</dd><dt>Approval</dt><dd>{c.approvalSummary}</dd>
            </dl>
          </section>
          <section className="panel"><h2>Risk assessment</h2><p className="sub">Score {c.riskScore} of 9.</p>
            <dl className="props" style={{ gridTemplateColumns: '1fr auto' }}>
              <dt>Reach</dt><dd>{['', 'One user or asset', 'A team or site', 'Organisation-wide'][c.riskAnswers.scope]}</dd>
              <dt>Downtime</dt><dd>{['None', 'Under an hour', 'Over an hour'][c.riskAnswers.downtime]}</dd>
              <dt>Tested first</dt><dd>{c.riskAnswers.tested ? 'Yes' : <span className="bad">No</span>}</dd>
              <dt>Backout plan</dt><dd>{c.riskAnswers.backout ? 'Yes' : <span className="bad">No</span>}</dd>
            </dl>
            <div style={{ marginTop: 10 }}><RiskChip r={c.risk} /></div>
          </section>
          <section className="panel"><h2>CAB approvals</h2>
            <p className="sub">{c.type === 'Standard' ? 'Standard changes are pre-approved by policy.' : 'Every approver must agree. One rejection sends the change back to Risk review.'}</p>
            {c.approvals.map((a) => (
              <div className="linkrow" key={a.id}>
                <span className="who"><Avatar user={a.approver} mine={a.approver?.id === user.id} /><span><b style={{ fontWeight: 500 }}>{a.approver?.name || 'Unassigned'}</b><div className="muted" style={{ fontSize: 12 }}>{a.role}</div></span></span>
                {a.status === 'Pending' ? (canDecide(a) ? (
                  <span className="tools">
                    <button type="button" className="btn sm primary" disabled={vote.isPending} onClick={() => vote.mutate({ id: a.id, decision: 'approve' })}>Approve</button>
                    <button type="button" className="btn sm danger" disabled={vote.isPending} onClick={() => vote.mutate({ id: a.id, decision: 'reject' })}>Reject</button>
                  </span>
                ) : <Chip>{c.status === 'Approval' ? 'Pending' : 'Not requested'}</Chip>) : <Chip cls={a.status === 'Approved' ? 'ok' : a.status === 'Rejected' ? 'bad' : 'grey'}>{a.status}</Chip>}
              </div>
            ))}
          </section>
          <AttachmentsPanel files={c.attachments} readOnly={ro || !can('attachment:upload')} onUpload={async (files) => { await changeService.attach(number, files); qc.invalidateQueries({ queryKey: ['change', number] }); }} onChanged={() => qc.invalidateQueries({ queryKey: ['change', number] })} />
          <section className="panel"><h2>Affected configuration items</h2>
            {c.assets.length ? c.assets.map((a) => <div className="linkrow" key={a.id}><Link to={`/assets/${a.tag}`}>{a.name}</Link><span className="muted">{a.type}</span></div>) : <p className="muted" style={{ marginTop: 8 }}>None selected.</p>}
          </section>
          <section className="panel"><h2>Linked records</h2>
            {c.tickets.map((t) => <div className="linkrow" key={t.number}><Link to={`/tickets/${t.number}`}>{t.number}</Link><span className="muted">{t.title.slice(0, 32)}</span></div>)}
            {c.problem ? <div className="linkrow"><Link to={`/problems/${c.problem.number}`}>{c.problem.number}</Link><span className="muted">Problem</span></div> : null}
            {!c.tickets.length && !c.problem ? <p className="muted" style={{ marginTop: 8 }}>No linked tickets or problems.</p> : null}
          </section>
        </div>
      </div>
      {dialog === 'close' ? <CloseDialog c={c} onClose={() => setDialog(null)} /> : null}
      {dialog === 'edit' ? <ChangeDialog change={c} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
