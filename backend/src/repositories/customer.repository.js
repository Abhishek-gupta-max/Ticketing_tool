import { OPEN_STATUSES } from '../constants/workflow.js';
import { insertOne, find, findOne, updateOne, aggregate, mapBy, like, equalsCi } from '../config/database.js';

/** Count documents of a collection grouped by a field: Map(value -> n). */
async function countBy(name, field, filter) {
  const rows = await aggregate(name, [{ $match: filter }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

export async function listCustomers() {
  const rows = await find('customers', { deleted_at: null }, {
    sort: { is_internal: 1, id: 1 }, projection: { id: 1, code: 1, name: 1, plan: 1, is_internal: 1 },
  });
  const [people, tickets, assets] = await Promise.all([
    countBy('people', 'customer_id', { deleted_at: null }),
    countBy('tickets', 'customer_id', { deleted_at: null, status: { $in: OPEN_STATUSES } }),
    countBy('assets', 'customer_id', { deleted_at: null }),
  ]);
  return rows.map((c) => ({ ...c, requesters: people.get(c.id) || 0, open_tickets: tickets.get(c.id) || 0, assets: assets.get(c.id) || 0 }));
}

export const findCustomer = (id, conn) => findOne('customers', { id, deleted_at: null }, {}, conn);
export const findCustomerByName = (name) => findOne('customers', { name: equalsCi(name), deleted_at: null });
export const internalCustomer = () => findOne('customers', { is_internal: 1, deleted_at: null }, { sort: { id: 1 } });

export const createCustomer = ({ code, name, plan }) => insertOne('customers', { code, name, plan });

export async function listPeople({ customerId, search, limit = 500 } = {}) {
  const w = { deleted_at: null };
  if (customerId) w.customer_id = customerId;
  if (search) w.$or = [{ name: like(search) }, { email: like(search) }];
  const people = await find('people', w, {
    projection: { id: 1, customer_id: 1, name: 1, email: 1, is_vip: 1, department: 1, job_title: 1, location: 1, phone: 1, user_id: 1 },
  });
  const customers = await mapBy('customers', people.map((p) => p.customer_id), { projection: { name: 1, is_internal: 1 } });
  const ids = people.map((p) => p.id);
  const [devices, owned] = await Promise.all([
    countBy('assets', 'assigned_person_id', { deleted_at: null, assigned_person_id: { $in: ids } }),
    countBy('assets', 'owner_person_id', { deleted_at: null, owner_person_id: { $in: ids } }),
  ]);
  return people
    .filter((p) => customers.has(p.customer_id))
    .map((p) => {
      const c = customers.get(p.customer_id);
      return {
        id: p.id, customer_id: p.customer_id, customer_name: c.name, customer_internal: c.is_internal, name: p.name, email: p.email, is_vip: p.is_vip,
        department: p.department, job_title: p.job_title, location: p.location, phone: p.phone, user_id: p.user_id,
        devices: devices.get(p.id) || 0, owned: owned.get(p.id) || 0,
      };
    })
    .sort((a, b) => a.customer_internal - b.customer_internal || a.customer_id - b.customer_id || a.id - b.id)
    .slice(0, limit);
}

export async function findPerson(id, conn) {
  const p = await findOne('people', { id, deleted_at: null }, {}, conn);
  if (!p) return null;
  const c = await findOne('customers', { id: p.customer_id }, { projection: { name: 1 } }, conn);
  return c ? { ...p, customer_name: c.name } : null;
}
export const findPersonByEmail = (email) => findOne('people', { email: equalsCi(email), deleted_at: null });

export const createPerson = (p) => insertOne('people', {
  customer_id: p.customerId, name: p.name, email: p.email, is_vip: p.vip ? 1 : 0, department: p.department || null, job_title: p.jobTitle || null,
  location: p.location || null, phone: p.phone || null,
});

export const setVip = (id, vip) => updateOne('people', { id }, { is_vip: vip ? 1 : 0 });
