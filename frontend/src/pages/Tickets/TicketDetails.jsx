import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useAction, useNow } from '../../hooks';
import { PageSkeleton, ErrorState, NotFound } from '../../components/common/Feedback';
import { Chip, StatusChip, PriorityChip } from '../../components/common/Chips';
import { Stars } from '../../components/common/Controls';
import TasksPanel from '../../components/tickets/TasksPanel';
import AttachmentsPanel from '../../components/tickets/AttachmentsPanel';
import ChangeDialog from '../../components/modals/ChangeDialog';
import TicketTimeline from './TicketTimeline';
import TicketSidePanel from './TicketSidePanel';
import TicketActions from './TicketActions';
import ResolveDialog from './ResolveDialog';
import HoldDialog from './HoldDialog';
import { EditTicket, TagsDialog, AssetDialog, LinkProblemDialog, NewProblemDialog, DeclareMajorDialog } from './TicketDialogs';
import { dtime } from '../../utils/format';

function StageTracker({ t }) {
  if (t.kind === 'request') {
    const rej = t.resolutionCode === 'Request rejected';
    const open = ['New', 'In Progress', 'On Hold', 'Awaiting approval'].includes(t.status);
    const idx = !open ? (rej ? 1 : 4) : t.status === 'Awaiting approval' ? 1 : t.tasks.length && t.openTaskCount === 0 ? 3 : 2;
    const L = ['Placed', 'Approval', 'Preparing', 'On its way', 'Done'];
    return <ol className="steps">{L.map((s, i) => <li key={s} className={rej && i === 1 ? 'fail' : i < idx ? 'done' : i === idx ? 'cur' : ''}>{rej && i === 1 ? 'Rejected' : s}</li>)}</ol>;
  }
  const idx = t.status === 'New' ? 0 : ['In Progress', 'On Hold'].includes(t.status) ? 1 : t.status === 'Resolved' ? 2 : 3;
  return <ol className="steps">{['New', t.status === 'On Hold' ? 'On Hold' : 'In Progress', 'Resolved', 'Closed'].map((s, i) => <li key={s} className={i < idx ? 'done' : i === idx ? 'cur' : ''}>{s}</li>)}</ol>;
}

export default function TicketDetails() {
  useNow();
  const { number } = useParams();
  const { user, can } = useAuth();
  const { confirm } = useUI();
  const toast = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [insertText, setInsertText] = useState(null);
  const q = useQuery({ queryKey: ['ticket', number], queryFn: () => ticketService.get(number) });
  const inv = ['tickets', 'ticket', 'dashboard'];
  const move = useAction((status) => ticketService.setStatus(number, { status }), { invalidate: inv });
  const decide = useAction(({ decision, comment }) => ticketService.decideApproval(number, decision, comment), { invalidate: [...inv, 'approvals'] });
  const rate = useAction((n) => ticketService.rate(number, n), { invalidate: ['ticket'], success: 'Thanks for the rating' });
  const unlink = useAction(() => ticketService.linkProblem(number, null), { invalidate: [...inv, 'problem'] });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Ticket ${number}`} back="/tickets" backLabel="Back to tickets" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const t = q.data;
  const open = ['New', 'In Progress', 'On Hold', 'Awaiting approval'].includes(t.status);
  const ro = t.status === 'Closed';

  const requestState = async (to) => {
    if (to === t.status) return;
    if (to === 'Resolved') return setDialog('resolve');
    if (to === 'On Hold') return setDialog('hold');
    if (to === 'Closed' && !(await confirm({ title: `Close ${t.number}`, message: 'A closed ticket is read-only. The requester can no longer reopen it.', confirmLabel: 'Close ticket' }))) return;
    move.mutate(to);
  };
  const reject = async () => {
    if (await confirm({ title: 'Reject request', message: 'This closes the request as rejected.', confirmLabel: 'Reject request', danger: true })) decide.mutate({ decision: 'reject' });
  };
  const upload = async (files) => { await ticketService.attach(number, files); qc.invalidateQueries({ queryKey: ['ticket', number] }); };

  return (
    <>
      <div className="crumb"><Link to="/tickets">Tickets</Link> / {t.number}</div>
      <div className="ph" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="chips">
            <span className="id">{t.number}</span><Chip>{t.kind === 'incident' ? 'Incident' : 'Service request'}</Chip>
            {t.isMajor ? <Chip cls="bad">Major incident</Chip> : null}<StatusChip s={t.status} />
            {t.status === 'On Hold' && t.holdReason ? <Chip>{t.holdReason}</Chip> : null}<PriorityChip p={t.priority} />
          </div>
          <h1 className="dtitle">{t.title}</h1>
        </div>
        <TicketActions t={t} onState={requestState} open={setDialog} />
      </div>
      <StageTracker t={t} />
      {ro ? (
        <div className="banner info">
          <div><b>This ticket is closed and read-only.</b> Use New linked ticket to raise another ticket connected to this one.</div>
          {can('ticket:create') ? <TicketActions t={t} followUpOnly /> : null}
        </div>
      ) : null}

      <div className="dgrid">
        <div>
          {t.approval?.status === 'Pending' ? (
            <div className="banner warn">
              <div><b>Approval requested.</b> {t.approval.role} needs to approve this request before fulfilment tasks are created.</div>
              {can('request:approve') ? (
                <div className="tools">
                  <button type="button" className="btn primary sm" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'approve' })}>Approve</button>
                  <button type="button" className="btn sm danger" disabled={decide.isPending} onClick={reject}>Reject</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {t.majorIncident ? (
            <div className="banner"><div><b>Major incident.</b> Customer updates are posted in the incident room.</div><Link className="btn sm" to="/incidents">Open incident room</Link></div>
          ) : null}

          <section className="panel">
            <h2>Description</h2>
            <p className="desc" style={{ marginTop: 8 }}>{t.description || <span className="muted">No description.</span>}</p>
            {t.formValues.length ? (
              <dl className="props" style={{ marginTop: 14 }}>{t.formValues.map((v) => <div key={v.key} style={{ display: 'contents' }}><dt>{v.label}</dt><dd>{v.value || '-'}</dd></div>)}</dl>
            ) : null}
            {t.tags.length ? <div className="chips" style={{ marginTop: 12 }}>{t.tags.map((x) => <Chip key={x}>{x}</Chip>)}</div> : null}
          </section>

          {user.isStaff ? (
            <TasksPanel tasks={t.tasks} readOnly={ro || !can('task:create')} invalidate={['ticket', 'tickets']}
              parent={{ number: t.number, kind: t.kind === 'request' ? 'request' : 'incident', label: t.kind === 'request' ? 'Catalog tasks' : 'Incident tasks', teamId: t.team?.id, title: t.title }} />
          ) : null}

          {!open ? (
            <section className="panel" style={{ marginTop: 16 }}>
              <h2>Resolution information</h2>
              <dl className="props" style={{ marginTop: 10 }}>
                <dt>Resolution code</dt><dd>{t.resolutionCode || '-'}</dd>
                <dt>Resolved</dt><dd>{dtime(t.resolvedAt)}</dd>
                {t.closedAt ? <><dt>Closed</dt><dd>{dtime(t.closedAt)}</dd></> : null}
                <dt>Resolution notes</dt><dd className="desc">{t.resolutionNotes || <span className="muted">No notes.</span>}</dd>
              </dl>
              <div style={{ marginTop: 14 }}>
                <span className="muted">Customer satisfaction</span>
                <Stars value={t.csat || 0} onRate={(n) => rate.mutate(n)} disabled={rate.isPending} />
                {t.csat ? null : <span className="muted" style={{ marginLeft: 8 }}>No rating yet</span>}
              </div>
            </section>
          ) : null}

          <TicketTimeline ticket={t} readOnly={ro} insertText={insertText} />
        </div>

        <div className="side-col">
          <TicketSidePanel t={t} onState={requestState} dialogs={{
            open: setDialog,
            unlinkProblem: () => unlink.mutate(),
            insert: (text) => { setInsertText({ text, at: Date.now() }); toast('Link added to your comment'); },
            attachments: <AttachmentsPanel files={t.attachments} readOnly={ro || !can('attachment:upload')} onUpload={upload} onChanged={() => qc.invalidateQueries({ queryKey: ['ticket', number] })} />,
          }} />
        </div>
      </div>

      {dialog === 'resolve' ? <ResolveDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'hold' ? <HoldDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'edit' ? <EditTicket ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'tags' ? <TagsDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'asset' ? <AssetDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'linkProblem' ? <LinkProblemDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'newProblem' ? <NewProblemDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'major' ? <DeclareMajorDialog ticket={t} onClose={() => setDialog(null)} /> : null}
      {dialog === 'change' ? <ChangeDialog pre={{ title: `Fix for ${t.title}`, ticketNumbers: [t.number], assetIds: t.assetId ? [t.assetId] : [], customerId: t.customer.id }} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
