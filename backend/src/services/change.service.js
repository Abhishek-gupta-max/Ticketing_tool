import { withTransaction, queryOne } from '../config/database.js';
import * as repo from '../repositories/change.repository.js';
import * as approvalRepo from '../repositories/approval.repository.js';
import * as taskRepo from '../repositories/task.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as problemRepo from '../repositories/problem.repository.js';
import * as activity from '../repositories/activity.repository.js';
import * as settingsRepo from '../repositories/settings.repository.js';
import * as audit from './audit.service.js';
import * as settings from './settings.service.js';
import * as attachments from './attachment.service.js';
import * as notifications from './notification.service.js';
import { createChangeTasks } from './taskFactory.js';
import { nextNumber } from './sequence.service.js';
import * as map from '../models/mappers.js';
import { badRequest, notFound, unprocessable, forbidden } from '../utils/AppError.js';
import { CHANGE_STEPS, CHANGE_STEPS_STANDARD, CHANGE_DONE, CHANGE_CANCELABLE, changeScore, riskOf } from '../constants/workflow.js';

const stepsOf = (c) => (c.type === 'Standard' ? CHANGE_STEPS_STANDARD : CHANGE_STEPS);
const fmt = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

async function load(number, conn) {
  const c = await repo.findByNumber(number, conn);
  if (!c) throw notFound(`Change ${number} was not found.`);
  if (conn) await repo.lockById(c.id, conn);
  return c;
}

const assertEditable = (c) => { if (CHANGE_DONE.includes(c.status)) throw unprocessable(`This change is ${c.status.toLowerCase()} and read-only.`, 'CHANGE_DONE'); };

export async function list(q) {
  const [rows, k, pairs] = await Promise.all([repo.list(q), repo.kpis(), repo.conflictPairs()]);
  const conflicts = {};
  pairs.forEach((p) => { (conflicts[p.change_id] = conflicts[p.change_id] || []).push(p.other_number); });
  return {
    items: rows.map((r) => ({ ...map.change(r), conflicts: conflicts[r.id] || [] })),
    kpis: {
      next7: Number(k.next7 || 0), awaiting: Number(k.awaiting || 0), emergency: Number(k.emergency || 0),
      successRate: Number(k.closed90) ? Math.round((Number(k.ok90) / Number(k.closed90)) * 100) : null,
      conflicts: Object.keys(conflicts).length,
    },
  };
}

export async function get(number) {
  const c = await load(number);
  const [approvals, tasks, acts, files, assets, tickets, conflicts] = await Promise.all([
    approvalRepo.forChange(c.id), taskRepo.byParent('change', c.id), activity.list('change', c.id), attachments.listFor('change', c.id),
    repo.assets(c.id), repo.linkedTickets(c.id), repo.conflictsFor(c.id),
  ]);
  return {
    ...map.change(c),
    riskScore: changeScore({ scope: c.risk_scope, downtime: c.risk_downtime, tested: !!c.risk_tested, backout: !!c.risk_backout }),
    steps: stepsOf(c),
    approvals: approvals.filter((a) => a.status !== 'Cancelled' || c.status === 'Canceled').map((a) => ({
      id: a.id, approver: a.approver_id ? { id: a.approver_id, name: a.approver_name } : null, role: a.approver_role, status: a.status,
      isRequested: !!a.is_requested, decidedBy: a.decided_by_name, decidedAt: a.decided_at, comment: a.comment,
    })),
    tasks: tasks.map(map.task),
    activity: acts.map((a) => map.timelineEntry(a)),
    attachments: files,
    assets: assets.map((a) => ({ id: a.id, tag: a.asset_tag, name: a.name, type: a.type_name })),
    tickets: tickets.map((t) => ({ number: t.ticket_number, title: t.title, status: t.status })),
    conflicts: conflicts.map((x) => x.change_number),
  };
}

function toColumns(body) {
  const answers = { scope: body.riskScope, downtime: body.riskDowntime, tested: body.riskTested, backout: body.riskBackout };
  const start = new Date(body.plannedStart);
  const end = body.plannedEnd ? new Date(body.plannedEnd) : new Date(start.getTime() + (body.durationHours || 2) * 3600000);
  if (end <= start) throw badRequest('The end must be after the start.', 'VALIDATION_ERROR', { fields: { plannedEnd: 'Must be after start' } });
  return {
    title: body.title, type: body.type, owner_id: body.ownerId, customer_id: body.customerId || null, planned_start: start, planned_end: end,
    impact: body.impact || 2, urgency: body.urgency || 2, risk: riskOf(changeScore(answers)), risk_scope: answers.scope, risk_downtime: answers.downtime,
    risk_tested: answers.tested ? 1 : 0, risk_backout: answers.backout ? 1 : 0, description: body.description || '',
    implementation_plan: body.implementationPlan || '', backout_plan: body.backoutPlan || '',
  };
}

async function cabApprovers(conn) {
  const list = (await settingsRepo.getSetting('cab_approvers', conn)) || [];
  const valid = [];
  for (const a of list) {
    const u = await queryOne("SELECT id FROM users WHERE id = ? AND status = 'active'", [a.userId], conn);
    if (u) valid.push(a);
  }
  if (valid.length) return valid;
  // Fallback: active members of approval teams.
  const rows = (await conn.query(
    "SELECT DISTINCT tm.user_id FROM team_members tm JOIN teams t ON t.id = tm.team_id JOIN users u ON u.id = tm.user_id WHERE t.type = 'Approval' AND t.is_active = 1 AND u.status = 'active'",
  ))[0];
  return rows.map((r) => ({ userId: r.user_id, role: 'CAB member' }));
}

/** body: change fields + { ticketNumbers, problemNumber, assetIds, submit } */
export async function create(body, user) {
  const result = await withTransaction(async (conn) => {
    const number = await nextNumber(conn, 'CHG');
    const cols = toColumns(body);
    if (body.problemNumber) {
      const p = await problemRepo.findByNumber(body.problemNumber, conn);
      if (!p) throw badRequest('Problem not found.');
      cols.problem_id = p.id;
    }
    const id = await repo.insert(number, cols, user.id, conn);
    await repo.setAssets(id, body.assetIds || [], conn);
    await approvalRepo.insertChangeApprovals(id, await cabApprovers(conn), conn);
    await activity.add('change', id, null, 'Change created', 'system', conn);
    for (const tn of body.ticketNumbers || []) {
      const t = await ticketRepo.findByNumber(tn, conn);
      if (!t) continue;
      await ticketRepo.update(t.id, { change_id: id }, conn);
      await ticketRepo.addActivity(t.id, user.id, `Change ${number} created for this ticket`, conn);
    }
    await audit.log({ action: 'Created change', entityType: 'change', entityId: id, entityRef: number, newValues: { title: body.title, type: body.type } }, conn);
    return number;
  });
  let submitError = null;
  if (body.submit) {
    const c = await repo.findByNumber(result);
    try { await transition(result, { to: c.type === 'Standard' ? 'Scheduled' : 'Risk review' }, user); } catch (e) { submitError = e.message; }
  }
  return { change: await get(result), submitError };
}

export async function update(number, body, user) {
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    assertEditable(c);
    const cols = toColumns(body);
    if (['Doing', 'Verify'].includes(c.status)) { delete cols.planned_start; delete cols.planned_end; }
    await repo.update(c.id, cols, conn);
    if (body.assetIds) await repo.setAssets(c.id, body.assetIds, conn);
    await activity.add('change', c.id, user.id, 'Change details updated', 'system', conn);
    await audit.log({ action: 'Edited change', entityType: 'change', entityId: c.id, entityRef: number, oldValues: { title: c.title }, newValues: { title: body.title } }, conn);
  });
  return get(number);
}

/** Inline edit of plans: implementationPlan, backoutPlan, testPlan, description. */
export async function updateFields(number, body, user) {
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    assertEditable(c);
    const f = {};
    if (body.implementationPlan !== undefined) f.implementation_plan = body.implementationPlan;
    if (body.backoutPlan !== undefined) {
      f.backout_plan = body.backoutPlan;
      f.risk_backout = body.backoutPlan.trim() ? 1 : 0;
      f.risk = riskOf(changeScore({ scope: c.risk_scope, downtime: c.risk_downtime, tested: !!c.risk_tested, backout: !!f.risk_backout }));
    }
    if (body.testPlan !== undefined) f.test_plan = body.testPlan;
    await repo.update(c.id, f, conn);
    await audit.log({ action: 'Updated change plans', entityType: 'change', entityId: c.id, entityRef: number, newValues: Object.keys(f) }, conn);
  });
  return get(number);
}

export async function reschedule(number, { plannedStart, plannedEnd }, user) {
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    if (['Doing', 'Verify', 'Closed', 'Canceled'].includes(c.status)) throw unprocessable('The window cannot change once implementation has started.');
    let start = plannedStart ? new Date(plannedStart) : new Date(c.planned_start);
    let end = plannedEnd ? new Date(plannedEnd) : new Date(c.planned_end);
    if (plannedStart && !plannedEnd) end = new Date(start.getTime() + Math.max(new Date(c.planned_end) - new Date(c.planned_start), 3600000));
    if (end <= start) throw badRequest('The end must be after the start.');
    await repo.update(c.id, { planned_start: start, planned_end: end }, conn);
    await activity.add('change', c.id, user.id, `Window changed to ${fmt(start)} to ${fmt(end)}`, 'system', conn);
    await audit.log({ action: 'Rescheduled change', entityType: 'change', entityId: c.id, entityRef: number, oldValues: { start: c.planned_start, end: c.planned_end }, newValues: { start, end } }, conn);
  });
  return get(number);
}

export async function setOwner(number, ownerId, user) {
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    assertEditable(c);
    const u = await queryOne("SELECT name FROM users WHERE id = ? AND status = 'active'", [ownerId], conn);
    if (!u) throw badRequest('Choose an active agent.');
    await repo.update(c.id, { owner_id: ownerId }, conn);
    await activity.add('change', c.id, user.id, `Assigned to ${u.name}`, 'system', conn);
    await audit.log({ action: 'Assigned change', entityType: 'change', entityId: c.id, entityRef: number, newValues: { owner: u.name } }, conn);
  });
  return get(number);
}

export function changeError(c, to, openTasks) {
  const st = stepsOf(c);
  if (CHANGE_DONE.includes(c.status)) return `This change is ${c.status.toLowerCase()} and read-only.`;
  if (to === 'Canceled') return CHANGE_CANCELABLE.includes(c.status) ? null : 'A change cannot be canceled once implementation has started.';
  if (to === 'Risk review' && c.status === 'Draft' && c.type === 'Standard') return 'Standard changes go straight from Draft to Scheduled.';
  if (st.indexOf(to) !== st.indexOf(c.status) + 1) return `The next state is ${st[st.indexOf(c.status) + 1] || 'none'}.`;
  const submitting = to === 'Approval' || (to === 'Scheduled' && c.status === 'Draft');
  if (submitting && !(c.backout_plan || '').trim()) return 'A backout plan is required.';
  if (submitting && !(c.implementation_plan || '').trim()) return 'An implementation plan is required.';
  if (to === 'Scheduled' && c.status === 'Approval') return 'The change is scheduled automatically once every approver agrees.';
  if (to === 'Verify' && openTasks) return `Close all ${openTasks} open change task(s) before moving to Verify.`;
  return null;
}

/** body: { to, closeCode, closeNotes, force } */
export async function transition(number, body, user) {
  let conflict = null;
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    const to = body.to;
    const err = changeError(c, to, await taskRepo.openCount('change', c.id, conn));
    if (err) throw unprocessable(err, 'INVALID_TRANSITION');
    let note = `State changed to ${to}`;
    const f = { status: to };
    if (to === 'Approval') {
      await approvalRepo.requestChange(c.id, conn);
      note = 'Approval requested from the change advisory board (CAB)';
      const approvers = await approvalRepo.forChange(c.id, conn);
      await notifications.notifyMany(approvers.map((a) => a.approver_id), { type: 'approval', title: `CAB approval needed: ${c.title} (${number})`, link: `/changes/${number}`, dedupeKey: `cab:${number}:${Date.now()}` }, conn);
    } else if (to === 'Scheduled' && c.status === 'Draft') {
      await approvalRepo.approveAllByPolicy(c.id, conn);
      note = 'Standard change. Pre-approved by policy and scheduled.';
    } else if (to === 'Doing') {
      const cf = await repo.conflictsFor(c.id, conn);
      if (cf.length && !body.force) { conflict = cf.map((x) => x.change_number); throw unprocessable(`This change overlaps with ${conflict.join(', ')} on a shared asset. Start anyway?`, 'SCHEDULE_CONFLICT', { conflicts: conflict }); }
      if (!(await taskRepo.countByParent('change', c.id, conn))) {
        const owner = await queryOne('SELECT primary_team_id FROM agents WHERE user_id = ?', [c.owner_id], conn);
        await createChangeTasks(conn, c, owner?.primary_team_id || null, user.id);
      }
      note = 'State changed to Doing. Change tasks created.';
    } else if (to === 'Closed') {
      if (!(await settingsRepo.lookupExists('change_close_code', body.closeCode, conn))) throw badRequest('Choose a close code.');
      if ((body.closeNotes || '').trim().length < 5) throw badRequest('Close notes are required (at least 5 characters).', 'VALIDATION_ERROR', { fields: { closeNotes: 'Too short' } });
      f.close_code = body.closeCode; f.close_notes = body.closeNotes.trim();
      note = `Closed (${body.closeCode}). ${f.close_notes}`;
    } else if (to === 'Canceled') {
      await approvalRepo.cancelPendingForChange(c.id, conn);
      note = 'Change canceled';
    }
    await repo.update(c.id, f, conn);
    await activity.add('change', c.id, user.id, note, 'system', conn);
    await audit.log({ action: `Change state: ${to}`, entityType: 'change', entityId: c.id, entityRef: number, oldValues: { status: c.status }, newValues: { status: to } }, conn);
  });
  return get(number);
}

/** A CAB approver (or an admin on their behalf) decides. */
export async function decide(number, approvalId, { decision, comment }, user) {
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    if (c.status !== 'Approval') throw unprocessable('This change is not waiting for approval.', 'NOT_PENDING');
    const a = await approvalRepo.lockById(approvalId, conn);
    if (!a || a.change_id !== c.id) throw notFound('Approval not found.');
    if (a.status !== 'Pending') throw unprocessable('This approval has already been decided.');
    if (a.approver_id !== user.id && !user.can('approval:override')) {
      const who = await queryOne('SELECT name FROM users WHERE id = ?', [a.approver_id], conn);
      throw forbidden(`Only ${who?.name || 'the approver'} or an admin can decide this approval.`);
    }
    if (!user.can('change:approve') && !user.can('approval:override')) throw forbidden();
    const status = decision === 'approve' ? 'Approved' : 'Rejected';
    await approvalRepo.decide(a.id, status, user.id, comment, conn);
    const who = await queryOne('SELECT name FROM users WHERE id = ?', [a.approver_id], conn);
    await activity.add('change', c.id, user.id, `${who?.name} (${a.approver_role}) ${status.toLowerCase()} the change${a.approver_id !== user.id ? ` (decided by ${user.name})` : ''}${comment ? ': ' + comment : ''}`, 'system', conn);
    await audit.log({ action: `${status} change`, entityType: 'change', entityId: c.id, entityRef: number, newValues: { approver: who?.name, role: a.approver_role, decision: status, comment } }, conn);

    // evalApprovals: one rejection sends it back; all approvals schedule it.
    const all = (await approvalRepo.forChange(c.id, conn)).filter((x) => x.status !== 'Cancelled');
    if (all.some((x) => x.status === 'Rejected')) {
      await repo.update(c.id, { status: 'Risk review' }, conn);
      await activity.add('change', c.id, null, 'Approval rejected. The change returns to Risk review for rework.', 'system', conn);
      await notifications.notify(c.owner_id, { type: 'approval', severity: 'warn', title: `${number} was rejected by the CAB`, link: `/changes/${number}` }, conn);
    } else if (all.every((x) => x.status === 'Approved')) {
      await repo.update(c.id, { status: 'Scheduled' }, conn);
      await activity.add('change', c.id, null, 'All approvers agreed. Change scheduled.', 'system', conn);
      await notifications.notify(c.owner_id, { type: 'approval', title: `${number} was approved and scheduled`, link: `/changes/${number}` }, conn);
    } else {
      await repo.touch(c.id, conn);
    }
  });
  return get(number);
}

export async function addAttachments(number, files, user) {
  if (!files?.length) throw badRequest('Choose at least one file.');
  await withTransaction(async (conn) => {
    const c = await load(number, conn);
    assertEditable(c);
    const stored = await attachments.storeFiles(conn, 'change', c.id, files, user.id);
    await activity.add('change', c.id, user.id, `Attached ${stored.map((s) => s.name).join(', ')}`, 'system', conn);
    await audit.log({ action: `Attached ${stored.length} file(s)`, entityType: 'change', entityId: c.id, entityRef: number }, conn);
  });
  return get(number);
}

export const settingsForCab = () => settings.get('cab_approvers');
