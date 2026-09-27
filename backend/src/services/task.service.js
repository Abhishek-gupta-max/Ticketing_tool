import { withTransaction, queryOne } from '../config/database.js';
import * as repo from '../repositories/task.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as problemRepo from '../repositories/problem.repository.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as activity from '../repositories/activity.repository.js';
import * as audit from './audit.service.js';
import * as attachments from './attachment.service.js';
import * as notifications from './notification.service.js';
import { insertTask } from './taskFactory.js';
import * as map from '../models/mappers.js';
import { pageParams, pageMeta } from '../utils/pagination.js';
import { badRequest, notFound, unprocessable } from '../utils/AppError.js';
import { TASK_CLOSED_STATES, allowedTaskStates, PRIORITY_NAMES } from '../constants/workflow.js';

const closed = (t) => TASK_CLOSED_STATES.includes(t.state);

async function load(number, conn) {
  const t = await repo.findByNumber(number, conn);
  if (!t) throw notFound(`Task ${number} was not found.`);
  if (conn) await repo.lockById(t.id, conn);
  return t;
}

const parentOf = (t) => (t.ticket_id ? ['ticket', t.ticket_id] : t.problem_id ? ['problem', t.problem_id] : t.change_id ? ['change', t.change_id] : [null, null]);

/** Record a line on the parent's timeline. */
async function parentActivity(conn, t, userId, text) {
  const [type, id] = parentOf(t);
  if (type === 'ticket') { await ticketRepo.addActivity(id, userId, text, conn); await ticketRepo.touch(id, conn); }
  else if (type) await activity.add(type, id, userId, text, 'system', conn);
}

export async function list(q, user) {
  const pg = pageParams(q, 25);
  const [{ rows, total }, counts, k] = await Promise.all([repo.list(q, user, pg), repo.quickCounts(user), repo.kpis(user.id)]);
  return {
    items: rows.map(map.task),
    meta: { ...pageMeta(pg, total), counts },
    kpis: { open: Number(k.open_count || 0), waiting: Number(k.waiting || 0), mine: Number(k.mine || 0), overdue: Number(k.overdue || 0), unassigned: Number(k.unassigned || 0), closedWeek: Number(k.closed_week || 0) },
  };
}

export async function get(number) {
  const t = await load(number);
  const [type, id] = parentOf(t);
  const [siblings, notes, acts, files] = await Promise.all([
    type ? repo.byParent(type, id) : [], activity.taskComments(t.id), activity.list('task', t.id), attachments.listFor('task', t.id),
  ]);
  const prev = t.is_sequential && t.state === 'Waiting' && type ? await repo.previousOpenStep(type, id, t.sort_order) : null;
  return {
    ...map.task(t),
    allowedStates: allowedTaskStates(t.state),
    siblings: siblings.filter((s) => s.id !== t.id).map(map.task),
    stepCount: siblings.length,
    waitingFor: prev ? { number: prev.task_number, title: prev.title } : null,
    timeline: [...notes, ...acts].map((a) => map.timelineEntry(a)).sort((a, b) => new Date(b.at) - new Date(a.at)),
    attachments: files,
  };
}

function typeForParent(kind, row) {
  if (!kind) return 'Task';
  if (kind === 'change') return 'Change task';
  if (kind === 'problem') return 'Problem task';
  return row.kind === 'request' ? 'Catalog task' : 'Incident task';
}

/** body: { title, description, parentNumber, teamId, assigneeId, priority, dueAt } */
export async function create(body, user) {
  const number = await withTransaction(async (conn) => {
    let kind = null, parent = null;
    const pn = body.parentNumber?.trim().toUpperCase();
    if (pn) {
      if (pn.startsWith('CHG-')) { kind = 'change'; parent = await changeRepo.findByNumber(pn, conn); }
      else if (pn.startsWith('PRB-')) { kind = 'problem'; parent = await problemRepo.findByNumber(pn, conn); }
      else { kind = 'ticket'; parent = await ticketRepo.findByNumber(pn, conn); }
      if (!parent) throw badRequest('No ticket, change or problem has that number.', 'VALIDATION_ERROR', { fields: { parentNumber: 'Not found' } });
      if (['Closed', 'Canceled'].includes(parent.status)) throw unprocessable('The parent record is closed.');
    }
    if (body.assigneeId && body.teamId && !(await teamRepo.isMember(body.teamId, body.assigneeId, conn))) throw badRequest('The assignee is not a member of that team.');
    const order = kind ? await repo.countByParent(kind, parent.id, conn) : 0;
    const created = await insertTask(conn, {
      type: typeForParent(kind, parent), ticketId: kind === 'ticket' ? parent.id : null, problemId: kind === 'problem' ? parent.id : null,
      changeId: kind === 'change' ? parent.id : null, title: body.title, description: body.description, assignedTo: body.assigneeId || null,
      teamId: body.teamId, priority: body.priority || 3, dueAt: body.dueAt ? new Date(body.dueAt) : null, sortOrder: order,
    }, user.id);
    if (parent) {
      const t = await repo.findById(created.id, conn);
      await parentActivity(conn, t, user.id, `Task ${created.number} added: ${body.title}`);
    }
    if (body.assigneeId && body.assigneeId !== user.id) await notifications.notify(body.assigneeId, { type: 'assigned', title: `Task ${created.number} was assigned to you: ${body.title}`, link: `/tasks/${created.number}` }, conn);
    await audit.log({ action: 'Created task', entityType: 'task', entityId: created.id, entityRef: created.number, newValues: { title: body.title, parent: pn || null } }, conn);
    return created.number;
  });
  return get(number);
}

/** Close or move a task. Closing a sequential step opens the next waiting one. */
export async function setState(number, { state, note }, user) {
  await withTransaction(async (conn) => {
    const t = await load(number, conn);
    if (closed(t)) throw unprocessable('This task is closed and read-only.', 'TASK_CLOSED');
    if (state === t.state) return;
    if (!allowedTaskStates(t.state).includes(state)) throw unprocessable(t.state === 'Waiting' ? 'This task opens when the previous step is closed.' : `A task in ${t.state} cannot move to ${state}.`, 'INVALID_TRANSITION');
    if ((state === 'Not done' || state === 'Not needed') && (note || '').trim().length < 3) throw badRequest('Close notes are required for this state.', 'VALIDATION_ERROR', { fields: { note: 'Required' } });
    const f = { state };
    if (TASK_CLOSED_STATES.includes(state)) {
      f.closed_at = new Date();
      if (note?.trim()) f.close_notes = note.trim();
    }
    await repo.update(t.id, f, conn);
    if (TASK_CLOSED_STATES.includes(state) && t.is_sequential) {
      const [type, id] = parentOf(t);
      const nx = type ? await repo.nextWaiting(type, id, t.sort_order, conn) : null;
      if (nx) {
        await repo.update(nx.id, { state: 'Ready' }, conn);
        await activity.add('task', nx.id, null, 'Opened because the previous task was closed', 'system', conn);
      }
    }
    await activity.add('task', t.id, user.id, `State changed from ${t.state} to ${state}${note?.trim() ? '. ' + note.trim() : ''}`, 'system', conn);
    await parentActivity(conn, t, user.id, `${t.task_number} (${t.title}) set to ${state}`);
    await audit.log({ action: `Task ${state}`, entityType: 'task', entityId: t.id, entityRef: t.task_number, oldValues: { state: t.state }, newValues: { state } }, conn);
  });
  return get(number);
}

/** body: { priority, teamId, assigneeId, dueAt } */
export async function update(number, body, user) {
  await withTransaction(async (conn) => {
    const t = await load(number, conn);
    if (closed(t)) throw unprocessable('This task is closed and read-only.', 'TASK_CLOSED');
    if (body.priority !== undefined && body.priority !== t.priority) {
      await repo.update(t.id, { priority: body.priority }, conn);
      await activity.add('task', t.id, user.id, `Priority set to ${PRIORITY_NAMES[body.priority]}`, 'system', conn);
    }
    if (body.teamId !== undefined && body.teamId !== t.team_id) {
      const team = await teamRepo.findById(body.teamId, conn);
      if (!team) throw badRequest('Choose a team.');
      const f = { team_id: team.id };
      let text = `Team changed to ${team.name}`;
      if (t.assigned_to && !(await teamRepo.isMember(team.id, t.assigned_to, conn))) { f.assigned_to = null; text += `. ${t.assignee_name} was unassigned.`; }
      await repo.update(t.id, f, conn);
      await activity.add('task', t.id, user.id, text, 'system', conn);
    }
    if (body.assigneeId !== undefined && body.assigneeId !== t.assigned_to) {
      let name = 'Unassigned';
      if (body.assigneeId) {
        const u = await queryOne("SELECT u.name, a.primary_team_id FROM users u JOIN agents a ON a.user_id = u.id WHERE u.id = ? AND u.status = 'active'", [body.assigneeId], conn);
        if (!u) throw badRequest('Choose an active agent.');
        name = u.name;
        const fresh = await repo.findById(t.id, conn);
        const f = { assigned_to: body.assigneeId };
        if (fresh.team_id && !(await teamRepo.isMember(fresh.team_id, body.assigneeId, conn))) f.team_id = u.primary_team_id;
        await repo.update(t.id, f, conn);
        if (body.assigneeId !== user.id) await notifications.notify(body.assigneeId, { type: 'assigned', title: `Task ${t.task_number} was assigned to you`, link: `/tasks/${t.task_number}` }, conn);
      } else await repo.update(t.id, { assigned_to: null }, conn);
      await activity.add('task', t.id, user.id, body.assigneeId ? `Assigned to ${name}` : 'Unassigned', 'system', conn);
    }
    if (body.dueAt !== undefined) {
      const due = body.dueAt ? new Date(body.dueAt) : null;
      await repo.update(t.id, { due_at: due }, conn);
      await activity.add('task', t.id, user.id, `Due date set to ${due ? due.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'none'}`, 'system', conn);
    }
    await audit.log({ action: 'Updated task', entityType: 'task', entityId: t.id, entityRef: t.task_number, newValues: body }, conn);
  });
  return get(number);
}

export async function addNote(number, body, user) {
  await withTransaction(async (conn) => {
    const t = await load(number, conn);
    if (closed(t)) throw unprocessable('This task is closed and read-only.');
    await activity.addTaskComment(t.id, user.id, body, conn);
    await audit.log({ action: 'Added task work note', entityType: 'task', entityId: t.id, entityRef: t.task_number }, conn);
  });
  return get(number);
}

export async function addAttachments(number, files, user) {
  if (!files?.length) throw badRequest('Choose at least one file.');
  await withTransaction(async (conn) => {
    const t = await load(number, conn);
    if (closed(t)) throw unprocessable('This task is closed and read-only.');
    const stored = await attachments.storeFiles(conn, 'task', t.id, files, user.id);
    await activity.add('task', t.id, user.id, `Attached ${stored.map((s) => s.name).join(', ')}`, 'system', conn);
    await audit.log({ action: `Attached ${stored.length} file(s)`, entityType: 'task', entityId: t.id, entityRef: t.task_number }, conn);
  });
  return get(number);
}
