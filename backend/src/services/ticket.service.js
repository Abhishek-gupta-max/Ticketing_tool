// Ticket queries and lifecycle. Business rules are ported from the original
// single-file application (createTicket, setStatus, assignTicket, postReply...).
import { withTransaction, queryOne } from '../config/database.js';
import * as repo from '../repositories/ticket.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as customerRepo from '../repositories/customer.repository.js';
import * as assetRepo from '../repositories/asset.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as requestRepo from '../repositories/request.repository.js';
import * as approvalRepo from '../repositories/approval.repository.js';
import * as taskRepo from '../repositories/task.repository.js';
import * as problemRepo from '../repositories/problem.repository.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as miRepo from '../repositories/majorIncident.repository.js';
import * as settingsRepo from '../repositories/settings.repository.js';
import * as activityRepo from '../repositories/activity.repository.js';
import * as kbRepo from '../repositories/kb.repository.js';
import * as settings from './settings.service.js';
import * as audit from './audit.service.js';
import * as notifications from './notification.service.js';
import * as attachments from './attachment.service.js';
import { createCatalogTasks } from './taskFactory.js';
import { nextNumber } from './sequence.service.js';
import * as map from '../models/mappers.js';
import { pageParams, pageMeta } from '../utils/pagination.js';
import { slaRows } from '../utils/sla.js';
import { addMinutes } from '../utils/time.js';
import { badRequest, notFound, unprocessable, forbidden } from '../utils/AppError.js';
import {
  OPEN_STATUSES, PRIORITY_NAMES, WAITING_FOR_REQUESTER, REQUEST_REJECTED_CODE, allowedTicketStates, priorityOf, REQUEST_RESPONSE_MINUTES,
} from '../constants/workflow.js';

const IU = ['', 'High', 'Medium', 'Low'];
const isOpen = (t) => OPEN_STATUSES.includes(t.status);

// ---------------------------------------------------------------- access

export function canView(row, user) {
  return user.can('ticket:view_all') || (user.personId && row.requester_id === user.personId);
}

async function getVisible(number, user, conn) {
  const row = await repo.findByNumber(number, conn);
  if (!row || !canView(row, user)) throw notFound(`Ticket ${number} was not found.`);
  return row;
}

/** Load and lock a ticket for modification. */
async function lockVisible(conn, number, user) {
  const row = await getVisible(number, user, conn);
  await repo.lockById(row.id, conn);
  return repo.findById(row.id, conn);
}

function assertEditable(t) {
  if (t.status === 'Closed') throw unprocessable('Closed tickets are read-only. Use New linked ticket to raise another ticket.', 'TICKET_CLOSED');
}

export async function activity(conn, ticketId, userId, text) {
  await repo.addActivity(ticketId, userId, text, conn);
  await repo.touch(ticketId, conn);
}

async function userName(id, conn) {
  if (!id) return 'Unassigned';
  return (await queryOne('SELECT name FROM users WHERE id = ?', [id], conn))?.name || 'Unknown';
}

// ---------------------------------------------------------------- queries

export async function list(q, user) {
  const pg = pageParams(q, 25);
  const { rows, total } = await repo.list(q, user, pg);
  const now = Date.now();
  const counts = await repo.quickCounts(q, user);
  return { items: rows.map((r) => map.ticket(r, now)), meta: { ...pageMeta(pg, total), counts } };
}

export async function board(q, user) {
  const cols = ['New', 'In Progress', 'On Hold', 'Awaiting approval', 'Resolved'];
  const now = Date.now();
  const out = [];
  for (const status of cols) {
    const { rows, total } = await repo.boardColumn(q, user, status, 20);
    out.push({ status, total, items: rows.map((r) => map.ticket(r, now)) });
  }
  return { columns: out, counts: await repo.quickCounts(q, user) };
}

export async function exportRows(q, user) {
  const rows = await repo.listAll(q, user);
  const now = Date.now();
  return rows.map((r) => map.ticket(r, now));
}

export async function get(number, user) {
  const row = await getVisible(number, user);
  const t = map.ticket(row);
  const staff = user.isStaff;
  const [tags, tasks, approval, formValues, files, children] = await Promise.all([
    repo.tags(row.id),
    taskRepo.byParent('ticket', row.id),
    approvalRepo.latestForTicket(row.id),
    repo.formValues(row.id),
    attachments.listFor('ticket', row.id, { includeNotes: user.can('ticket:note') }),
    repo.children(row.id),
  ]);
  let asset = null, problem = null, change = null, parent = null, request = null, major = null, suggestions = [];
  if (row.asset_id) asset = map.asset(await assetRepo.findById(row.asset_id));
  if (row.problem_id) { const p = await problemRepo.findById(row.problem_id); problem = p ? { id: p.id, number: p.problem_number, title: p.title, status: p.status } : null; }
  if (row.change_id) { const c = await changeRepo.findById(row.change_id); change = c ? { id: c.id, number: c.change_number, title: c.title, status: c.status } : null; }
  if (row.parent_ticket_id) { const p = await repo.findById(row.parent_ticket_id); parent = p ? { number: p.ticket_number, title: p.title } : null; }
  if (row.request_id) { const r = await requestRepo.findById(row.request_id); request = r ? { id: r.id, number: r.request_number } : null; }
  if (row.is_major) { const m = await miRepo.activeForTicket(row.id); major = m ? { id: m.id, number: m.mi_number, status: m.status } : null; }
  if (staff && row.status !== 'Closed') suggestions = await suggestArticles(`${row.title} ${row.category_name}`, 3);
  const openTasks = tasks.filter((x) => !['Done', 'Not done', 'Not needed'].includes(x.state)).length;

  return {
    ...t,
    requester: { ...t.requester, isPortalUser: !!row.requester_user_id },
    tags,
    tasks: staff ? tasks.map(map.task) : [],
    openTaskCount: openTasks,
    approval: approval ? { id: approval.id, status: approval.status, role: approval.approver_role, decidedBy: approval.decided_by_name, decidedAt: approval.decided_at, comment: approval.comment, requestedAt: approval.requested_at } : null,
    formValues: formValues.map((v) => ({ key: v.field_key, label: v.label, value: v.value })),
    attachments: files,
    children: children.map((c) => ({ number: c.ticket_number, title: c.title, status: c.status })),
    asset: asset ? { id: asset.id, tag: asset.tag, name: asset.name, environment: asset.environment, ownerLabel: asset.ownerLabel, owner: asset.owner, supportTeam: asset.supportTeam, type: asset.type.name } : null,
    problem, change, parent, request, majorIncident: major,
    allowedStates: allowedTicketStates(row.status),
    slaRows: slaRows(row),
    resolveBy: isOpen(row) ? new Date(new Date(row.sla_resolution_due_at).getTime() + row.paused_seconds * 1000 + (row.paused_at ? Date.now() - new Date(row.paused_at).getTime() : 0)) : row.resolved_at,
    suggestedArticles: suggestions,
  };
}

export async function timeline(number, user, filter = 'all') {
  const row = await getVisible(number, user);
  const includeNotes = user.can('ticket:note');
  const { comments, activities } = await repo.timeline(row.id, { includeNotes });
  const files = await attachments.listFor('ticket', row.id, { includeNotes });
  const byComment = {};
  files.filter((f) => f.commentId).forEach((f) => { (byComment[f.commentId] = byComment[f.commentId] || []).push(f); });
  let all = [
    ...comments.map((c) => map.timelineEntry(c, byComment[c.id] || [])),
    ...activities.map((a) => map.timelineEntry(a)),
  ];
  if (filter === 'comments') all = all.filter((a) => a.type === 'comment');
  else if (filter === 'notes') all = all.filter((a) => a.type === 'note');
  else if (filter === 'system') all = all.filter((a) => a.type === 'system');
  all.sort((a, b) => new Date(b.at) - new Date(a.at) || (b.id > a.id ? 1 : -1));
  return all;
}

export async function history(number, user) {
  const row = await getVisible(number, user);
  if (!user.isStaff) throw forbidden();
  return (await repo.history(row.id)).map((h) => ({ id: h.id, field: h.field, oldValue: h.old_value, newValue: h.new_value, at: h.changed_at, user: h.user_name || 'System' }));
}

async function suggestArticles(text, limit) {
  const words = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3);
  if (!words.length) return [];
  const rows = await kbRepo.publishedForMatching();
  return rows
    .map((a) => { const h = `${a.title} ${a.tags || ''} ${a.category_name}`.toLowerCase(); return { a, s: words.filter((w) => h.includes(w)).length }; })
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, limit)
    .map(({ a }) => ({ id: a.id, number: a.article_number, title: a.title }));
}

// ---------------------------------------------------------------- creation

/**
 * Create a ticket inside an open transaction. Applies routing and automation
 * rules, SLA targets, approvals and catalog tasks exactly like the original.
 * o: { kind, title, description, customerId, requesterId, categoryId, assetId, impact, urgency,
 *      assignee ('auto' | userId | null), teamId, channel, problemId, parentId, catalogItemId,
 *      formValues [{key,label,value}], requestId }
 */
export async function createInConnection(conn, o, user) {
  const rules = await settings.rulesMap();
  const person = await customerRepo.findPerson(o.requesterId, conn);
  if (!person) throw badRequest('Choose a requester.', 'INVALID_REQUESTER');
  const customerId = o.customerId || person.customer_id;
  if (person.customer_id !== customerId) throw badRequest('The requester does not belong to that customer.', 'INVALID_REQUESTER');
  const category = await settingsRepo.categoryById(o.categoryId, conn);
  if (!category) throw badRequest('Choose a category.', 'INVALID_CATEGORY');
  if (o.channel && !(await settingsRepo.lookupExists('channel', o.channel, conn))) throw badRequest('Choose a valid channel.', 'INVALID_CHANNEL');

  const impact = Number(o.impact) || 2, urgency = Number(o.urgency) || 2;
  let pri = priorityOf(impact, urgency);
  if (o.kind === 'request' && !o.priorityFixed) pri = Math.max(pri, 3);
  if (rules.r4 && person.is_vip && pri > 1) pri--;

  const notes = [];
  const sd = await teamRepo.findByCode('sd', conn);
  let teamId = o.teamId || null;
  if (teamId) {
    const t = await teamRepo.findById(teamId, conn);
    if (!t || t.type !== 'Support') throw badRequest('Choose a support team.', 'INVALID_TEAM');
  } else {
    const routed = category.default_team_id ? await teamRepo.findById(category.default_team_id, conn) : null;
    teamId = routed && routed.is_active ? routed.id : sd?.id || null;
  }

  let assetRow = null;
  if (o.assetId) {
    assetRow = await assetRepo.findById(o.assetId, conn);
    if (!assetRow) throw badRequest('The affected asset does not exist.', 'INVALID_ASSET');
  }
  if (rules.r5 && !o.teamId && assetRow?.support_team_id && assetRow.support_team_id !== teamId) {
    const g = await teamRepo.findById(assetRow.support_team_id, conn);
    if (g?.is_active) { teamId = g.id; notes.push(`Rule applied: assignment group set to ${g.name} from the configuration item`); }
  }
  if (rules.r1 && category.name === 'Security alerts') {
    const soc = await teamRepo.findByCode('soc', conn);
    if (soc?.is_active && teamId !== soc.id) { teamId = soc.id; notes.push(`Rule applied: routed to ${soc.name}`); }
  }

  let assignee = null;
  if (o.assignee === 'auto') assignee = await teamRepo.leastBusyMember(teamId, conn);
  else if (o.assignee) {
    const u = await queryOne("SELECT u.id FROM users u JOIN agents a ON a.user_id = u.id WHERE u.id = ? AND u.status = 'active'", [o.assignee], conn);
    if (!u) throw badRequest('Choose an active agent.', 'INVALID_ASSIGNEE');
    assignee = u.id;
  }
  if (rules.r2 && pri === 1 && !assignee) {
    const oc = (await teamRepo.onCallFor(teamId, conn)) || (await teamRepo.anyOnCall(conn));
    if (oc) { assignee = oc; notes.push(`Rule applied: assigned to on-call agent ${await userName(oc, conn)}`); }
  }

  let ci = null;
  if (o.catalogItemId) {
    ci = await catalogRepo.findItem(o.catalogItemId, conn);
    if (!ci || !ci.is_active) throw badRequest('That catalog item is not available.', 'INVALID_CATALOG_ITEM');
  }
  const policy = await settings.priorityPolicy(pri);
  const requestSla = (await settings.get('request_sla')) || {};
  const respMin = o.kind === 'request' ? (requestSla.responseMinutes || REQUEST_RESPONSE_MINUTES) : policy.response_minutes;
  const resMin = o.kind === 'request' && ci ? ci.fulfilment_hours * 60 : policy.resolution_minutes;
  const now = new Date();

  // Record numbers: INC-YYYY-NNNN, or REQ-YYYY-NNNN.<line> for order items.
  let number, requestId = null, lineNo = null;
  if (o.kind === 'request') {
    if (o.requestId) {
      await requestRepo.lockById(o.requestId, conn);
      requestId = o.requestId;
    } else {
      const reqNumber = await nextNumber(conn, 'REQ');
      requestId = await requestRepo.insert({ number: reqNumber, requestedForId: person.id, customerId, openedBy: user.id }, conn);
    }
    const req = await requestRepo.findById(requestId, conn);
    lineNo = await requestRepo.nextLine(requestId, conn);
    number = `${req.request_number}.${lineNo}`;
  } else {
    number = await nextNumber(conn, 'INC');
  }

  const needsApproval = !!ci?.requires_approval;
  const status = needsApproval ? 'Awaiting approval' : assignee ? 'In Progress' : 'New';
  if (needsApproval) assignee = null;
  const channel = o.channel || 'Portal';

  const id = await repo.insert({
    number, kind: o.kind, title: o.title, description: o.description, customerId, requesterId: person.id, categoryId: category.id, teamId,
    assignedTo: assignee, channel, impact, urgency, priority: pri, status, slaResponseDueAt: addMinutes(now, respMin), slaResolutionDueAt: addMinutes(now, resMin),
    assetId: assetRow?.id, problemId: o.problemId, parentId: o.parentId, requestId, catalogItemId: ci?.id, createdBy: user.id,
  }, conn);

  await repo.addActivity(id, null, `Ticket created via ${channel}`, conn);
  for (const n of notes) await repo.addActivity(id, null, n, conn);
  if (assignee) await repo.addActivity(id, null, `Assigned to ${await userName(assignee, conn)}`, conn);

  if (requestId) {
    const itemId = await requestRepo.addItem(requestId, id, ci?.id, lineNo, conn);
    if (o.formValues?.length) await requestRepo.addValues(itemId, o.formValues, conn);
  }

  const row = await repo.findById(id, conn);
  if (needsApproval) {
    await approvalRepo.insertRequestApproval(id, conn);
    await repo.addActivity(id, null, 'Approval requested from line manager', conn);
    await notifications.notifyMany(await notifications.approverUserIds(), { type: 'approval', severity: 'info', title: `Approval needed: ${o.title} (${number})`, link: `/tickets/${number}`, dedupeKey: `approval:${number}` }, conn);
  } else if (ci) {
    const n = await createCatalogTasks(conn, row, user.id);
    await repo.addActivity(id, null, `${n} catalog task${n === 1 ? '' : 's'} created`, conn);
  }
  if (o.parentId) {
    const parentNumber = await repo.numberById(o.parentId, conn);
    await activity(conn, o.parentId, user.id, `Linked ticket ${number} created`);
    await repo.addActivity(id, null, `Linked to ${parentNumber}`, conn);
  }
  if (o.problemId) {
    await activityRepo.add('problem', o.problemId, user.id, `Incident ${number} linked`, 'system', conn);
  }
  if (assignee && assignee !== user.id) {
    await notifications.notify(assignee, { type: 'assigned', severity: 'info', title: `${number} was assigned to you: ${o.title}`, link: `/tickets/${number}`, dedupeKey: `assigned:${number}:${assignee}` }, conn);
  }
  await audit.log({ action: `Created ${o.kind === 'incident' ? 'incident' : 'request'}`, entityType: 'ticket', entityId: id, entityRef: number, newValues: { title: o.title, priority: pri, team: teamId, assignee } }, conn);
  return { id, number };
}

export async function create(input, user, files = []) {
  const o = { ...input };
  if (o.parentNumber) {
    const parent = await repo.findByNumber(o.parentNumber);
    if (!parent || !canView(parent, user)) throw badRequest('The linked ticket does not exist.');
    o.parentId = parent.id;
  }
  if (!user.isStaff) {
    // Portal users always raise tickets for themselves.
    if (!user.personId) throw forbidden('Your account is not linked to a requester profile.');
    Object.assign(o, { requesterId: user.personId, customerId: user.customerId, assignee: null, teamId: null, channel: 'Portal' });
  }
  const result = await withTransaction(async (conn) => {
    const r = await createInConnection(conn, o, user);
    if (files.length) {
      const stored = await attachments.storeFiles(conn, 'ticket', r.id, files, user.id);
      await repo.addActivity(r.id, user.id, `Attached ${stored.map((s) => s.name).join(', ')}`, conn);
    }
    return r;
  });
  return get(result.number, user);
}

// ---------------------------------------------------------------- state machine

export function transitionError(t, to, openTasks) {
  if (t.status === 'Closed') return 'Closed tickets are read-only. Use New linked ticket to raise another ticket.';
  if (t.status === 'Awaiting approval' && to !== 'Awaiting approval') return 'This request needs approval first.';
  if (to !== t.status && !allowedTicketStates(t.status).includes(to)) return `A ticket in ${t.status} cannot move to ${to}.`;
  if (to === 'Resolved' && openTasks) return `Close all ${openTasks} open task(s) before resolving this ticket.`;
  return null;
}

/**
 * Apply a state change (no rule checks; callers validate first). Keeps the SLA
 * pause clock in sync: it runs unless the ticket is On Hold waiting for the requester.
 */
export async function applyStatus(conn, t, to, extra, user) {
  const old = t.status;
  if (old === to && !(to === 'On Hold' && extra.holdReason && extra.holdReason !== t.hold_reason)) return;
  const now = new Date();
  const f = {};
  if (to === 'Resolved') {
    f.resolved_at = now;
    if (!t.first_response_at) f.first_response_at = now;
    if (extra.code) f.resolution_code = extra.code;
    if (extra.note != null) f.resolution_notes = extra.note;
  }
  if (to === 'Closed') {
    f.closed_at = now;
    if (!t.resolved_at) f.resolved_at = now;
    if (extra.code) f.resolution_code = extra.code;
    if (extra.note != null) f.resolution_notes = extra.note;
  }
  const reopen = (old === 'Resolved' || old === 'Closed') && OPEN_STATUSES.includes(to);
  if (reopen) { f.resolved_at = null; f.closed_at = null; f.reopened_count = t.reopened_count + 1; }
  const hold = to === 'On Hold' ? (extra.holdReason || t.hold_reason || WAITING_FOR_REQUESTER) : null;
  f.hold_reason = hold;
  f.status = to;
  let assignedNow = null;
  if (to === 'In Progress' && !t.assigned_to && user?.isStaff) { f.assigned_to = user.id; assignedNow = user; }
  const willPause = to === 'On Hold' && hold === WAITING_FOR_REQUESTER;
  if (willPause && !t.paused_at) f.paused_at = now;
  if (!willPause && t.paused_at) {
    f.paused_seconds = t.paused_seconds + Math.max(0, Math.round((now - new Date(t.paused_at)) / 1000));
    f.paused_at = null;
  }
  await repo.update(t.id, f, conn);
  await repo.addHistory(t.id, user?.id, { status: [old, to], hold_reason: [t.hold_reason, hold], ...(assignedNow ? { assigned_to: [t.assigned_to, assignedNow.id] } : {}) }, conn);
  if (assignedNow) await repo.addActivity(t.id, user.id, `Assigned to ${assignedNow.name}`, conn);
  const code = f.resolution_code ?? t.resolution_code;
  const note = f.resolution_notes ?? t.resolution_notes;
  const text = to === 'Resolved' ? `Resolved (${code}): ${note}`
    : reopen ? `Reopened. State set to ${to}`
      : to === 'On Hold' ? `State changed from ${old} to On Hold (${hold})`
        : `State changed from ${old} to ${to}`;
  await repo.addActivity(t.id, user?.id, text, conn);
  await audit.log({ action: `Set state to ${to}`, entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { status: old }, newValues: { status: to, holdReason: hold } }, conn);
  if (to === 'Resolved' && t.requester_user_id) {
    await notifications.notify(t.requester_user_id, { type: 'resolved', severity: 'info', title: `${t.ticket_number} was resolved: ${t.title}`, link: `/tickets/${t.ticket_number}` }, conn);
  }
}

/**
 * Change state with validation. body: { status, holdReason, comment, resolutionCode, resolutionNotes, createArticle }
 */
export async function changeStatus(number, body, user) {
  const to = body.status;
  let articleNumber = null;
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    const openTasks = await taskRepo.openCount('ticket', t.id, conn);
    const err = transitionError(t, to, openTasks);
    if (err) throw unprocessable(err, 'INVALID_TRANSITION');
    if (to === 'Closed' && !user.can('ticket:close')) throw forbidden('You cannot close tickets.');
    if (to === 'Resolved') {
      if (!body.resolutionCode) throw badRequest('Choose a resolution code.', 'VALIDATION_ERROR', { fields: { resolutionCode: 'Required' } });
      if (!(await settingsRepo.lookupExists('resolution_code', body.resolutionCode, conn))) throw badRequest('Choose a valid resolution code.');
      if ((body.resolutionNotes || '').trim().length < 5) throw badRequest('Resolution notes are required (at least 5 characters).', 'VALIDATION_ERROR', { fields: { resolutionNotes: 'Too short' } });
    }
    if (to === 'On Hold') {
      const reason = body.holdReason || WAITING_FOR_REQUESTER;
      if (!(await settingsRepo.lookupExists('hold_reason', reason, conn))) throw badRequest('Choose a valid on hold reason.');
      if (t.status !== 'On Hold' && (body.comment || '').trim().length < 3) throw badRequest('A comment is required when a ticket is placed on hold.', 'VALIDATION_ERROR', { fields: { comment: 'Required' } });
      if (body.comment?.trim()) await postComment(conn, t, { body: body.comment.trim(), internal: false }, user);
      const fresh = await repo.findById(t.id, conn);
      await applyStatus(conn, fresh, 'On Hold', { holdReason: reason }, user);
      return;
    }
    await applyStatus(conn, t, to, { code: body.resolutionCode, note: body.resolutionNotes?.trim() }, user);
    if (to === 'Resolved' && body.createArticle) {
      const kb = await import('./kb.service.js');
      articleNumber = await kb.createDraftFromTicket(conn, t, body.resolutionNotes.trim(), user);
    }
  });
  const detail = await get(number, user);
  return { ticket: detail, articleNumber };
}

// ---------------------------------------------------------------- assignment

export async function assignInConnection(conn, t, assigneeId, user) {
  const f = { assigned_to: assigneeId || null };
  const changes = { assigned_to: [t.assigned_to, assigneeId || null] };
  if (assigneeId) {
    const agent = await queryOne("SELECT u.id, u.name, a.primary_team_id FROM users u JOIN agents a ON a.user_id = u.id WHERE u.id = ? AND u.status = 'active'", [assigneeId], conn);
    if (!agent) throw badRequest('Choose an active agent.', 'INVALID_ASSIGNEE');
    if (t.status === 'New') { f.status = 'In Progress'; changes.status = ['New', 'In Progress']; }
    if (t.team_id && !(await teamRepo.isMember(t.team_id, assigneeId, conn)) && agent.primary_team_id) {
      f.team_id = agent.primary_team_id; changes.team_id = [t.team_id, agent.primary_team_id];
    }
    await taskRepo.assignOpenUnassigned(t.id, assigneeId, conn);
  }
  await repo.update(t.id, f, conn);
  await repo.addHistory(t.id, user.id, changes, conn);
  const name = assigneeId ? await userName(assigneeId, conn) : null;
  await repo.addActivity(t.id, user.id, assigneeId ? `Assigned to ${name}` : 'Unassigned', conn);
  await audit.log({ action: assigneeId ? `Assigned to ${name}` : 'Unassigned', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { assignee: t.assignee_name }, newValues: { assignee: name } }, conn);
  if (assigneeId && assigneeId !== user.id) {
    await notifications.notify(assigneeId, { type: 'assigned', severity: 'info', title: `${t.ticket_number} was assigned to you: ${t.title}`, link: `/tickets/${t.ticket_number}`, dedupeKey: `assigned:${t.ticket_number}:${assigneeId}:${Date.now()}` }, conn);
  }
}

export async function assign(number, assigneeId, user) {
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    if (t.status === 'Awaiting approval') throw unprocessable('This request needs approval before it can be assigned.', 'AWAITING_APPROVAL');
    await assignInConnection(conn, t, assigneeId, user);
  });
  return get(number, user);
}

// ---------------------------------------------------------------- priority

async function setPriorityInConnection(conn, t, pri, user) {
  if (t.priority === pri) return;
  const f = { priority: pri };
  if (t.kind === 'incident') {
    const pol = await settings.priorityPolicy(pri);
    f.sla_response_due_at = addMinutes(t.created_at, pol.response_minutes);
    f.sla_resolution_due_at = addMinutes(t.created_at, pol.resolution_minutes);
  }
  await repo.update(t.id, f, conn);
  await repo.addHistory(t.id, user.id, { priority: [t.priority, pri] }, conn);
  await repo.addActivity(t.id, user.id, `Priority changed from ${PRIORITY_NAMES[t.priority]} to ${PRIORITY_NAMES[pri]}`, conn);
  await audit.log({ action: `Set priority to ${PRIORITY_NAMES[pri]}`, entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { priority: t.priority }, newValues: { priority: pri } }, conn);
}

export async function setImpactUrgencyInConnection(conn, t, impact, urgency, user) {
  if (t.impact !== impact) await repo.addActivity(t.id, user.id, `Impact changed to ${IU[impact]}`, conn);
  if (t.urgency !== urgency) await repo.addActivity(t.id, user.id, `Urgency changed to ${IU[urgency]}`, conn);
  await repo.update(t.id, { impact, urgency }, conn);
  await repo.addHistory(t.id, user.id, { impact: [t.impact, impact], urgency: [t.urgency, urgency] }, conn);
  const fresh = await repo.findById(t.id, conn);
  await setPriorityInConnection(conn, fresh, priorityOf(impact, urgency), user);
}

export async function setPriority(number, body, user) {
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    if (body.impact || body.urgency) await setImpactUrgencyInConnection(conn, t, body.impact || t.impact, body.urgency || t.urgency, user);
    else await setPriorityInConnection(conn, t, body.priority, user);
  });
  return get(number, user);
}

// ---------------------------------------------------------------- general update

/** PUT/PATCH fields: title, description, categoryId, teamId, assetId, tags, holdReason. */
export async function update(number, body, user) {
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    if (body.title !== undefined || body.description !== undefined) {
      const title = body.title ?? t.title, description = body.description ?? t.description;
      await repo.update(t.id, { title, description }, conn);
      await repo.addHistory(t.id, user.id, { title: [t.title, title], description: [t.description, description] }, conn);
      await repo.addActivity(t.id, user.id, 'Summary or description edited', conn);
      await audit.log({ action: 'Edited ticket', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { title: t.title }, newValues: { title } }, conn);
    }
    if (body.categoryId !== undefined && body.categoryId !== t.category_id) {
      const cat = await settingsRepo.categoryById(body.categoryId, conn);
      if (!cat) throw badRequest('Choose a valid category.');
      await repo.update(t.id, { category_id: cat.id }, conn);
      await repo.addHistory(t.id, user.id, { category: [t.category_name, cat.name] }, conn);
      await repo.addActivity(t.id, user.id, `Category changed to ${cat.name}`, conn);
      await audit.log({ action: 'Changed category', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { category: t.category_name }, newValues: { category: cat.name } }, conn);
    }
    if (body.teamId !== undefined && body.teamId !== t.team_id) {
      const team = await teamRepo.findById(body.teamId, conn);
      if (!team || team.type !== 'Support') throw badRequest('Choose a support team.');
      const f = { team_id: team.id };
      let text = `Team changed to ${team.name}`;
      if (t.assigned_to && !(await teamRepo.isMember(team.id, t.assigned_to, conn))) {
        f.assigned_to = null;
        text = `Team changed to ${team.name}. ${t.assignee_name} is not in that group, so the ticket is unassigned.`;
      }
      await repo.update(t.id, f, conn);
      await repo.addHistory(t.id, user.id, { team: [t.team_name, team.name], ...(f.assigned_to === null ? { assigned_to: [t.assigned_to, null] } : {}) }, conn);
      await repo.addActivity(t.id, user.id, text, conn);
      await audit.log({ action: 'Changed assignment group', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { team: t.team_name }, newValues: { team: team.name } }, conn);
    }
    if (body.impact !== undefined || body.urgency !== undefined) {
      const fresh = await repo.findById(t.id, conn);
      await setImpactUrgencyInConnection(conn, fresh, body.impact ?? fresh.impact, body.urgency ?? fresh.urgency, user);
    }
    if (body.assetId !== undefined && body.assetId !== t.asset_id) {
      let text = 'Affected asset cleared';
      if (body.assetId) {
        const a = await assetRepo.findById(body.assetId, conn);
        if (!a) throw badRequest('That asset does not exist.');
        text = `Affected asset set to ${a.name}`;
      }
      await repo.update(t.id, { asset_id: body.assetId || null }, conn);
      await repo.addHistory(t.id, user.id, { asset_id: [t.asset_id, body.assetId || null] }, conn);
      await repo.addActivity(t.id, user.id, text, conn);
      await audit.log({ action: 'Linked asset', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number }, conn);
    }
    if (body.tags !== undefined) {
      const clean = [...new Set(body.tags.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
      await repo.setTags(t.id, clean, conn);
      await activity(conn, t.id, user.id, 'Tags updated');
    }
    if (body.holdReason !== undefined && t.status === 'On Hold' && body.holdReason !== t.hold_reason) {
      if (!(await settingsRepo.lookupExists('hold_reason', body.holdReason, conn))) throw badRequest('Choose a valid on hold reason.');
      const fresh = await repo.findById(t.id, conn);
      await applyStatus(conn, fresh, 'On Hold', { holdReason: body.holdReason }, user);
    }
  });
  return get(number, user);
}

export async function remove(number, user) {
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    await repo.softDelete(t.id, conn);
    await audit.log({ action: 'Deleted ticket', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, oldValues: { title: t.title, status: t.status } }, conn);
  });
}

// ---------------------------------------------------------------- comments

/**
 * Post a reply or work note. Ported from postReply: the first public reply by
 * an agent sets first response; replying on a New ticket picks it up.
 */
export async function postComment(conn, t, { body, internal, holdAfter, files = [] }, user) {
  const type = internal ? 'note' : 'comment';
  const commentId = await repo.addComment(t.id, user.id, type, body, conn);
  let stored = [];
  if (files.length) stored = await attachments.storeFiles(conn, 'ticket', t.id, files, user.id, commentId);
  const f = {};
  const changes = {};
  if (!internal && !t.first_response_at && user.isStaff) f.first_response_at = new Date();
  if (user.isStaff && t.status === 'New') {
    if (!t.assigned_to) { f.assigned_to = user.id; changes.assigned_to = [null, user.id]; await repo.addActivity(t.id, user.id, `Assigned to ${user.name}`, conn); }
    f.status = 'In Progress'; changes.status = ['New', 'In Progress'];
  }
  if (Object.keys(f).length) { await repo.update(t.id, f, conn); await repo.addHistory(t.id, user.id, changes, conn); }
  else await repo.touch(t.id, conn);

  if (!user.isStaff && t.status === 'On Hold' && t.hold_reason === WAITING_FOR_REQUESTER) {
    const fresh = await repo.findById(t.id, conn);
    await applyStatus(conn, fresh, 'In Progress', {}, null);
    await repo.addActivity(t.id, null, 'The requester replied, so the ticket is back in progress', conn);
  }
  if (holdAfter && user.isStaff) {
    const fresh = await repo.findById(t.id, conn);
    if (fresh.status !== 'On Hold') await applyStatus(conn, fresh, 'On Hold', { holdReason: WAITING_FOR_REQUESTER }, user);
  }
  await audit.log({ action: internal ? 'Added work note' : 'Added comment', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, newValues: stored.length ? { files: stored.map((s) => s.name) } : undefined }, conn);

  // Tell the other side.
  if (!internal && user.isStaff && t.requester_user_id) {
    await notifications.notify(t.requester_user_id, { type: 'reply', severity: 'info', title: `New reply on ${t.ticket_number}: ${t.title}`, link: `/tickets/${t.ticket_number}` }, conn);
  }
  if (!user.isStaff && t.assigned_to) {
    await notifications.notify(t.assigned_to, { type: 'reply', severity: 'info', title: `The requester replied on ${t.ticket_number}`, link: `/tickets/${t.ticket_number}` }, conn);
  }
  return commentId;
}

export async function addComment(number, body, user, files = []) {
  if (body.internal && !user.can('ticket:note')) throw forbidden('You cannot add internal notes.');
  if (!body.body?.trim() && !files.length) throw badRequest('Write a message or attach a file first.', 'VALIDATION_ERROR');
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    const text = body.body?.trim() || `Attached ${files.map((f) => f.originalname).join(', ')}`;
    await postComment(conn, t, { body: text, internal: !!body.internal, holdAfter: !!body.holdAfter, files }, user);
  });
  return timeline(number, user);
}

export async function addAttachments(number, files, user) {
  if (!files?.length) throw badRequest('Choose at least one file.', 'NO_FILES');
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    const stored = await attachments.storeFiles(conn, 'ticket', t.id, files, user.id);
    await activity(conn, t.id, user.id, `Attached ${stored.map((s) => s.name).join(', ')}`);
    await audit.log({ action: `Attached ${stored.length} file${stored.length > 1 ? 's' : ''}`, entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, newValues: { files: stored.map((s) => s.name) } }, conn);
  });
  return attachments.listFor('ticket', (await repo.findByNumber(number)).id, { includeNotes: user.can('ticket:note') });
}

// ---------------------------------------------------------------- approvals and CSAT

export async function decideApproval(number, { decision, comment }, user) {
  if (!user.can('request:approve')) throw forbidden('Only a manager or an admin can approve requests.', 'PERMISSION_DENIED');
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    const ap = await approvalRepo.latestForTicket(t.id, conn);
    if (t.status !== 'Awaiting approval' || !ap || ap.status !== 'Pending') throw unprocessable('This request is not waiting for approval.', 'NOT_PENDING');
    await approvalRepo.lockById(ap.id, conn);
    const approved = decision === 'approve';
    await approvalRepo.decide(ap.id, approved ? 'Approved' : 'Rejected', user.id, comment, conn);
    await repo.addActivity(t.id, user.id, `${approved ? 'Approved' : 'Rejected'} by ${user.name} (line manager)${comment ? ': ' + comment : ''}`, conn);
    if (approved) {
      let assignee = t.assigned_to;
      const f = { status: 'In Progress' };
      if (!assignee) { assignee = (await teamRepo.leastBusyMember(t.team_id, conn)) || user.id; f.assigned_to = assignee; }
      await repo.update(t.id, f, conn);
      await repo.addHistory(t.id, user.id, { status: [t.status, 'In Progress'], assigned_to: [t.assigned_to, assignee] }, conn);
      if (!t.assigned_to) await repo.addActivity(t.id, null, `Assigned to ${await userName(assignee, conn)}`, conn);
      const fresh = await repo.findById(t.id, conn);
      const n = await createCatalogTasks(conn, fresh, user.id);
      await repo.addActivity(t.id, null, `${n} catalog task${n > 1 ? 's' : ''} created`, conn);
      if (assignee !== user.id) await notifications.notify(assignee, { type: 'assigned', title: `${t.ticket_number} was approved and assigned to you`, link: `/tickets/${t.ticket_number}` }, conn);
    } else {
      const fresh = await repo.findById(t.id, conn);
      await applyStatus(conn, fresh, 'Closed', { code: REQUEST_REJECTED_CODE, note: 'The request was not approved.' + (comment ? ' ' + comment : '') }, user);
    }
    if (t.requester_user_id) await notifications.notify(t.requester_user_id, { type: 'approval', title: `${t.ticket_number} was ${approved ? 'approved' : 'rejected'}`, link: `/tickets/${t.ticket_number}` }, conn);
    await audit.log({ action: `${approved ? 'Approved' : 'Rejected'} request`, entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, newValues: { decision, comment } }, conn);
  });
  return get(number, user);
}

export async function rate(number, rating, user) {
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    if (isOpen(t)) throw unprocessable('A rating can be given once the ticket is resolved.', 'NOT_RESOLVED');
    if (!user.isStaff && t.requester_id !== user.personId) throw forbidden();
    await repo.update(t.id, { csat: rating }, conn);
    await repo.addActivity(t.id, user.id, `Customer rated this ${rating} out of 5`, conn);
    await audit.log({ action: 'Recorded satisfaction', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, newValues: { csat: rating } }, conn);
  });
  return get(number, user);
}

// ---------------------------------------------------------------- bulk

export async function bulk({ numbers, assigneeId, status }, user) {
  let updated = 0, skipped = 0;
  for (const number of numbers) {
    try {
      await withTransaction(async (conn) => {
        const t = await lockVisible(conn, number, user);
        if (t.status === 'Closed') throw new Error('skip');
        if (assigneeId !== undefined) {
          if (t.status === 'Awaiting approval') throw new Error('skip');
          await assignInConnection(conn, t, assigneeId, user);
        } else if (status) {
          const openTasks = await taskRepo.openCount('ticket', t.id, conn);
          if (transitionError(t, status, openTasks)) throw new Error('skip');
          if (status === 'Closed' && !user.can('ticket:close')) throw new Error('skip');
          await applyStatus(conn, t, status, { holdReason: WAITING_FOR_REQUESTER }, user);
        }
      });
      updated++;
    } catch {
      skipped++;
    }
  }
  return { updated, skipped };
}

// ---------------------------------------------------------------- problems

export async function linkProblem(number, problemNumber, user) {
  await withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    if (!problemNumber) {
      if (!t.problem_id) return;
      const p = await problemRepo.findById(t.problem_id, conn);
      await repo.update(t.id, { problem_id: null }, conn);
      await repo.addActivity(t.id, user.id, `Unlinked from problem ${p?.problem_number || ''}`.trim(), conn);
      await audit.log({ action: 'Unlinked problem', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number }, conn);
      return;
    }
    const p = await problemRepo.findByNumber(problemNumber, conn);
    if (!p) throw badRequest('Choose a problem.');
    if (['Fixed', 'Closed'].includes(p.status)) throw unprocessable('That problem is already fixed or closed.');
    await repo.update(t.id, { problem_id: p.id }, conn);
    await repo.addHistory(t.id, user.id, { problem_id: [t.problem_id, p.id] }, conn);
    await repo.addActivity(t.id, user.id, `Linked to problem ${p.problem_number}`, conn);
    await activityRepo.add('problem', p.id, user.id, `Incident ${t.ticket_number} linked`, 'system', conn);
    await audit.log({ action: 'Linked problem', entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, newValues: { problem: p.problem_number } }, conn);
  });
  return get(number, user);
}

export async function createProblemFromTicket(number, body, user) {
  const problems = await import('./problem.service.js');
  return withTransaction(async (conn) => {
    const t = await lockVisible(conn, number, user);
    assertEditable(t);
    const p = await problems.createInConnection(conn, { title: body.title, priority: body.priority, ownerId: body.ownerId || user.id }, user);
    await repo.update(t.id, { problem_id: p.id }, conn);
    await repo.addActivity(t.id, user.id, `Problem ${p.number} created from this ticket`, conn);
    if (body.linkSimilar) {
      for (const s of await repo.similarWithoutProblem(t.title, t.id)) {
        await repo.update(s.id, { problem_id: p.id }, conn);
        await repo.addActivity(s.id, user.id, `Linked to problem ${p.number}`, conn);
      }
    }
    return p;
  });
}

export async function similarCount(number, user) {
  const t = await getVisible(number, user);
  return (await repo.similarWithoutProblem(t.title, t.id)).length;
}
