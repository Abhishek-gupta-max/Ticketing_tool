import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../context/AuthContext';
import { useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, Views, Pagination, SearchBox } from '../../components/common/Controls';
import { Select } from '../../components/forms/Field';
import { TaskChip, PriorityChip, OwnerCell } from '../../components/common/Chips';
import { Skeleton, ErrorState } from '../../components/common/Feedback';
import DataTable from '../../components/tables/DataTable';
import TaskAddDialog from '../../components/modals/TaskAddDialog';
import { TASK_VIEWS, TASK_DONE, PAGE_SIZE } from '../../constants';
import { dshort } from '../../utils/format';

export function DueCell({ t }) {
  if (!t.dueAt) return <span className="muted">-</span>;
  const late = !TASK_DONE.includes(t.state) && new Date(t.dueAt) < Date.now();
  return <span className={late ? 'bad' : 'muted'} style={{ whiteSpace: 'nowrap' }}>{late ? 'Overdue ' : ''}{dshort(t.dueAt)}</span>;
}

export default function TaskList() {
  const { user, can } = useAuth();
  const meta = useMeta();
  const [sp] = useSearchParams();
  const [quick, setQuick] = useState(sp.get('quick') || 'mine');
  const [f, setF] = useState({ search: '', type: '', teamId: '', assignee: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const params = useMemo(() => {
    const p = { quick, page, limit: PAGE_SIZE };
    Object.entries(f).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [quick, f, page]);
  const q = useQuery({ queryKey: ['tasks', params], queryFn: () => taskService.list(params), placeholderData: keepPreviousData });
  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(1); };
  const k = q.data?.meta?.kpis;

  return (
    <>
      <div className="ph">
        <div><h1>Tasks</h1><p>Every unit of work in one list: catalog, change, problem and incident tasks, and stand-alone tasks.</p></div>
        {can('task:create') ? <div className="tools"><button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />New task</button></div> : null}
      </div>
      {k ? (
        <div className="kpis">
          <Kpi label="Open tasks" value={k.open} sub={`${k.waiting} waiting on an earlier task`} />
          <Kpi label="Assigned to me" value={k.mine} sub="not yet closed" />
          <Kpi label="Overdue" value={k.overdue} sub="past their due date" />
          <Kpi label="Unassigned" value={k.unassigned} sub="need an owner" />
          <Kpi label="Closed this week" value={k.closedWeek} sub="completed or skipped" />
        </div>
      ) : null}
      <Views value={quick} onChange={(v) => { setQuick(v); setPage(1); }} options={TASK_VIEWS} counts={q.data?.meta?.counts} />
      <div className="toolbar">
        <SearchBox value={f.search} onChange={(v) => set({ search: v })} placeholder="Search number or description" label="Search tasks" />
        <Select aria-label="Type" blank="All types" options={meta?.taskTypes || []} value={f.type} onChange={(e) => set({ type: e.target.value })} />
        <Select aria-label="Team" blank="All groups" options={(meta?.teams || []).map((t) => [t.id, t.name])} value={f.teamId} onChange={(e) => set({ teamId: e.target.value })} />
        <Select aria-label="Assigned to" blank="Anyone" options={[['none', 'Unassigned'], ...(meta?.agents || []).map((a) => [a.id, a.id === user.id ? 'You' : a.name])]} value={f.assignee} onChange={(e) => set({ assignee: e.target.value })} />
      </div>
      <section className="panel" style={{ padding: '12px 14px' }}>
        {q.isLoading ? <Skeleton rows={10} /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
          <>
            <DataTable rows={q.data.data} rowKey={(t) => t.number} rowTo={(t) => `/tasks/${t.number}`} empty="No tasks match. Try another view."
              columns={[
                { key: 'n', header: 'Number', className: 'id', render: (t) => t.number },
                { key: 't', header: 'Summary', className: 'title', render: (t) => t.title },
                { key: 'ty', header: 'Type', className: 'muted', render: (t) => <span style={{ whiteSpace: 'nowrap' }}>{t.type}</span> },
                { key: 'p', header: 'Parent', render: (t) => (t.parent ? <Link to={`/${t.parent.route}/${t.parent.number}`}>{t.parent.number}</Link> : <span className="muted">None</span>) },
                { key: 's', header: 'State', render: (t) => <TaskChip s={t.state} /> },
                { key: 'pr', header: 'Priority', render: (t) => <PriorityChip p={t.priority} /> },
                { key: 'tm', header: 'Team', render: (t) => <span style={{ whiteSpace: 'nowrap' }}>{t.team?.name || '-'}</span> },
                { key: 'a', header: 'Assigned to', render: (t) => <OwnerCell user={t.assignee} meId={user.id} /> },
                { key: 'd', header: 'Due', render: (t) => <DueCell t={t} /> },
              ]} />
            <Pagination meta={q.data.meta} onPage={setPage} />
          </>
        )}
      </section>
      {adding ? <TaskAddDialog onClose={() => setAdding(false)} openAfter /> : null}
    </>
  );
}
