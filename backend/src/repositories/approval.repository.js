import { insertOne, insertMany, find, findOne, updateOne, updateMany, mapBy, attach } from '../config/database.js';
import { DAY } from '../utils/time.js';

export const insertRequestApproval = (ticketId, conn) => insertOne('approvals', {
  approval_type: 'request', ticket_id: ticketId, approver_role: 'Line manager', status: 'Pending',
}, conn);

export async function insertChangeApprovals(changeId, approvers, conn) {
  if (!approvers.length) return;
  await insertMany('approvals', approvers.map((a, i) => ({
    approval_type: 'change', change_id: changeId, approver_id: a.userId, approver_role: a.role, status: 'Pending', is_requested: 0, sort_order: i,
  })), conn);
}

export async function latestForTicket(ticketId, conn) {
  const a = await findOne('approvals', { ticket_id: ticketId }, { sort: { id: -1 } }, conn);
  return a ? attach(a, 'users', 'decided_by', { decided_by_name: 'name' }, { conn }) : null;
}

export async function forChange(changeId, conn) {
  const rows = await find('approvals', { change_id: changeId }, { sort: { sort_order: 1, id: 1 } }, conn);
  await attach(rows, 'users', 'approver_id', { approver_name: 'name' }, { conn });
  return attach(rows, 'users', 'decided_by', { decided_by_name: 'name' }, { conn });
}

export const findById = (id, conn) => findOne('approvals', { id }, {}, conn);
export const lockById = (id, conn) => findOne('approvals', { id }, {}, conn);

export const decide = (id, status, userId, comment, conn) => updateOne('approvals', { id }, {
  status, decided_by: userId, decided_at: new Date(), comment: comment || null,
}, conn);

/** Reset every approver of a change to pending and mark them as requested. */
export const requestChange = (changeId, conn) => updateMany('approvals', { change_id: changeId }, {
  status: 'Pending', is_requested: 1, decided_by: null, decided_at: null, comment: null, requested_at: new Date(),
}, conn);

/** Standard change: approved by policy. */
export const approveAllByPolicy = (changeId, conn) => updateMany('approvals', { change_id: changeId }, {
  status: 'Approved', is_requested: 1, decided_at: new Date(), comment: 'Pre-approved by policy',
}, conn);

export const cancelPendingForChange = (changeId, conn) => updateMany('approvals', { change_id: changeId, status: 'Pending' }, { status: 'Cancelled' }, conn);

// ---------- queues ----------
async function requestPending() {
  const rows = await find('approvals', { approval_type: 'request', status: 'Pending' });
  const tickets = await mapBy('tickets', rows.map((a) => a.ticket_id), { projection: { ticket_number: 1, title: 1, status: 1, deleted_at: 1, requester_id: 1, customer_id: 1 } });
  const live = rows.filter((a) => { const t = tickets.get(a.ticket_id); return t && t.status === 'Awaiting approval' && t.deleted_at == null; });
  const [people, customers] = await Promise.all([
    mapBy('people', live.map((a) => tickets.get(a.ticket_id).requester_id), { projection: { name: 1 } }),
    mapBy('customers', live.map((a) => tickets.get(a.ticket_id).customer_id), { projection: { name: 1 } }),
  ]);
  return live
    .filter((a) => people.has(tickets.get(a.ticket_id).requester_id) && customers.has(tickets.get(a.ticket_id).customer_id))
    .map((a) => {
      const t = tickets.get(a.ticket_id);
      return {
        kind: 'request', approval_id: a.id, role: a.approver_role, approver_id: a.approver_id, approver_name: null, waiting_since: a.requested_at,
        record_number: t.ticket_number, title: t.title, record_id: t.id, requester_name: people.get(t.requester_id).name,
        customer_name: customers.get(t.customer_id).name,
      };
    });
}

async function changePending(approverId) {
  const rows = await find('approvals', { approval_type: 'change', status: 'Pending', ...(approverId != null && { approver_id: approverId }) });
  const changes = await mapBy('changes', rows.map((a) => a.change_id), { projection: { change_number: 1, title: 1, status: 1, deleted_at: 1, updated_at: 1, customer_id: 1 } });
  const live = rows.filter((a) => { const c = changes.get(a.change_id); return c && c.status === 'Approval' && c.deleted_at == null; });
  const [users, customers] = await Promise.all([
    mapBy('users', live.map((a) => a.approver_id), { projection: { name: 1 } }),
    mapBy('customers', live.map((a) => changes.get(a.change_id).customer_id), { projection: { name: 1 } }),
  ]);
  return live.map((a) => {
    const ch = changes.get(a.change_id);
    return {
      kind: 'change', approval_id: a.id, role: a.approver_role, approver_id: a.approver_id, approver_name: users.get(a.approver_id)?.name ?? null,
      waiting_since: ch.updated_at, record_number: ch.change_number, title: ch.title, record_id: ch.id, requester_name: null,
      customer_name: customers.get(ch.customer_id)?.name ?? null,
    };
  });
}

const byWaiting = (rows) => rows.sort((a, b) => new Date(a.waiting_since) - new Date(b.waiting_since));

/** Approvals the user may decide: request approvals (with request:approve) and their own CAB votes (or all, with override). */
export async function mine(user) {
  const parts = [];
  if (user.can('request:approve')) parts.push(requestPending());
  if (user.can('approval:override')) parts.push(changePending());
  else if (user.can('change:approve')) parts.push(changePending(user.id));
  if (!parts.length) return [];
  return byWaiting((await Promise.all(parts)).flat());
}

export const allPending = async () => byWaiting((await Promise.all([requestPending(), changePending()])).flat());

export async function history(days = 30) {
  const rows = await find(
    'approvals',
    { status: { $in: ['Approved', 'Rejected'] }, decided_at: { $gt: new Date(Date.now() - days * DAY) } },
    { sort: { decided_at: -1 }, limit: 200 },
  );
  const [tickets, changes, users] = await Promise.all([
    mapBy('tickets', rows.map((a) => a.ticket_id), { projection: { ticket_number: 1, title: 1 } }),
    mapBy('changes', rows.map((a) => a.change_id), { projection: { change_number: 1, title: 1 } }),
    mapBy('users', rows.map((a) => a.decided_by), { projection: { name: 1 } }),
  ]);
  return rows.map((a) => {
    const t = tickets.get(a.ticket_id), ch = changes.get(a.change_id);
    return {
      id: a.id, kind: a.approval_type, decision: a.status, decided_at: a.decided_at, role: a.approver_role, comment: a.comment,
      record_number: t?.ticket_number ?? ch?.change_number ?? null, title: t?.title ?? ch?.title ?? null,
      decided_by_name: users.get(a.decided_by)?.name ?? null,
    };
  });
}

export async function approvalHours(from, to) {
  const rows = await find('approvals', { approval_type: 'request', status: 'Approved', decided_at: { $ne: null } }, { projection: { ticket_id: 1, decided_at: 1 } });
  const tickets = await mapBy('tickets', rows.map((a) => a.ticket_id), { projection: { created_at: 1 } });
  const f = new Date(from), t = new Date(to);
  return rows
    .filter((a) => { const k = tickets.get(a.ticket_id); return k && k.created_at >= f && k.created_at < t; })
    // TIMESTAMPDIFF(SECOND, ...) / 3600: whole seconds, then hours
    .map((a) => ({ hours: Math.trunc((a.decided_at - tickets.get(a.ticket_id).created_at) / 1000) / 3600 }));
}
