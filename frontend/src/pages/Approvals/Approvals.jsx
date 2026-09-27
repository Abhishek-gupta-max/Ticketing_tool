import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { approvalService, changeService } from '../../services/changeService';
import { ticketService } from '../../services/ticketService';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAction } from '../../hooks';
import { Kpi, Tabs } from '../../components/common/Controls';
import { Chip } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, EmptyState } from '../../components/common/Feedback';
import DataTable from '../../components/tables/DataTable';
import { ago } from '../../utils/format';

export default function Approvals() {
  const { user, can } = useAuth();
  const { confirm } = useUI();
  const [tab, setTab] = useState('mine');
  const q = useQuery({ queryKey: ['approvals'], queryFn: approvalService.overview });
  const inv = ['approvals', 'tickets', 'ticket', 'change', 'changes', 'dashboard'];
  const decideReq = useAction(({ n, d }) => ticketService.decideApproval(n, d), { invalidate: inv });
  const decideChg = useAction(({ n, id, d }) => changeService.decide(n, id, d), { invalidate: inv, success: 'Decision recorded' });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;

  const decide = async (x, dec) => {
    if (x.kind === 'request' && dec === 'reject' && !(await confirm({ title: 'Reject request', message: 'This closes the request as rejected.', confirmLabel: 'Reject request', danger: true }))) return;
    if (x.kind === 'request') decideReq.mutate({ n: x.record.number, d: dec });
    else decideChg.mutate({ n: x.record.number, id: x.approvalId, d: dec });
  };
  const busy = decideReq.isPending || decideChg.isPending;

  let body;
  if (tab === 'mine') {
    body = d.mine.length ? (
      <section className="panel"><h2>Waiting for your decision</h2>
        <p className="sub">{can('approval:override') ? 'As an admin you can also decide on behalf of other approvers.' : 'These are the approvals assigned to you.'}</p>
        <ul className="plain">
          {d.mine.map((x) => (
            <li key={x.approvalId}>
              <div style={{ minWidth: 0 }}>
                <Link to={`/${x.record.route}/${x.record.number}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}><b>{x.record.title}</b></Link>
                <span className="s">{x.record.number} · {x.kind === 'change' ? `Change · ${x.role}${x.approver && x.approver.id !== user.id ? ` (on behalf of ${x.approver.name})` : ''}` : `Order item · ${x.requesterName}, ${x.customerName}`} · waiting {ago(x.waitingSince)}</span>
              </div>
              <div className="tools">
                <button type="button" className="btn sm primary" disabled={busy} onClick={() => decide(x, 'approve')}>Approve</button>
                <button type="button" className="btn sm danger" disabled={busy} onClick={() => decide(x, 'reject')}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    ) : <section className="panel"><EmptyState>Nothing is waiting for you.</EmptyState></section>;
  } else if (tab === 'all') {
    body = (
      <section className="panel" style={{ padding: '12px 14px' }}>
        <DataTable rows={d.all} rowKey={(r) => r.approvalId} rowTo={(r) => `/${r.record.route}/${r.record.number}`} empty="No approvals are pending anywhere."
          columns={[
            { key: 'k', header: 'Type', render: (r) => (r.kind === 'change' ? 'Change' : 'Order item') },
            { key: 'n', header: 'Record', className: 'id', render: (r) => r.record.number },
            { key: 't', header: 'Summary', className: 'title', render: (r) => r.record.title },
            { key: 'w', header: 'Waiting for', render: (r) => (r.kind === 'change' ? `${r.approver?.name}, ${r.role}` : r.role) },
            { key: 'a', header: 'Waiting', className: 'muted', render: (r) => ago(r.waitingSince) },
          ]} />
      </section>
    );
  } else {
    body = (
      <section className="panel" style={{ padding: '12px 14px' }}>
        <DataTable rows={d.history.slice(0, 40)} rowKey={(r) => r.id} rowTo={(r) => `/${r.record.route}/${r.record.number}`} empty="No decisions in the last 30 days."
          columns={[
            { key: 'k', header: 'Type', render: (r) => (r.kind === 'change' ? 'Change' : 'Order item') },
            { key: 'n', header: 'Record', className: 'id', render: (r) => r.record.number },
            { key: 't', header: 'Summary', className: 'title', render: (r) => r.record.title },
            { key: 'd', header: 'Decision', render: (r) => <Chip cls={r.decision === 'Approved' ? 'ok' : 'bad'}>{r.decision}</Chip> },
            { key: 'b', header: 'Decided by', render: (r) => `${r.decidedBy || '-'}${r.kind === 'change' ? ` (${r.role})` : ''}` },
            { key: 'w', header: 'When', className: 'muted', render: (r) => ago(r.decidedAt) },
          ]} />
      </section>
    );
  }

  return (
    <>
      <div className="ph"><div><h1>Approvals</h1><p>Requests and changes that need a decision. You are signed in as <b>{user.name}</b> ({user.role}).</p></div></div>
      <div className="kpis">
        <Kpi label="Waiting for me" value={d.kpis.mine} sub="need your decision" />
        <Kpi label="Order items waiting" value={d.kpis.requests} sub="line manager approval" />
        <Kpi label="Changes at CAB" value={d.kpis.changes} sub="awaiting approvers" />
        <Kpi label="Decided, last 30 days" value={d.kpis.decided} sub={`${d.kpis.rejected} rejected`} />
      </div>
      <Tabs value={tab} onChange={setTab} options={[['mine', 'Waiting for me'], ['all', "Everyone's pending"], ['history', 'History']]} />
      {body}
    </>
  );
}
