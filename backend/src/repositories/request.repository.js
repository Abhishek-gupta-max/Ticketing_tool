import { OPEN_STATUSES } from '../constants/workflow.js';
import { insertOne, insertMany, find, findOne, mapBy, like } from '../config/database.js';

export const insert = (r, conn) => insertOne('requests', {
  request_number: r.number, requested_for_id: r.requestedForId, customer_id: r.customerId, opened_by: r.openedBy || null,
}, conn);

export const findById = (id, conn) => findOne('requests', { id }, {}, conn);
export const lockById = (id, conn) => findOne('requests', { id }, { projection: { id: 1, request_number: 1 } }, conn);

export async function nextLine(requestId, conn) {
  const last = await findOne('request_items', { request_id: requestId }, { sort: { line_no: -1 }, projection: { line_no: 1 } }, conn);
  return (last?.line_no || 0) + 1;
}

export const addItem = (requestId, ticketId, catalogItemId, lineNo, conn) => insertOne('request_items', {
  request_id: requestId, ticket_id: ticketId, catalog_item_id: catalogItemId || null, line_no: lineNo,
}, conn);

export async function addValues(requestItemId, values, conn) {
  if (!values.length) return;
  await insertMany('request_item_values', values.map((v, i) => ({
    request_item_id: requestItemId, field_key: v.key, label: v.label, value: v.value ?? null, sort_order: i + 1,
  })), conn);
}

const scope = (user) => (user.isStaff && user.can('ticket:view_all') ? {} : { requested_for_id: user.personId || -1 });

export async function list(user, { limit, offset, search }) {
  const w = scope(user);
  if (search) {
    const people = await find('people', { name: like(search) }, { projection: { id: 1 } });
    w.$or = [{ request_number: like(search) }, { requested_for_id: { $in: people.map((p) => p.id) } }];
  }
  const all = await find('requests', w, { sort: { created_at: -1, id: -1 } });
  const [people, customers] = await Promise.all([
    mapBy('people', all.map((r) => r.requested_for_id), { projection: { name: 1 } }),
    mapBy('customers', all.map((r) => r.customer_id), { projection: { name: 1, is_internal: 1 } }),
  ]);
  // Inner joins: requests whose person or customer is missing are left out.
  const visible = all.filter((r) => people.has(r.requested_for_id));
  const page = visible.filter((r) => customers.has(r.customer_id)).slice(offset, offset + limit);

  const items = await find('request_items', { request_id: { $in: page.map((r) => r.id) } }, { sort: { line_no: 1 }, projection: { request_id: 1, ticket_id: 1 } });
  const tickets = await mapBy('tickets', items.map((i) => i.ticket_id), { projection: { title: 1, status: 1 } });
  const rows = page.map((r) => {
    const mine = items.filter((i) => i.request_id === r.id);
    const withTicket = mine.map((i) => tickets.get(i.ticket_id)).filter(Boolean);
    const c = customers.get(r.customer_id);
    return {
      id: r.id, request_number: r.request_number, requested_for_id: r.requested_for_id, requested_for_name: people.get(r.requested_for_id).name,
      customer_id: r.customer_id, customer_name: c.name, customer_internal: c.is_internal, created_at: r.created_at,
      item_titles: withTicket.length ? withTicket.map((t) => t.title).join('\n') : null,
      open_items: withTicket.filter((t) => OPEN_STATUSES.includes(t.status)).length,
      item_count: mine.length,
    };
  });
  return { rows, total: visible.length };
}

export async function findByNumber(number) {
  const r = await findOne('requests', { request_number: number });
  if (!r) return null;
  const [p, c] = await Promise.all([
    findOne('people', { id: r.requested_for_id }, { projection: { name: 1 } }),
    findOne('customers', { id: r.customer_id }, { projection: { name: 1 } }),
  ]);
  if (!p || !c) return null;
  return {
    id: r.id, request_number: r.request_number, requested_for_id: r.requested_for_id, requested_for_name: p.name, customer_id: r.customer_id,
    customer_name: c.name, opened_by: r.opened_by, created_at: r.created_at,
  };
}
