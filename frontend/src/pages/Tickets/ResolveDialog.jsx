import { useState } from 'react';
import Modal from '../../components/common/Modal';
import { Field, Select, Textarea, Checkbox } from '../../components/forms/Field';
import { useAction, useMeta } from '../../hooks';
import { ticketService } from '../../services/ticketService';

export default function ResolveDialog({ ticket, onClose }) {
  const meta = useMeta();
  const [code, setCode] = useState('Fixed');
  const [note, setNote] = useState('');
  const [kb, setKb] = useState(false);
  const [err, setErr] = useState('');
  const act = useAction(() => ticketService.setStatus(ticket.number, { status: 'Resolved', resolutionCode: code, resolutionNotes: note.trim(), createArticle: kb }), {
    invalidate: ['tickets', 'ticket', 'dashboard', 'problem'], onSuccess: onClose,
  });
  const submit = () => {
    if (note.trim().length < 5) return setErr('Resolution notes are required (at least 5 characters).');
    act.mutate();
  };
  return (
    <Modal title={`Resolve ${ticket.number}`} onClose={onClose} onSubmit={submit} busy={act.isPending}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Resolve ticket', variant: 'primary', type: 'submit' }]}>
      <Field label="Resolution code *">{(id) => <Select id={id} options={meta?.resolutionCodes || []} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
      <Field label="Resolution notes *" error={err}>{(id) => <Textarea id={id} placeholder="Describe the fix so the next agent can reuse it" value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} />}</Field>
      <Checkbox checked={kb} onChange={setKb}>Create a knowledge article draft from this</Checkbox>
    </Modal>
  );
}
