import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customerService } from '../../services/adminService';
import { useAction, useMeta, useForm } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Field, Input, Select, Switch, Checkbox } from '../../components/forms/Field';
import { Chip } from '../../components/common/Chips';
import { Skeleton, ErrorState } from '../../components/common/Feedback';
import Modal from '../../components/common/Modal';
import { isEmail } from '../../validators';

const INV = ['customers', 'people', 'meta'];

function CustomerDialog({ onClose }) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('Business');
  const [err, setErr] = useState('');
  const act = useAction(() => customerService.create({ name: name.trim(), plan }), { invalidate: INV, onSuccess: onClose, onError: (e) => { setErr(e.fields?.name || ''); } });
  return (
    <Modal title="Add customer" onClose={onClose} busy={act.isPending} onSubmit={() => (name.trim().length < 2 ? setErr('Enter a name.') : act.mutate())} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Add customer', variant: 'primary', type: 'submit' }]}>
      <Field label="Name" error={err}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Plan">{(id) => <Select id={id} options={['Enterprise', 'Business', 'Starter']} value={plan} onChange={(e) => setPlan(e.target.value)} />}</Field>
    </Modal>
  );
}

function PersonDialog({ onClose }) {
  const meta = useMeta();
  const f = useForm({ customerId: meta?.customers[0]?.id || '', name: '', email: '', department: '', jobTitle: '', vip: false });
  const act = useAction((b) => customerService.createPerson(b), { invalidate: INV, onSuccess: onClose, onError: (e) => { f.fromError(e); } });
  const submit = () => {
    const e = {};
    if (f.values.name.trim().length < 3) e.name = 'Enter a name.';
    if (!isEmail(f.values.email)) e.email = 'Enter a valid email address.';
    f.setErrors(e);
    if (!Object.keys(e).length) act.mutate({ ...f.values, customerId: Number(f.values.customerId), name: f.values.name.trim(), email: f.values.email.trim() });
  };
  return (
    <Modal title="Add requester" onClose={onClose} busy={act.isPending} onSubmit={submit} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Add requester', variant: 'primary', type: 'submit' }]}>
      <Field label="Customer">{(id) => <Select id={id} options={(meta?.customers || []).map((c) => [c.id, c.name])} {...f.bind('customerId')} />}</Field>
      <Field label="Name" error={f.errors.name}>{(id) => <Input id={id} {...f.bind('name')} />}</Field>
      <Field label="Email" error={f.errors.email}>{(id) => <Input id={id} type="email" {...f.bind('email')} />}</Field>
      <div className="row2">
        <Field label="Department">{(id) => <Input id={id} {...f.bind('department')} />}</Field>
        <Field label="Job title">{(id) => <Input id={id} {...f.bind('jobTitle')} />}</Field>
      </div>
      <Checkbox checked={f.values.vip} onChange={(v) => f.set('vip', v)}>VIP requester</Checkbox>
    </Modal>
  );
}

export default function CustomersTab() {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null);
  const c = useQuery({ queryKey: ['customers'], queryFn: customerService.list });
  const p = useQuery({ queryKey: ['people', 'all'], queryFn: () => customerService.people({}) });
  const vip = useAction(({ id, on }) => customerService.setVip(id, on), { invalidate: INV });
  return (
    <>
      <section className="panel">
        <div className="head-row"><div><h2>Customers</h2><p className="sub">Each customer has their own requesters, tickets, assets and reports.</p></div>
          <div className="tools"><button type="button" className="btn sm" onClick={() => setDialog('person')}>Add requester</button><button type="button" className="btn primary sm" onClick={() => setDialog('customer')}><Icon name="plus" />Add customer</button></div></div>
        {c.isLoading ? <Skeleton /> : c.error ? <ErrorState error={c.error} /> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Customer</th><th>Plan</th><th className="r">Requesters</th><th className="r">Open tickets</th><th className="r">Assets</th></tr></thead>
            <tbody>{c.data.map((x) => <tr key={x.id}><td>{x.name}</td><td><Chip>{x.plan}</Chip></td><td className="r">{x.requesters}</td><td className="r">{x.openTickets}</td><td className="r">{x.assets}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Requesters</h2><p className="sub">People who raise tickets. The counts show the devices and applications they own.</p>
        {p.isLoading ? <Skeleton /> : p.error ? <ErrorState error={p.error} /> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Name</th><th>Customer</th><th>Job</th><th>Portal login</th><th>VIP</th><th className="r">Devices</th><th className="r">Applications owned</th></tr></thead>
            <tbody>{p.data.map((x) => (
              <tr key={x.id}>
                <td><b style={{ fontWeight: 500 }}>{x.name}</b><div className="muted" style={{ fontSize: 12 }}>{x.email}</div></td>
                <td>{x.customer.isInternal ? 'Internal' : x.customer.name}</td><td className="muted">{x.jobTitle}{x.department ? `, ${x.department}` : ''}</td>
                <td>{x.hasLogin ? <Chip cls="ok">Yes</Chip> : <span className="muted">No</span>}</td>
                <td><Switch on={x.vip} label={`VIP: ${x.name}`} onChange={(on) => vip.mutate({ id: x.id, on })} /></td>
                <td className="r">{x.devices ? <button type="button" className="link" onClick={() => navigate(`/assets?ownerId=${x.id}`)}>{x.devices}</button> : <span className="muted">0</span>}</td>
                <td className="r">{x.owned ? <button type="button" className="link" onClick={() => navigate(`/assets?ownerId=${x.id}`)}>{x.owned}</button> : <span className="muted">0</span>}</td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
      {dialog === 'customer' ? <CustomerDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'person' ? <PersonDialog onClose={() => setDialog(null)} /> : null}
    </>
  );
}
