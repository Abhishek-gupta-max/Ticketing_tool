import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import { Select } from '../forms/Field';
import TaskAddDialog from '../modals/TaskAddDialog';
import TaskCloseDialog from '../modals/TaskCloseDialog';
import { taskService } from '../../services/taskService';
import { useAction, useMeta } from '../../hooks';
import { dshort } from '../../utils/format';
import { TASK_DONE } from '../../constants';

const statesFor = (t) => (TASK_DONE.includes(t.state) ? [t.state] : t.state === 'Waiting' ? ['Waiting'] : ['Ready', 'In progress', 'Done', 'Not done', 'Not needed']);

/**
 * Child tasks of a ticket, problem or change. parent: { number, kind, label,
 * teamId, title }. invalidate: query keys to refresh after changes.
 */
export default function TasksPanel({ tasks = [], parent, readOnly, invalidate }) {
  const meta = useMeta();
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(null);
  const done = tasks.filter((t) => TASK_DONE.includes(t.state)).length;
  const inv = [...invalidate, 'tasks'];
  const setState = useAction(({ t, state }) => taskService.setState(t.number, state), { invalidate: inv });
  const assign = useAction(({ t, id }) => taskService.update(t.number, { assigneeId: id ? Number(id) : null }), { invalidate: inv });
  if (!tasks.length && readOnly) return null;
  const poolFor = (t) => (meta?.agents || []).filter((a) => a.teamIds.includes(t.team?.id) || a.id === t.assignee?.id);

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="head-row">
        <div>
          <h2>{parent.label}</h2>
          <p className="sub">{tasks.length ? `${done} of ${tasks.length} closed. All tasks must be closed before ${parent.kind === 'change' ? 'the change can move to Verify' : 'this record can be resolved'}.` : 'No tasks yet. Add tasks to split the work between people.'}</p>
        </div>
        {readOnly ? null : <button type="button" className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" />Add task</button>}
      </div>
      {tasks.map((x) => (
        <div className="task" key={x.number}>
          <div style={{ minWidth: 0 }}>
            <Link to={`/tasks/${x.number}`} style={{ fontWeight: 500, color: 'var(--ink)' }}>{x.title}</Link>
            <div className="muted" style={{ fontSize: 12 }}><span className="id">{x.number}</span> · {x.isSequential ? `Step ${x.sortOrder + 1} of ${tasks.length}` : 'Parallel'}{x.dueAt ? ` · due ${dshort(x.dueAt)}` : ''}</div>
          </div>
          <div className="tools">
            <Select aria-label={`Assigned to for ${x.title}`} disabled={readOnly || TASK_DONE.includes(x.state)} value={x.assignee?.id || ''} blank="Unassigned"
              options={poolFor(x).map((a) => [a.id, a.name])} onChange={(e) => assign.mutate({ t: x, id: e.target.value })} />
            <Select aria-label={`State of ${x.title}`} disabled={readOnly || TASK_DONE.includes(x.state) || x.state === 'Waiting'} value={x.state} options={statesFor(x)}
              onChange={(e) => { const v = e.target.value; if (v === 'Not done' || v === 'Not needed') setClosing({ t: x, state: v }); else setState.mutate({ t: x, state: v }); }} />
          </div>
        </div>
      ))}
      {tasks.length && done === tasks.length && !readOnly ? <p className="good" style={{ marginTop: 10 }}><b>All tasks are closed.</b></p> : null}
      {adding ? <TaskAddDialog parent={parent} onClose={() => setAdding(false)} invalidate={inv} /> : null}
      {closing ? <TaskCloseDialog task={closing.t} state={closing.state} onClose={() => setClosing(null)} invalidate={inv} /> : null}
    </section>
  );
}
