import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teamService } from '../../services/adminService';
import { useAction, useMeta } from '../../hooks';
import { useUI } from '../../context/UIContext';
import Icon from '../../components/common/Icon';
import { Field, Input, Textarea, Select, Switch } from '../../components/forms/Field';
import { Chip, OwnerCell, Avatar } from '../../components/common/Chips';
import { Skeleton, ErrorState, EmptyState } from '../../components/common/Feedback';
import Modal from '../../components/common/Modal';
import { isEmail } from '../../validators';

const INV = ['teams', 'meta', 'users'];

function TeamDialog({ team, onClose, onSaved }) {
  const meta = useMeta();
  const edit = !!team;
  const [v, setV] = useState({ name: team?.name || '', type: team?.type || 'Support', managerId: team?.manager?.id || '', description: team?.description || '', email: team?.email || '' });
  const [members, setMembers] = useState(team?.members?.map((m) => m.id) || []);
  const [err, setErr] = useState({});
  const act = useAction((body) => (edit ? teamService.update(team.id, body) : teamService.create(body)), { invalidate: INV, onSuccess: (r) => { onSaved?.(r.data.id); onClose(); }, onError: (e) => { setErr(e.fields || {}); } });
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  const submit = () => {
    const e = {};
    if (v.name.trim().length < 2) e.name = 'Enter a team name.';
    if (v.email && !isEmail(v.email)) e.email = 'Enter a valid email address.';
    setErr(e);
    if (!Object.keys(e).length) act.mutate({ name: v.name.trim(), type: v.type, managerId: v.managerId ? Number(v.managerId) : null, description: v.description.trim(), email: v.email.trim(), memberIds: members });
  };
  return (
    <Modal title={edit ? `Edit ${team.name}` : 'New team'} wide onClose={onClose} busy={act.isPending} onSubmit={submit} buttons={[{ label: 'Cancel', onClick: onClose }, { label: edit ? 'Save changes' : 'Create team', variant: 'primary', type: 'submit' }]}>
      <Field label="Team name *" error={err.name}>{(id) => <Input id={id} placeholder="For example Network engineering" {...bind('name')} />}</Field>
      <div className="row2">
        <Field label="Type">{(id) => <Select id={id} options={[['Support', 'Support: receives tickets and tasks'], ['Approval', 'Approval: decides on changes']]} {...bind('type')} />}</Field>
        <Field label="Manager">{(id) => <Select id={id} blank="No manager" options={(meta?.agents || []).map((a) => [a.id, a.name])} {...bind('managerId')} />}</Field>
      </div>
      <Field label="Description">{(id) => <Textarea id={id} placeholder="What does this team do?" {...bind('description')} />}</Field>
      <Field label="Team email" error={err.email}>{(id) => <Input id={id} type="email" placeholder="team@company.com" {...bind('email')} />}</Field>
      <Field label="Members" hint="Agents can belong to several teams.">{() => (
        <div className="scroll" style={{ maxHeight: 170, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
          {(meta?.agents || []).map((a) => <label key={a.id} style={{ display: 'flex', gap: 8, padding: '3px 0' }}><input type="checkbox" checked={members.includes(a.id)} onChange={(e) => setMembers((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} /> {a.name} <span className="muted">{a.role}</span></label>)}
        </div>
      )}</Field>
    </Modal>
  );
}

function TeamDetail({ id, onBack }) {
  const meta = useMeta();
  const { confirm } = useUI();
  const [editing, setEditing] = useState(false);
  const [add, setAdd] = useState('');
  const q = useQuery({ queryKey: ['teams', id], queryFn: () => teamService.get(id) });
  const toggle = useAction(() => teamService.toggle(id), { invalidate: INV });
  const del = useAction(() => teamService.remove(id), { invalidate: INV, onSuccess: onBack });
  const addM = useAction((userId) => teamService.addMember(id, userId), { invalidate: INV, onSuccess: () => setAdd('') });
  const rmM = useAction((userId) => teamService.removeMember(id, userId), { invalidate: INV });
  const onCall = useAction(({ userId, on }) => teamService.setOnCall(id, userId, on), { invalidate: [...INV, 'incidents'] });
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} />;
  const t = q.data;
  const support = t.type === 'Support';
  const non = (meta?.agents || []).filter((a) => !t.members.some((m) => m.id === a.id));
  return (
    <>
      <p style={{ marginBottom: 10 }}><button type="button" className="link" onClick={onBack}>&larr; All teams</button></p>
      <div className="head-row" style={{ marginBottom: 14 }}>
        <div><div className="chips"><Chip cls={support ? 'info' : 'violet'}>{t.type}</Chip><Chip cls={t.isActive ? 'ok' : 'grey'}>{t.isActive ? 'Active' : 'Inactive'}</Chip></div>
          <h2 style={{ fontSize: 24, marginTop: 6 }}>{t.name}</h2><p className="muted">{t.description || 'No description.'}</p></div>
        <div className="tools">
          <button type="button" className="btn" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button>
          <button type="button" className="btn" onClick={() => toggle.mutate()}>{t.isActive ? 'Deactivate' : 'Reactivate'}</button>
          <button type="button" className="btn danger" onClick={async () => { if (await confirm({ title: 'Delete team', message: `Delete ${t.name}? Its members stay in their other teams.`, confirmLabel: 'Delete team', danger: true })) del.mutate(); }}><Icon name="trash" />Delete</button>
        </div>
      </div>
      <div className="dgrid">
        <div>
          <section className="panel">
            <div className="head-row"><div><h2>Members</h2><p className="sub">{t.members.length} active member{t.members.length === 1 ? '' : 's'}.{support ? ' Switch on call on for the person who receives critical tickets.' : ''}</p></div>
              <span className="tools"><Select aria-label="Add a member" blank="Add a member..." value={add} options={non.map((a) => [a.id, a.name])} onChange={(e) => setAdd(e.target.value)} /><button type="button" className="btn sm primary" disabled={!add} onClick={() => addM.mutate(Number(add))}>Add</button></span></div>
            {t.members.length ? (
              <div className="scroll"><table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Also in</th>{support ? <th>On call</th> : null}<th /></tr></thead>
                <tbody>{t.members.map((m) => (
                  <tr key={m.id}><td><span className="who"><Avatar user={m} />{m.name}{t.manager?.id === m.id ? <> <Chip cls="violet">Manager</Chip></> : null}</span></td><td>{m.role}</td><td className="muted">{m.otherTeams || '-'}</td>
                    {support ? <td><Switch on={m.isOnCall} label={`On call: ${m.name}`} onChange={(on) => onCall.mutate({ userId: m.id, on })} /></td> : null}
                    <td><button type="button" className="btn sm" onClick={() => rmM.mutate(m.id)}>Remove</button></td></tr>
                ))}</tbody></table></div>
            ) : <EmptyState>No members yet.</EmptyState>}
          </section>
        </div>
        <div className="side-col">
          <section className="panel"><h2>Details</h2><dl className="props" style={{ marginTop: 12 }}><dt>Manager</dt><dd>{t.manager?.name || '-'}</dd><dt>Email</dt><dd>{t.email || '-'}</dd><dt>Open tickets</dt><dd>{t.openTickets}</dd><dt>Open tasks</dt><dd>{t.openTasks}</dd><dt>Assets supported</dt><dd>{t.assetsSupported}</dd></dl></section>
          {support ? <section className="panel"><h2>Receives tickets for</h2>{t.routedCategories.length ? <div className="chips" style={{ marginTop: 8 }}>{t.routedCategories.map((c) => <Chip key={c}>{c}</Chip>)}</div> : <p className="muted" style={{ marginTop: 8 }}>No categories are routed here. Change this in Automation.</p>}</section> : null}
        </div>
      </div>
      {editing ? <TeamDialog team={t} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

export default function TeamsTab() {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['teams'], queryFn: teamService.list });
  if (openId) return <TeamDetail id={openId} onBack={() => setOpenId(null)} />;
  return (
    <section className="panel">
      <div className="head-row"><div><h2>Teams</h2><p className="sub">Support teams receive tickets and tasks. Approval teams decide on changes. Create as many as you need.</p></div><button type="button" className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" />New team</button></div>
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="scroll"><table className="tbl"><thead><tr><th>Team</th><th>Type</th><th>Manager</th><th className="r">Members</th><th>On call</th><th className="r">Open tickets</th><th className="r">Open tasks</th><th>Status</th></tr></thead>
          <tbody>{q.data.map((t) => (
            <tr key={t.id} data-go="" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setOpenId(t.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(t.id); }}>
              <td className="title"><b style={{ fontWeight: 500 }}>{t.name}</b><small>{t.description}</small></td>
              <td><Chip cls={t.type === 'Approval' ? 'violet' : 'info'}>{t.type}</Chip></td><td><OwnerCell user={t.manager} /></td>
              <td className="r">{t.memberCount}</td><td>{t.onCall.map((o) => o.name).join(', ') || <span className="muted">-</span>}</td>
              <td className="r">{t.openTickets}</td><td className="r">{t.openTasks}</td><td><Chip cls={t.isActive ? 'ok' : 'grey'}>{t.isActive ? 'Active' : 'Inactive'}</Chip></td>
            </tr>
          ))}</tbody></table></div>
      )}
      {creating ? <TeamDialog onClose={() => setCreating(false)} onSaved={setOpenId} /> : null}
    </section>
  );
}
