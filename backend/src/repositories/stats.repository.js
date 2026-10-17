// Aggregates for the dashboard and reports. Tickets in scope are loaded with the
// fields a figure needs and counted in code with the same SLA predicates the
// lists use. Day buckets use the organisation's UTC offset so "today" matches
// the desk's time zone.
import { find, mapBy, toDateValue } from '../config/database.js';
import { isOpen, isBreached, isRisk, isMet, isPausedRequester } from '../utils/sla.js';

const TICKET_FIELDS = {
  id: 1, kind: 1, title: 1, status: 1, priority: 1, customer_id: 1, team_id: 1, category_id: 1, assigned_to: 1, catalog_item_id: 1, problem_id: 1,
  created_at: 1, resolved_at: 1, first_response_at: 1, paused_at: 1, paused_seconds: 1, sla_response_due_at: 1, sla_resolution_due_at: 1,
  csat: 1, reopened_count: 1,
};

function scope(f = {}) {
  const w = { deleted_at: null };
  if (f.customerId) w.customer_id = f.customerId;
  if (f.teamId) w.team_id = f.teamId;
  return w;
}
const loadTickets = (filter) => find('tickets', filter, { projection: TICKET_FIELDS });

const between = (d, from, to) => d != null && d >= from && d < to;
const asDate = (v) => (v instanceof Date ? v : new Date(toDateValue(v)));
const range = (from, to) => [asDate(from), asDate(to)];
// MySQL TIMESTAMPDIFF counts whole units (truncated toward zero).
const diffSeconds = (a, b) => Math.trunc((b.getTime() - a.getTime()) / 1000);
const avg = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
const countIf = (rows, test) => rows.reduce((s, r) => s + (test(r) ? 1 : 0), 0);
// SUM(...) over no rows is NULL in SQL.
const sumIf = (rows, test) => (rows.length ? countIf(rows, test) : null);
const resolveHours = (t) => (diffSeconds(t.created_at, t.resolved_at) - (t.paused_seconds || 0)) / 3600;
const firstResponseMinutes = (t) => diffSeconds(t.created_at, t.first_response_at) / 60;

async function policyMinutes() {
  return new Map((await find('priorities', {}, { projection: { id: 1, resolution_minutes: 1 } })).map((p) => [p.id, p.resolution_minutes]));
}

export async function deskTotals(userId, todayStart) {
  const policy = await policyMinutes();
  const all = (await loadTickets({ deleted_at: null })).filter((t) => policy.has(t.priority));
  const open = all.filter(isOpen);
  const unassigned = open.filter((t) => t.assigned_to == null && t.status !== 'Awaiting approval');
  const today = new Date(todayStart);
  return {
    total: all.length,
    open_count: open.length,
    critical: countIf(open, (t) => t.priority === 1),
    awaiting: countIf(all, (t) => t.status === 'Awaiting approval'),
    resolved: countIf(all, (t) => t.status === 'Resolved'),
    closed: countIf(all, (t) => t.status === 'Closed'),
    mine: countIf(open, (t) => t.assigned_to === userId),
    mine_breached: countIf(open, (t) => t.assigned_to === userId && isBreached(t)),
    unassigned: unassigned.length,
    unassigned_high: countIf(unassigned, (t) => t.priority <= 2),
    breached: countIf(all, (t) => isBreached(t)),
    risk: countIf(all, (t) => isRisk(t, policy.get(t.priority))),
    on_hold: countIf(all, (t) => t.status === 'On Hold'),
    paused: countIf(all, isPausedRequester),
    resolved_today: countIf(all, (t) => t.resolved_at != null && t.resolved_at >= today),
  };
}

export async function byPriority() {
  const open = (await loadTickets({ deleted_at: null })).filter(isOpen);
  const counts = new Map();
  for (const t of open) counts.set(t.priority, (counts.get(t.priority) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([priority, n]) => ({ priority, n }));
}

export async function byCategoryOpen() {
  const [categories, open] = await Promise.all([
    find('ticket_categories', {}, { sort: { sort_order: 1, id: 1 }, projection: { id: 1, name: 1, sort_order: 1 } }),
    loadTickets({ deleted_at: null }).then((rows) => rows.filter(isOpen)),
  ]);
  return categories
    .map((c) => ({ name: c.name, n: countIf(open, (t) => t.category_id === c.id), sort_order: c.sort_order }))
    .sort((a, b) => b.n - a.n || a.sort_order - b.sort_order)
    .map(({ name, n }) => ({ name, n }));
}

function offsetMs(offset) {
  const m = String(offset).match(/^([+-])(\d{2}):(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
}

/** Per-day created / resolved / SLA met, in the org time zone. */
export async function daily(from, to, offset, f = {}) {
  const [a, b] = range(from, to);
  const shift = offsetMs(offset);
  const day = (d) => new Date(d.getTime() + shift).toISOString().slice(0, 10);
  const created = await loadTickets({ ...scope(f), created_at: { $gte: a, $lt: b } });
  const resolved = await loadTickets({ ...scope(f), resolved_at: { $gte: a, $lt: b } });
  const group = (rows, dateOf) => {
    const m = new Map();
    for (const t of rows) { const k = day(dateOf(t)); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
    return m;
  };
  return {
    created: [...group(created, (t) => t.created_at)].map(([d, rows]) => ({ d, n: rows.length })),
    resolved: [...group(resolved, (t) => t.resolved_at)].map(([d, rows]) => ({ d, n: rows.length, met: countIf(rows, isMet) })),
  };
}

/** Window statistics for reports (created, resolved, SLA, first response, MTTR, CSAT, reopen). */
export async function windowStats(from, to, f = {}) {
  const [a, b] = range(from, to);
  const created = await loadTickets({ ...scope(f), created_at: { $gte: a, $lt: b } });
  const resolved = await loadTickets({ ...scope(f), resolved_at: { $gte: a, $lt: b } });
  const frt = created.filter((t) => t.first_response_at != null).map(firstResponseMinutes).sort((x, y) => x - y);
  const med = frt.length ? (frt.length % 2 ? frt[(frt.length - 1) / 2] : (frt[frt.length / 2 - 1] + frt[frt.length / 2]) / 2) : null;
  const rated = resolved.filter((t) => t.csat != null);
  return {
    created: created.length,
    resolved: resolved.length,
    sla: resolved.length ? (countIf(resolved, isMet) / resolved.length) * 100 : null,
    frt: med,
    mttr: avg(resolved.map(resolveHours)),
    csat: avg(rated.map((t) => t.csat)),
    csatN: rated.length,
    reopenPct: resolved.length ? (countIf(resolved, (t) => t.reopened_count > 0) / resolved.length) * 100 : 0,
  };
}

export async function agingOpen(f = {}) {
  const now = new Date();
  const open = (await loadTickets(scope(f))).filter(isOpen);
  const counts = new Map();
  for (const t of open) {
    const age = diffSeconds(t.created_at, now) / 86400;
    const bucket = age < 1 ? 0 : age < 3 ? 1 : age < 7 ? 2 : age < 14 ? 3 : 4;
    const k = `${bucket}:${t.priority}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].map(([k, n]) => { const [bucket, priority] = k.split(':').map(Number); return { bucket, priority, n }; });
}

/** created / resolved / met / csat figures of a ticket group within a window. */
function windowFigures(rows, a, b) {
  const created = rows.filter((t) => between(t.created_at, a, b));
  const resolved = rows.filter((t) => between(t.resolved_at, a, b));
  const rated = resolved.filter((t) => t.csat != null);
  return {
    created: created.length,
    resolved: resolved.length,
    met: sumIf(resolved, isMet),
    csat: avg(rated.map((t) => t.csat)),
  };
}

export async function categories(from, to, f = {}) {
  const [a, b] = range(from, to);
  const [cats, rows] = await Promise.all([
    find('ticket_categories', {}, { sort: { id: 1 }, projection: { id: 1, name: 1 } }),
    loadTickets(scope(f)),
  ]);
  return cats
    .map((c) => { const w = windowFigures(rows.filter((t) => t.category_id === c.id), a, b); return { name: c.name, n: w.created, res: w.resolved, met: w.met }; })
    .sort((x, y) => y.n - x.n);
}

export async function agents(from, to, f = {}) {
  const [a, b] = range(from, to);
  const [users, agentRows, rows, tasks] = await Promise.all([
    find('users', { status: 'active' }, { sort: { id: 1 }, projection: { id: 1, name: 1 } }),
    find('agents', {}, { projection: { user_id: 1, primary_team_id: 1 } }),
    loadTickets(scope(f)),
    find('tasks', { state: { $nin: ['Done', 'Not done', 'Not needed'] }, assigned_to: { $ne: null } }, { projection: { assigned_to: 1 } }),
  ]);
  const agentBy = new Map(agentRows.map((r) => [r.user_id, r]));
  const teams = await mapBy('teams', agentRows.map((r) => r.primary_team_id), { projection: { name: 1 } });
  return users
    .filter((u) => agentBy.has(u.id))
    .map((u) => {
      const mine = rows.filter((t) => t.assigned_to === u.id);
      const w = windowFigures(mine, a, b);
      return {
        id: u.id, name: u.name, team_name: teams.get(agentBy.get(u.id).primary_team_id)?.name ?? null,
        open_count: countIf(mine, isOpen), resolved: w.resolved, met: w.met, csat: w.csat,
        open_tasks: countIf(tasks, (s) => s.assigned_to === u.id),
      };
    });
}

export async function customers(from, to, f = {}) {
  const [a, b] = range(from, to);
  const [list, rows, policy] = await Promise.all([
    find('customers', { deleted_at: null, ...(f.customerId && { id: f.customerId }) }, { sort: { is_internal: 1, id: 1 }, projection: { id: 1, name: 1, plan: 1 } }),
    loadTickets(scope(f)),
    policyMinutes(),
  ]);
  return list.map((c) => {
    const mine = rows.filter((t) => t.customer_id === c.id);
    const w = windowFigures(mine, a, b);
    return {
      id: c.id, name: c.name, plan: c.plan, created: w.created, resolved: w.resolved, met: w.met, csat: w.csat,
      open_now: countIf(mine, isOpen), breached: countIf(mine, (t) => policy.has(t.priority) && isBreached(t)),
    };
  });
}

/**
 * Tickets created in the window grouped by title (case-insensitive, like the
 * MySQL collation). filter is an extra MongoDB condition, e.g. { kind: 'incident' }.
 */
export async function groupedTitles(from, to, f, filter, limit = 6) {
  const [a, b] = range(from, to);
  const rows = await loadTickets({ ...scope(f), ...filter, created_at: { $gte: a, $lt: b } });
  const groups = new Map();
  for (const t of rows) {
    const key = t.title.toLowerCase();
    if (!groups.has(key)) groups.set(key, { k: t.title, rows: [] });
    groups.get(key).rows.push(t);
  }
  return [...groups.values()]
    .map(({ k, rows: g }) => {
      const resolved = g.filter((t) => t.resolved_at != null);
      return {
        k, n: g.length, res: resolved.length, met: countIf(g, isMet),
        hours: avg(resolved.map(resolveHours)),
        frt: avg(g.filter((t) => t.first_response_at != null).map(firstResponseMinutes)),
      };
    })
    .sort((x, y) => y.n - x.n)
    .slice(0, limit);
}

export async function catalogGroups(from, to, f) {
  const [a, b] = range(from, to);
  const rows = await loadTickets({ ...scope(f), kind: 'request', catalog_item_id: { $ne: null }, created_at: { $gte: a, $lt: b } });
  const items = await mapBy('catalog_items', rows.map((t) => t.catalog_item_id), { projection: { name: 1 } });
  const groups = new Map();
  for (const t of rows) {
    if (!items.has(t.catalog_item_id)) continue;
    if (!groups.has(t.catalog_item_id)) groups.set(t.catalog_item_id, []);
    groups.get(t.catalog_item_id).push(t);
  }
  return [...groups]
    .map(([id, g]) => ({ k: items.get(id).name, n: g.length, res: countIf(g, (t) => t.resolved_at != null), met: countIf(g, isMet) }))
    .sort((x, y) => y.n - x.n)
    .slice(0, 6);
}

export async function kindWindow(from, to, f, kind) {
  const [a, b] = range(from, to);
  const rows = await loadTickets({ ...scope(f), kind });
  const resolved = rows.filter((t) => between(t.resolved_at, a, b));
  return {
    created: sumIf(rows, (t) => between(t.created_at, a, b)),
    resolved: sumIf(rows, (t) => between(t.resolved_at, a, b)),
    met: sumIf(rows, (t) => between(t.resolved_at, a, b) && isMet(t)),
    mttr: avg(resolved.map(resolveHours)),
    reopened: sumIf(rows, (t) => between(t.resolved_at, a, b) && t.reopened_count > 0),
  };
}

/** Id of the "Security alerts" category (null when it does not exist). */
export async function securityCategoryId() {
  const [c] = await find('ticket_categories', { name: 'Security alerts' }, { projection: { id: 1 } });
  return c?.id ?? null;
}

export async function security(from, to, f) {
  const [a, b] = range(from, to);
  const id = await securityCategoryId();
  const rows = id == null ? [] : await loadTickets({ ...scope(f), category_id: id });
  return {
    created: sumIf(rows, (t) => between(t.created_at, a, b)),
    open_high: sumIf(rows, (t) => isOpen(t) && t.priority <= 2),
  };
}

export async function problemRows() {
  const [problems, rows] = await Promise.all([
    find('problems', { deleted_at: null }, { sort: { id: 1 }, projection: { id: 1, problem_number: 1, title: 1, status: 1 } }),
    loadTickets({ deleted_at: null, problem_id: { $ne: null } }),
  ]);
  return problems
    .map((p) => {
      const linked = rows.filter((t) => t.problem_id === p.id);
      return { problem_number: p.problem_number, title: p.title, status: p.status, n: linked.length, open_n: countIf(linked, isOpen) };
    })
    .sort((x, y) => y.n - x.n);
}

export async function changeStatusRows() {
  const rows = await find('changes', { deleted_at: null }, { projection: { status: 1, risk: 1 } });
  const groups = new Map();
  for (const c of rows) {
    const g = groups.get(c.status) || { status: c.status, n: 0, high: 0 };
    g.n += 1;
    if (c.risk === 'High') g.high += 1;
    groups.set(c.status, g);
  }
  return [...groups.values()].sort((x, y) => y.n - x.n);
}
