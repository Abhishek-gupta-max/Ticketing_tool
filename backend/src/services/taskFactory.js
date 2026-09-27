// Low-level task creation shared by tickets, requests, problems and changes.
// Always runs inside the caller's transaction.
import * as taskRepo from '../repositories/task.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as activity from '../repositories/activity.repository.js';
import { nextNumber } from './sequence.service.js';
import { CHANGE_DEFAULT_TASKS } from '../constants/workflow.js';

export async function insertTask(conn, o, actorId) {
  const number = await nextNumber(conn, 'TSK');
  const id = await taskRepo.insert({
    number,
    type: o.type || 'Task',
    ticketId: o.ticketId, problemId: o.problemId, changeId: o.changeId,
    title: o.title,
    description: o.description,
    state: o.state || 'Ready',
    priority: o.priority || 3,
    assignedTo: o.assignedTo,
    teamId: o.teamId,
    dueAt: o.dueAt,
    sortOrder: o.sortOrder || 0,
    isSequential: !!o.isSequential,
    createdBy: actorId,
  }, conn);
  await activity.add('task', id, null, 'Task created', 'system', conn);
  return { id, number };
}

/** Fulfilment tasks for an approved (or approval-free) catalog order item. */
export async function createCatalogTasks(conn, ticket, actorId) {
  const titles = ticket.catalog_item_id ? await catalogRepo.taskTitles(ticket.catalog_item_id, conn) : [];
  const list = titles.length ? titles : ['Fulfil the request'];
  for (let i = 0; i < list.length; i++) {
    await insertTask(conn, {
      type: 'Catalog task', ticketId: ticket.id, title: list[i], assignedTo: ticket.assigned_to, teamId: ticket.team_id,
      priority: ticket.priority, sortOrder: i, isSequential: true, state: i === 0 ? 'Ready' : 'Waiting', dueAt: ticket.sla_resolution_due_at,
    }, actorId);
  }
  return list.length;
}

/** The four implementation tasks created when a change moves to Doing. */
export async function createChangeTasks(conn, change, teamId, actorId) {
  for (let i = 0; i < CHANGE_DEFAULT_TASKS.length; i++) {
    await insertTask(conn, {
      type: 'Change task', changeId: change.id, title: CHANGE_DEFAULT_TASKS[i], assignedTo: change.owner_id, teamId,
      priority: 3, sortOrder: i, dueAt: change.planned_end,
    }, actorId);
  }
}
