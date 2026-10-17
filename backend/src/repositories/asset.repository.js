import { OPEN_STATUSES } from '../constants/workflow.js';
import {
  insertOne, insertMany, find, findOne, updateOne, deleteMany, aggregate, mapBy, distinct, like, equalsCi,
} from '../config/database.js';
import { DAY } from '../utils/time.js';

const COLS = ['name', 'asset_type_id', 'criticality', 'status', 'environment', 'customer_id', 'department', 'location', 'serial_number', 'platform',
  'purchase_date', 'warranty_end', 'assigned_person_id', 'owner_person_id', 'managed_by', 'support_team_id', 'notes'];

// "Owner" follows the legacy rule: subscriptions -> owner, personal devices -> user then owner, others -> owner.
const ownerId = (a, ty) => (ty.is_subscription === 1 ? a.owner_person_id
  : ty.is_personal_device === 1 ? a.assigned_person_id ?? a.owner_person_id : a.owner_person_id);

/** Asset rows with type, customer, people, manager, team and open ticket count (former ASSET_SELECT). */
async function enrich(assets, conn) {
  if (!assets.length) return [];
  const [types, customers, people, users, teams, open] = await Promise.all([
    mapBy('asset_types', assets.map((a) => a.asset_type_id), { conn }),
    mapBy('customers', assets.map((a) => a.customer_id), { projection: { name: 1, is_internal: 1 }, conn }),
    mapBy('people', assets.flatMap((a) => [a.assigned_person_id, a.owner_person_id]), { projection: { name: 1, job_title: 1, department: 1 }, conn }),
    mapBy('users', assets.map((a) => a.managed_by), { projection: { name: 1 }, conn }),
    mapBy('teams', assets.map((a) => a.support_team_id), { projection: { name: 1 }, conn }),
    aggregate('tickets', [
      { $match: { asset_id: { $in: assets.map((a) => a.id) }, deleted_at: null, status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$asset_id', n: { $sum: 1 } } },
    ], conn),
  ]);
  const openBy = new Map(open.map((o) => [o._id, o.n]));
  return assets
    .filter((a) => types.has(a.asset_type_id) && customers.has(a.customer_id))
    .map((a) => {
      const ty = types.get(a.asset_type_id), c = customers.get(a.customer_id);
      const ap = people.get(a.assigned_person_id), op = people.get(a.owner_person_id);
      return {
        id: a.id, asset_tag: a.asset_tag, name: a.name, asset_type_id: a.asset_type_id, type_name: ty.name, type_icon: ty.icon,
        is_subscription: ty.is_subscription, is_personal_device: ty.is_personal_device, criticality: a.criticality, status: a.status,
        environment: a.environment, customer_id: a.customer_id, customer_name: c.name, customer_internal: c.is_internal, department: a.department,
        location: a.location, serial_number: a.serial_number, platform: a.platform, purchase_date: a.purchase_date, warranty_end: a.warranty_end,
        assigned_person_id: a.assigned_person_id, assigned_name: ap?.name ?? null, assigned_title: ap?.job_title ?? null, assigned_dept: ap?.department ?? null,
        owner_person_id: a.owner_person_id, owner_name: op?.name ?? null, owner_title: op?.job_title ?? null, owner_dept: op?.department ?? null,
        managed_by: a.managed_by, managed_by_name: users.get(a.managed_by)?.name ?? null, support_team_id: a.support_team_id,
        support_team_name: teams.get(a.support_team_id)?.name ?? null, notes: a.notes, created_at: a.created_at, updated_at: a.updated_at,
        open_tickets: openBy.get(a.id) || 0,
      };
    });
}

async function buildFilter(f) {
  const w = { deleted_at: null };
  if (f.typeId) w.asset_type_id = f.typeId;
  if (f.criticality) w.criticality = f.criticality;
  if (f.status) w.status = f.status;
  if (f.customerId) w.customer_id = f.customerId;
  if (f.teamId) w.support_team_id = f.teamId;
  const and = [];
  if (f.ownerId) and.push({ $or: [{ assigned_person_id: f.ownerId }, { owner_person_id: f.ownerId }] });
  if (f.search) {
    const s = like(f.search);
    const people = await distinct('people', 'id', { name: s });
    and.push({ $or: [{ asset_tag: s }, { name: s }, { serial_number: s }, { location: s }, { assigned_person_id: { $in: people } }, { owner_person_id: { $in: people } }] });
  }
  if (and.length) w.$and = and;
  return w;
}

const CRITICALITY = ['Low', 'Medium', 'High', 'Critical'];
const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? -1 : b == null ? 1
  : typeof a === 'string' ? a.localeCompare(b, 'en', { sensitivity: 'base' }) : a < b ? -1 : a > b ? 1 : 0);
const SORTS = {
  tag: (r) => r.id, name: (r) => r.name, type: (r) => r.type_name, criticality: (r) => CRITICALITY.indexOf(r.criticality) + 1,
  status: (r) => r.status, warranty: (r) => r.warranty_end, updated: (r) => r.updated_at,
};

export async function list(f, { limit, offset }) {
  const rows = await enrich(await find('assets', await buildFilter(f)));
  const key = SORTS[f.sortBy] || SORTS.tag;
  const dir = String(f.sortOrder || 'ASC').toUpperCase() === 'ASC' ? 1 : -1;
  rows.sort((a, b) => dir * cmp(key(a), key(b)));
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

export async function listAll(f) {
  return enrich(await find('assets', await buildFilter(f), { sort: { id: 1 }, limit: 20000 }));
}

export async function kpis() {
  const assets = await find('assets', { deleted_at: null });
  const types = await mapBy('asset_types', assets.map((a) => a.asset_type_id));
  const withType = assets.filter((a) => types.has(a.asset_type_id));
  const open = new Set(await distinct('tickets', 'asset_id', { asset_id: { $ne: null }, deleted_at: null, status: { $in: OPEN_STATUSES } }));
  const live = withType.filter((a) => a.status !== 'Retired');
  const today = new Date(new Date().toISOString().slice(0, 10));
  return {
    total: withType.length,
    retired: withType.length - live.length,
    critical: live.filter((a) => a.criticality === 'Critical').length,
    without_owner: live.filter((a) => ownerId(a, types.get(a.asset_type_id)) == null).length,
    warranty_expiring: live.filter((a) => types.get(a.asset_type_id).is_subscription === 0 && a.warranty_end != null
      && a.warranty_end < new Date(today.getTime() + 90 * DAY)).length,
    with_open: live.filter((a) => open.has(a.id)).length,
  };
}

const one = async (filter, conn) => (await enrich(await find('assets', filter, {}, conn), conn))[0] || null;
export const findByTag = (tag, conn) => one({ asset_tag: tag, deleted_at: null }, conn);
export const findById = (id, conn) => one({ id, deleted_at: null }, conn);
export const findByName = (name, conn) => findOne('assets', { name: equalsCi(name), deleted_at: null }, { projection: { id: 1 } }, conn);

export async function options() {
  const rows = await find('assets', { deleted_at: null }, { sort: { name: 1 }, projection: { id: 1, asset_tag: 1, name: 1, asset_type_id: 1, status: 1, assigned_person_id: 1 } });
  const types = await mapBy('asset_types', rows.map((a) => a.asset_type_id), { projection: { name: 1 } });
  return rows.filter((a) => types.has(a.asset_type_id)).map((a) => ({
    id: a.id, asset_tag: a.asset_tag, name: a.name, type_name: types.get(a.asset_type_id).name, status: a.status, assigned_person_id: a.assigned_person_id,
  }));
}

export async function owners() {
  const ids = [
    ...await distinct('assets', 'assigned_person_id', { deleted_at: null }),
    ...await distinct('assets', 'owner_person_id', { deleted_at: null }),
  ].filter((x) => x != null);
  return find('people', { id: { $in: [...new Set(ids)] } }, { sort: { name: 1 }, projection: { id: 1, name: 1 } });
}

export const insert = (tag, a, userId, conn) => insertOne('assets', {
  asset_tag: tag,
  ...Object.fromEntries(COLS.map((c) => [c, a[c] ?? null]).filter(([, v]) => v !== null)),
  created_by: userId || null,
}, conn);

export const update = (id, a, conn) => updateOne('assets', { id }, Object.fromEntries(COLS.map((c) => [c, a[c] ?? null])), conn);

export async function softDelete(id, conn) {
  const a = await findOne('assets', { id }, { projection: { name: 1 } }, conn);
  return updateOne('assets', { id }, { deleted_at: new Date(), name: `${a?.name} (deleted ${id})` }, conn);
}

export async function dependsOn(id) {
  const ids = await distinct('asset_dependencies', 'depends_on_asset_id', { asset_id: id });
  return find('assets', { id: { $in: ids }, deleted_at: null }, { sort: { name: 1 }, projection: { id: 1, asset_tag: 1, name: 1, criticality: 1 } });
}
export const dependencyIds = (id) => distinct('asset_dependencies', 'depends_on_asset_id', { asset_id: id });

export async function setDependencies(id, ids, conn) {
  await deleteMany('asset_dependencies', { asset_id: id }, conn);
  const clean = [...new Set(ids)].filter((x) => x !== id);
  await insertMany('asset_dependencies', clean.map((d) => ({ asset_id: id, depends_on_asset_id: d })), conn);
}

/** Everything that depends on this asset, directly or indirectly (up to 10 levels). */
export async function dependents(id) {
  const edges = await find('asset_dependencies', {});
  const depth = new Map();
  let frontier = [id];
  for (let level = 1; level <= 10 && frontier.length; level++) {
    const next = [];
    for (const target of frontier) {
      for (const e of edges) {
        if (e.depends_on_asset_id === target && !depth.has(e.asset_id)) { depth.set(e.asset_id, level); next.push(e.asset_id); }
      }
    }
    frontier = next;
  }
  depth.delete(id);
  const assets = await find('assets', { id: { $in: [...depth.keys()] }, deleted_at: null }, {
    projection: { id: 1, asset_tag: 1, name: 1, asset_type_id: 1, assigned_person_id: 1, owner_person_id: 1 },
  });
  const [types, people] = await Promise.all([
    mapBy('asset_types', assets.map((a) => a.asset_type_id)),
    mapBy('people', assets.flatMap((a) => [a.assigned_person_id, a.owner_person_id]), { projection: { name: 1 } }),
  ]);
  return assets
    .filter((a) => types.has(a.asset_type_id))
    .map((a) => ({
      id: a.id, asset_tag: a.asset_tag, name: a.name, depth: depth.get(a.id), owner_id: ownerId(a, types.get(a.asset_type_id)) ?? null,
      owner_name: people.get(a.assigned_person_id)?.name ?? people.get(a.owner_person_id)?.name ?? null,
    }))
    .sort((a, b) => cmp(a.name, b.name));
}

export const assignedToPerson = (personId) => find('assets', { assigned_person_id: personId, deleted_at: null }, { projection: { id: 1, asset_tag: 1, name: 1 } });

export async function changesForAsset(id) {
  const ids = await distinct('change_assets', 'change_id', { asset_id: id });
  return find('changes', { id: { $in: ids }, deleted_at: null }, {
    sort: { planned_start: -1 }, projection: { id: 1, change_number: 1, title: 1, status: 1, close_code: 1, planned_start: 1 },
  });
}
