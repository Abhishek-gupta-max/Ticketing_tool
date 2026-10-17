import { insertOne, find, attach } from '../config/database.js';

// Activity collections of problems, changes and tasks share a shape. Collection
// and field names come from this whitelist only, never from input.
const TABLES = {
  problem: { table: 'problem_activities', fk: 'problem_id', typed: true },
  change: { table: 'change_activities', fk: 'change_id', typed: true },
  task: { table: 'task_activities', fk: 'task_id', typed: false },
};

export async function add(kind, parentId, userId, body, type = 'system', conn) {
  const t = TABLES[kind];
  const doc = { [t.fk]: parentId, user_id: userId || null, body };
  if (t.typed) doc.type = type;
  return insertOne(t.table, doc, conn);
}

export async function list(kind, parentId) {
  const t = TABLES[kind];
  const rows = await find(t.table, { [t.fk]: parentId }, {
    sort: { created_at: -1, id: -1 },
    projection: { id: 1, type: 1, body: 1, created_at: 1, user_id: 1 },
  });
  if (!t.typed) rows.forEach((r) => { r.type = 'system'; });
  return attach(rows, 'users', 'user_id', { user_name: 'name' });
}

export const addTaskComment = (taskId, userId, body, conn) => insertOne('task_comments', { task_id: taskId, user_id: userId, body }, conn);

export async function taskComments(taskId) {
  const rows = await find('task_comments', { task_id: taskId }, { sort: { created_at: -1 }, projection: { id: 1, body: 1, created_at: 1, user_id: 1 } });
  rows.forEach((r) => { r.type = 'note'; });
  return attach(rows, 'users', 'user_id', { user_name: 'name' });
}
