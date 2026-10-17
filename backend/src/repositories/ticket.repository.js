import { OPEN_STATUSES } from '../constants/workflow.js';
import {
  insertOne, insertMany, find, findOne, updateOne, deleteMany, count, mapBy, distinct, like, toDateValue,
} from '../config/database.js';
import { isBreached, isRisk, slaLeftSeconds } from '../utils/sla.js';
import { DAY } from '../utils/time.js';

const STATUS_ORDER = ['New', 'In Progress', 'On Hold', 'Awaiting approval', 'Resolved', 'Closed'];

/**
 * Ticket rows with customer, requester, category, priority policy, team and
 * assignee (the former TICKET_SELECT / TICKET_FROM join). Rows whose required
 * relations are missing are left out, as the inner joins did.
 */
export async function rowsFor(docs, conn) {
  if (!docs.length) return [];
  const [customers, people, categories, priorities, teams, users] = await Promise.all([
    mapBy('customers', docs.map((t) => t.customer_id), { projection: { name: 1, is_internal: 1 }, conn }),
    mapBy('people', docs.map((t) => t.requester_id), { projection: { name: 1, email: 1, is_vip: 1, user_id: 1 }, conn }),
    mapBy('ticket_categories', docs.map((t) => t.category_id), { projection: { name: 1 }, conn }),
    mapBy('priorities', docs.map((t) => t.priority), { projection: { resolution_minutes: 1 }, conn }),
    mapBy('teams', docs.map((t) => t.team_id), { projection: { name: 1 }, conn }),
    mapBy('users', docs.map((t) => t.assigned_to), { projection: { name: 1 }, conn }),
  ]);
  return docs
    .filter((t) => customers.has(t.customer_id) && people.has(t.requester_id) && categories.has(t.category_id) && priorities.has(t.priority))
    .map((t) => {
      const c = customers.get(t.customer_id), rq = people.get(t.requester_id);
      return {
        id: t.id, ticket_number: t.ticket_number, kind: t.kind, title: t.title, description: t.description, customer_id: t.customer_id,
        customer_name: c.name, customer_internal: c.is_internal, requester_id: t.requester_id, requester_name: rq.name, requester_email: rq.email,
        requester_vip: rq.is_vip, requester_user_id: rq.user_id, category_id: t.category_id, category_name: categories.get(t.category_id).name,
        team_id: t.team_id, team_name: teams.get(t.team_id)?.name ?? null, assigned_to: t.assigned_to, assignee_name: users.get(t.assigned_to)?.name ?? null,
        channel: t.channel, impact: t.impact, urgency: t.urgency, priority: t.priority,
        policy_resolution_minutes: priorities.get(t.priority).resolution_minutes, status: t.status, hold_reason: t.hold_reason, is_major: t.is_major,
        sla_response_due_at: t.sla_response_due_at, sla_resolution_due_at: t.sla_resolution_due_at, paused_at: t.paused_at,
        paused_seconds: t.paused_seconds, first_response_at: t.first_response_at, resolved_at: t.resolved_at, closed_at: t.closed_at,
        resolution_code: t.resolution_code, resolution_notes: t.resolution_notes, csat: t.csat, reopened_count: t.reopened_count,
        asset_id: t.asset_id, problem_id: t.problem_id, change_id: t.change_id, parent_ticket_id: t.parent_ticket_id, request_id: t.request_id,
        catalog_item_id: t.catalog_item_id, created_by: t.created_by, created_at: t.created_at, updated_at: t.updated_at,
      };
    });
}

/** Resolution policy minutes per priority (for the "at risk" band). */
async function policyMinutes() {
  return new Map((await find('priorities', {}, { projection: { id: 1, resolution_minutes: 1 } })).map((p) => [p.id, p.resolution_minutes]));
}

// Quick views: a MongoDB filter, plus a check in code for the SLA-based ones.
const RUNNING = { status: { $in: OPEN_STATUSES.filter((s) => s !== 'Awaiting approval') }, paused_at: null };
export const QUICK = {
  open: { filter: () => ({ status: { $in: OPEN_STATUSES } }) },
  mine: { filter: (me) => ({ status: { $in: OPEN_STATUSES }, assigned_to: me }) },
  unassigned: { filter: () => ({ status: { $in: OPEN_STATUSES, $ne: 'Awaiting approval' }, assigned_to: null }) },
  breached: { filter: () => RUNNING, check: (t) => isBreached(t) },
  risk: { filter: () => RUNNING, check: (t, policy) => isRisk(t, policy.get(t.priority)) },
  onhold: { filter: () => ({ status: 'On Hold' }) },
  resolved: { filter: () => ({ status: { $in: ['Resolved', 'Closed'] } }) },
  all: { filter: () => ({}) },
};

/** MongoDB filter from validated filters (without the quick view). */
async function baseFilter(f, user) {
  const and = [{ deleted_at: null }];
  if (!user.isStaff || !user.can('ticket:view_all')) and.push({ requester_id: user.personId || -1 });
  if (f.kind) and.push({ kind: f.kind });
  if (f.status?.length) and.push({ status: { $in: f.status } });
  if (f.priority?.length) and.push({ priority: { $in: f.priority.map(Number) } });
  if (f.teamId) and.push({ team_id: f.teamId });
  if (f.assignee === 'none') and.push({ assigned_to: null });
  else if (f.assignee === 'me') and.push({ assigned_to: user.id });
  else if (f.assignee) and.push({ assigned_to: Number(f.assignee) });
  if (f.customerId) and.push({ customer_id: f.customerId });
  if (f.categoryId) and.push({ category_id: f.categoryId });
  if (f.problemId) and.push({ problem_id: f.problemId });
  if (f.assetId) and.push({ asset_id: f.assetId });
  if (f.requestId) and.push({ request_id: f.requestId });
  if (f.withoutProblem) and.push({ problem_id: null });
  if (f.dateFrom) and.push({ created_at: { $gte: toDateValue(f.dateFrom) } });
  if (f.dateTo) and.push({ created_at: { $lt: toDateValue(f.dateTo) } });
  if (f.search) {
    const s = like(f.search);
    const [people, customers] = await Promise.all([distinct('people', 'id', { name: s }), distinct('customers', 'id', { name: s })]);
    and.push({ $or: [{ ticket_number: s }, { title: s }, { requester_id: { $in: people } }, { customer_id: { $in: customers } }] });
  }
  return and;
}

/** Filter for a list: { filter, check } where check (optional) is applied in code. */
async function buildQuery(f, user) {
  const and = await baseFilter(f, user);
  const q = f.quick && QUICK[f.quick];
  if (q) and.push(q.filter(user.id));
  return { filter: { $and: and }, check: q?.check };
}

const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? -1 : b == null ? 1
  : typeof a === 'string' ? a.localeCompare(b, 'en', { sensitivity: 'base' }) : a < b ? -1 : a > b ? 1 : 0);

// Sorts on ticket fields run in MongoDB; the others are computed.
const DB_SORTS = { created: 'created_at', created_at: 'created_at', title: 'title', priority: 'priority', updated: 'updated_at', updated_at: 'updated_at', number: 'id' };
const CODE_SORTS = {
  cust: (t, x) => x.customers.get(t.customer_id)?.name ?? null,
  customer: (t, x) => x.customers.get(t.customer_id)?.name ?? null,
  status: (t) => STATUS_ORDER.indexOf(t.status) + 1,
  assignee: (t, x) => x.users.get(t.assigned_to)?.name ?? '~',
  sla: (t) => slaLeftSeconds(t),
};

async function sortedPage(filter, check, sortBy, sortOrder, { limit, offset }) {
  const dir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;
  const sortKey = DB_SORTS[sortBy] || (CODE_SORTS[sortBy] ? null : 'created_at');
  if (sortKey && !check) {
    const sort = sortKey === 'id' ? { id: dir } : { [sortKey]: dir, id: -1 };
    const docs = await find('tickets', filter, { sort, skip: offset, limit });
    return { rows: await rowsFor(docs), total: await count('tickets', filter) };
  }
  let docs = await find('tickets', filter);
  if (check) { const policy = await policyMinutes(); docs = docs.filter((t) => check(t, policy)); }
  if (sortKey) docs.sort((a, b) => dir * cmp(a[sortKey], b[sortKey]) || b.id - a.id);
  else {
    const extra = {
      customers: await mapBy('customers', docs.map((t) => t.customer_id), { projection: { name: 1 } }),
      users: await mapBy('users', docs.map((t) => t.assigned_to), { projection: { name: 1 } }),
    };
    const key = CODE_SORTS[sortBy];
    docs.sort((a, b) => dir * cmp(key(a, extra), key(b, extra)) || b.id - a.id);
  }
  return { rows: await rowsFor(docs.slice(offset, offset + limit)), total: docs.length };
}

export async function list(f, user, page) {
  const { filter, check } = await buildQuery(f, user);
  return sortedPage(filter, check, f.sortBy, f.sortOrder, page);
}

/** All rows for exports (bounded). */
export async function listAll(f, user, max = 20000) {
  const { filter, check } = await buildQuery(f, user);
  return (await sortedPage(filter, check, f.sortBy, f.sortOrder, { limit: max, offset: 0 })).rows;
}

/** Counts per quick view, within the user's scope and the non-quick filters. */
export async function quickCounts(f, user) {
  const and = await baseFilter({ ...f, quick: undefined }, user);
  const policy = await policyMinutes();
  const entries = await Promise.all(Object.entries(QUICK).map(async ([k, q]) => {
    const filter = { $and: [...and, q.filter(user.id)] };
    if (!q.check) return [k, await count('tickets', filter)];
    const docs = await find('tickets', filter, {
      projection: { status: 1, priority: 1, paused_at: 1, paused_seconds: 1, first_response_at: 1, sla_response_due_at: 1, sla_resolution_due_at: 1 },
    });
    return [k, docs.filter((t) => q.check(t, policy)).length];
  }));
  return Object.fromEntries(entries);
}

export async function boardColumn(f, user, status, limit = 20) {
  const { filter, check } = await buildQuery({ ...f, status: [status] }, user);
  let docs = await find('tickets', filter);
  if (check) { const policy = await policyMinutes(); docs = docs.filter((t) => check(t, policy)); }
  docs.sort((a, b) => slaLeftSeconds(a) - slaLeftSeconds(b) || b.id - a.id);
  return { rows: await rowsFor(docs.slice(0, limit)), total: docs.length };
}

const one = async (filter, conn) => (await rowsFor(await find('tickets', filter, {}, conn), conn))[0] || null;
export const findByNumber = (number, conn) => one({ ticket_number: number, deleted_at: null }, conn);
export const findById = (id, conn) => one({ id, deleted_at: null }, conn);

/** Read the ticket inside the transaction (MongoDB detects conflicting writes). */
export const lockById = (id, conn) => findOne('tickets', { id }, { projection: { id: 1 } }, conn);

export function insert(t, conn) {
  const now = new Date();
  return insertOne('tickets', {
    ticket_number: t.number, kind: t.kind, title: t.title, description: t.description || null, customer_id: t.customerId, requester_id: t.requesterId,
    category_id: t.categoryId, team_id: t.teamId ?? null, assigned_to: t.assignedTo || null, channel: t.channel, impact: t.impact, urgency: t.urgency,
    priority: t.priority, status: t.status, sla_response_due_at: t.slaResponseDueAt, sla_resolution_due_at: t.slaResolutionDueAt,
    asset_id: t.assetId || null, problem_id: t.problemId || null, parent_ticket_id: t.parentId || null, request_id: t.requestId || null,
    catalog_item_id: t.catalogItemId || null, created_by: t.createdBy || null, created_at: now, updated_at: now,
  }, conn);
}

const UPDATABLE = new Set([
  'title', 'description', 'team_id', 'assigned_to', 'category_id', 'impact', 'urgency', 'priority', 'status', 'hold_reason', 'is_major',
  'sla_response_due_at', 'sla_resolution_due_at', 'paused_at', 'paused_seconds', 'first_response_at', 'resolved_at', 'closed_at', 'resolution_code',
  'resolution_notes', 'csat', 'reopened_count', 'asset_id', 'problem_id', 'change_id',
]);

/** Update whitelisted fields and bump updated_at. */
export async function update(id, fields, conn) {
  for (const k of Object.keys(fields)) if (!UPDATABLE.has(k)) throw new Error(`Column ${k} cannot be updated`);
  await updateOne('tickets', { id }, { $set: { ...fields, updated_at: new Date() } }, conn);
}

export const touch = (id, conn) => updateOne('tickets', { id }, { $set: { updated_at: new Date() } }, conn);
export const softDelete = (id, conn) => updateOne('tickets', { id }, { $set: { deleted_at: new Date() } }, conn);

// ---------- timeline ----------
export const addActivity = (ticketId, userId, body, conn) => insertOne('ticket_activities', { ticket_id: ticketId, user_id: userId || null, body }, conn);

export const addComment = (ticketId, userId, type, body, conn) => insertOne('ticket_comments', { ticket_id: ticketId, user_id: userId, type, body }, conn);

export async function addHistory(ticketId, userId, changes, conn) {
  const rows = Object.entries(changes).filter(([, v]) => String(v[0] ?? '') !== String(v[1] ?? ''));
  if (!rows.length) return;
  await insertMany('ticket_history', rows.map(([field, [o, n]]) => ({
    ticket_id: ticketId, field, old_value: o == null ? null : String(o), new_value: n == null ? null : String(n), changed_by: userId || null,
  })), conn);
}

async function withUserNames(rows, field = 'user_id') {
  const users = await mapBy('users', rows.map((r) => r[field]), { projection: { name: 1 } });
  for (const r of rows) r.user_name = users.get(r[field])?.name ?? null;
  return rows;
}

export async function timeline(ticketId, { includeNotes }) {
  const comments = await withUserNames(await find(
    'ticket_comments',
    { ticket_id: ticketId, ...(includeNotes ? {} : { type: 'comment' }) },
    { sort: { id: 1 }, projection: { id: 1, type: 1, body: 1, created_at: 1, user_id: 1 } },
  ));
  const activities = (await withUserNames(await find(
    'ticket_activities',
    { ticket_id: ticketId },
    { sort: { id: 1 }, projection: { id: 1, body: 1, created_at: 1, user_id: 1 } },
  ))).map((a) => ({ id: a.id, type: 'system', body: a.body, created_at: a.created_at, user_id: a.user_id, user_name: a.user_name }));
  return { comments, activities };
}

export async function history(ticketId) {
  const rows = await find('ticket_history', { ticket_id: ticketId }, {
    sort: { changed_at: -1, id: -1 }, limit: 200, projection: { id: 1, field: 1, old_value: 1, new_value: 1, changed_at: 1, changed_by: 1 },
  });
  await withUserNames(rows, 'changed_by');
  return rows.map(({ changed_by, ...r }) => r); // eslint-disable-line camelcase, no-unused-vars
}

// ---------- tags ----------
export const tags = async (ticketId, conn) => (await find('ticket_tags', { ticket_id: ticketId }, { sort: { tag: 1 } }, conn)).map((r) => r.tag);
export async function setTags(ticketId, list, conn) {
  await deleteMany('ticket_tags', { ticket_id: ticketId }, conn);
  await insertMany('ticket_tags', list.map((t) => ({ ticket_id: ticketId, tag: t })), conn);
}

// ---------- related ----------
export const children = (ticketId) => find('tickets', { parent_ticket_id: ticketId, deleted_at: null }, { sort: { id: 1 }, projection: { id: 1, ticket_number: 1, title: 1, status: 1 } });
export const numberById = async (id, conn) => (await findOne('tickets', { id }, { projection: { ticket_number: 1 } }, conn))?.ticket_number || null;

export async function formValues(ticketId) {
  const items = await find('request_items', { ticket_id: ticketId }, { projection: { id: 1 } });
  return find('request_item_values', { request_item_id: { $in: items.map((i) => i.id) } }, {
    sort: { sort_order: 1, id: 1 }, projection: { field_key: 1, label: 1, value: 1 },
  });
}

export const similarWithoutProblem = (title, excludeId) => find('tickets', {
  title, id: { $ne: excludeId }, problem_id: null, kind: 'incident', deleted_at: null,
}, { projection: { id: 1, ticket_number: 1 } });

/** Open incidents that could be declared a major incident or linked to a problem. */
export function candidates({ openOnly = true, withoutProblem = false, notMajor = false, notClosed = false, limit = 80 }) {
  const and = [{ kind: 'incident', deleted_at: null }];
  if (openOnly) and.push({ status: { $in: OPEN_STATUSES } });
  if (withoutProblem) and.push({ problem_id: null });
  if (notMajor) and.push({ is_major: 0 });
  if (notClosed) and.push({ status: { $ne: 'Closed' } });
  return find('tickets', { $and: and }, {
    sort: notMajor ? { priority: 1, created_at: -1 } : { created_at: -1 }, limit, projection: { id: 1, ticket_number: 1, title: 1, priority: 1 },
  });
}

export const resolvedOlderThan = (days, conn) => find('tickets', {
  status: 'Resolved', resolved_at: { $lt: new Date(Date.now() - days * DAY) }, deleted_at: null,
}, { limit: 500, projection: { id: 1, ticket_number: 1 } }, conn);

async function assignedWhere(check) {
  const docs = await find('tickets', { ...RUNNING, deleted_at: null, assigned_to: { $ne: null } });
  const policy = await policyMinutes();
  return docs.filter((t) => policy.has(t.priority) && check(t, policy)).slice(0, 500)
    .map((t) => ({ id: t.id, ticket_number: t.ticket_number, title: t.title, assigned_to: t.assigned_to }));
}
export const breachedAssigned = () => assignedWhere(QUICK.breached.check);
export const riskAssigned = () => assignedWhere(QUICK.risk.check);
