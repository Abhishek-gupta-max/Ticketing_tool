import { query } from '../config/database.js';

// Activity tables of problems, changes and tasks share a shape. Table and column
// names come from this whitelist only, never from input.
const TABLES = {
  problem: { table: 'problem_activities', fk: 'problem_id', typed: true },
  change: { table: 'change_activities', fk: 'change_id', typed: true },
  task: { table: 'task_activities', fk: 'task_id', typed: false },
};

export async function add(kind, parentId, userId, body, type = 'system', conn) {
  const t = TABLES[kind];
  if (t.typed) return query(`INSERT INTO ${t.table} (${t.fk}, user_id, type, body) VALUES (?, ?, ?, ?)`, [parentId, userId || null, type, body], conn);
  return query(`INSERT INTO ${t.table} (${t.fk}, user_id, body) VALUES (?, ?, ?)`, [parentId, userId || null, body], conn);
}

export async function list(kind, parentId) {
  const t = TABLES[kind];
  return query(
    `SELECT a.id, ${t.typed ? 'a.type' : "'system' AS type"}, a.body, a.created_at, a.user_id, u.name AS user_name
       FROM ${t.table} a LEFT JOIN users u ON u.id = a.user_id WHERE a.${t.fk} = ? ORDER BY a.created_at DESC, a.id DESC`,
    [parentId],
  );
}

export const addTaskComment = (taskId, userId, body, conn) => query('INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)', [taskId, userId, body], conn);
export const taskComments = (taskId) => query(
  `SELECT c.id, 'note' AS type, c.body, c.created_at, c.user_id, u.name AS user_name
     FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at DESC`,
  [taskId],
);
