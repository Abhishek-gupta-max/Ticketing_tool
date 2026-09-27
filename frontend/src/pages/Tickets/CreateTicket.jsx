import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/common/Modal';
import { Field, Input, Textarea, Select } from '../../components/forms/Field';
import { useForm, useMeta, useDebounce, withMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ticketService } from '../../services/ticketService';
import { customerService } from '../../services/adminService';
import { assetService, kbService } from '../../services/assetService';
import { fileProblem } from '../../validators';
import { dur } from '../../utils/format';
import { PRI } from '../../constants';

/**
 * New ticket dialog (also used for "New linked ticket" and "Report an issue").
 * prefill: { title, description, kind, customerId, requesterId, categoryId, assetId, parentNumber, problemId }
 */
function CreateTicket({ prefill = {}, onClose }) {
  const meta = useMeta();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const staff = user.isStaff;
  const defaultCat = meta?.categories.find((c) => c.name === 'Software and apps')?.id || meta?.categories[0]?.id || '';
  const f = useForm({
    kind: prefill.kind || 'incident', channel: 'Portal', title: prefill.title || '', description: prefill.description || '',
    customerId: prefill.customerId || meta?.customers?.[0]?.id || '', requesterId: prefill.requesterId || '', categoryId: prefill.categoryId || defaultCat,
    assetId: prefill.assetId || '', impact: 2, urgency: 2, assignee: '',
  });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const v = f.values;

  const people = useQuery({ queryKey: ['people', v.customerId], queryFn: () => customerService.people({ customerId: v.customerId }), enabled: staff && !!v.customerId });
  const assets = useQuery({ queryKey: ['asset-options'], queryFn: assetService.options, enabled: staff });
  const dq = useDebounce(v.title, 400);
  const sug = useQuery({ queryKey: ['kb-suggest', dq], queryFn: () => kbService.list({ search: [...dq.split(/[^A-Za-z0-9-]+/)].sort((a, b) => b.length - a.length)[0] }).then((r) => r.data.slice(0, 3)), enabled: dq.trim().length > 5 });

  useEffect(() => {
    const list = people.data || [];
    if (list.length && !list.some((p) => String(p.id) === String(v.requesterId))) f.set('requesterId', prefill.requesterId && list.some((p) => p.id === prefill.requesterId) ? prefill.requesterId : list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.data]);

  const pri = useMemo(() => meta?.priorityMatrix?.[v.impact - 1]?.[v.urgency - 1] || 3, [meta, v.impact, v.urgency]);
  const policy = meta?.priorities.find((p) => p.id === pri);
  const mine = (assets.data || []).filter((a) => a.assignedPersonId && String(a.assignedPersonId) === String(v.requesterId));
  const rest = (assets.data || []).filter((a) => !mine.includes(a));

  const submit = async () => {
    const errs = {};
    if (v.title.trim().length < 5) errs.title = 'Add a short description of at least 5 characters.';
    if (staff && !v.requesterId) errs.requesterId = 'Choose a requester.';
    const bad = files.map((x) => fileProblem(x, meta?.attachments)).filter(Boolean);
    if (bad.length) errs.files = bad[0];
    if (Object.keys(errs).length) return f.setErrors(errs);
    setBusy(true);
    try {
      const body = { kind: v.kind, title: v.title.trim(), description: v.description.trim(), categoryId: Number(v.categoryId), impact: Number(v.impact), urgency: Number(v.urgency), parentNumber: prefill.parentNumber, problemId: prefill.problemId };
      if (staff) Object.assign(body, { channel: v.channel, customerId: Number(v.customerId), requesterId: Number(v.requesterId), assetId: v.assetId ? Number(v.assetId) : undefined, assignee: v.assignee === 'auto' ? 'auto' : v.assignee ? Number(v.assignee) : undefined });
      const t = await ticketService.create(body, files);
      qc.invalidateQueries({ queryKey: ['tickets'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['nav'] });
      toast(`${t.number} created`);
      onClose();
      navigate(`/tickets/${t.number}`);
    } catch (e) {
      f.fromError(e);
      toast(e.message);
    } finally { setBusy(false); }
  };

  if (!meta) return null;
  return (
    <Modal title="New ticket" wide onClose={onClose} onSubmit={submit} busy={busy} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Create ticket', variant: 'primary', type: 'submit' }]}>
      <div className="row2">
        <Field label="Type">{(id) => <Select id={id} options={[['incident', 'Incident: something is broken'], ['request', 'Service request: I need something']]} {...f.bind('kind')} />}</Field>
        {staff ? <Field label="Channel">{(id) => <Select id={id} options={meta.channels} {...f.bind('channel')} />}</Field> : <span />}
      </div>
      <Field label="Summary *" error={f.errors.title}>{(id) => <Input id={id} placeholder="What is the problem?" autoComplete="off" {...f.bind('title')} />}</Field>
      {sug.data?.length ? <div className="suggest"><b>These articles might help:</b>{sug.data.map((a) => <a key={a.number} href={`/kb/${a.number}`} target="_blank" rel="noopener noreferrer">{a.title}</a>)}</div> : null}
      <Field label="Description" error={f.errors.description}>{(id) => <Textarea id={id} placeholder="What happened? What did you expect? Any error messages?" {...f.bind('description')} />}</Field>
      {staff ? (
        <div className="row2">
          <Field label="Customer">{(id) => <Select id={id} options={meta.customers.map((c) => [c.id, c.name])} value={v.customerId} onChange={(e) => { f.set('customerId', e.target.value); f.set('requesterId', ''); }} />}</Field>
          <Field label="Requester *" error={f.errors.requesterId}>{(id) => <Select id={id} options={(people.data || []).map((p) => [p.id, p.name + (p.vip ? ' (VIP)' : '')])} {...f.bind('requesterId')} />}</Field>
        </div>
      ) : null}
      <div className="row2">
        <Field label="Category">{(id) => <Select id={id} options={meta.categories.map((c) => [c.id, c.name])} {...f.bind('categoryId')} />}</Field>
        {staff ? (
          <Field label="Affected asset" hint="Devices owned by the requester are listed first.">{(id) => (
            <select id={id} className="sel" {...f.bind('assetId')}>
              <option value="">None</option>
              {mine.length ? <optgroup label="Owned by the requester">{mine.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup> : null}
              <optgroup label="All configuration items">{rest.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
            </select>
          )}</Field>
        ) : <span />}
      </div>
      <div className="row2">
        <Field label="Impact">{(id) => <Select id={id} options={[1, 2, 3].map((i) => [i, meta.impactLabels[i]])} {...f.bind('impact')} />}</Field>
        <Field label="Urgency">{(id) => <Select id={id} options={[1, 2, 3].map((i) => [i, meta.urgencyLabels[i]])} {...f.bind('urgency')} />}</Field>
      </div>
      <p className="muted" style={{ margin: '-4px 0 12px' }}>Priority will be <b>P{pri} {PRI[pri]}</b>. Resolve target: {policy ? dur(policy.resolutionMinutes) : '-'}.</p>
      {staff ? (
        <Field label="Assigned to">{(id) => (
          <select id={id} className="sel" {...f.bind('assignee')}>
            <option value="">Leave in the assignment group queue</option>
            <option value="auto">Auto-assign to the least busy agent</option>
            {meta.agents.map((a) => <option key={a.id} value={a.id}>{a.id === user.id ? `You (${a.name})` : a.name}</option>)}
          </select>
        )}</Field>
      ) : null}
      <Field label="Attachments" error={f.errors.files} hint={`Up to ${Math.round(meta.attachments.maxBytes / 1048576)} MB each. Executable file types are blocked.`}>
        {(id) => <input id={id} className="inp" type="file" multiple onChange={(e) => { setFiles([...e.target.files]); f.setErrors({}); }} />}
      </Field>
    </Modal>
  );
}

export default withMeta(CreateTicket);
