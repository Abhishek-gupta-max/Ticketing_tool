// Simulated inbound integrations from the original Settings > Integrations tab.
// They create real tickets through the normal ticket workflow.
import { find, findOne } from '../config/database.js';
import * as settings from './settings.service.js';
import * as tickets from './ticket.service.js';
import { unprocessable } from '../utils/AppError.js';

/** A requester of the given customer, else of an external customer, else anyone. */
async function requesterOf(customerCode) {
  const people = await find('people', { deleted_at: null }, { sort: { id: 1 }, projection: { id: 1, customer_id: 1 } });
  const customers = new Map((await find('customers', {}, { projection: { id: 1, code: 1, is_internal: 1 } })).map((c) => [c.id, c]));
  const rank = (p) => { const c = customers.get(p.customer_id); return [c.code === customerCode ? 0 : 1, c.is_internal, p.id]; };
  const ranked = people.filter((p) => customers.has(p.customer_id)).sort((a, b) => {
    const x = rank(a), y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return ranked[0] || null;
}
const categoryId = async (name) => (await findOne('ticket_categories', { name }, { projection: { id: 1 } }))?.id;

export async function simulateEmail(user) {
  const i = (await settings.get('integrations')) || {};
  if (!i.email?.on) throw unprocessable('Connect the email integration first.');
  const p = await requesterOf('c-nw');
  if (!p) throw unprocessable('Add a customer and requester first.');
  return tickets.create({
    kind: 'incident', title: 'Cannot print from the finance floor', description: `Sent by email to ${i.email.address}`, customerId: p.customer_id, requesterId: p.id,
    categoryId: await categoryId('Hardware and devices'), impact: 2, urgency: 2, channel: 'Email',
  }, user);
}

export async function simulateSiem(user) {
  const i = (await settings.get('integrations')) || {};
  if (!i.siem?.on) throw unprocessable('Connect the SIEM integration first.');
  const p = await requesterOf('c-hx');
  if (!p) throw unprocessable('Add a customer and requester first.');
  const asset = await findOne('assets', { name: 'vpn-gw-01', deleted_at: null }, { projection: { id: 1 } });
  return tickets.create({
    kind: 'incident', title: 'SIEM alert: repeated failed logins on VPN gateway', description: 'Rule VPN-BRUTE-01 fired 48 times in 5 minutes from a single address.',
    customerId: p.customer_id, requesterId: p.id, categoryId: await categoryId('Security alerts'), impact: 1, urgency: 2, channel: 'Monitoring', assetId: asset?.id || null,
  }, user);
}
