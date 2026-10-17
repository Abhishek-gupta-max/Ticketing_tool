import { insertOne, insertMany, find, findOne, updateOne, deleteMany, mapBy, attach, like } from '../config/database.js';
import { DAY } from '../utils/time.js';

const CLOSED = ['Closed', 'Canceled'];

const FIELDS = {
  id: 1, change_number: 1, title: 1, type: 1, status: 1, owner_id: 1, customer_id: 1, problem_id: 1, planned_start: 1, planned_end: 1, impact: 1,
  urgency: 1, risk: 1, risk_scope: 1, risk_downtime: 1, risk_tested: 1, risk_backout: 1, description: 1, implementation_plan: 1, backout_plan: 1,
  test_plan: 1, close_code: 1, close_notes: 1, created_at: 1, updated_at: 1,
};

function approvalSummary(change, approvals) {
  const a = approvals.filter((x) => x.status !== 'Cancelled');
  if (a.some((x) => x.status === 'Rejected')) return 'Rejected';
  if (a.length > 0 && a.every((x) => x.status === 'Approved')) return 'Approved';
  if (a.some((x) => x.status !== 'Pending') || change.status === 'Approval') return 'Requested';
  return 'Not yet requested';
}

/** Owner, customer, problem number and approval summary (former JOINs and subquery). */
async function enrich(rows, conn) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  if (!list.length) return rows;
  await attach(list, 'users', 'owner_id', { owner_name: 'name' }, { conn });
  await attach(list, 'customers', 'customer_id', { customer_name: 'name' }, { conn });
  await attach(list, 'problems', 'problem_id', { problem_number: 'problem_number' }, { conn });
  const approvals = await find('approvals', { change_id: { $in: list.map((c) => c.id) } }, { projection: { change_id: 1, status: 1 } }, conn);
  for (const c of list) c.approval_summary = approvalSummary(c, approvals.filter((a) => a.change_id === c.id));
  return rows;
}

const VIEWS = {
  active: { status: { $nin: CLOSED } },
  Approval: { status: 'Approval' },
  Closed: { status: 'Closed' },
  all: {},
};

export async function list({ view = 'active', from, to, search, problemId }) {
  const w = { deleted_at: null, ...(VIEWS[view] || VIEWS.active) };
  if (from || to) w.planned_start = { ...(from && { $gte: new Date(from) }), ...(to && { $lt: new Date(to) }) };
  if (problemId) w.problem_id = problemId;
  if (search) w.$or = [{ change_number: like(search) }, { title: like(search) }];
  const dir = view === 'Closed' || view === 'all' ? -1 : 1;
  return enrich(await find('changes', w, { sort: { planned_start: dir }, limit: 500, projection: FIELDS }));
}

export async function kpis() {
  const rows = await find('changes', { deleted_at: null }, { projection: { status: 1, type: 1, planned_start: 1, planned_end: 1, close_code: 1 } });
  const now = Date.now();
  const recentClosed = (c) => c.status === 'Closed' && c.close_code != null && c.planned_end > new Date(now - 90 * DAY);
  return {
    next7: rows.filter((c) => ['Scheduled', 'Doing', 'Approval'].includes(c.status) && c.planned_start > new Date(now - DAY) && c.planned_start < new Date(now + 7 * DAY)).length,
    awaiting: rows.filter((c) => c.status === 'Approval').length,
    closed90: rows.filter(recentClosed).length,
    ok90: rows.filter((c) => recentClosed(c) && c.close_code !== 'Did not work').length,
    emergency: rows.filter((c) => c.type === 'Emergency').length,
  };
}

/** Active changes that overlap in time and share at least one asset: [{ change_id, other_id, other_number }]. */
async function overlaps(onlyId, conn) {
  const active = await find('changes', { status: { $nin: CLOSED }, deleted_at: null }, { projection: { id: 1, change_number: 1, planned_start: 1, planned_end: 1 } }, conn);
  const links = await find('change_assets', { change_id: { $in: active.map((c) => c.id) } }, {}, conn);
  const assetsOf = new Map(active.map((c) => [c.id, new Set(links.filter((l) => l.change_id === c.id).map((l) => l.asset_id))]));
  const pairs = [];
  for (const a of active) {
    if (onlyId != null && a.id !== onlyId) continue;
    for (const b of active) {
      if (b.id === a.id || !(b.planned_start < a.planned_end && a.planned_start < b.planned_end)) continue;
      if ([...assetsOf.get(a.id)].some((x) => assetsOf.get(b.id).has(x))) pairs.push({ change_id: a.id, other_id: b.id, other_number: b.change_number });
    }
  }
  return pairs;
}

export const conflictPairs = () => overlaps(null);
export const conflictsFor = async (id, conn) => (await overlaps(id, conn)).map((p) => ({ id: p.other_id, change_number: p.other_number }));

export const findByNumber = async (n, conn) => enrich(await findOne('changes', { change_number: n, deleted_at: null }, { projection: FIELDS }, conn), conn);
export const findById = async (id, conn) => enrich(await findOne('changes', { id, deleted_at: null }, { projection: FIELDS }, conn), conn);
export const lockById = (id, conn) => findOne('changes', { id }, { projection: { id: 1 } }, conn);

const COLS = ['title', 'type', 'owner_id', 'customer_id', 'problem_id', 'planned_start', 'planned_end', 'impact', 'urgency', 'risk', 'risk_scope',
  'risk_downtime', 'risk_tested', 'risk_backout', 'description', 'implementation_plan', 'backout_plan', 'test_plan'];

const toDate = (v) => (v == null || v instanceof Date ? v : new Date(v));

export const insert = (number, c, userId, conn) => insertOne('changes', {
  change_number: number, status: 'Draft',
  ...Object.fromEntries(COLS.map((k) => [k, c[k] ?? null]).filter(([, v]) => v !== null)),
  planned_start: toDate(c.planned_start), planned_end: toDate(c.planned_end), created_by: userId || null,
}, conn);

const UPDATABLE = [...COLS, 'status', 'close_code', 'close_notes'];
export async function update(id, fields, conn) {
  const keys = Object.keys(fields);
  keys.forEach((k) => { if (!UPDATABLE.includes(k)) throw new Error(`Column ${k} cannot be updated`); });
  if (!keys.length) return;
  const set = { ...fields };
  for (const k of ['planned_start', 'planned_end']) if (k in set) set[k] = toDate(set[k]);
  await updateOne('changes', { id }, set, conn);
}

export const touch = (id, conn) => updateOne('changes', { id }, {}, conn);

export async function assets(id, conn) {
  const links = await find('change_assets', { change_id: id }, {}, conn);
  const rows = await find('assets', { id: { $in: links.map((l) => l.asset_id) } }, { sort: { name: 1 }, projection: { id: 1, asset_tag: 1, name: 1, asset_type_id: 1 } }, conn);
  await attach(rows, 'asset_types', 'asset_type_id', { type_name: 'name' }, { conn });
  return rows.map(({ asset_type_id, ...r }) => r); // eslint-disable-line no-unused-vars, camelcase
}

export async function setAssets(id, ids, conn) {
  await deleteMany('change_assets', { change_id: id }, conn);
  await insertMany('change_assets', [...new Set(ids)].map((a) => ({ change_id: id, asset_id: a })), conn);
}

export const linkedTickets = (id) => find('tickets', { change_id: id, deleted_at: null }, { sort: { id: 1 }, projection: { id: 1, ticket_number: 1, title: 1, status: 1 } });

export const upcoming = (limit = 5) => find('changes', {
  deleted_at: null, status: { $in: ['Scheduled', 'Approval', 'Doing', 'Verify'] }, planned_start: { $lt: new Date(Date.now() + 7 * DAY) },
}, { sort: { planned_start: 1 }, limit, projection: { id: 1, change_number: 1, title: 1, type: 1, status: 1, planned_start: 1 } });

export const byProblem = (problemId) => find('changes', { problem_id: problemId, deleted_at: null }, { sort: { id: 1 }, projection: { id: 1, change_number: 1, title: 1, status: 1 } });

/** Users by id (helper used by the change service). */
export const usersById = (ids) => mapBy('users', ids, { projection: { name: 1 } });
