import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import { Field, Input, Textarea, Select } from '../forms/Field';
import { useAction, useForm, useMeta, withMeta } from '../../hooks';
import { taskService } from '../../services/taskService';
import { PRI_OPTIONS } from '../../constants';
import { toLocalInput, fromLocalInput, DAY } from '../../utils/format';

/** New task; with a parent it becomes a catalog, incident, problem or change task. */
function TaskAddDialog({ parent, onClose, invalidate = ['tasks'], openAfter = false }) {
  const meta = useMeta();
  const navigate = useNavigate();
  const teams = (meta?.teams || []).filter((t) => t.isActive);
  const f = useForm({ title: '', description: '', parentNumber: '', teamId: parent?.teamId || teams[0]?.id || '', assigneeId: '', priority: 3, dueAt: toLocalInput(Date.now() + 2 * DAY) });
  const members = (meta?.agents || []).filter((a) => a.teamIds.includes(Number(f.values.teamId)));
  const typeLabel = parent ? { change: 'Change task', problem: 'Problem task', request: 'Catalog task', incident: 'Incident task' }[parent.kind] : null;

  const act = useAction((body) => taskService.create(body), {
    invalidate,
    onSuccess: (res) => { onClose(); if (openAfter) navigate(`/tasks/${res.data.number}`); },
    onError: (e) => { f.fromError(e); },
  });
  const submit = () => {
    if (f.values.title.trim().length < 3) return f.setErrors({ title: 'Add a short description.' });
    act.mutate({
      title: f.values.title.trim(), description: f.values.description.trim() || undefined, parentNumber: parent?.number || f.values.parentNumber.trim() || undefined,
      teamId: Number(f.values.teamId), assigneeId: f.values.assigneeId ? Number(f.values.assigneeId) : undefined, priority: Number(f.values.priority), dueAt: fromLocalInput(f.values.dueAt),
    });
  };

  return (
    <Modal title="New task" onClose={onClose} onSubmit={submit} busy={act.isPending}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Create task', variant: 'primary', type: 'submit' }]}>
      <Field label="Summary *" error={f.errors.title}>{(id) => <Input id={id} placeholder="What needs to be done?" {...f.bind('title')} />}</Field>
      <Field label="Description">{(id) => <Textarea id={id} {...f.bind('description')} />}</Field>
      {parent ? (
        <p className="muted" style={{ marginBottom: 12 }}>Parent: <b>{parent.number}</b> {parent.title}. This will be a <b>{typeLabel}</b>.</p>
      ) : (
        <Field label="Parent record (optional)" hint="Leave empty for a stand-alone task." error={f.errors.parentNumber}>{(id) => <Input id={id} placeholder="For example INC-2026-0001, CHG-2026-0001 or PRB-2026-0001" {...f.bind('parentNumber')} />}</Field>
      )}
      <div className="row2">
        <Field label="Team">{(id) => <Select id={id} options={teams.map((t) => [t.id, t.name])} value={f.values.teamId} onChange={(e) => { f.set('teamId', e.target.value); f.set('assigneeId', ''); }} />}</Field>
        <Field label="Assigned to">{(id) => <Select id={id} blank="Unassigned" options={members.map((a) => [a.id, a.name])} {...f.bind('assigneeId')} />}</Field>
      </div>
      <div className="row2">
        <Field label="Priority">{(id) => <Select id={id} options={PRI_OPTIONS} {...f.bind('priority')} />}</Field>
        <Field label="Due">{(id) => <Input id={id} type="datetime-local" {...f.bind('dueAt')} />}</Field>
      </div>
    </Modal>
  );
}

export default withMeta(TaskAddDialog);
