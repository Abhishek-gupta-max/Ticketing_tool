import * as repo from '../repositories/customer.repository.js';
import * as audit from './audit.service.js';
import { conflict, notFound, badRequest } from '../utils/AppError.js';

export async function listCustomers() {
  return (await repo.listCustomers()).map((c) => ({ id: c.id, code: c.code, name: c.name, plan: c.plan, isInternal: !!c.is_internal, requesters: Number(c.requesters), openTickets: Number(c.open_tickets), assets: Number(c.assets) }));
}

export async function createCustomer({ name, plan }) {
  if (await repo.findCustomerByName(name)) throw conflict('A customer with this name already exists.', 'DUPLICATE', { fields: { name: 'Already exists' } });
  const code = 'c-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) + '-' + Math.random().toString(36).slice(2, 5);
  const id = await repo.createCustomer({ code, name, plan });
  await audit.log({ action: `Added customer ${name}`, entityType: 'customer', entityId: id, entityRef: name });
  return (await listCustomers()).find((c) => c.id === id);
}

const shapePerson = (p) => ({
  id: p.id, name: p.name, email: p.email, vip: !!p.is_vip, department: p.department || '', jobTitle: p.job_title || '', location: p.location || '', phone: p.phone || '',
  customer: { id: p.customer_id, name: p.customer_name, isInternal: !!p.customer_internal }, hasLogin: !!p.user_id, devices: Number(p.devices || 0), owned: Number(p.owned || 0),
});

export async function listPeople(q) {
  return (await repo.listPeople(q)).map(shapePerson);
}

export async function createPerson(body) {
  if (!(await repo.findCustomer(body.customerId))) throw badRequest('Choose a customer.');
  if (await repo.findPersonByEmail(body.email)) throw conflict('A requester with this email already exists.', 'DUPLICATE', { fields: { email: 'Already exists' } });
  const id = await repo.createPerson(body);
  await audit.log({ action: `Added requester ${body.name}`, entityType: 'person', entityId: id, entityRef: body.email });
  return (await listPeople({ customerId: body.customerId })).find((p) => p.id === id);
}

export async function setVip(id, vip) {
  const p = await repo.findPerson(id);
  if (!p) throw notFound('Requester not found.');
  await repo.setVip(id, vip);
  await audit.log({ action: `${vip ? 'Marked VIP' : 'Removed VIP'}: ${p.name}`, entityType: 'person', entityId: id, entityRef: p.email });
  return { id, vip };
}
