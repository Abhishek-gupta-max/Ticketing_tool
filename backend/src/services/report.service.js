import * as stats from '../repositories/stats.repository.js';
import * as approvalRepo from '../repositories/approval.repository.js';
import * as settings from './settings.service.js';
import * as audit from './audit.service.js';
import { query, queryOne } from '../config/database.js';
import { tzOffset, startOfDayUtc, DAY } from '../utils/time.js';
import { notFound } from '../utils/AppError.js';

const n = (v) => Number(v || 0);

/** Daily series for the last `days` days in the organisation time zone. */
export async function dailySeries(days, f = {}) {
  const offset = tzOffset(await settings.timezone());
  const end = new Date(startOfDayUtc(offset).getTime() + DAY);
  const from = new Date(end.getTime() - days * DAY);
  const { created, resolved } = await stats.daily(from, end, offset, f);
  const key = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));
  const cm = Object.fromEntries(created.map((r) => [key(r.d), n(r.n)]));
  const rm = Object.fromEntries(resolved.map((r) => [key(r.d), [n(r.n), n(r.met)]]));
  const out = [];
  for (let i = 0; i < days; i++) {
    const start = new Date(from.getTime() + i * DAY);
    const localKey = new Date(start.getTime() + offsetMs(offset)).toISOString().slice(0, 10);
    const [res, met] = rm[localKey] || [0, 0];
    out.push({ day: localKey, start, created: cm[localKey] || 0, resolved: res, sla: res ? (met / res) * 100 : null });
  }
  return { series: out, from, to: end };
}

function offsetMs(offset) {
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
}

export async function summary({ range = 30, customerId, teamId }) {
  const f = { customerId, teamId };
  const { series, from, to } = await dailySeries(range, f);
  const prevFrom = new Date(from.getTime() - range * DAY);
  const [cur, prev, aging, cats, agents, customers] = await Promise.all([
    stats.windowStats(from, to, f), stats.windowStats(prevFrom, from, f), stats.agingOpen(f), stats.categories(from, to, f), stats.agents(from, to, f), stats.customers(from, to, f),
  ]);
  const buckets = ['Under 1 day', '1 to 3 days', '3 to 7 days', '7 to 14 days', 'Over 14 days'].map((label, b) => ({
    label, byPriority: [1, 2, 3, 4].map((p) => n(aging.find((a) => n(a.bucket) === b && a.priority === p)?.n)),
  }));
  buckets.forEach((b) => { b.total = b.byPriority.reduce((a, x) => a + x, 0); });
  return {
    range, from, to, current: cur, previous: prev, daily: series,
    openNow: buckets.reduce((a, b) => a + b.total, 0),
    aging: buckets,
    categories: cats.map((c) => ({ name: c.name, count: n(c.n), sla: n(c.res) ? (n(c.met) / n(c.res)) * 100 : null })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, team: a.team_name, open: n(a.open_count), resolved: n(a.resolved), sla: n(a.resolved) ? (n(a.met) / n(a.resolved)) * 100 : null, csat: a.csat != null ? Number(a.csat) : null, openTasks: n(a.open_tasks) })),
    customers: customers.map((c) => ({ id: c.id, name: c.name, plan: c.plan, created: n(c.created), resolved: n(c.resolved), sla: n(c.resolved) ? (n(c.met) / n(c.resolved)) * 100 : null, csat: c.csat != null ? Number(c.csat) : null, openNow: n(c.open_now), breached: n(c.breached) })),
  };
}

const pct = (met, total) => (n(total) ? (n(met) / n(total)) * 100 : null);

export async function processReport({ tab = 'incident', range = 30, customerId, teamId }) {
  const f = { customerId, teamId };
  const { from, to } = await dailySeries(range, f);
  if (tab === 'incident' || tab === 'request') {
    const w = await stats.kindWindow(from, to, f, tab);
    if (tab === 'incident') {
      const groups = await stats.groupedTitles(from, to, f, "t.kind = 'incident'");
      return {
        mini: [['Incidents created', n(w.created), 'in this period'], ['Mean time to resolve', w.mttr != null ? `${Number(w.mttr).toFixed(1)} h` : '-', 'resolved incidents'], ['Reopened', n(w.resolved) ? `${((n(w.reopened) / n(w.resolved)) * 100).toFixed(1)}%` : '-', 'of resolved incidents']],
        title: 'Most frequent incidents', head: ['Incident', 'Count', 'Resolve time', 'SLA'],
        rows: groups.map((g) => [g.k, n(g.n), g.hours != null ? `${Number(g.hours).toFixed(1)} h` : '-', pct(g.met, g.res) == null ? '-' : `${pct(g.met, g.res).toFixed(0)}%`]),
      };
    }
    const hours = (await approvalRepo.approvalHours(from, to)).map((r) => Number(r.hours));
    const groups = await stats.catalogGroups(from, to, f);
    return {
      mini: [['Requests created', n(w.created), 'in this period'], ['Fulfilled on time', pct(w.met, w.resolved) == null ? '-' : `${pct(w.met, w.resolved).toFixed(0)}%`, `${n(w.resolved)} fulfilled`], ['Average approval time', hours.length ? `${(hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1)} h` : '-', 'for approved requests']],
      title: 'Most order items', head: ['Catalog item', 'Requests', 'Fulfilled', 'On time'],
      rows: groups.map((g) => [g.k, n(g.n), n(g.res), pct(g.met, g.res) == null ? '-' : `${pct(g.met, g.res).toFixed(0)}%`]),
    };
  }
  if (tab === 'problem') {
    const k = await queryOne("SELECT SUM(status IN ('Logged','Investigating','Finding cause','Fix underway')) AS open_count, SUM(status IN ('Logged','Investigating','Finding cause','Fix underway') AND is_known_error = 1) AS known FROM problems WHERE deleted_at IS NULL");
    const linked = await queryOne('SELECT COUNT(*) AS n FROM tickets WHERE problem_id IS NOT NULL AND deleted_at IS NULL');
    const rows = await stats.problemRows();
    return {
      mini: [['Open problems', n(k.open_count), 'not yet resolved'], ['Known errors', n(k.known), 'workaround available'], ['Incidents linked', n(linked.n), 'across all problems']],
      title: 'Problems by impact', head: ['Problem', 'Status', 'Incidents', 'Open incidents'],
      rows: rows.map((r) => [`${r.problem_number} ${r.title}`, r.status, n(r.n), n(r.open_n)]), links: rows.map((r) => `/problems/${r.problem_number}`),
    };
  }
  if (tab === 'change') {
    const k = await queryOne("SELECT SUM(status = 'Closed' AND close_code IS NOT NULL) AS done, SUM(status = 'Closed' AND close_code IS NOT NULL AND close_code <> 'Did not work') AS ok, SUM(type = 'Emergency') AS emergency, SUM(status = 'Approval') AS awaiting FROM changes WHERE deleted_at IS NULL");
    const rows = await stats.changeStatusRows();
    return {
      mini: [['Success rate', n(k.done) ? `${((n(k.ok) / n(k.done)) * 100).toFixed(0)}%` : '-', `${n(k.done)} finished changes`], ['Emergency changes', n(k.emergency), 'all time'], ['Awaiting approval', n(k.awaiting), 'CAB decision needed']],
      title: 'Changes by status', head: ['Status', 'Changes', 'High risk'], rows: rows.map((r) => [r.status, n(r.n), n(r.high)]),
    };
  }
  const sec = await stats.security(from, to, f);
  const groups = await stats.groupedTitles(from, to, f, "t.category_id = (SELECT id FROM ticket_categories WHERE name = 'Security alerts')");
  const frts = groups.filter((g) => g.frt != null).map((g) => Number(g.frt));
  return {
    mini: [['Security tickets', n(sec.created), 'created in this period'], ['Average first response', frts.length ? `${Math.round(frts.reduce((a, b) => a + b, 0) / frts.length)}m` : '-', 'security tickets'], ['Open critical and high', n(sec.open_high), 'right now']],
    title: 'Security tickets by type', head: ['Type', 'Count', 'SLA'],
    rows: groups.map((g) => [g.k, n(g.n), pct(g.met, g.res) == null ? '-' : `${pct(g.met, g.res).toFixed(0)}%`]),
  };
}

export async function exportTickets({ range = 30, customerId, teamId }) {
  const { from } = await dailySeries(range, {});
  const w = ['t.deleted_at IS NULL', 't.created_at >= ?'], p = [from];
  if (customerId) { w.push('t.customer_id = ?'); p.push(customerId); }
  if (teamId) { w.push('t.team_id = ?'); p.push(teamId); }
  return query(
    `SELECT t.ticket_number, t.kind, t.title, c.name AS customer, cat.name AS category, pr.name AS priority, t.status, u.name AS owner,
            t.created_at, t.resolved_at, TIMESTAMPDIFF(MINUTE, t.created_at, t.first_response_at) AS frt,
            CASE WHEN t.resolved_at IS NULL THEN '' WHEN t.resolved_at <= TIMESTAMPADD(SECOND, t.paused_seconds, t.sla_resolution_due_at) THEN 'Met' ELSE 'Missed' END AS sla, t.csat
       FROM tickets t JOIN customers c ON c.id = t.customer_id JOIN ticket_categories cat ON cat.id = t.category_id JOIN priorities pr ON pr.id = t.priority
       LEFT JOIN users u ON u.id = t.assigned_to WHERE ${w.join(' AND ')} ORDER BY t.created_at DESC LIMIT 50000`,
    p,
  );
}

// ---------- schedules ----------
export const schedules = async () => (await query('SELECT id, name, frequency, format, recipient, run_when FROM report_schedules ORDER BY id')).map((s) => ({ id: s.id, name: s.name, frequency: s.frequency, format: s.format, recipient: s.recipient, when: s.run_when }));

export async function addSchedule(b, user) {
  const res = await query('INSERT INTO report_schedules (name, frequency, format, recipient, run_when, created_by) VALUES (?, ?, ?, ?, ?, ?)', [b.name, b.frequency, b.format, b.recipient, b.when, user.id]);
  await audit.log({ action: 'Scheduled report', entityType: 'report', entityId: res.insertId, entityRef: 'Reports', newValues: b });
  return schedules();
}

export async function removeSchedule(id) {
  const res = await query('DELETE FROM report_schedules WHERE id = ?', [id]);
  if (!res.affectedRows) throw notFound('Schedule not found.');
  await audit.log({ action: 'Removed scheduled report', entityType: 'report', entityId: id, entityRef: 'Reports' });
  return schedules();
}
