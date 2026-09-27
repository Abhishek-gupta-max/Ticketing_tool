import { withTransaction, queryOne, query } from '../config/database.js';
import * as repo from '../repositories/asset.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as customerRepo from '../repositories/customer.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as audit from './audit.service.js';
import { nextAssetTag } from './sequence.service.js';
import * as map from '../models/mappers.js';
import { pageParams, pageMeta } from '../utils/pagination.js';
import { parseCsv } from '../utils/csv.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { CRITICALITIES, ASSET_STATUSES } from '../constants/workflow.js';

const staffUser = { isStaff: true, can: () => true, id: 0 };

export async function list(q) {
  const pg = pageParams(q, 50);
  const [{ rows, total }, k] = await Promise.all([repo.list(q, pg), repo.kpis()]);
  return {
    items: rows.map(map.asset),
    meta: pageMeta(pg, total),
    kpis: {
      total: Number(k.total || 0), retired: Number(k.retired || 0), critical: Number(k.critical || 0), withoutOwner: Number(k.without_owner || 0),
      warrantyExpiring: Number(k.warranty_expiring || 0), withOpenTickets: Number(k.with_open || 0),
    },
  };
}

export async function exportRows(q) {
  return (await repo.listAll(q)).map(map.asset);
}

export async function get(tag) {
  const r = await repo.findByTag(tag);
  if (!r) throw notFound(`Asset ${tag} was not found.`);
  const [deps, dependents, changes, devices, open, resolved] = await Promise.all([
    repo.dependsOn(r.id), repo.dependents(r.id), repo.changesForAsset(r.id), repo.assignedToPerson(r.id),
    ticketRepo.list({ assetId: r.id, quick: 'open', sortBy: 'created', sortOrder: 'DESC' }, staffUser, { limit: 50, offset: 0 }),
    ticketRepo.list({ assetId: r.id, quick: 'resolved', sortBy: 'updated', sortOrder: 'DESC' }, staffUser, { limit: 8, offset: 0 }),
  ]);
  return {
    ...map.asset(r),
    dependencyIds: deps.map((d) => d.id),
    dependsOn: deps.map((d) => ({ id: d.id, tag: d.asset_tag, name: d.name, criticality: d.criticality })),
    dependents: dependents.map((d) => ({ id: d.id, tag: d.asset_tag, name: d.name, direct: d.depth === 1, ownerName: d.owner_name })),
    changes: changes.map((c) => ({ number: c.change_number, title: c.title, status: c.status, closeCode: c.close_code, plannedStart: c.planned_start })),
    devices: devices.map((d) => ({ tag: d.asset_tag, name: d.name })),
    openTicketList: open.rows.map((t) => map.ticket(t)),
    ticketTotal: open.total + (await queryOne('SELECT COUNT(*) AS n FROM tickets WHERE asset_id = ? AND deleted_at IS NULL AND status IN (\'Resolved\',\'Closed\')', [r.id])).n,
    resolvedTickets: resolved.rows.map((t) => map.ticket(t)),
  };
}

function columns(b) {
  return {
    name: b.name.trim(), asset_type_id: b.typeId, criticality: b.criticality, status: b.status, environment: b.environment || 'Production',
    customer_id: b.customerId, department: b.department || null, location: b.location || null, serial_number: b.serialNumber || null, platform: b.platform || null,
    purchase_date: b.purchaseDate || null, warranty_end: b.warrantyEnd || null, assigned_person_id: b.assignedToId || null, owner_person_id: b.ownedById || null,
    managed_by: b.managedById || null, support_team_id: b.supportTeamId || null, notes: b.notes || null,
  };
}

async function assertUniqueName(name, exceptId, conn) {
  const hit = await repo.findByName(name, conn);
  if (hit && hit.id !== exceptId) throw badRequest('An asset with this name already exists.', 'VALIDATION_ERROR', { fields: { name: 'Already exists' } });
}

export async function create(body, user) {
  const tag = await withTransaction(async (conn) => {
    await assertUniqueName(body.name, null, conn);
    const t = await nextAssetTag(conn);
    const id = await repo.insert(t, columns(body), user.id, conn);
    await repo.setDependencies(id, body.dependsOnIds || [], conn);
    await audit.log({ action: 'Created asset', entityType: 'asset', entityId: id, entityRef: t, newValues: { name: body.name } }, conn);
    return t;
  });
  return get(tag);
}

export async function update(tag, body, user) {
  await withTransaction(async (conn) => {
    const r = await repo.findByTag(tag, conn);
    if (!r) throw notFound(`Asset ${tag} was not found.`);
    await assertUniqueName(body.name, r.id, conn);
    await repo.update(r.id, columns(body), conn);
    if (body.dependsOnIds) await repo.setDependencies(r.id, body.dependsOnIds, conn);
    await audit.log({ action: 'Edited asset', entityType: 'asset', entityId: r.id, entityRef: tag, oldValues: { name: r.name, status: r.status }, newValues: { name: body.name, status: body.status } }, conn);
  });
  return get(tag);
}

export async function remove(tag) {
  await withTransaction(async (conn) => {
    const r = await repo.findByTag(tag, conn);
    if (!r) throw notFound(`Asset ${tag} was not found.`);
    await repo.softDelete(r.id, conn);
    await audit.log({ action: 'Deleted asset', entityType: 'asset', entityId: r.id, entityRef: tag, oldValues: { name: r.name } }, conn);
  });
}

/** CSV import: name,type,criticality,status,customer,location,serial,platform,warranty,device_owner_email,owner_email,managed_by_email,support_group */
export async function importCsv(text, user) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { imported: 0, errors: ['The file has no data rows.'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const ix = (k) => head.indexOf(k);
  if (ix('name') < 0) return { imported: 0, errors: ['The first row must contain a "name" column.'] };
  const g = (r, k) => (ix(k) >= 0 ? (r[ix(k)] || '').trim() : '');
  const types = await query('SELECT id, name FROM asset_types');
  const internal = await customerRepo.internalCustomer();
  const errors = [];
  let imported = 0;
  const seen = new Set();
  await withTransaction(async (conn) => {
    for (let i = 1; i < rows.length && i <= 2000; i++) {
      const r = rows[i];
      const name = g(r, 'name');
      if (!name) { errors.push(`Row ${i + 1}: name is empty`); continue; }
      if (seen.has(name.toLowerCase()) || await repo.findByName(name, conn)) { errors.push(`Row ${i + 1}: ${name} already exists`); continue; }
      seen.add(name.toLowerCase());
      const type = types.find((t) => t.name.toLowerCase() === g(r, 'type').toLowerCase()) || types.find((t) => t.name === 'Other');
      const crit = CRITICALITIES.find((c) => c.toLowerCase() === g(r, 'criticality').toLowerCase()) || 'Medium';
      const status = ASSET_STATUSES.find((s) => s.toLowerCase() === g(r, 'status').toLowerCase()) || 'In use';
      const cust = (g(r, 'customer') && await customerRepo.findCustomerByName(g(r, 'customer'))) || internal;
      const person = async (m) => (m ? (await customerRepo.findPersonByEmail(m))?.id || null : null);
      const agentByMail = async (m) => (m ? (await queryOne('SELECT u.id FROM users u JOIN agents a ON a.user_id = u.id WHERE LOWER(u.email) = LOWER(?)', [m]))?.id || null : null);
      const grp = g(r, 'support_group') ? await teamRepo.findByName(g(r, 'support_group')) : null;
      const warranty = g(r, 'warranty');
      if (warranty && Number.isNaN(Date.parse(warranty))) { errors.push(`Row ${i + 1}: warranty "${warranty}" is not a date`); continue; }
      const tag = await nextAssetTag(conn);
      await repo.insert(tag, {
        name, asset_type_id: type.id, criticality: crit, status, environment: 'Production', customer_id: cust.id, location: g(r, 'location') || null,
        serial_number: g(r, 'serial') || null, platform: g(r, 'platform') || null, warranty_end: warranty || null,
        assigned_person_id: await person(g(r, 'device_owner_email')), owner_person_id: await person(g(r, 'owner_email')),
        managed_by: await agentByMail(g(r, 'managed_by_email')), support_team_id: grp?.id || null,
      }, user.id, conn);
      imported++;
    }
    if (imported) await audit.log({ action: `Imported ${imported} assets`, entityType: 'asset', entityRef: 'Assets' }, conn);
  });
  return { imported, errors };
}

export async function options() {
  return (await repo.options()).map((a) => ({ id: a.id, tag: a.asset_tag, name: a.name, type: a.type_name, status: a.status, assignedPersonId: a.assigned_person_id }));
}

export const owners = async () => (await repo.owners()).map((p) => ({ id: p.id, name: p.name }));
