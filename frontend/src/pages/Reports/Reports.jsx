import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportService } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAction, useMeta } from '../../hooks';
import Icon from '../../components/common/Icon';
import { Kpi, Seg, Tabs, Menu } from '../../components/common/Controls';
import { Chip, Avatar } from '../../components/common/Chips';
import { PageSkeleton, ErrorState, EmptyState, Skeleton } from '../../components/common/Feedback';
import { Field, Input, Select } from '../../components/forms/Field';
import Modal from '../../components/common/Modal';
import { HealthStrip, LineChart, AgingChart, BarList, LoadBar } from '../../components/charts/Charts';
import { dur, fmt } from '../../utils/format';
import { isEmail } from '../../validators';

function Delta({ cur, prev, fmtFn, goodUp, unit = '' }) {
  if (cur == null || prev == null) return <em className="muted">No earlier data</em>;
  const d = cur - prev;
  if (Math.abs(d) < 0.05) return <em className="muted">No change vs previous period</em>;
  const good = d > 0 === goodUp;
  return <em className={good ? 'good' : 'bad'}>{d > 0 ? '▲' : '▼'} {fmtFn(Math.abs(d))}{unit} vs previous period</em>;
}

function Process({ params }) {
  const [tab, setTab] = useState('incident');
  const q = useQuery({ queryKey: ['reports', 'process', tab, params], queryFn: () => reportService.process({ ...params, tab }) });
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2>By process</h2><p className="sub">Service management practice reports.</p>
      <Tabs value={tab} onChange={setTab} options={[['incident', 'Incidents'], ['request', 'Requests'], ['problem', 'Problems'], ['change', 'Changes'], ['security', 'Security']]} />
      {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : (
        <>
          <div className="mini">{q.data.mini.map(([l, v, s]) => <div key={l}><span>{l}</span><b>{v}</b><em>{s}</em></div>)}</div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{q.data.title}</h3>
          {q.data.rows.length ? (
            <div className="scroll"><table className="tbl"><thead><tr>{q.data.head.map((h, i) => <th key={h} className={i ? 'r' : ''}>{h}</th>)}</tr></thead>
              <tbody>{q.data.rows.map((r, j) => <tr key={j}>{r.map((c, i) => <td key={i} className={i ? 'r' : ''}>{i === 0 && q.data.links ? <Link to={q.data.links[j]}>{c}</Link> : c}</td>)}</tr>)}</tbody></table></div>
          ) : <EmptyState>Nothing to show for this period.</EmptyState>}
        </>
      )}
    </section>
  );
}

function ScheduleDialog({ onClose }) {
  const [v, setV] = useState({ name: 'Weekly SLA summary', frequency: 'Weekly', format: 'PDF', recipient: '', when: 'Monday 09:00' });
  const [errs, setErrs] = useState({});
  const act = useAction(() => reportService.addSchedule(v), { invalidate: ['schedules'], onSuccess: onClose });
  const set = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  const submit = () => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the report a name.';
    if (!isEmail(v.recipient)) e.recipient = 'Enter a valid email address.';
    setErrs(e);
    if (!Object.keys(e).length) act.mutate();
  };
  return (
    <Modal title="Schedule a report" onClose={onClose} busy={act.isPending} onSubmit={submit} buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Schedule', variant: 'primary', type: 'submit' }]}>
      <Field label="Name" error={errs.name}>{(id) => <Input id={id} {...set('name')} />}</Field>
      <div className="row2">
        <Field label="Frequency">{(id) => <Select id={id} options={['Daily', 'Weekly', 'Monthly']} {...set('frequency')} />}</Field>
        <Field label="Format">{(id) => <Select id={id} options={['PDF', 'CSV']} {...set('format')} />}</Field>
      </div>
      <Field label="Send to" error={errs.recipient}>{(id) => <Input id={id} type="email" placeholder="name@company.com" {...set('recipient')} />}</Field>
      <Field label="When">{(id) => <Input id={id} {...set('when')} />}</Field>
    </Modal>
  );
}

export default function Reports() {
  const meta = useMeta();
  const { can, user } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState(30);
  const [customerId, setCustomer] = useState('');
  const [teamId, setTeam] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const params = { range, customerId: customerId || undefined, teamId: teamId || undefined };
  const q = useQuery({ queryKey: ['reports', params], queryFn: () => reportService.summary(params) });
  const sch = useQuery({ queryKey: ['schedules'], queryFn: reportService.schedules });
  const unsched = useAction((id) => reportService.removeSchedule(id), { invalidate: ['schedules'] });
  const run = (fn) => fn(params).then(() => toast('Download started')).catch((e) => toast(e.message));

  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data, cur = d.current, prev = d.previous;
  const low = d.daily.filter((x) => x.sla != null && x.sla < 90).length;
  const head = cur.sla == null ? 'No tickets were resolved in this period.'
    : `SLA compliance was ${cur.sla.toFixed(1)}% over the last ${range} days, ${Math.abs(cur.sla - 95).toFixed(1)} points ${cur.sla >= 95 ? 'above' : 'below'} the 95% target${prev.sla != null ? `, ${cur.sla >= prev.sla ? 'up' : 'down'} from ${prev.sla.toFixed(1)}% in the previous period` : ''}.`;
  const maxOpen = Math.max(1, ...d.agents.map((a) => a.open));

  return (
    <>
      <div className="ph">
        <div><h1>Reports</h1><p>Live from your tickets, problems and changes. Create a ticket and it shows up here.</p></div>
        <div className="tools">
          <Seg label="Date range" value={range} onChange={setRange} options={[[7, '7 days'], [30, '30 days'], [90, '90 days']]} />
          <Select aria-label="Customer" blank="All customers" options={(meta?.customers || []).map((c) => [c.id, c.name])} value={customerId} onChange={(e) => setCustomer(e.target.value)} />
          <Select aria-label="Team" blank="All teams" options={(meta?.teams || []).filter((t) => t.type === 'Support').map((t) => [t.id, t.name])} value={teamId} onChange={(e) => setTeam(e.target.value)} />
          <Menu label={<><Icon name="download" />Export</>}>
            <button type="button" onClick={() => run(reportService.exportCsv)}>Tickets as CSV</button>
            <button type="button" onClick={() => run(reportService.exportJson)}>Summary as JSON</button>
            <button type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </Menu>
        </div>
      </div>
      <div className="kpis six">
        <Kpi label="Tickets created" value={fmt(cur.created)} sub={<Delta cur={cur.created} prev={prev.created} fmtFn={fmt} goodUp />} />
        <Kpi label="Tickets resolved" value={fmt(cur.resolved)} sub={<Delta cur={cur.resolved} prev={prev.resolved} fmtFn={fmt} goodUp />} />
        <Kpi label="SLA compliance" value={cur.sla == null ? '-' : cur.sla.toFixed(1)} unit={cur.sla == null ? '' : '%'} sub={<Delta cur={cur.sla} prev={prev.sla} fmtFn={(x) => x.toFixed(1)} goodUp unit=" pts" />} />
        <Kpi label="Median first response" value={cur.frt ? dur(cur.frt).replace(/ /g, '') : '-'} sub={<Delta cur={cur.frt} prev={prev.frt} fmtFn={dur} goodUp={false} />} />
        <Kpi label="Mean time to resolve" value={cur.mttr ? cur.mttr.toFixed(1) : '-'} unit={cur.mttr ? ' h' : ''} sub={<Delta cur={cur.mttr} prev={prev.mttr} fmtFn={(x) => x.toFixed(1)} goodUp={false} unit=" h" />} />
        <Kpi label="Customer satisfaction" value={cur.csat == null ? '-' : cur.csat.toFixed(2)} sub={cur.csat == null ? <em className="muted">No ratings</em> : <em className="muted">{cur.csatN} ratings out of 5</em>} />
      </div>
      <section className="panel"><h2 className="lead">{head}</h2>
        <p className="sub" style={{ marginTop: 8 }}>{low ? `${low} days fell below 90%.` : 'No day fell below 90%.'} Each bar is one day. Hover to see details.</p>
        <HealthStrip days={d.daily} />
      </section>
      <div className="grid g-c">
        <section className="panel"><h2>Volume</h2><p className="sub">Tickets created and resolved each day.</p>
          <div className="legend inline"><span><u style={{ background: 'var(--brand)' }} />Created</span><span><u style={{ background: 'var(--warn)' }} />Resolved</span></div>
          <LineChart labels={d.daily.map((x) => x.day)} series={[{ name: 'Created', color: 'var(--brand)', values: d.daily.map((x) => x.created) }, { name: 'Resolved', color: 'var(--warn)', values: d.daily.map((x) => x.resolved), dash: true }]} />
        </section>
        <section className="panel"><h2>Backlog by age</h2><p className="sub">{d.openNow} tickets are open right now.</p><AgingChart buckets={d.aging} /></section>
      </div>
      <div className="grid g-d">
        <section className="panel"><h2>Where tickets come from</h2><p className="sub">Created in this period, with SLA compliance for resolved ones.</p>
          <BarList rows={d.categories.map((c) => ({ name: c.name, count: c.count, note: c.sla != null ? `${c.sla.toFixed(0)}% SLA` : '' }))} />
        </section>
        <section className="panel"><h2>Team workload and quality</h2><p className="sub">Open now, and results for tickets resolved in this period.</p>
          <div className="scroll"><table className="tbl"><thead><tr><th>Agent</th><th>Team</th><th>Open</th><th className="r">Resolved</th><th className="r">SLA</th><th className="r">Satisfaction</th></tr></thead>
            <tbody>{d.agents.map((a) => (
              <tr key={a.id}><td><span className="who"><Avatar user={a} mine={a.id === user.id} />{a.id === user.id ? 'You' : a.name}</span></td><td className="muted">{a.team}</td><td><LoadBar value={a.open} max={maxOpen} /></td>
                <td className="r">{a.resolved}</td><td className="r">{a.sla == null ? '-' : `${a.sla.toFixed(0)}%`}</td><td className="r">{a.csat == null ? '-' : a.csat.toFixed(1)}</td></tr>
            ))}</tbody></table></div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}><h2>By customer</h2><p className="sub">How each customer is being served in this period.</p>
        <div className="scroll"><table className="tbl"><thead><tr><th>Customer</th><th className="r">Created</th><th className="r">Resolved</th><th className="r">SLA</th><th className="r">Satisfaction</th><th className="r">Open now</th><th className="r">Breached now</th></tr></thead>
          <tbody>{d.customers.map((c) => (
            <tr key={c.id}><td>{c.name} <Chip>{c.plan}</Chip></td><td className="r">{c.created}</td><td className="r">{c.resolved}</td><td className="r">{c.sla == null ? '-' : `${c.sla.toFixed(1)}%`}</td>
              <td className="r">{c.csat == null ? '-' : c.csat.toFixed(1)}</td><td className="r">{c.openNow}</td><td className={`r${c.breached ? ' bad' : ''}`}>{c.breached}</td></tr>
          ))}</tbody></table></div>
      </section>
      <Process params={params} />
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="head-row"><div><h2>Scheduled reports</h2><p className="sub">Emailed automatically. Delivery needs the email integration in Settings.</p></div>
          {can('report:schedule') ? <button type="button" className="btn sm" onClick={() => setScheduling(true)}><Icon name="plus" />Schedule a report</button> : null}</div>
        {sch.data?.length ? (
          <ul className="plain">{sch.data.map((s) => <li key={s.id}><div><b>{s.name}</b><span className="s">{s.frequency} · {s.when} · {s.format} to {s.recipient}</span></div>
            {can('report:schedule') ? <button type="button" className="btn sm" onClick={() => unsched.mutate(s.id)}>Remove</button> : null}</li>)}</ul>
        ) : <EmptyState>No reports are scheduled.</EmptyState>}
      </section>
      {scheduling ? <ScheduleDialog onClose={() => setScheduling(false)} /> : null}
    </>
  );
}
