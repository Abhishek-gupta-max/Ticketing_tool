import { useState } from 'react';
import Modal from '../common/Modal';
import { Field, Textarea } from '../forms/Field';
import { useAction } from '../../hooks';
import { taskService } from '../../services/taskService';

export default function TaskCloseDialog({ task, state, onClose, invalidate }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const need = state !== 'Done';
  const act = useAction(() => taskService.setState(task.number, state, note.trim() || undefined), { invalidate, onSuccess: onClose });
  const submit = () => {
    if (need && note.trim().length < 3) return setErr('Close notes are required for this state.');
    act.mutate();
  };
  const title = `${state === 'Done' ? 'Close ' : state === 'Not done' ? 'Close incomplete: ' : 'Skip '}${task.number}`;
  return (
    <Modal title={title} onClose={onClose} onSubmit={submit} busy={act.isPending} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Save', variant: 'primary', type: 'submit' }]}>
      <Field label={`Close notes${need ? ' *' : ''}`} error={err}>
        {(id) => <Textarea id={id} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} placeholder={need ? 'Why was this task not completed?' : 'Optional: what was done?'} />}
      </Field>
    </Modal>
  );
}
