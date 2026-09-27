import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userService } from '../../services/adminService';
import { useAction, useForm, useMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/common/Icon';
import { Field, Input, Select, Switch } from '../../components/forms/Field';
import { Avatar, Chip } from '../../components/common/Chips';
import { Skeleton, ErrorState } from '../../components/common/Feedback';
import Modal from '../../components/common/Modal';
import { isEmail, passwordProblem } from '../../validators';
import { ago } from '../../utils/format';

const INV = ['users', 'meta', 'teams'];

function AgentDialog({ agent, onClose }) {
  const meta = useMeta();
  const edit = !!agent;
  const f = useForm({ name: agent?.name || '', email: agent?.email || '', role: agent?.role || 'Agent', password: '' });
  const [teams, setTeams] = useState(agent?.teamIds || []);
  const act = useAction((body) => (edit ? userService.update(agent.id, body) : userService.create(body)), { invalidate: INV, onSuccess: onClose, onError: (e) => { f.fromError(e); } });
  const submit = () => {
    const e = {};
    if (f.values.name.trim().length < 3) e.name = 'Enter a name.';
    if (!isEmail(f.values.email)) e.email = 'Enter a valid email address.';
    if (!teams.length) e.teamIds = 'Choose at least one team.';
    if (!edit || f.values.password) { const p = passwordProblem(f.values.password); if (p) e.password = p; }
    f.setErrors(e);
    if (Object.keys(e).length) return;
    act.mutate({ name: f.values.name.trim(), email: f.values.email.trim(), role: f.values.role, teamIds: teams, password: f.values.password || undefined });
  };
  return (
    <Modal title={edit ? `Edit ${agent.name}` : 'Add agent'} onClose={onClose} busy={act.isPending} onSubmit={submit} buttons={[{ label: 'Cancel', onClick: onClose }, { label: edit ? 'Save changes' : 'Add agent', variant: 'primary', type: 'submit' }]}>
      <Field label="Name *" error={f.errors.name}>{(id) => <Input id={id} {...f.bind('name')} />}</Field>
      <Field label="Email *" error={f.errors.email}>{(id) => <Input id={id} type="email" {...f.bind('email')} />}</Field>
      <Field label="Role">{(id) => <Select id={id} options={['Agent', 'Manager', 'Admin']} {...f.bind('role')} />}</Field>
      <Field label={edit ? 'New password (leave empty to keep)' : 'Initial password *'} error={f.errors.password} hint="At least 10 characters with a letter and a number. Share it securely; the agent should change it after signing in.">{(id) => <Input id={id} type="password" autoComplete="new-password" {...f.bind('password')} />}</Field>
      <Field label="Teams *" error={f.errors.teamIds} hint="The first one you tick becomes the primary team.">{() => (
        <div className="scroll" style={{ maxHeight: 160, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
          {(meta?.teams || []).filter((t) => t.isActive).map((t) => (
            <label key={t.id} style={{ display: 'flex', gap: 8, padding: '3px 0' }}><input type="checkbox" checked={teams.includes(t.id)} onChange={(e) => setTeams((x) => (e.target.checked ? [...x, t.id] : x.filter((y) => y !== t.id)))} /> {t.name} <span className="muted">{t.type}</span></label>
          ))}
        </div>
      )}</Field>
    </Modal>
  );
}

export default function PeopleTab() {
  const { user } = useAuth();
  const meta = useMeta();
  const [dialog, setDialog] = useState(null);
  const q = useQuery({ queryKey: ['users'], queryFn: userService.list });
  const roles = useQuery({ queryKey: ['roles'], queryFn: userService.roles });
  const role = useAction(({ a, r }) => userService.update(a.id, { role: r }), { invalidate: INV });
  const active = useAction(({ a, on }) => userService.setActive(a.id, on), { invalidate: INV });
  const teamName = (id) => meta?.teams.find((t) => t.id === id)?.name || '?';
  const keyPerms = [['ticket:update', 'Work tickets, tasks and requests'], ['major:declare', 'Declare major incidents'], ['request:approve', 'Approve requests'], ['approval:override', 'Decide approvals on behalf of others'], ['kb:delete', 'Delete knowledge articles'], ['settings:manage', 'Change settings, SLA and automation'], ['team:manage', 'Create and edit teams, agents and customers'], ['data:export', 'Export all data'], ['audit:view', 'Read the audit log']];
  return (
    <>
      <section className="panel">
        <div className="head-row"><div><h2>Agents</h2><p className="sub">People who work tickets and tasks. An agent can belong to several teams. Roles decide what they may do.</p></div><button type="button" className="btn primary sm" onClick={() => setDialog({})}><Icon name="plus" />Add agent</button></div>
        {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Name</th><th>Teams</th><th>Role</th><th>Active</th><th>Last sign-in</th><th className="r">Open tickets</th><th className="r">Open tasks</th><th /></tr></thead>
            <tbody>{q.data.map((a) => (
              <tr key={a.id}>
                <td><span className="who"><Avatar user={a} mine={a.id === user.id} /><span><b style={{ fontWeight: 500 }}>{a.name}</b><div className="muted" style={{ fontSize: 12 }}>{a.email}</div></span></span></td>
                <td><div className="chips">{a.teamIds.map((t) => <Chip key={t} cls={t === a.primaryTeamId ? 'info' : 'grey'}>{teamName(t)}</Chip>)}</div></td>
                <td><Select aria-label={`Role for ${a.name}`} disabled={a.id === user.id} value={a.role} options={['Admin', 'Manager', 'Agent']} onChange={(e) => role.mutate({ a, r: e.target.value })} /></td>
                <td>{a.id === user.id ? <span className="muted">You</span> : <Switch on={a.active} label={`Active: ${a.name}`} onChange={(on) => active.mutate({ a, on })} />}</td>
                <td className="muted">{a.lastLoginAt ? ago(a.lastLoginAt) : 'Never'}</td>
                <td className="r">{a.openTickets}</td><td className="r">{a.openTasks}</td>
                <td><button type="button" className="btn sm" onClick={() => setDialog(a)}>Edit</button></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>What each role can do</h2><p className="sub">Enforced by the server on every request. The full permission list is stored in the database.</p>
        {roles.data ? (
          <div className="scroll"><table className="tbl"><thead><tr><th>Permission</th>{roles.data.map((r) => <th key={r.role}>{r.role}</th>)}</tr></thead>
            <tbody>{keyPerms.map(([code, label]) => <tr key={code}><td>{label}</td>{roles.data.map((r) => <td key={r.role}>{r.permissions.includes(code) ? <span className="good">Yes</span> : <span className="muted">No</span>}</td>)}</tr>)}</tbody></table></div>
        ) : <Skeleton rows={4} />}
      </section>
      {dialog ? <AgentDialog agent={dialog.id ? dialog : null} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
