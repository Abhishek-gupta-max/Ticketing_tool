import { withTransaction } from '../config/database.js';
import * as repo from '../repositories/problem.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as taskRepo from '../repositories/task.repository.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as activity from '../repositories/activity.repository.js';
import * as settingsRepo from '../repositories/settings.repository.js';
import * as audit from './audit.service.js';
import * as attachments from './attachment.service.js';
import { nextNumber } from './sequence.service.js';
import { applyStatus, transitionError } from './ticket.service.js';
import * as map from '../models/mappers.js';
import { badRequest, notFound, unprocessable } from '../utils/AppError.js';
import { PROBLEM_STEPS, PRIORITY_NAMES } from '../constants/workflow.js';

async function load(number, conn) {
  const p = await repo.findByNumber(number, conn);
  if (!p) throw notFound(`Problem ${number} was not found.`);
  if (conn) await repo.lockById(p.id, conn);
  return p;
}

const assertEditable = (p) => { if (p.status === 'Closed') throw unprocessable('Closed problems are read-only.', 'PROBLEM_CLOSED'); };

export async function list(q) {
  const [rows, k, sug] = await Promise.all([repo.list(q), repo.kpis(), repo.suggestions()]);
  return {
    items: rows.map(map.problem),
    kpis: { open: Number(k.open_count || 0), known: Number(k.known || 0), linkedOpen: Number(k.linked_open || 0), avgAgeDays: Number(k.avg_age_days || 0) },
    suggestions: sug.map((s) => ({ title: s.title, count: s.n, category: s.category, priority: s.priority })),
  };
}

export async function get(number) {
  const p = await load(number);
  const [tasks, acts, files, changes, linked] = await Promise.all([
    taskRepo.byParent('problem', p.id), activity.list('problem', p.id), attachments.listFor('problem', p.id), changeRepo.byProblem(p.id),
    ticketRepo.list({ problemId: p.id, sortBy: 'created', sortOrder: 'DESC' }, { isStaff: true, can: () => true, id: 0 }, { limit: 15, offset: 0 }),
  ]);
  return {
    ...map.problem(p),
    tasks: tasks.map(map.task),
    activity: acts.map((a) => map.timelineEntry(a)),
    attachments: files,
    changes: changes.map((c) => ({ id: c.id, number: c.change_number, title: c.title, status: c.status })),
    incidents: linked.rows.map((r) => map.ticket(r)),
    incidentTotal: linked.total,
  };
}

export async function createInConnection(conn, o, user) {
  const number = await nextNumber(conn, 'PRB');
  const id = await repo.insert({ number, title: o.title, priority: o.priority || 3, ownerId: o.ownerId || user.id, rootCause: o.rootCause, workaround: o.workaround, createdBy: user.id }, conn);
  await activity.add('problem', id, null, 'Problem record created', 'system', conn);
  await audit.log({ action: 'Created problem', entityType: 'problem', entityId: id, entityRef: number, newValues: { title: o.title } }, conn);
  return { id, number };
}

export async function create(body, user) {
  const p = await withTransaction((conn) => createInConnection(conn, body, user));
  return get(p.number);
}

/** Create a problem from a group of repeating incidents and link them all. */
export async function createFromSuggestion(title, user) {
  const p = await withTransaction(async (conn) => {
    const list = await ticketRepo.similarWithoutProblem(title, 0);
    if (!list.length) throw unprocessable('There are no unlinked incidents with that summary.');
    const pri = (await conn.query(`SELECT MIN(priority) AS p FROM tickets WHERE id IN (${list.map(() => '?').join(',')})`, list.map((t) => t.id)))[0][0].p;
    const created = await createInConnection(conn, { title, priority: pri }, user);
    for (const t of list) {
      await ticketRepo.update(t.id, { problem_id: created.id }, conn);
      await ticketRepo.addActivity(t.id, user.id, `Linked to problem ${created.number}`, conn);
    }
    await activity.add('problem', created.id, null, `${list.length} incidents linked automatically`, 'system', conn);
    return { ...created, linked: list.length };
  });
  return { problem: await get(p.number), linked: p.linked };
}

export async function update(number, body, user) {
  await withTransaction(async (conn) => {
    const p = await load(number, conn);
    assertEditable(p);
    const f = {};
    if (body.rootCause !== undefined) f.root_cause = body.rootCause;
    if (body.workaround !== undefined) f.workaround = body.workaround;
    if (body.title !== undefined) f.title = body.title;
    if (body.priority !== undefined && body.priority !== p.priority) {
      f.priority = body.priority;
      await activity.add('problem', p.id, user.id, `Priority set to ${PRIORITY_NAMES[body.priority]}`, 'system', conn);
    }
    if (body.ownerId !== undefined && body.ownerId !== p.owner_id) {
      f.owner_id = body.ownerId;
      const u = (await conn.query('SELECT name FROM users WHERE id = ?', [body.ownerId]))[0][0];
      await activity.add('problem', p.id, user.id, `Assigned to ${u?.name || 'Unknown'}`, 'system', conn);
    }
    await repo.update(p.id, f, conn);
    await audit.log({ action: 'Updated problem', entityType: 'problem', entityId: p.id, entityRef: number, newValues: Object.keys(f) }, conn);
  });
  return get(number);
}

function problemError(p, to, openTasks) {
  const i = PROBLEM_STEPS.indexOf(p.status), j = PROBLEM_STEPS.indexOf(to);
  if (p.status === 'Closed') return 'Closed problems are read-only.';
  if (to === p.status) return null;
  if (p.status === 'Fixed' && (to === 'Finding cause' || to === 'Fix underway')) return null;
  if (j !== i + 1) return `Move through the states in order. The next state is ${PROBLEM_STEPS[i + 1] || 'none'}.`;
  if (to === 'Fix underway' && (p.root_cause || '').trim().length < 5) return 'Add the root cause (cause notes) before moving to Fix underway.';
  if (to === 'Fixed' && openTasks) return `Close all ${openTasks} open problem task(s) before marking the problem fixed.`;
  return null;
}

/** body: { status, resolutionCode, fixNotes, resolveLinked } */
export async function changeStatus(number, body, user) {
  let resolvedIncidents = 0;
  await withTransaction(async (conn) => {
    const p = await load(number, conn);
    const to = body.status;
    const err = problemError(p, to, await taskRepo.openCount('problem', p.id, conn));
    if (err) throw unprocessable(err, 'INVALID_TRANSITION');
    if (to === p.status) return;
    if (to === 'Fixed') {
      if (!(await settingsRepo.lookupExists('problem_code', body.resolutionCode, conn))) throw badRequest('Choose a resolution code.');
      if ((body.fixNotes || '').trim().length < 5) throw badRequest('Fix notes are required (at least 5 characters).', 'VALIDATION_ERROR', { fields: { fixNotes: 'Too short' } });
      if (body.resolveLinked) {
        const linked = await ticketRepo.list({ problemId: p.id, quick: 'open' }, { isStaff: true, can: () => true, id: 0 }, { limit: 1000, offset: 0 });
        for (const row of linked.rows) {
          await ticketRepo.lockById(row.id, conn);
          const t = await ticketRepo.findById(row.id, conn);
          if (!transitionError(t, 'Resolved', await taskRepo.openCount('ticket', t.id, conn))) {
            await applyStatus(conn, t, 'Resolved', { code: 'Fixed', note: `Fixed by problem ${p.problem_number}: ${body.fixNotes.trim()}` }, user);
            resolvedIncidents++;
          }
        }
      }
      await repo.update(p.id, { status: 'Fixed', resolution_code: body.resolutionCode, fix_notes: body.fixNotes.trim(), resolved_at: new Date() }, conn);
      await activity.add('problem', p.id, user.id, `Fixed (${body.resolutionCode}). ${body.fixNotes.trim()}`, 'system', conn);
      await audit.log({ action: 'Marked problem fixed', entityType: 'problem', entityId: p.id, entityRef: number, newValues: { resolvedIncidents } }, conn);
      return;
    }
    const back = p.status === 'Fixed' && to !== 'Closed';
    await repo.update(p.id, back ? { status: to, resolved_at: null } : { status: to }, conn);
    await activity.add('problem', p.id, user.id, back ? `Problem reopened. State set to ${to}` : `State changed to ${to}`, 'system', conn);
    await audit.log({ action: `Set problem state to ${to}`, entityType: 'problem', entityId: p.id, entityRef: number, oldValues: { status: p.status }, newValues: { status: to } }, conn);
  });
  return { problem: await get(number), resolvedIncidents };
}

export async function toggleKnownError(number, user) {
  await withTransaction(async (conn) => {
    const p = await load(number, conn);
    assertEditable(p);
    if (!p.is_known_error) {
      if (PROBLEM_STEPS.indexOf(p.status) < 2) throw unprocessable('Move the problem to Finding cause before marking it a known error.');
      if ((p.workaround || '').trim().length < 5) throw unprocessable('Record a workaround before marking this a known error.');
    }
    await repo.update(p.id, { is_known_error: p.is_known_error ? 0 : 1 }, conn);
    await activity.add('problem', p.id, user.id, p.is_known_error ? 'Known error flag removed' : 'Marked as a known error', 'system', conn);
    await audit.log({ action: `${p.is_known_error ? 'Cleared' : 'Marked'} known error`, entityType: 'problem', entityId: p.id, entityRef: number }, conn);
  });
  return get(number);
}

export async function addNote(number, body, user) {
  await withTransaction(async (conn) => {
    const p = await load(number, conn);
    assertEditable(p);
    await activity.add('problem', p.id, user.id, body, 'note', conn);
    await audit.log({ action: 'Added problem note', entityType: 'problem', entityId: p.id, entityRef: number }, conn);
  });
  return get(number);
}

export async function linkIncident(number, ticketNumber, user) {
  await withTransaction(async (conn) => {
    const p = await load(number, conn);
    assertEditable(p);
    const t = await ticketRepo.findByNumber(ticketNumber, conn);
    if (!t || t.kind !== 'incident') throw badRequest('Choose an incident.');
    await ticketRepo.update(t.id, { problem_id: p.id }, conn);
    await ticketRepo.addActivity(t.id, user.id, `Linked to problem ${p.problem_number}`, conn);
    await activity.add('problem', p.id, user.id, `Incident ${t.ticket_number} linked`, 'system', conn);
    await audit.log({ action: 'Linked incident', entityType: 'problem', entityId: p.id, entityRef: number, newValues: { ticket: t.ticket_number } }, conn);
  });
  return get(number);
}

export async function addAttachments(number, files, user) {
  if (!files?.length) throw badRequest('Choose at least one file.');
  await withTransaction(async (conn) => {
    const p = await load(number, conn);
    assertEditable(p);
    const stored = await attachments.storeFiles(conn, 'problem', p.id, files, user.id);
    await activity.add('problem', p.id, user.id, `Attached ${stored.map((s) => s.name).join(', ')}`, 'system', conn);
    await audit.log({ action: `Attached ${stored.length} file(s)`, entityType: 'problem', entityId: p.id, entityRef: number }, conn);
  });
  return get(number);
}

export const options = async () => (await repo.openOptions()).map((p) => ({ id: p.id, number: p.problem_number, title: p.title }));
