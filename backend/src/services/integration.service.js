// Simulated inbound integrations from the original Settings > Integrations tab.
// They create real tickets through the normal ticket workflow.
import { queryOne } from '../config/database.js';
import * as settings from './settings.service.js';
import * as tickets from './ticket.service.js';
import { unprocessable } from '../utils/AppError.js';

async function requesterOf(customerCode) {
  return queryOne(
    `SELECT p.id, p.customer_id FROM people p JOIN customers c ON c.id = p.customer_id
      WHERE p.deleted_at IS NULL ORDER BY (c.code = ?) DESC, c.is_internal ASC, p.id LIMIT 1`,
    [customerCode],
  );
}
const categoryId = async (name) => (await queryOne('SELECT id FROM ticket_categories WHERE name = ?', [name]))?.id;

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
  const asset = await queryOne("SELECT id FROM assets WHERE name = 'vpn-gw-01' AND deleted_at IS NULL");
  return tickets.create({
    kind: 'incident', title: 'SIEM alert: repeated failed logins on VPN gateway', description: 'Rule VPN-BRUTE-01 fired 48 times in 5 minutes from a single address.',
    customerId: p.customer_id, requesterId: p.id, categoryId: await categoryId('Security alerts'), impact: 1, urgency: 2, channel: 'Monitoring', assetId: asset?.id || null,
  }, user);
}
