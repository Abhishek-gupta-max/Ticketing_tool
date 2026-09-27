import { query, queryOne } from '../config/database.js';
import { orderBy } from '../utils/pagination.js';

const CLOSED = "('Done','Not done','Not needed')";

export const TASK_SELECT = `
  s.id, s.task_number, s.type, s.ticket_id, s.problem_id, s.change_id, s.title, s.description, s.state, s.priority, s.assigned_to,
  au.name AS assignee_name, s.team_id, tm.name AS team_name, s.due_at, s.sort_order, s.is_sequential, s.closed_at, s.close_notes,
  s.created_at, s.updated_at,
  COALESCE(tk.ticket_number, pb.problem_number, ch.change_number) AS parent_number,
  COALESCE(tk.title, pb.title, ch.title) AS parent_title,
  COALESCE(tk.status, pb.status, ch.status) AS parent_status,
  CASE WHEN s.ticket_id IS NOT NULL THEN 'ticket' WHEN s.problem_id IS NOT NULL THEN 'problem' WHEN s.change_id IS NOT NULL THEN 'change' ELSE NULL END AS parent_type`;

export const TASK_FROM = `
  FROM tasks s
  LEFT JOIN users au ON au.id = s.assigned_to
  LEFT JOIN teams tm ON tm.id = s.team_id
  LEFT JOIN tickets tk ON tk.id = s.ticket_id
  LEFT JOIN problems pb ON pb.id = s.problem_id
  LEFT JOIN changes ch ON ch.id = s.change_id`;

export const QUICK = {
  mine: `s.assigned_to = :me AND s.state NOT IN ${CLOSED}`,
  open: `s.state NOT IN ${CLOSED}`,
  overdue: `s.state NOT IN ${CLOSED} AND s.due_at IS NOT NULL AND s.due_at < UTC_TIMESTAMP(3)`,
  unassigned: `s.state NOT IN ${CLOSED} AND s.assigned_to IS NULL`,
  closed: `s.state IN ${CLOSED}`,
  all: '1=1',
};

function buildWhere(f, user) {
  const w = [], p = [];
  if (f.quick && QUICK[f.quick]) {
    const c = QUICK[f.quick];
    if (c.includes(':me')) { w.push(c.replace(':me', '?')); p.push(user.id); } else w.push(c);
  }
  if (f.type) { w.push('s.type = ?'); p.push(f.type); }
  if (f.teamId) { w.push('s.team_id = ?'); p.push(f.teamId); }
  if (f.assignee === 'none') w.push('s.assigned_to IS NULL');
  else if (f.assignee) { w.push('s.assigned_to = ?'); p.push(Number(f.assignee)); }
  if (f.state) { w.push('s.state = ?'); p.push(f.state); }
  if (f.search) {
    const s = `%${f.search}%`;
    w.push('(s.task_number LIKE ? OR s.title LIKE ? OR tk.ticket_number LIKE ? OR pb.problem_number LIKE ? OR ch.change_number LIKE ?)');
    p.push(s, s, s, s, s);
  }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

const SORTS = { due: `(s.state IN ${CLOSED}), COALESCE(s.due_at, '9999-12-31')`, created: 's.created_at', number: 's.id', priority: 's.priority', state: 's.state', title: 's.title' };

export async function list(f, user, { limit, offset }) {
  const { sql, params } = buildWhere(f, user);
  const order = f.sortBy && SORTS[f.sortBy] && f.sortBy !== 'due' ? orderBy(f.sortBy, f.sortOrder, SORTS, 'created') : `${SORTS.due} ASC`;
  const rows = await query(`SELECT ${TASK_SELECT} ${TASK_FROM} ${sql} ORDER BY ${order}, s.id ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = (await queryOne(`SELECT COUNT(*) AS n ${TASK_FROM} ${sql}`, params)).n;
  return { rows, total };
}

export async function quickCounts(user) {
  const cols = Object.entries(QUICK).map(([k, c]) => `SUM(CASE WHEN ${c.replace(':me', String(Number(user.id)))} THEN 1 ELSE 0 END) AS \`${k}\``);
  const row = await queryOne(`SELECT ${cols.join(', ')} FROM tasks s`);
  return Object.fromEntries(Object.keys(QUICK).map((k) => [k, Number(row[k] || 0)]));
}

export async function kpis(userId) {
  return queryOne(
    `SELECT SUM(state NOT IN ${CLOSED}) AS open_count,
            SUM(state = 'Waiting') AS waiting,
            SUM(state NOT IN ${CLOSED} AND assigned_to = ?) AS mine,
            SUM(state NOT IN ${CLOSED} AND due_at IS NOT NULL AND due_at < UTC_TIMESTAMP(3)) AS overdue,
            SUM(state NOT IN ${CLOSED} AND assigned_to IS NULL) AS unassigned,
            SUM(closed_at IS NOT NULL AND closed_at > UTC_TIMESTAMP(3) - INTERVAL 7 DAY) AS closed_week
       FROM tasks`,
    [userId],
  );
}

export const findByNumber = (number, conn) => queryOne(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE s.task_number = ?`, [number], conn);
export const findById = (id, conn) => queryOne(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE s.id = ?`, [id], conn);
export const lockById = (id, conn) => queryOne('SELECT id FROM tasks WHERE id = ? FOR UPDATE', [id], conn);

const PARENT_COL = { ticket: 'ticket_id', problem: 'problem_id', change: 'change_id' };

export const byParent = (parentType, parentId, conn) => query(
  `SELECT ${TASK_SELECT} ${TASK_FROM} WHERE s.${PARENT_COL[parentType]} = ? ORDER BY s.sort_order, s.id`,
  [parentId],
  conn,
);

export const byTickets = (ticketIds) => (ticketIds.length ? query(
  `SELECT ${TASK_SELECT} ${TASK_FROM} WHERE s.ticket_id IN (${ticketIds.map(() => '?').join(',')}) ORDER BY s.ticket_id, s.sort_order`,
  ticketIds,
) : Promise.resolve([]));

export async function openCount(parentType, parentId, conn) {
  const row = await queryOne(`SELECT COUNT(*) AS n FROM tasks WHERE ${PARENT_COL[parentType]} = ? AND state NOT IN ${CLOSED}`, [parentId], conn);
  return row.n;
}

export async function countByParent(parentType, parentId, conn) {
  return (await queryOne(`SELECT COUNT(*) AS n FROM tasks WHERE ${PARENT_COL[parentType]} = ?`, [parentId], conn)).n;
}

export async function insert(t, conn) {
  const res = await query(
    `INSERT INTO tasks (task_number, type, ticket_id, problem_id, change_id, title, description, state, priority, assigned_to, team_id, due_at,
       sort_order, is_sequential, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.number, t.type, t.ticketId || null, t.problemId || null, t.changeId || null, t.title, t.description || null, t.state, t.priority,
      t.assignedTo || null, t.teamId || null, t.dueAt || null, t.sortOrder || 0, t.isSequential ? 1 : 0, t.createdBy || null],
    conn,
  );
  return res.insertId;
}

const UPDATABLE = ['state', 'priority', 'assigned_to', 'team_id', 'due_at', 'closed_at', 'close_notes', 'title', 'description'];
export async function update(id, fields, conn) {
  const keys = Object.keys(fields);
  keys.forEach((k) => { if (!UPDATABLE.includes(k)) throw new Error(`Column ${k} cannot be updated`); });
  if (!keys.length) return;
  await query(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id], conn);
}

/** Next waiting step of a sequential task list. */
export const nextWaiting = (parentType, parentId, afterOrder, conn) => queryOne(
  `SELECT id FROM tasks WHERE ${PARENT_COL[parentType]} = ? AND sort_order > ? AND state = 'Waiting' ORDER BY sort_order LIMIT 1`,
  [parentId, afterOrder],
  conn,
);

export const previousOpenStep = (parentType, parentId, beforeOrder) => queryOne(
  `SELECT task_number, title FROM tasks WHERE ${PARENT_COL[parentType]} = ? AND sort_order < ? AND state NOT IN ${CLOSED} ORDER BY sort_order DESC LIMIT 1`,
  [parentId, beforeOrder],
);

/** Give unassigned open tasks of a ticket to the new assignee. */
export const assignOpenUnassigned = (ticketId, userId, conn) => query(
  `UPDATE tasks SET assigned_to = ? WHERE ticket_id = ? AND assigned_to IS NULL AND state NOT IN ${CLOSED}`,
  [userId, ticketId],
  conn,
);

export const myOpen = (userId, limit = 6) => query(
  `SELECT ${TASK_SELECT} ${TASK_FROM} WHERE s.assigned_to = ? AND s.state NOT IN ${CLOSED} AND s.state <> 'Waiting'
    ORDER BY COALESCE(s.due_at, '9999-12-31') ASC LIMIT ?`,
  [userId, limit],
);

export const overdueAssigned = () => query(
  `SELECT id, task_number, title, assigned_to FROM tasks WHERE state NOT IN ${CLOSED} AND assigned_to IS NOT NULL AND due_at < UTC_TIMESTAMP(3) LIMIT 500`,
);
