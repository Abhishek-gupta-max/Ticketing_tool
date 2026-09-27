import { withTransaction, queryOne } from '../config/database.js';
import * as repo from '../repositories/request.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as taskRepo from '../repositories/task.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as customerRepo from '../repositories/customer.repository.js';
import * as audit from './audit.service.js';
import * as attachments from './attachment.service.js';
import { createInConnection } from './ticket.service.js';
import { nextNumber } from './sequence.service.js';
import * as map from '../models/mappers.js';
import { pageParams, pageMeta } from '../utils/pagination.js';
import { badRequest, notFound, forbidden } from '../utils/AppError.js';
import { OPEN_STATUSES, TASK_CLOSED_STATES } from '../constants/workflow.js';

export function mapCatalogItem(i) {
  return {
    id: i.id, code: i.code, name: i.name, category: { id: i.category_id, name: i.category_name }, icon: i.icon, description: i.description,
    requiresApproval: !!i.requires_approval, fulfilmentHours: i.fulfilment_hours, isActive: !!i.is_active,
    fields: i.fields.map((f) => ({ id: f.id, key: f.field_key, label: f.label, type: f.field_type, required: !!f.is_required, options: f.options ? JSON.parse(f.options) : [] })),
    tasks: i.tasks.map((t) => t.title),
  };
}

export async function catalog({ includeInactive = false } = {}) {
  return (await catalogRepo.listItems({ includeInactive })).map(mapCatalogItem);
}

export async function kpis() {
  const row = await queryOne(
    `SELECT SUM(kind = 'request' AND status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_items,
            SUM(kind = 'request' AND status = 'Awaiting approval') AS pending,
            SUM(kind = 'request' AND resolved_at > UTC_TIMESTAMP(3) - INTERVAL 30 DAY) AS fulfilled,
            SUM(kind = 'request' AND resolved_at > UTC_TIMESTAMP(3) - INTERVAL 30 DAY AND resolved_at <= TIMESTAMPADD(SECOND, paused_seconds, sla_resolution_due_at)) AS on_time,
            (SELECT COUNT(*) FROM tasks WHERE type = 'Catalog task' AND state NOT IN ('Done','Not done','Not needed')) AS open_tasks
       FROM tickets WHERE deleted_at IS NULL`,
  );
  return {
    openItems: Number(row.open_items || 0), pending: Number(row.pending || 0), openTasks: Number(row.open_tasks || 0),
    onTimePct: Number(row.fulfilled) ? Math.round((Number(row.on_time) / Number(row.fulfilled)) * 100) : 0,
  };
}

export async function list(q, user) {
  const pg = pageParams(q, 40);
  const { rows, total } = await repo.list(user, { ...pg, search: q.search });
  return {
    items: rows.map((r) => ({
      id: r.id, number: r.request_number, requestedFor: { id: r.requested_for_id, name: r.requested_for_name },
      customer: { id: r.customer_id, name: r.customer_name, isInternal: !!r.customer_internal }, createdAt: r.created_at,
      itemTitles: r.item_titles ? r.item_titles.split('\n') : [], itemCount: r.item_count, isOpen: Number(r.open_items) > 0,
    })),
    meta: pageMeta(pg, total),
  };
}

const stageLabel = (t, tasks) => {
  if (!OPEN_STATUSES.includes(t.status)) return t.resolutionCode === 'Request rejected' ? 'Rejected' : 'Done';
  if (t.status === 'Awaiting approval') return 'Approval';
  if (tasks.length && tasks.every((x) => TASK_CLOSED_STATES.includes(x.state))) return 'On its way';
  return 'Preparing';
};

export async function get(number, user) {
  const r = await repo.findByNumber(number);
  if (!r) throw notFound(`Request ${number} was not found.`);
  if (!user.can('ticket:view_all') && r.requested_for_id !== user.personId) throw notFound(`Request ${number} was not found.`);
  const { rows } = await ticketRepo.list({ requestId: r.id, sortBy: 'number', sortOrder: 'ASC' }, user, { limit: 100, offset: 0 });
  const items = rows.map((x) => map.ticket(x));
  const tasks = user.isStaff ? (await taskRepo.byTickets(rows.map((x) => x.id))).map(map.task) : [];
  const approvals = await Promise.all(rows.map((x) => queryOne('SELECT status FROM approvals WHERE ticket_id = ? ORDER BY id DESC LIMIT 1', [x.id])));
  return {
    id: r.id, number: r.request_number, requestedFor: { id: r.requested_for_id, name: r.requested_for_name }, customer: { id: r.customer_id, name: r.customer_name },
    createdAt: r.created_at, isOpen: items.some((i) => OPEN_STATUSES.includes(i.status)),
    items: items.map((i, idx) => {
      const own = tasks.filter((t) => t.parent?.number === i.number);
      const ap = approvals[idx]?.status;
      return { ...i, approvalLabel: !ap ? 'Not required' : ap === 'Pending' ? 'Requested' : ap, stage: stageLabel(i, own), taskTotal: own.length, taskClosed: own.filter((t) => TASK_CLOSED_STATES.includes(t.state)).length };
    }),
    tasks,
  };
}

/**
 * Checkout: one request with one order item per cart line, all in one transaction.
 * body: { customerId, requestedForId, items: [{ catalogItemId, values: { key: value } }] }
 */
export async function submit(body, user, files = []) {
  let customerId = body.customerId, requestedForId = body.requestedForId;
  if (!user.isStaff) {
    if (!user.personId) throw forbidden('Your account is not linked to a requester profile.');
    customerId = user.customerId; requestedForId = user.personId;
  }
  const person = await customerRepo.findPerson(requestedForId);
  if (!person || person.customer_id !== customerId) throw badRequest('Choose who the request is for.', 'VALIDATION_ERROR', { fields: { requestedForId: 'Required' } });

  const lines = [];
  for (const [idx, line] of body.items.entries()) {
    const ci = await catalogRepo.findItem(line.catalogItemId);
    if (!ci || !ci.is_active) throw badRequest('A catalog item is no longer available.');
    const values = [];
    for (const f of ci.fields) {
      const v = String(line.values?.[f.field_key] ?? '').trim();
      if (f.is_required && !v) throw badRequest(`${ci.name}: ${f.label} is required.`, 'VALIDATION_ERROR', { fields: { [`items.${idx}.${f.field_key}`]: 'Required' } });
      if (v && f.field_type === 'select' && f.options && !JSON.parse(f.options).includes(v)) throw badRequest(`${ci.name}: choose a valid ${f.label}.`);
      if (v && f.field_type === 'date' && Number.isNaN(Date.parse(v))) throw badRequest(`${ci.name}: ${f.label} must be a date.`);
      values.push({ key: f.field_key, label: f.label, value: v.slice(0, 4000) });
    }
    const first = ci.fields[0];
    const lead = first && first.field_type === 'text' ? values[0]?.value : '';
    lines.push({ ci, values, title: lead ? `${ci.name}: ${lead}` : ci.name, description: ci.fields.map((f, i) => `${f.label}: ${values[i].value || '-'}`).join('\n') });
  }

  const number = await withTransaction(async (conn) => {
    const reqNumber = await nextNumber(conn, 'REQ');
    const requestId = await repo.insert({ number: reqNumber, requestedForId, customerId, openedBy: user.id }, conn);
    const created = [];
    for (const l of lines) {
      created.push(await createInConnection(conn, {
        kind: 'request', title: l.title, description: l.description, customerId, requesterId: requestedForId, categoryId: l.ci.category_id,
        impact: 2, urgency: 2, catalogItemId: l.ci.id, formValues: l.values, channel: 'Portal', requestId,
      }, user));
    }
    if (files.length) for (const t of created) await attachments.storeFiles(conn, 'ticket', t.id, files, user.id);
    await audit.log({ action: 'Submitted request', entityType: 'request', entityId: requestId, entityRef: reqNumber, newValues: { items: created.map((c) => c.number) } }, conn);
    return { reqNumber, items: created.map((c) => c.number) };
  });
  return number;
}
