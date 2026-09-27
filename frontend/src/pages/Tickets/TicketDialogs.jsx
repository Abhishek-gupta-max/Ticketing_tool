// Small dialogs used on the ticket detail page.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Modal from '../../components/common/Modal';
import { Field, Input, Textarea, Select, Checkbox } from '../../components/forms/Field';
import { useAction, useMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { ticketService } from '../../services/ticketService';
import { problemService } from '../../services/problemService';
import { assetService } from '../../services/assetService';
import { PRI_OPTIONS } from '../../constants';

const INV = ['tickets', 'ticket', 'dashboard'];

export function EditTicket({ ticket, onClose }) {
  const [title, setTitle] = useState(ticket.title);
  const [desc, setDesc] = useState(ticket.description);
  const [err, setErr] = useState('');
  const act = useAction(() => ticketService.update(ticket.number, { title: title.trim(), description: desc.trim() }), { invalidate: INV, success: 'Saved', onSuccess: onClose });
  return (
    <Modal title={`Edit ${ticket.number}`} onClose={onClose} busy={act.isPending} onSubmit={() => (title.trim().length < 5 ? setErr('Summary needs at least 5 characters.') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Save changes', variant: 'primary', type: 'submit' }]}>
      <Field label="Summary" error={err}>{(id) => <Input id={id} value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} />}</Field>
      <Field label="Description">{(id) => <Textarea id={id} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
    </Modal>
  );
}

export function TagsDialog({ ticket, onClose }) {
  const [v, setV] = useState(ticket.tags.join(', '));
  const act = useAction(() => ticketService.update(ticket.number, { tags: v.split(',').map((x) => x.trim()).filter(Boolean) }), { invalidate: INV, success: 'Tags updated', onSuccess: onClose });
  return (
    <Modal title="Tags" onClose={onClose} busy={act.isPending} onSubmit={() => act.mutate()} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Save', variant: 'primary', type: 'submit' }]}>
      <Field label="Tags separated by commas">{(id) => <Input id={id} value={v} onChange={(e) => setV(e.target.value)} placeholder="vip, network, follow-up" />}</Field>
    </Modal>
  );
}

export function AssetDialog({ ticket, onClose }) {
  const { data = [] } = useQuery({ queryKey: ['asset-options'], queryFn: assetService.options });
  const [v, setV] = useState(ticket.assetId || '');
  const act = useAction(() => ticketService.update(ticket.number, { assetId: v ? Number(v) : null }), { invalidate: INV, success: 'Saved', onSuccess: onClose });
  return (
    <Modal title="Affected asset" onClose={onClose} busy={act.isPending} onSubmit={() => act.mutate()} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Save', variant: 'primary', type: 'submit' }]}>
      <Field label="Asset">{(id) => <Select id={id} blank="No asset" options={data.map((a) => [a.id, `${a.name} (${a.type})`])} value={v} onChange={(e) => setV(e.target.value)} />}</Field>
    </Modal>
  );
}

export function LinkProblemDialog({ ticket, onClose }) {
  const { data = [] } = useQuery({ queryKey: ['problem-options'], queryFn: problemService.options });
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const act = useAction(() => ticketService.linkProblem(ticket.number, v), { invalidate: [...INV, 'problem'], onSuccess: onClose });
  return (
    <Modal title="Link to a problem" onClose={onClose} busy={act.isPending} onSubmit={() => (v ? act.mutate() : setErr('Choose a problem.'))}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Link problem', variant: 'primary', type: 'submit' }]}>
      <Field label="Problem" error={err}>{(id) => <Select id={id} blank="Choose a problem" options={data.map((p) => [p.number, `${p.number}: ${p.title}`])} value={v} onChange={(e) => { setV(e.target.value); setErr(''); }} />}</Field>
    </Modal>
  );
}

export function NewProblemDialog({ ticket, onClose }) {
  const meta = useMeta();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: similar = 0 } = useQuery({ queryKey: ['similar', ticket.number], queryFn: () => ticketService.similar(ticket.number) });
  const [title, setTitle] = useState(ticket.title);
  const [pri, setPri] = useState(ticket.priority);
  const [owner, setOwner] = useState(ticket.assignee?.id || user.id);
  const [link, setLink] = useState(true);
  const [err, setErr] = useState('');
  const act = useAction(() => ticketService.createProblem(ticket.number, { title: title.trim(), priority: Number(pri), ownerId: Number(owner), linkSimilar: link && similar > 0 }), {
    invalidate: [...INV, 'problems'], success: (p) => `${p.number} created`, onSuccess: (p) => { onClose(); navigate(`/problems/${p.number}`); },
  });
  return (
    <Modal title="Create a problem" onClose={onClose} busy={act.isPending} onSubmit={() => (title.trim().length < 5 ? setErr('Summary needs at least 5 characters.') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Create problem', variant: 'primary', type: 'submit' }]}>
      <Field label="Summary" error={err}>{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <div className="row2">
        <Field label="Priority">{(id) => <Select id={id} options={PRI_OPTIONS} value={pri} onChange={(e) => setPri(e.target.value)} />}</Field>
        <Field label="Assigned to">{(id) => <Select id={id} options={(meta?.agents || []).map((a) => [a.id, a.name])} value={owner} onChange={(e) => setOwner(e.target.value)} />}</Field>
      </div>
      {similar ? <Checkbox checked={link} onChange={setLink}>Also link {similar} other ticket{similar > 1 ? 's' : ''} with the same short description</Checkbox> : null}
    </Modal>
  );
}

export function DeclareMajorDialog({ ticket, onClose }) {
  const meta = useMeta();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [impact, setImpact] = useState('');
  const [cmd, setCmd] = useState(ticket.assignee?.id || user.id);
  const [err, setErr] = useState('');
  const act = useAction(() => ticketService.declareMajor(ticket.number, { impact: impact.trim(), commanderId: Number(cmd) }), {
    invalidate: [...INV, 'incidents'], onSuccess: () => { onClose(); navigate('/incidents'); },
  });
  return (
    <Modal title="Declare a major incident" onClose={onClose} busy={act.isPending} onSubmit={() => (impact.trim().length < 5 ? setErr('Describe the impact in a few words.') : act.mutate())}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Declare major incident', variant: 'danger', type: 'submit' }]}>
      <p className="muted" style={{ marginBottom: 12 }}>Use this when a critical service is down or many users are blocked. Impact and urgency are set to High, and an incident room opens.</p>
      <Field label="Customer impact" error={err}>{(id) => <Textarea id={id} placeholder="What are users experiencing?" value={impact} onChange={(e) => { setImpact(e.target.value); setErr(''); }} />}</Field>
      <Field label="Incident commander">{(id) => <Select id={id} options={(meta?.agents || []).map((a) => [a.id, a.name])} value={cmd} onChange={(e) => setCmd(e.target.value)} />}</Field>
    </Modal>
  );
}
