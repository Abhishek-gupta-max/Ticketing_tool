import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/common/Modal';
import { Field, Input, Textarea, Select } from '../../components/forms/Field';
import { Chip } from '../../components/common/Chips';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useMeta, withMeta } from '../../hooks';
import { requestService } from '../../services/requestService';
import { customerService } from '../../services/adminService';
import { fileProblem } from '../../validators';

/** Checkout for one or more catalog items: one request, one order item per line. */
function Checkout({ items, onClose, onDone }) {
  const meta = useMeta();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState(meta?.customers?.[0]?.id || '');
  const [requestedForId, setRequestedFor] = useState('');
  const [values, setValues] = useState(items.map(() => ({})));
  const [errors, setErrors] = useState({});
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const people = useQuery({ queryKey: ['people', customerId], queryFn: () => customerService.people({ customerId }), enabled: user.isStaff && !!customerId });
  useEffect(() => { if (people.data?.length) setRequestedFor(people.data[0].id); }, [people.data]);

  const setVal = (i, k, v) => { setValues((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setErrors((e) => ({ ...e, [`${i}.${k}`]: undefined })); };

  const submit = async () => {
    const errs = {};
    items.forEach((ci, i) => ci.fields.forEach((f) => { if (f.required && !String(values[i][f.key] || '').trim()) errs[`${i}.${f.key}`] = 'This field is required.'; }));
    const bad = files.map((f) => fileProblem(f, meta?.attachments)).filter(Boolean);
    if (bad.length) errs.files = bad[0];
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = { items: items.map((ci, i) => ({ catalogItemId: ci.id, values: Object.fromEntries(Object.entries(values[i]).map(([k, v]) => [k, String(v)])) })) };
      if (user.isStaff) Object.assign(body, { customerId: Number(customerId), requestedForId: Number(requestedForId) });
      const res = await requestService.submit(body, files);
      ['requests', 'tickets', 'dashboard', 'approvals', 'nav'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast(res.message);
      onDone?.();
      onClose();
      navigate(res.data.items.length > 1 ? `/requests/${res.data.reqNumber}` : `/tickets/${res.data.items[0]}`);
    } catch (e) {
      toast(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={items.length > 1 ? `Checkout: ${items.length} items` : items[0].name} wide onClose={onClose} onSubmit={submit} busy={busy}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Submit request', variant: 'primary', type: 'submit' }]}>
      <p className="muted" style={{ marginBottom: 12 }}>{items.length > 1 ? `One request with ${items.length} items. Each item is approved separately.` : items[0].description}</p>
      {user.isStaff ? (
        <div className="row2">
          <Field label="Customer">{(id) => <Select id={id} options={(meta?.customers || []).map((c) => [c.id, c.name])} value={customerId} onChange={(e) => setCustomerId(e.target.value)} />}</Field>
          <Field label="Requested for">{(id) => <Select id={id} options={(people.data || []).map((p) => [p.id, p.name])} value={requestedForId} onChange={(e) => setRequestedFor(e.target.value)} />}</Field>
        </div>
      ) : null}
      {items.map((ci, i) => (
        <fieldset className="fs" key={`${ci.id}-${i}`}>
          <legend>{ci.name} {ci.requiresApproval ? <Chip cls="warn">Needs approval</Chip> : null}</legend>
          {ci.fields.map((f) => {
            const err = errors[`${i}.${f.key}`];
            const common = { value: values[i][f.key] || '', onChange: (e) => setVal(i, f.key, e.target.value), 'aria-invalid': err ? 'true' : undefined };
            return (
              <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} error={err}>
                {(id) => (f.type === 'select' ? <Select id={id} blank="" options={f.options} {...common} />
                  : f.type === 'textarea' ? <Textarea id={id} {...common} /> : <Input id={id} type={f.type === 'date' ? 'date' : 'text'} {...common} />)}
              </Field>
            );
          })}
        </fieldset>
      ))}
      <Field label="Attachments" error={errors.files} hint={`Attached to every item. Up to ${Math.round((meta?.attachments?.maxBytes || 5242880) / 1048576)} MB each.`}>
        {(id) => <input id={id} className="inp" type="file" multiple onChange={(e) => setFiles([...e.target.files])} />}
      </Field>
    </Modal>
  );
}

export default withMeta(Checkout);
