import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Modal from '../../components/common/Modal';
import { Field, Input, Textarea, Select } from '../../components/forms/Field';
import { useForm, useMeta, withMeta } from '../../hooks';
import { useToast } from '../../context/ToastContext';
import { assetService } from '../../services/assetService';
import { customerService } from '../../services/adminService';

/** Create or edit an asset. */
function AssetDialog({ asset, onClose }) {
  const meta = useMeta();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const edit = !!asset;
  const { data: people = [] } = useQuery({ queryKey: ['people', 'all'], queryFn: () => customerService.people({}) });
  const { data: options = [] } = useQuery({ queryKey: ['asset-options'], queryFn: assetService.options });
  const internal = meta?.customers.find((c) => c.isInternal)?.id;
  const f = useForm({
    name: asset?.name || '', typeId: asset?.type.id || meta?.assetTypes[0]?.id || '', criticality: asset?.criticality || 'Medium', status: asset?.status || 'In use',
    environment: asset?.environment || 'Production', assignedToId: asset?.assignedTo?.id || '', ownedById: asset?.ownedBy?.id || '', managedById: asset?.managedBy?.id || '',
    supportTeamId: asset?.supportTeam?.id || '', customerId: asset?.customer.id || internal || '', location: asset?.location || '', serialNumber: asset?.serialNumber || '',
    platform: asset?.platform || '', department: asset?.department || '', purchaseDate: asset?.purchaseDate || '', warrantyEnd: asset?.warrantyEnd || '', notes: asset?.notes || '',
  });
  const [deps, setDeps] = useState(asset?.dependencyIds || []);
  const [busy, setBusy] = useState(false);
  const ppl = people.map((p) => [p.id, `${p.name} (${p.customer.isInternal ? 'Internal' : p.customer.name})`]);
  const id = (v) => (v ? Number(v) : null);

  const submit = async () => {
    if (f.values.name.trim().length < 2) return f.setErrors({ name: 'Enter a name.' });
    const v = f.values;
    const body = {
      name: v.name.trim(), typeId: Number(v.typeId), criticality: v.criticality, status: v.status, environment: v.environment, customerId: Number(v.customerId),
      assignedToId: id(v.assignedToId), ownedById: id(v.ownedById), managedById: id(v.managedById), supportTeamId: id(v.supportTeamId), location: v.location, serialNumber: v.serialNumber,
      platform: v.platform, department: v.department, purchaseDate: v.purchaseDate || null, warrantyEnd: v.warrantyEnd || null, notes: v.notes, dependsOnIds: deps,
    };
    setBusy(true);
    try {
      const res = edit ? await assetService.update(asset.tag, body) : await assetService.create(body);
      ['assets', 'asset', 'asset-options'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast(res.message);
      onClose();
      if (!edit) navigate(`/assets/${res.data.tag}`);
    } catch (e) { f.fromError(e); toast(e.message); } finally { setBusy(false); }
  };

  if (!meta) return null;
  return (
    <Modal title={edit ? `Edit ${asset.tag}` : 'New asset'} wide onClose={onClose} onSubmit={submit} busy={busy}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: edit ? 'Save changes' : 'Add asset', variant: 'primary', type: 'submit' }]}>
      <Field label="Name *" error={f.errors.name}>{(i) => <Input id={i} placeholder="Host name, tag or service name" {...f.bind('name')} />}</Field>
      <div className="row2">
        <Field label="Type">{(i) => <Select id={i} options={meta.assetTypes.map((t) => [t.id, t.name])} {...f.bind('typeId')} />}</Field>
        <Field label="Criticality">{(i) => <Select id={i} options={meta.criticalities} {...f.bind('criticality')} />}</Field>
      </div>
      <div className="row2">
        <Field label="Status">{(i) => <Select id={i} options={meta.assetStatuses} {...f.bind('status')} />}</Field>
        <Field label="Environment">{(i) => <Select id={i} options={meta.environments} {...f.bind('environment')} />}</Field>
      </div>
      <h3 style={{ fontSize: 14, margin: '6px 0 8px' }}>Ownership</h3>
      <div className="row2">
        <Field label="Device owner (assigned to)" hint="The person who uses this device or item.">{(i) => <Select id={i} blank="Nobody" options={ppl} {...f.bind('assignedToId')} />}</Field>
        <Field label="Application or business owner" hint="The person accountable for it.">{(i) => <Select id={i} blank="Not set" options={ppl} {...f.bind('ownedById')} />}</Field>
      </div>
      <div className="row2">
        <Field label="Managed by" hint="The agent who looks after it technically.">{(i) => <Select id={i} blank="Not set" options={meta.agents.map((a) => [a.id, a.name])} {...f.bind('managedById')} />}</Field>
        <Field label="Support group" hint="Tickets about this item go to this group.">{(i) => <Select id={i} blank="Not set" options={meta.teams.filter((t) => t.type === 'Support').map((t) => [t.id, t.name])} {...f.bind('supportTeamId')} />}</Field>
      </div>
      <div className="row2">
        <Field label="Customer">{(i) => <Select id={i} options={meta.customers.map((c) => [c.id, c.name])} {...f.bind('customerId')} />}</Field>
        <Field label="Location">{(i) => <Input id={i} {...f.bind('location')} />}</Field>
      </div>
      <div className="row2">
        <Field label="Address or serial">{(i) => <Input id={i} {...f.bind('serialNumber')} />}</Field>
        <Field label="Platform">{(i) => <Input id={i} {...f.bind('platform')} />}</Field>
      </div>
      <div className="row2">
        <Field label="Department">{(i) => <Select id={i} blank="Not set" options={meta.departments} {...f.bind('department')} />}</Field>
        <Field label="Purchase date">{(i) => <Input id={i} type="date" {...f.bind('purchaseDate')} />}</Field>
      </div>
      <Field label="Warranty end">{(i) => <Input id={i} type="date" {...f.bind('warrantyEnd')} />}</Field>
      <Field label="Depends on">{() => (
        <div className="scroll" style={{ maxHeight: 120, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
          {options.filter((x) => x.id !== asset?.id).map((x) => (
            <label key={x.id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <input type="checkbox" checked={deps.includes(x.id)} onChange={(e) => setDeps((d) => (e.target.checked ? [...d, x.id] : d.filter((y) => y !== x.id)))} /> {x.name}
            </label>
          ))}
        </div>
      )}</Field>
      <Field label="Notes">{(i) => <Textarea id={i} {...f.bind('notes')} />}</Field>
    </Modal>
  );
}

export default withMeta(AssetDialog);
