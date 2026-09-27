import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { settingsService, dataService } from '../../services/adminService';
import { useAction, useMeta } from '../../hooks';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import Icon from '../../components/common/Icon';
import { Field, Input, Select, Switch } from '../../components/forms/Field';
import { PriorityChip, Chip } from '../../components/common/Chips';
import { Skeleton } from '../../components/common/Feedback';
import Modal from '../../components/common/Modal';
import { dur } from '../../utils/format';

const INV = ['settings', 'meta'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function GeneralTab({ s }) {
  const meta = useMeta();
  const [name, setName] = useState(s.organisation?.name || '');
  const save = useAction((body) => settingsService.general(body), { invalidate: INV });
  const hours = s.businessHours || { start: '09:00', end: '18:00', days: [] };
  const toggleDay = (d) => save.mutate({ hours: { days: hours.days.includes(d) ? hours.days.filter((x) => x !== d) : [...hours.days, d].sort() } });
  return (
    <section className="panel" style={{ maxWidth: 720 }}>
      <h2>Organisation</h2><p className="sub">Shown in the sidebar and in outgoing emails.</p>
      <Field label="Organisation name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim().length >= 2 && name !== s.organisation?.name && save.mutate({ name: name.trim() })} />}</Field>
      <Field label="Time zone" hint="Used for daily report buckets and business hours.">{(id) => <Select id={id} options={meta?.timezones || []} value={s.organisation?.timezone} onChange={(e) => save.mutate({ timezone: e.target.value })} />}</Field>
      <h2 style={{ marginTop: 8 }}>Business hours</h2><p className="sub">Used to plan on-call and support windows. SLA clocks run 24 hours a day.</p>
      <div className="row2">
        <Field label="Opens">{(id) => <Input id={id} type="time" defaultValue={hours.start} onBlur={(e) => e.target.value !== hours.start && save.mutate({ hours: { start: e.target.value } })} />}</Field>
        <Field label="Closes">{(id) => <Input id={id} type="time" defaultValue={hours.end} onBlur={(e) => e.target.value !== hours.end && save.mutate({ hours: { end: e.target.value } })} />}</Field>
      </div>
      <div className="filters" role="group" aria-label="Working days">{DAYS.map((d, i) => <button type="button" key={d} aria-pressed={hours.days.includes(i)} onClick={() => toggleDay(i)}>{d}</button>)}</div>
      <h2 style={{ marginTop: 20 }}>Attachments</h2>
      <p className="sub">Files are stored on the server outside the web root and downloaded through an authorised endpoint. Each file can be up to {Math.round((meta?.attachments?.maxBytes || 0) / 1048576)} MB. These types are blocked: {(meta?.attachments?.blocked || []).map((x) => `.${x}`).join(', ')}.</p>
    </section>
  );
}

export function SlaTab({ s }) {
  const [rows, setRows] = useState(s.sla);
  const save = useAction(() => settingsService.sla(rows.map((r) => ({ priority: r.priority, responseMinutes: Number(r.responseMinutes), resolutionMinutes: Number(r.resolutionMinutes) }))), { invalidate: INV });
  const set = (i, k, v) => setRows((x) => x.map((r, j) => (j === i ? { ...r, [k]: Math.max(1, Number(v) || 1) } : r)));
  const dirty = JSON.stringify(rows) !== JSON.stringify(s.sla);
  return (
    <section className="panel" style={{ maxWidth: 820 }}>
      <h2>Service level targets</h2><p className="sub">Time to first response and to resolution, in minutes. Changes apply to new tickets and to priority changes. Requests use the target on their catalog item.</p>
      <div className="scroll"><table className="tbl"><thead><tr><th>Priority</th><th>First response (min)</th><th>Resolution (min)</th><th>In words</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.priority}><td><PriorityChip p={r.priority} /></td>
            <td><input className="inp" type="number" min="1" style={{ width: 110 }} value={r.responseMinutes} onChange={(e) => set(i, 'responseMinutes', e.target.value)} aria-label={`P${r.priority} first response minutes`} /></td>
            <td><input className="inp" type="number" min="1" style={{ width: 110 }} value={r.resolutionMinutes} onChange={(e) => set(i, 'resolutionMinutes', e.target.value)} aria-label={`P${r.priority} resolution minutes`} /></td>
            <td className="muted">{dur(r.responseMinutes)} to respond, {dur(r.resolutionMinutes)} to resolve</td></tr>
        ))}</tbody></table></div>
      <div className="tools" style={{ marginTop: 12 }}><button type="button" className="btn primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save SLA policy</button></div>
      <p className="sub" style={{ marginTop: 12 }}>The resolution clock pauses when a ticket is On Hold with the reason <b>Waiting for requester</b>, and while a request waits for approval. Other hold reasons keep the clock running. Changing impact or urgency recalculates priority and the targets.</p>
    </section>
  );
}

export function NotifyTab({ s }) {
  const save = useAction((body) => settingsService.notifications(body), { invalidate: INV });
  const rows = [['newAssigned', 'A ticket is assigned to me'], ['breachWarn', 'A ticket is close to breaching its SLA'], ['majorIncident', 'A major incident is declared'], ['approvals', 'Something needs my approval'], ['dailyDigest', 'Send me a daily digest']];
  return (
    <section className="panel" style={{ maxWidth: 720 }}>
      <h2>Notifications</h2><p className="sub">Which events create notifications for agents.</p>
      <ul className="plain">{rows.map(([k, l]) => <li key={k}><b>{l}</b><Switch on={s.notifications?.[k]} label={l} onChange={(v) => save.mutate({ [k]: v })} /></li>)}</ul>
    </section>
  );
}

export function IntegrationsTab({ s }) {
  const I = s.integrations || {};
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useUI();
  const [newKey, setNewKey] = useState(null);
  const [url, setUrl] = useState(I.webhook?.url || '');
  const save = useAction(({ key, body }) => settingsService.integration(key, body), { invalidate: INV });
  const simulate = useAction((key) => settingsService.simulate(key), { invalidate: ['tickets', 'dashboard'], onSuccess: (r) => navigate(`/tickets/${r.data.number}`) });
  const rotate = useAction(() => settingsService.rotateKey(), { invalidate: INV, onSuccess: (r) => setNewKey(r.data.key) });
  const card = (k, name, desc, extra) => (
    <section className="panel" key={k}>
      <div className="head-row"><div><h2>{name}</h2><p className="sub">{desc}</p></div><Switch on={I[k]?.on} label={name} onChange={(v) => save.mutate({ key: k, body: { on: v } })} /></div>
      {I[k]?.on ? extra : null}
      <p style={{ marginTop: 8 }}><Chip cls={I[k]?.on ? 'ok' : 'grey'}>{I[k]?.on ? 'Connected' : 'Not connected'}</Chip></p>
    </section>
  );
  return (
    <div className="grid g2" style={{ marginTop: 0 }}>
      {card('email', 'Email to ticket', 'Emails sent to your support address become tickets.', <><div className="pwd">{I.email?.address}</div><div style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => simulate.mutate('email')}>Simulate an incoming email</button></div></>)}
      {card('siem', 'Security monitoring (SIEM)', 'Alerts from your SIEM open security tickets.', <div style={{ marginTop: 6 }}><button type="button" className="btn sm" onClick={() => simulate.mutate('siem')}>Simulate a SIEM alert</button></div>)}
      {card('slack', 'Slack', 'Post major incident updates to a channel.')}
      {card('teams', 'Microsoft Teams', 'Notify a Teams channel about critical tickets.')}
      {card('sso', 'Single sign-on', 'Let agents sign in with your identity provider.')}
      {card('webhook', 'Webhooks and API', 'Send ticket events to your own systems.', <>
        <Field label="Webhook URL">{(id) => <Input id={id} value={url} placeholder="https://example.com/hooks/tickets" onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== (I.webhook?.url || '') && save.mutate({ key: 'webhook', body: { url } })} />}</Field>
        <div className="muted" style={{ marginBottom: 4 }}>API key</div>
        <div className="pwd">{I.webhook?.keyPreview || 'No key generated yet'}</div>
        <div style={{ marginTop: 10 }} className="tools"><button type="button" className="btn sm" onClick={async () => { if (!I.webhook?.keyPreview || await confirm({ title: 'Generate a new key', message: 'The current key stops working immediately.', confirmLabel: 'Generate key' })) rotate.mutate(); }}>Generate a new key</button></div>
      </>)}
      {newKey ? (
        <Modal title="New API key" onClose={() => setNewKey(null)} buttons={[{ label: 'Copy key', onClick: () => navigator.clipboard?.writeText(newKey).then(() => toast('Key copied'), () => toast('Copy blocked by the browser')) }, { label: 'Done', variant: 'primary', onClick: () => setNewKey(null) }]}>
          <p style={{ marginBottom: 10 }}>Copy this key now. Only a hash is stored, so it cannot be shown again.</p>
          <div className="pwd">{newKey}</div>
        </Modal>
      ) : null}
    </div>
  );
}

export function DataTab() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['data-summary'], queryFn: dataService.summary });
  const rows = [['tickets', 'Tickets'], ['requests', 'Requests'], ['tasks', 'Tasks'], ['problems', 'Problems'], ['changes', 'Changes'], ['assets', 'Assets'], ['articles', 'Knowledge articles'], ['attachments', 'Attachments'], ['audit', 'Audit entries']];
  return (
    <div className="grid g2" style={{ marginTop: 0 }}>
      <section className="panel"><h2>Your data</h2><p className="sub">Everything is stored in the MySQL database. Attachment files are stored on the server.</p>
        {q.isLoading ? <Skeleton rows={4} /> : <div className="kv">{rows.map(([k, l]) => <span key={k} style={{ display: 'contents' }}><span>{l}</span><b>{q.data?.[k] ?? '-'}</b></span>)}</div>}
        <div className="tools" style={{ marginTop: 14 }}><button type="button" className="btn" onClick={() => dataService.exportAll().then(() => toast('Exported'), (e) => toast(e.message))}><Icon name="download" />Export everything (JSON)</button></div>
        <p className="sub" style={{ marginTop: 12 }}>The export contains business records and user names and roles, never password hashes or secrets.</p>
      </section>
      <section className="panel"><h2>Backups and sample data</h2>
        <p className="sub">Back up the database with mysqldump on a schedule (see docs/DEPLOYMENT.md). Sample data can be loaded into a non-production database with <code>npm run db:seed:demo</code>; production only needs <code>npm run db:seed</code>.</p>
      </section>
    </div>
  );
}
