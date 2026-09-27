import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../common/Modal';
import { Field, Input, Textarea, Select, Checkbox } from '../forms/Field';
import { RiskChip } from '../common/Chips';
import { useForm, useMeta, withMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { changeService } from '../../services/changeService';
import { assetService } from '../../services/assetService';
import { toLocalInput, fromLocalInput, DAY, HOUR } from '../../utils/format';

const score = (a) => (Number(a.scope) || 1) + (Number(a.down) || 0) + (a.tested ? 0 : 2) + (a.backout ? 0 : 2);
const riskOf = (s) => (s <= 3 ? 'Low' : s <= 5 ? 'Medium' : 'High');

/** New change (with optional prefill from a ticket or problem) or edit an existing one. */
function ChangeDialog({ change, pre = {}, onClose }) {
  const meta = useMeta();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const edit = !!change;
  const { data: assets = [] } = useQuery({ queryKey: ['asset-options'], queryFn: assetService.options });
  const internal = meta?.customers.find((c) => c.isInternal)?.id;
  const f = useForm({
    title: change?.title || pre.title || '', type: change?.type || 'Normal', ownerId: change?.owner?.id || user.id, description: change?.description || '',
    customerId: change?.customer?.id || pre.customerId || internal || '', start: toLocalInput(change?.plannedStart || Date.now() + 2 * DAY),
    hours: change ? Math.max(1, Math.round((new Date(change.plannedEnd) - new Date(change.plannedStart)) / HOUR)) : 2,
    scope: change?.riskAnswers.scope || 2, down: change?.riskAnswers.downtime ?? 1, tested: change ? change.riskAnswers.tested : true, backout: change ? change.riskAnswers.backout : true,
    plan: change?.implementationPlan || '', backoutPlan: change?.backoutPlan || '',
  });
  const [assetIds, setAssetIds] = useState(change ? change.assets.map((a) => a.id) : pre.assetIds || []);
  const [busy, setBusy] = useState(false);
  const v = f.values;
  const s = score(v);

  const save = async (submit) => {
    if (v.title.trim().length < 5) return f.setErrors({ title: 'Summary needs at least 5 characters.' });
    if (!v.start) return f.setErrors({ start: 'Choose a start time.' });
    const body = {
      title: v.title.trim(), type: v.type, ownerId: Number(v.ownerId), description: v.description.trim(), customerId: v.customerId ? Number(v.customerId) : undefined,
      plannedStart: fromLocalInput(v.start), durationHours: Math.max(1, Number(v.hours) || 1), riskScope: Number(v.scope), riskDowntime: Number(v.down),
      riskTested: !!v.tested, riskBackout: !!v.backout, implementationPlan: v.plan.trim(), backoutPlan: v.backoutPlan.trim(), assetIds,
    };
    setBusy(true);
    try {
      const res = edit ? await changeService.update(change.number, body) : await changeService.create({ ...body, ticketNumbers: pre.ticketNumbers, problemNumber: pre.problemNumber, submit });
      await Promise.all(['changes', 'change', 'ticket', 'problem', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      qc.invalidateQueries({ queryKey: ['nav'] });
      toast(res.message);
      onClose();
      if (!edit) navigate(`/changes/${res.data.number}`);
    } catch (e) { f.fromError(e); toast(e.message); } finally { setBusy(false); }
  };

  if (!meta) return null;
  return (
    <Modal title={edit ? `Edit ${change.number}` : 'New change'} wide onClose={onClose} busy={busy} onSubmit={() => save(!edit)}
      buttons={edit ? [{ label: 'Cancel', onClick: onClose }, { label: 'Save changes', variant: 'primary', type: 'submit' }]
        : [{ label: 'Cancel', onClick: onClose }, { label: 'Save', onClick: () => save(false) }, { label: 'Save and move on', variant: 'primary', type: 'submit' }]}>
      <Field label="Summary *" error={f.errors.title}>{(id) => <Input id={id} placeholder="What is changing?" {...f.bind('title')} />}</Field>
      <div className="row2">
        <Field label="Type">{(id) => <Select id={id} options={[['Standard', 'Standard: pre-approved, low risk'], ['Normal', 'Normal: needs CAB approval'], ['Emergency', 'Emergency: urgent fix']]} {...f.bind('type')} />}</Field>
        <Field label="Assigned to">{(id) => <Select id={id} options={meta.agents.map((a) => [a.id, a.id === user.id ? `You (${a.name})` : a.name])} {...f.bind('ownerId')} />}</Field>
      </div>
      <Field label="Description">{(id) => <Textarea id={id} placeholder="Why is this change needed?" {...f.bind('description')} />}</Field>
      <div className="row2">
        <Field label="Customer">{(id) => <Select id={id} options={meta.customers.map((c) => [c.id, c.name])} {...f.bind('customerId')} />}</Field>
        <Field label="Planned start" error={f.errors.start || f.errors.plannedStart}>{(id) => <Input id={id} type="datetime-local" {...f.bind('start')} disabled={edit && ['Doing', 'Verify'].includes(change.status)} />}</Field>
      </div>
      <Field label="Duration in hours">{(id) => <Input id={id} type="number" min="1" max="72" {...f.bind('hours')} />}</Field>
      <Field label="Affected configuration items">{() => (
        <div className="scroll" style={{ maxHeight: 130, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
          {assets.filter((a) => a.status !== 'Retired').map((a) => (
            <label key={a.id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <input type="checkbox" checked={assetIds.includes(a.id)} onChange={(e) => setAssetIds((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} /> {a.name} <span className="muted">{a.type}</span>
            </label>
          ))}
        </div>
      )}</Field>
      <h3 style={{ fontSize: 14, margin: '6px 0 8px' }}>Risk assessment</h3>
      <div className="row2">
        <Field label="Reach">{(id) => <Select id={id} options={[[1, 'One user or asset'], [2, 'A team or site'], [3, 'Organisation-wide or critical']]} {...f.bind('scope')} />}</Field>
        <Field label="Expected downtime">{(id) => <Select id={id} options={[[0, 'None'], [1, 'Under an hour'], [2, 'Over an hour']]} {...f.bind('down')} />}</Field>
      </div>
      <div style={{ marginBottom: 6 }}><Checkbox checked={v.tested} onChange={(x) => f.set('tested', x)}>Tested in a non-production environment</Checkbox></div>
      <div style={{ marginBottom: 8 }}><Checkbox checked={v.backout} onChange={(x) => f.set('backout', x)}>A backout plan exists</Checkbox></div>
      <p style={{ marginBottom: 12 }}>Calculated risk: <RiskChip r={riskOf(s)} /> <span className="muted">(score {s} of 9)</span></p>
      <Field label="Implementation plan">{(id) => <Textarea id={id} placeholder="Steps to carry out the change" {...f.bind('plan')} />}</Field>
      <Field label="Backout plan">{(id) => <Textarea id={id} placeholder="How to undo it" {...f.bind('backoutPlan')} />}</Field>
    </Modal>
  );
}

export default withMeta(ChangeDialog);
