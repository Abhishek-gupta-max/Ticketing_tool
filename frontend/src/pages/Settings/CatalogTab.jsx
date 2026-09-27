import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requestService } from '../../services/requestService';
import { useAction, useMeta } from '../../hooks';
import Icon, { ICON_NAMES } from '../../components/common/Icon';
import { Field, Input, Textarea, Select, Checkbox } from '../../components/forms/Field';
import { Chip } from '../../components/common/Chips';
import { Skeleton, ErrorState } from '../../components/common/Feedback';
import Modal from '../../components/common/Modal';

const ICONS = ['user', 'box', 'mail', 'key', 'shield', 'monitor', 'laptop', 'db', 'wifi', 'cloud', 'server'].filter((i) => ICON_NAMES.includes(i));

function ItemDialog({ item, onClose }) {
  const meta = useMeta();
  const [v, setV] = useState({
    name: item?.name || '', categoryId: item?.category.id || meta?.categories[0]?.id, icon: item?.icon || 'box', description: item?.description || '',
    requiresApproval: item?.requiresApproval || false, fulfilmentHours: item?.fulfilmentHours || 24, isActive: item ? item.isActive : true,
  });
  const [fields, setFields] = useState(item?.fields.map((f) => ({ ...f, options: f.options.join(', ') })) || []);
  const [tasks, setTasks] = useState((item?.tasks || []).join('\n'));
  const [err, setErr] = useState('');
  const act = useAction((body) => (item ? requestService.updateCatalogItem(item.id, body) : requestService.createCatalogItem(body)), { invalidate: ['catalog'], onSuccess: onClose, onError: (e) => { setErr(e.message); } });
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  const setF = (i, k, val) => setFields((x) => x.map((f, j) => (j === i ? { ...f, [k]: val } : f)));
  const submit = () => {
    if (v.name.trim().length < 3) return setErr('Enter a name of at least 3 characters.');
    if (v.description.trim().length < 5) return setErr('Add a description.');
    act.mutate({
      name: v.name.trim(), categoryId: Number(v.categoryId), icon: v.icon, description: v.description.trim(), requiresApproval: v.requiresApproval,
      fulfilmentHours: Number(v.fulfilmentHours), isActive: v.isActive,
      fields: fields.map((f) => ({ key: f.key.trim(), label: f.label.trim(), type: f.type, required: !!f.required, options: f.type === 'select' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : [] })),
      tasks: tasks.split('\n').map((t) => t.trim()).filter(Boolean),
    });
  };
  return (
    <Modal title={item ? `Edit ${item.name}` : 'New catalog item'} wide onClose={onClose} busy={act.isPending} onSubmit={submit} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Save', variant: 'primary', type: 'submit' }]}>
      {err ? <div className="banner" role="alert" style={{ marginBottom: 12 }}>{err}</div> : null}
      <div className="row2">
        <Field label="Name *">{(id) => <Input id={id} {...bind('name')} />}</Field>
        <Field label="Category">{(id) => <Select id={id} options={(meta?.categories || []).map((c) => [c.id, c.name])} {...bind('categoryId')} />}</Field>
      </div>
      <Field label="Description *">{(id) => <Textarea id={id} {...bind('description')} />}</Field>
      <div className="row2">
        <Field label="Icon">{(id) => <Select id={id} options={ICONS} {...bind('icon')} />}</Field>
        <Field label="Fulfilment target (hours)">{(id) => <Input id={id} type="number" min="1" {...bind('fulfilmentHours')} />}</Field>
      </div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
        <Checkbox checked={v.requiresApproval} onChange={(x) => setV({ ...v, requiresApproval: x })}>Needs line manager approval</Checkbox>
        <Checkbox checked={v.isActive} onChange={(x) => setV({ ...v, isActive: x })}>Shown in the catalog</Checkbox>
      </div>
      <h3 style={{ fontSize: 14, margin: '6px 0 8px' }}>Form fields</h3>
      {fields.map((f, i) => (
        <div className="editrow" key={i}>
          <input className="inp" aria-label="Field key" placeholder="key" value={f.key} onChange={(e) => setF(i, 'key', e.target.value)} />
          <input className="inp" aria-label="Label" placeholder="Label" value={f.label} onChange={(e) => setF(i, 'label', e.target.value)} />
          <Select aria-label="Type" options={['text', 'textarea', 'select', 'date']} value={f.type} onChange={(e) => setF(i, 'type', e.target.value)} />
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!!f.required} onChange={(e) => setF(i, 'required', e.target.checked)} />Req.</label>
          <input className="inp" aria-label="Options" placeholder="Options, comma separated" disabled={f.type !== 'select'} value={f.options} onChange={(e) => setF(i, 'options', e.target.value)} />
          <button type="button" className="btn icon-btn" aria-label="Remove field" onClick={() => setFields((x) => x.filter((_, j) => j !== i))}><Icon name="x" /></button>
        </div>
      ))}
      <button type="button" className="btn sm" style={{ marginBottom: 12 }} onClick={() => setFields((x) => [...x, { key: '', label: '', type: 'text', required: false, options: '' }])}><Icon name="plus" />Add field</button>
      <Field label="Fulfilment tasks (one per line, in order)" hint="Created when the item is approved. Each step opens when the previous one closes.">{(id) => <Textarea id={id} value={tasks} onChange={(e) => setTasks(e.target.value)} />}</Field>
    </Modal>
  );
}

export default function CatalogTab() {
  const [dialog, setDialog] = useState(null);
  const q = useQuery({ queryKey: ['catalog', 'all'], queryFn: () => requestService.catalog(true) });
  return (
    <section className="panel">
      <div className="head-row"><div><h2>Service catalog</h2><p className="sub">Items people can order, their form fields and the fulfilment tasks created for each order.</p></div><button type="button" className="btn primary sm" onClick={() => setDialog({})}><Icon name="plus" />New item</button></div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="scroll"><table className="tbl"><thead><tr><th>Item</th><th>Category</th><th>Approval</th><th>Target</th><th className="r">Fields</th><th className="r">Tasks</th><th>Status</th><th /></tr></thead>
          <tbody>{q.data.map((c) => (
            <tr key={c.id}><td className="title"><span className="who"><Icon name={c.icon} /><b style={{ fontWeight: 500 }}>{c.name}</b></span><small>{c.description}</small></td>
              <td>{c.category.name}</td><td>{c.requiresApproval ? 'Needed' : <span className="muted">No</span>}</td><td>{c.fulfilmentHours} h</td>
              <td className="r">{c.fields.length}</td><td className="r">{c.tasks.length}</td><td><Chip cls={c.isActive ? 'ok' : 'grey'}>{c.isActive ? 'Active' : 'Hidden'}</Chip></td>
              <td><button type="button" className="btn sm" onClick={() => setDialog(c)}>Edit</button></td></tr>
          ))}</tbody></table></div>
      )}
      {dialog ? <ItemDialog item={dialog.id ? dialog : null} onClose={() => setDialog(null)} /> : null}
    </section>
  );
}
