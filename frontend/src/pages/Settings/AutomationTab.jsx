import { useState } from 'react';
import { settingsService } from '../../services/adminService';
import { useAction, useMeta } from '../../hooks';
import { useUI } from '../../context/UIContext';
import Icon from '../../components/common/Icon';
import { Field, Input, Textarea, Select, Switch } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';

const INV = ['settings', 'meta'];

function CannedDialog({ item, onClose }) {
  const [name, setName] = useState(item?.name || '');
  const [body, setBody] = useState(item?.body || '');
  const [err, setErr] = useState({});
  const act = useAction(() => (item ? settingsService.updateCanned(item.id, { name, body }) : settingsService.createCanned({ name, body })), { invalidate: INV, onSuccess: onClose });
  const submit = () => { const e = {}; if (name.trim().length < 2) e.name = 'Enter a name.'; if (body.trim().length < 2) e.body = 'Enter the text.'; setErr(e); if (!Object.keys(e).length) act.mutate(); };
  return (
    <Modal title={item ? 'Edit canned response' : 'New canned response'} onClose={onClose} busy={act.isPending} onSubmit={submit} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Save', variant: 'primary', type: 'submit' }]}>
      <Field label="Name" error={err.name}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Text" error={err.body}>{(id) => <Textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
    </Modal>
  );
}

export default function AutomationTab({ s }) {
  const meta = useMeta();
  const { confirm } = useUI();
  const [canned, setCanned] = useState(null);
  const [cab, setCab] = useState(s.cabApprovers);
  const rule = useAction(({ code, on }) => settingsService.rule(code, on), { invalidate: INV });
  const auto = useAction((days) => settingsService.autoClose(days), { invalidate: INV });
  const route = useAction(({ categoryId, teamId }) => settingsService.routing(categoryId, teamId), { invalidate: INV });
  const delCanned = useAction((id) => settingsService.deleteCanned(id), { invalidate: INV });
  const saveCab = useAction(() => settingsService.cab(cab.filter((a) => a.userId).map((a) => ({ userId: Number(a.userId), role: a.role || 'CAB member' }))), { invalidate: INV });
  const support = (meta?.teams || []).filter((t) => t.type === 'Support');

  return (
    <>
      <div className="grid g2" style={{ marginTop: 0 }}>
        <section className="panel"><h2>Automation rules</h2><p className="sub">Rules run when a ticket is created or updated. Each one is recorded on the ticket.</p>
          <ul className="plain">{s.rules.map((r) => <li key={r.code}><div><b>{r.name}</b><span className="s">{r.description}</span></div><Switch on={r.enabled} label={r.name} onChange={(on) => rule.mutate({ code: r.code, on })} /></li>)}</ul>
          <div className="row2" style={{ marginTop: 14, maxWidth: 420 }}>
            <Field label="Auto-close after (days)">{(id) => <Input id={id} type="number" min="1" max="30" defaultValue={s.automation?.autoCloseDays || 3} onBlur={(e) => { const v = Math.min(30, Math.max(1, Number(e.target.value) || 1)); if (v !== s.automation?.autoCloseDays) auto.mutate(v); }} />}</Field>
          </div>
        </section>
        <section className="panel"><h2>Assignment rules by category</h2><p className="sub">Which team receives new tickets in each category. Inactive teams are skipped.</p>
          <table className="tbl"><thead><tr><th>Category</th><th>Team</th></tr></thead>
            <tbody>{s.routing.map((r) => <tr key={r.categoryId}><td>{r.category}</td><td><Select aria-label={`Team for ${r.category}`} value={r.teamId || ''} options={support.map((t) => [t.id, t.name])} onChange={(e) => route.mutate({ categoryId: r.categoryId, teamId: Number(e.target.value) })} /></td></tr>)}</tbody></table>
        </section>
      </div>
      <div className="grid g2">
        <section className="panel">
          <div className="head-row"><div><h2>Canned responses</h2><p className="sub">Reusable replies agents can insert in the ticket composer.</p></div><button type="button" className="btn sm primary" onClick={() => setCanned({})}><Icon name="plus" />Add</button></div>
          <ul className="plain">{s.canned.map((c) => (
            <li key={c.id}><div style={{ minWidth: 0 }}><b>{c.name}</b><span className="s">{c.body.slice(0, 90)}{c.body.length > 90 ? '...' : ''}</span></div>
              <span className="tools"><button type="button" className="btn sm" onClick={() => setCanned(c)}>Edit</button><button type="button" className="btn sm" aria-label={`Delete ${c.name}`} onClick={async () => { if (await confirm({ title: 'Delete canned response', message: `Delete ${c.name}?`, confirmLabel: 'Delete', danger: true })) delCanned.mutate(c.id); }}><Icon name="trash" /></button></span></li>
          ))}</ul>
        </section>
        <section className="panel"><h2>Change advisory board</h2><p className="sub">Approvers added to every new normal or emergency change. One rejection sends a change back to Risk review.</p>
          {cab.map((a, i) => (
            <div className="row2" key={i} style={{ alignItems: 'end' }}>
              <Field label="Approver">{(id) => <Select id={id} blank="Choose" value={a.userId || ''} options={(meta?.agents || []).map((x) => [x.id, x.name])} onChange={(e) => setCab((c) => c.map((y, j) => (j === i ? { ...y, userId: e.target.value } : y)))} />}</Field>
              <Field label="Role">{(id) => <div style={{ display: 'flex', gap: 6 }}><Input id={id} value={a.role} onChange={(e) => setCab((c) => c.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} /><button type="button" className="btn icon-btn" aria-label="Remove approver" onClick={() => setCab((c) => c.filter((_, j) => j !== i))}><Icon name="x" /></button></div>}</Field>
            </div>
          ))}
          <div className="tools"><button type="button" className="btn sm" onClick={() => setCab((c) => [...c, { userId: '', role: 'CAB member' }])}><Icon name="plus" />Add approver</button><button type="button" className="btn sm primary" disabled={saveCab.isPending} onClick={() => saveCab.mutate()}>Save approvers</button></div>
        </section>
      </div>
      {canned ? <CannedDialog item={canned.id ? canned : null} onClose={() => setCanned(null)} /> : null}
    </>
  );
}
