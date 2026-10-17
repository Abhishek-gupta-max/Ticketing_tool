import { insertOne, find, findOne, count, updateOne, attach } from '../config/database.js';

/** Major incident rows with ticket number, asset and commander name (former JOINs). */
async function enrich(rows, conn) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  await attach(list, 'tickets', 'ticket_id', { ticket_number: 'ticket_number', asset_id: 'asset_id' }, { conn });
  await attach(list, 'users', 'commander_id', { commander_name: 'name' }, { conn });
  return rows;
}

const one = async (filter, sort, conn) => enrich(await findOne('major_incidents', filter, { sort }, conn), conn);

export const active = (conn) => one({ status: 'Active' }, { started_at: -1 }, conn);
export const activeForTicket = (ticketId) => one({ status: 'Active', ticket_id: ticketId });
export const past = async (limit = 5) => enrich(await find('major_incidents', { status: 'Resolved' }, { sort: { started_at: -1 }, limit }));
export const total = () => count('major_incidents');
export const findById = (id, conn) => one({ id }, undefined, conn);
export const lockById = (id, conn) => findOne('major_incidents', { id }, { projection: { id: 1 } }, conn);

export const insert = (mi, conn) => insertOne('major_incidents', {
  mi_number: mi.number, ticket_id: mi.ticketId, title: mi.title, status: 'Active', commander_id: mi.commanderId, impact: mi.impact,
}, conn);

export const resolve = (id, conn) => updateOne('major_incidents', { id }, { status: 'Resolved', resolved_at: new Date() }, conn);

export const addUpdate = (id, userId, body, conn) => insertOne('major_incident_updates', { major_incident_id: id, user_id: userId, body }, conn);

export async function updates(id) {
  const rows = await find(
    'major_incident_updates',
    { major_incident_id: id },
    { sort: { created_at: -1 }, projection: { id: 1, body: 1, created_at: 1, user_id: 1 } },
  );
  return attach(rows, 'users', 'user_id', { user_name: 'name' });
}
