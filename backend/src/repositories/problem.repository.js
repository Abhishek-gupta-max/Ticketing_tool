import { OPEN_STATUSES } from '../constants/workflow.js';
import { insertOne, find, findOne, updateOne, count, aggregate, attach, like } from '../config/database.js';
import { DAY, HOUR } from '../utils/time.js';

const OPEN = ['Logged', 'Investigating', 'Finding cause', 'Fix underway'];

const FIELDS = {
  id: 1, problem_number: 1, title: 1, status: 1, priority: 1, owner_id: 1, team_id: 1, customer_id: 1, root_cause: 1, workaround: 1,
  is_known_error: 1, resolution_code: 1, fix_notes: 1, resolved_at: 1, created_at: 1, updated_at: 1,
};

/** Owner name and linked incident counts (former JOIN and subqueries). */
async function enrich(rows, conn) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  if (!list.length) return rows;
  await attach(list, 'users', 'owner_id', { owner_name: 'name' }, { conn });
  const counts = await aggregate('tickets', [
    { $match: { problem_id: { $in: list.map((p) => p.id) }, deleted_at: null } },
    { $group: { _id: '$problem_id', n: { $sum: 1 }, open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] } } } },
  ], conn);
  const byId = new Map(counts.map((c) => [c._id, c]));
  for (const p of list) {
    p.incident_count = byId.get(p.id)?.n || 0;
    p.open_incident_count = byId.get(p.id)?.open || 0;
  }
  return rows;
}

const FILTERS = {
  open: { status: { $in: OPEN } },
  known: { status: { $in: OPEN }, is_known_error: 1 },
  resolved: { status: { $nin: OPEN } },
  all: {},
};

export async function list({ view = 'open', search }) {
  const w = { deleted_at: null, ...(FILTERS[view] || FILTERS.open) };
  if (search) w.$or = [{ problem_number: like(search) }, { title: like(search) }];
  return enrich(await find('problems', w, { sort: { created_at: -1 }, projection: FIELDS }));
}

export async function kpis() {
  const open = await find('problems', { deleted_at: null, status: { $in: OPEN } }, { projection: { is_known_error: 1, created_at: 1 } });
  const now = Date.now();
  return {
    open_count: open.length,
    known: open.filter((p) => p.is_known_error === 1).length,
    // TIMESTAMPDIFF(HOUR, ...) / 24: whole hours, then days
    avg_age_days: open.length ? open.reduce((s, p) => s + Math.trunc((now - p.created_at.getTime()) / HOUR) / 24, 0) / open.length : null,
    linked_open: await count('tickets', { problem_id: { $ne: null }, deleted_at: null, status: { $in: OPEN_STATUSES } }),
  };
}

export const findByNumber = async (n, conn) => enrich(await findOne('problems', { problem_number: n, deleted_at: null }, { projection: FIELDS }, conn), conn);
export const findById = async (id, conn) => enrich(await findOne('problems', { id, deleted_at: null }, { projection: FIELDS }, conn), conn);
export const lockById = (id, conn) => findOne('problems', { id }, { projection: { id: 1 } }, conn);

export const insert = (p, conn) => insertOne('problems', {
  problem_number: p.number, title: p.title, status: 'Logged', priority: p.priority, owner_id: p.ownerId || null, team_id: p.teamId || null,
  customer_id: p.customerId || null, root_cause: p.rootCause || '', workaround: p.workaround || '', created_by: p.createdBy || null,
}, conn);

const UPDATABLE = ['title', 'status', 'priority', 'owner_id', 'root_cause', 'workaround', 'is_known_error', 'resolution_code', 'fix_notes', 'resolved_at'];
export async function update(id, fields, conn) {
  const keys = Object.keys(fields);
  keys.forEach((k) => { if (!UPDATABLE.includes(k)) throw new Error(`Column ${k} cannot be updated`); });
  if (!keys.length) return;
  await updateOne('problems', { id }, fields, conn);
}

export const openOptions = () => find('problems', { deleted_at: null, status: { $in: OPEN } }, { sort: { id: -1 }, projection: { id: 1, problem_number: 1, title: 1 } });

/** The same incident title raised 4+ times in 30 days with no problem linked. */
export async function suggestions() {
  const rows = await aggregate('tickets', [
    { $match: { kind: 'incident', problem_id: null, deleted_at: null, created_at: { $gt: new Date(Date.now() - 30 * DAY) } } },
    { $lookup: { from: 'ticket_categories', localField: 'category_id', foreignField: 'id', as: 'cat' } },
    { $unwind: '$cat' },
    { $group: { _id: '$title', n: { $sum: 1 }, priority: { $min: '$priority' }, category: { $max: '$cat.name' } } },
    { $match: { n: { $gte: 4 } } },
    { $sort: { n: -1 } },
    { $limit: 4 },
  ]);
  return rows.map((r) => ({ title: r._id, n: r.n, priority: r.priority, category: r.category }));
}
