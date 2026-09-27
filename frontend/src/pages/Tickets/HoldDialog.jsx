import { useState } from 'react';
import Modal from '../../components/common/Modal';
import { Field, Select, Textarea } from '../../components/forms/Field';
import { useAction, useMeta } from '../../hooks';
import { ticketService } from '../../services/ticketService';
import { HOLD_REQUESTER } from '../../constants';

export default function HoldDialog({ ticket, onClose }) {
  const meta = useMeta();
  const [reason, setReason] = useState(ticket.holdReason || HOLD_REQUESTER);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const act = useAction(() => ticketService.setStatus(ticket.number, { status: 'On Hold', holdReason: reason, comment: note.trim() }), {
    invalidate: ['tickets', 'ticket', 'dashboard'], success: `${ticket.number} is on hold`, onSuccess: onClose,
  });
  const submit = () => {
    if (note.trim().length < 3) return setErr('A comment is required when a ticket is placed on hold.');
    act.mutate();
  };
  return (
    <Modal title={`Place ${ticket.number} on hold`} onClose={onClose} onSubmit={submit} busy={act.isPending}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Place on hold', variant: 'primary', type: 'submit' }]}>
      <Field label="On hold reason" hint="The resolution clock pauses only for Waiting for requester.">{(id) => <Select id={id} options={meta?.holdReasons || []} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <Field label="Comment for the requester *" error={err}>{(id) => <Textarea id={id} placeholder="Tell the requester what you are waiting for" value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} />}</Field>
    </Modal>
  );
}
