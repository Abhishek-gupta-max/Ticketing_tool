import { insertOne, find, findOne, updateOne, updateMany, count, mapBy, distinct, like } from '../config/database.js';
import { DAY } from '../utils/time.js';

const CLOSED = ['Done', 'Not done', 'Not needed'];
const isClosed = (s) => CLOSED.includes(s.state);
const PARENT_COL = { ticket: 'ticket_id', problem: 'problem_id', change: 'change_id' };

/** Task rows with assignee, team and parent record (former TASK_SELECT). */
async function enrich(tasks, conn) {
  if (!tasks.length) return [];
  const [users, teams, tickets, problems, changes] = await Promise.all([
    mapBy('users', tasks.map((s) => s.assigned_to), { projection: { name: 1 }, conn }),
    mapBy('teams', tasks.map((s) => s.team_id), { projection: { name: 1 }, conn }),
    mapBy('tickets', tasks.map((s) => s.ticket_id), { projection: { ticket_number: 1, title: 1, status: 1 }, conn }),
    mapBy('problems', tasks.map((s) => s.problem_id), { projection: { problem_number: 1, title: 1, status: 1 }, conn }),
    mapBy('changes', tasks.map((s) => s.change_id), { projection: { change_number: 1, title: 1, status: 1 }, conn }),
  ]);
  return tasks.map((s) => {
    const tk = tickets.get(s.ticket_id), pb = problems.get(s.problem_id), ch = changes.get(s.change_id);
    return {
      id: s.id, task_number: s.task_number, type: s.type, ticket_id: s.ticket_id, problem_id: s.problem_id, change_id: s.change_id, title: s.title,
      description: s.description, state: s.state, priority: s.priority, assigned_to: s.assigned_to, assignee_name: users.get(s.assigned_to)?.name ?? null,
      team_id: s.team_id, team_name: teams.get(s.team_id)?.name ?? null, due_at: s.due_at, sort_order: s.sort_order, is_sequential: s.is_sequential,
      closed_at: s.closed_at, close_notes: s.close_notes, created_at: s.created_at, updated_at: s.updated_at,
      parent_number: tk?.ticket_number ?? pb?.problem_number ?? ch?.change_number ?? null,
      parent_title: tk?.title ?? pb?.title ?? ch?.title ?? null,
      parent_status: tk?.status ?? pb?.status ?? ch?.status ?? null,
      parent_type: s.ticket_id != null ? 'ticket' : s.problem_id != null ? 'problem' : s.change_id != null ? 'change' : null,
    };
  });
}

export const QUICK = {
  mine: (me) => ({ assigned_to: me, state: { $nin: CLOSED } }),
  open: () => ({ state: { $nin: CLOSED } }),
  overdue: () => ({ state: { $nin: CLOSED }, due_at: { $ne: null, $lt: new Date() } }),
  unassigned: () => ({ state: { $nin: CLOSED }, assigned_to: null }),
  closed: () => ({ state: { $in: CLOSED } }),
  all: () => ({}),
};

async function buildFilter(f, user) {
  const and = [];
  if (f.quick && QUICK[f.quick]) and.push(QUICK[f.quick](user.id));
  if (f.type) and.push({ type: f.type });
  if (f.teamId) and.push({ team_id: f.teamId });
  if (f.assignee === 'none') and.push({ assigned_to: null });
  else if (f.assignee) and.push({ assigned_to: Number(f.assignee) });
  if (f.state) and.push({ state: f.state });
  if (f.search) {
    const s = like(f.search);
    const [tk, pb, ch] = await Promise.all([
      distinct('tickets', 'id', { ticket_number: s }), distinct('problems', 'id', { problem_number: s }), distinct('changes', 'id', { change_number: s }),
    ]);
    and.push({ $or: [{ task_number: s }, { title: s }, { ticket_id: { $in: tk } }, { problem_id: { $in: pb } }, { change_id: { $in: ch } }] });
  }
  return and.length ? { $and: and } : {};
}

const FAR = new Date('9999-12-31T00:00:00Z').getTime();
const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? -1 : b == null ? 1
  : typeof a === 'string' ? a.localeCompare(b, 'en', { sensitivity: 'base' }) : a < b ? -1 : a > b ? 1 : 0);
const SORTS = { created: (s) => s.created_at, number: (s) => s.id, priority: (s) => s.priority, state: (s) => s.state, title: (s) => s.title };
// Default order: open first, then by due date (no due date last), then id.
const byDue = (a, b) => (isClosed(a) - isClosed(b)) || ((a.due_at?.getTime() ?? FAR) - (b.due_at?.getTime() ?? FAR)) || a.id - b.id;

export async function list(f, user, { limit, offset }) {
  const tasks = await find('tasks', await buildFilter(f, user));
  if (f.sortBy && SORTS[f.sortBy] && f.sortBy !== 'due') {
    const key = SORTS[f.sortBy], dir = String(f.sortOrder).toUpperCase() === 'ASC' ? 1 : -1;
    tasks.sort((a, b) => dir * cmp(key(a), key(b)) || a.id - b.id);
  } else tasks.sort(byDue);
  return { rows: await enrich(tasks.slice(offset, offset + limit)), total: tasks.length };
}

export async function quickCounts(user) {
  const entries = await Promise.all(Object.entries(QUICK).map(async ([k, q]) => [k, await count('tasks', q(user.id))]));
  return Object.fromEntries(entries);
}

export async function kpis(userId) {
  const tasks = await find('tasks', {}, { projection: { state: 1, assigned_to: 1, due_at: 1, closed_at: 1 } });
  const now = new Date(), weekAgo = new Date(Date.now() - 7 * DAY);
  const open = tasks.filter((s) => !isClosed(s));
  return {
    open_count: open.length,
    waiting: tasks.filter((s) => s.state === 'Waiting').length,
    mine: open.filter((s) => s.assigned_to === userId).length,
    overdue: open.filter((s) => s.due_at != null && s.due_at < now).length,
    unassigned: open.filter((s) => s.assigned_to == null).length,
    closed_week: tasks.filter((s) => s.closed_at != null && s.closed_at > weekAgo).length,
  };
}

const one = async (filter, conn) => (await enrich(await find('tasks', filter, {}, conn), conn))[0] || null;
export const findByNumber = (number, conn) => one({ task_number: number }, conn);
export const findById = (id, conn) => one({ id }, conn);
export const lockById = (id, conn) => findOne('tasks', { id }, { projection: { id: 1 } }, conn);

export const byParent = async (parentType, parentId, conn) => enrich(await find('tasks', { [PARENT_COL[parentType]]: parentId }, { sort: { sort_order: 1, id: 1 } }, conn), conn);

export const byTickets = async (ticketIds) => (ticketIds.length
  ? enrich(await find('tasks', { ticket_id: { $in: ticketIds } }, { sort: { ticket_id: 1, sort_order: 1 } }))
  : []);

export const openCount = (parentType, parentId, conn) => count('tasks', { [PARENT_COL[parentType]]: parentId, state: { $nin: CLOSED } }, conn);
export const countByParent = (parentType, parentId, conn) => count('tasks', { [PARENT_COL[parentType]]: parentId }, conn);

export const insert = (t, conn) => insertOne('tasks', {
  task_number: t.number, type: t.type, ticket_id: t.ticketId || null, problem_id: t.problemId || null, change_id: t.changeId || null, title: t.title,
  description: t.description || null, state: t.state, priority: t.priority, assigned_to: t.assignedTo || null, team_id: t.teamId || null,
  due_at: t.dueAt || null, sort_order: t.sortOrder || 0, is_sequential: t.isSequential ? 1 : 0, created_by: t.createdBy || null,
}, conn);

const UPDATABLE = ['state', 'priority', 'assigned_to', 'team_id', 'due_at', 'closed_at', 'close_notes', 'title', 'description'];
export async function update(id, fields, conn) {
  const keys = Object.keys(fields);
  keys.forEach((k) => { if (!UPDATABLE.includes(k)) throw new Error(`Column ${k} cannot be updated`); });
  if (!keys.length) return;
  await updateOne('tasks', { id }, fields, conn);
}

/** Next waiting step of a sequential task list. */
export const nextWaiting = (parentType, parentId, afterOrder, conn) => findOne(
  'tasks', { [PARENT_COL[parentType]]: parentId, sort_order: { $gt: afterOrder }, state: 'Waiting' }, { sort: { sort_order: 1 }, projection: { id: 1 } }, conn,
);

export const previousOpenStep = (parentType, parentId, beforeOrder) => findOne(
  'tasks', { [PARENT_COL[parentType]]: parentId, sort_order: { $lt: beforeOrder }, state: { $nin: CLOSED } },
  { sort: { sort_order: -1 }, projection: { task_number: 1, title: 1 } },
);

/** Give unassigned open tasks of a ticket to the new assignee. */
export const assignOpenUnassigned = (ticketId, userId, conn) => updateMany(
  'tasks', { ticket_id: ticketId, assigned_to: null, state: { $nin: CLOSED } }, { assigned_to: userId }, conn,
);

export async function myOpen(userId, limit = 6) {
  const tasks = await find('tasks', { assigned_to: userId, state: { $nin: [...CLOSED, 'Waiting'] } });
  tasks.sort((a, b) => (a.due_at?.getTime() ?? FAR) - (b.due_at?.getTime() ?? FAR));
  return enrich(tasks.slice(0, limit));
}

export const overdueAssigned = () => find(
  'tasks', { state: { $nin: CLOSED }, assigned_to: { $ne: null }, due_at: { $lt: new Date() } },
  { limit: 500, projection: { id: 1, task_number: 1, title: 1, assigned_to: 1 } },
);
