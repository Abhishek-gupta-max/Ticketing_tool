import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { requestService } from '../../services/requestService';
import { useAuth } from '../../context/AuthContext';
import { Chip, StatusChip, TaskChip, OwnerCell } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, NotFound } from '../../components/common/Feedback';
import DataTable from '../../components/tables/DataTable';
import { dtime } from '../../utils/format';
import { TASK_DONE } from '../../constants';

export default function RequestDetails() {
  const { number } = useParams();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['requests', number], queryFn: () => requestService.get(number) });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error?.status === 404) return <NotFound what={`Request ${number}`} back="/requests" backLabel="Back to requests" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const r = q.data;
  const approval = r.items.every((t) => ['Not required', 'Approved'].includes(t.approvalLabel)) ? 'All approved or not required'
    : r.items.some((t) => t.approvalLabel === 'Rejected') ? 'An item was rejected' : 'Waiting for approval';
  return (
    <>
      <div className="crumb"><Link to="/requests">Service requests</Link> / {r.number}</div>
      <div className="ph" style={{ marginBottom: 12 }}>
        <div><div className="chips"><span className="id">{r.number}</span><Chip cls={r.isOpen ? 'ok' : 'grey'}>{r.isOpen ? 'Open' : 'Closed'}</Chip></div><h1 className="dtitle">Request for {r.requestedFor.name}</h1></div>
      </div>
      <div className="dgrid">
        <div>
          <section className="panel"><h2>Order items</h2><p className="sub">Each item is approved and fulfilled on its own.</p>
            <DataTable rows={r.items} rowKey={(t) => t.number} rowTo={(t) => `/tickets/${t.number}`}
              columns={[
                { key: 'n', header: 'Item', className: 'id', render: (t) => t.number },
                { key: 't', header: 'Summary', className: 'title', render: (t) => t.title },
                { key: 'a', header: 'Approval', render: (t) => t.approvalLabel },
                { key: 's', header: 'Stage', render: (t) => <><StatusChip s={t.status} /><small className="muted" style={{ display: 'block', fontSize: 12 }}>{t.stage}</small></> },
                { key: 'k', header: 'Tasks', render: (t) => `${t.taskClosed} of ${t.taskTotal}` },
                { key: 'o', header: 'Assigned to', render: (t) => <OwnerCell user={t.assignee} meId={user.id} /> },
              ]} />
          </section>
          {r.tasks.length ? (
            <section className="panel" style={{ marginTop: 16 }}><h2>All catalog tasks</h2>
              {r.tasks.map((x) => <div className="linkrow" key={x.number}><span><Link to={`/tasks/${x.number}`}>{x.number}</Link> {x.title}<span className="muted"> · {x.parent?.number}</span></span><TaskChip s={x.state} /></div>)}
            </section>
          ) : null}
        </div>
        <div className="side-col">
          <section className="panel"><h2>Details</h2>
            <dl className="props" style={{ marginTop: 12 }}>
              <dt>Requested for</dt><dd>{r.requestedFor.name}</dd><dt>Customer</dt><dd>{r.customer.name}</dd><dt>Opened</dt><dd>{dtime(r.createdAt)}</dd>
              <dt>Items</dt><dd>{r.items.length}</dd><dt>Approval</dt><dd>{approval}</dd>
              <dt>Tasks</dt><dd>{r.tasks.filter((t) => TASK_DONE.includes(t.state)).length} of {r.tasks.length} closed</dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
