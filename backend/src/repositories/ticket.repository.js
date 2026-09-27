import { query, queryOne } from '../config/database.js';
import { SQL_OPEN, SQL_BREACHED, SQL_RISK, SQL_SLA_LEFT } from '../utils/sla.js';
import { orderBy } from '../utils/pagination.js';

// Columns shared by list and detail queries.
export const TICKET_SELECT = `
  t.id, t.ticket_number, t.kind, t.title, t.description, t.customer_id, c.name AS customer_name, c.is_internal AS customer_internal,
  t.requester_id, rq.name AS requester_name, rq.email AS requester_email, rq.is_vip AS requester_vip, rq.user_id AS requester_user_id,
  t.category_id, cat.name AS category_name, t.team_id, tm.name AS team_name, t.assigned_to, au.name AS assignee_name,
  t.channel, t.impact, t.urgency, t.priority, pr.resolution_minutes AS policy_resolution_minutes, t.status, t.hold_reason, t.is_major,
  t.sla_response_due_at, t.sla_resolution_due_at, t.paused_at, t.paused_seconds, t.first_response_at, t.resolved_at, t.closed_at,
  t.resolution_code, t.resolution_notes, t.csat, t.reopened_count, t.asset_id, t.problem_id, t.change_id, t.parent_ticket_id,
  t.request_id, t.catalog_item_id, t.created_by, t.created_at, t.updated_at`;

export const TICKET_FROM = `
  FROM tickets t
  JOIN customers c ON c.id = t.customer_id
  JOIN people rq ON rq.id = t.requester_id
  JOIN ticket_categories cat ON cat.id = t.category_id
  JOIN priorities pr ON pr.id = t.priority
  LEFT JOIN teams tm ON tm.id = t.team_id
  LEFT JOIN users au ON au.id = t.assigned_to`;

const SORTS = {
  created: 't.created_at', created_at: 't.created_at', title: 't.title', cust: 'c.name', customer: 'c.name', priority: 't.priority',
  status: "FIELD(t.status,'New','In Progress','On Hold','Awaiting approval','Resolved','Closed')", assignee: "COALESCE(au.name,'~')",
  sla: SQL_SLA_LEFT, updated: 't.updated_at', updated_at: 't.updated_at', number: 't.id',
};

export const QUICK = {
  open: SQL_OPEN,
  mine: `${SQL_OPEN} AND t.assigned_to = :me`,
  unassigned: `${SQL_OPEN} AND t.assigned_to IS NULL AND t.status <> 'Awaiting approval'`,
  breached: SQL_BREACHED,
  risk: SQL_RISK,
  onhold: "t.status = 'On Hold'",
  resolved: "t.status IN ('Resolved','Closed')",
  all: '1=1',
};

/** WHERE clause from validated filters. Every value is a bound parameter. */
export function buildWhere(f, user) {
  const w = ['t.deleted_at IS NULL'], p = [];
  if (!user.isStaff || !user.can('ticket:view_all')) { w.push('t.requester_id = ?'); p.push(user.personId || -1); }
  if (f.quick && QUICK[f.quick]) {
    const cond = QUICK[f.quick];
    if (cond.includes(':me')) { w.push(cond.replace(':me', '?')); p.push(user.id); } else w.push(cond);
  }
  if (f.kind) { w.push('t.kind = ?'); p.push(f.kind); }
  if (f.status?.length) { w.push(`t.status IN (${f.status.map(() => '?').join(',')})`); p.push(...f.status); }
  if (f.priority?.length) { w.push(`t.priority IN (${f.priority.map(() => '?').join(',')})`); p.push(...f.priority); }
  if (f.teamId) { w.push('t.team_id = ?'); p.push(f.teamId); }
  if (f.assignee === 'none') w.push('t.assigned_to IS NULL');
  else if (f.assignee === 'me') { w.push('t.assigned_to = ?'); p.push(user.id); }
  else if (f.assignee) { w.push('t.assigned_to = ?'); p.push(Number(f.assignee)); }
  if (f.customerId) { w.push('t.customer_id = ?'); p.push(f.customerId); }
  if (f.categoryId) { w.push('t.category_id = ?'); p.push(f.categoryId); }
  if (f.problemId) { w.push('t.problem_id = ?'); p.push(f.problemId); }
  if (f.assetId) { w.push('t.asset_id = ?'); p.push(f.assetId); }
  if (f.requestId) { w.push('t.request_id = ?'); p.push(f.requestId); }
  if (f.withoutProblem) w.push('t.problem_id IS NULL');
  if (f.dateFrom) { w.push('t.created_at >= ?'); p.push(f.dateFrom); }
  if (f.dateTo) { w.push('t.created_at < ?'); p.push(f.dateTo); }
  if (f.search) {
    const s = `%${f.search}%`;
    w.push('(t.ticket_number LIKE ? OR t.title LIKE ? OR rq.name LIKE ? OR c.name LIKE ?)');
    p.push(s, s, s, s);
  }
  return { sql: 'WHERE ' + w.join(' AND '), params: p };
}

export async function list(f, user, { limit, offset }) {
  const { sql, params } = buildWhere(f, user);
  const order = orderBy(f.sortBy, f.sortOrder, SORTS, 'created');
  const rows = await query(`SELECT ${TICKET_SELECT} ${TICKET_FROM} ${sql} ORDER BY ${order}, t.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = (await queryOne(`SELECT COUNT(*) AS n ${TICKET_FROM} ${sql}`, params)).n;
  return { rows, total };
}

/** All rows for exports (bounded). */
export async function listAll(f, user, max = 20000) {
  const { sql, params } = buildWhere(f, user);
  const order = orderBy(f.sortBy, f.sortOrder, SORTS, 'created');
  return query(`SELECT ${TICKET_SELECT} ${TICKET_FROM} ${sql} ORDER BY ${order}, t.id DESC LIMIT ?`, [...params, max]);
}

/** Counts per quick view, within the user's scope and the non-quick filters. */
export async function quickCounts(f, user) {
  const { sql, params } = buildWhere({ ...f, quick: undefined }, user);
  const cols = Object.entries(QUICK).map(([k, cond]) => {
    const c = cond.replace(':me', String(Number(user.id)));
    return `SUM(CASE WHEN ${c} THEN 1 ELSE 0 END) AS \`${k}\``;
  });
  const row = await queryOne(`SELECT ${cols.join(', ')} ${TICKET_FROM} ${sql}`, params);
  return Object.fromEntries(Object.keys(QUICK).map((k) => [k, Number(row[k] || 0)]));
}

export async function boardColumn(f, user, status, limit = 20) {
  const { sql, params } = buildWhere({ ...f, status: [status] }, user);
  const rows = await query(`SELECT ${TICKET_SELECT} ${TICKET_FROM} ${sql} ORDER BY ${SQL_SLA_LEFT} ASC, t.id DESC LIMIT ?`, [...params, limit]);
  const total = (await queryOne(`SELECT COUNT(*) AS n ${TICKET_FROM} ${sql}`, params)).n;
  return { rows, total };
}

export const findByNumber = (number, conn) => queryOne(`SELECT ${TICKET_SELECT} ${TICKET_FROM} WHERE t.ticket_number = ? AND t.deleted_at IS NULL`, [number], conn);
export const findById = (id, conn) => queryOne(`SELECT ${TICKET_SELECT} ${TICKET_FROM} WHERE t.id = ? AND t.deleted_at IS NULL`, [id], conn);

/** Lock the ticket row for the rest of the transaction. */
export const lockById = (id, conn) => queryOne('SELECT id FROM tickets WHERE id = ? FOR UPDATE', [id], conn);

export async function insert(t, conn) {
  const res = await query(
    `INSERT INTO tickets (ticket_number, kind, title, description, customer_id, requester_id, category_id, team_id, assigned_to, channel, impact, urgency,
       priority, status, sla_response_due_at, sla_resolution_due_at, asset_id, problem_id, parent_ticket_id, request_id, catalog_item_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [t.number, t.kind, t.title, t.description || null, t.customerId, t.requesterId, t.categoryId, t.teamId, t.assignedTo || null, t.channel,
      t.impact, t.urgency, t.priority, t.status, t.slaResponseDueAt, t.slaResolutionDueAt, t.assetId || null, t.problemId || null,
      t.parentId || null, t.requestId || null, t.catalogItemId || null, t.createdBy || null],
    conn,
  );
  return res.insertId;
}

const UPDATABLE = {
  title: 'title', description: 'description', team_id: 'team_id', assigned_to: 'assigned_to', category_id: 'category_id', impact: 'impact',
  urgency: 'urgency', priority: 'priority', status: 'status', hold_reason: 'hold_reason', is_major: 'is_major', sla_response_due_at: 'sla_response_due_at',
  sla_resolution_due_at: 'sla_resolution_due_at', paused_at: 'paused_at', paused_seconds: 'paused_seconds', first_response_at: 'first_response_at',
  resolved_at: 'resolved_at', closed_at: 'closed_at', resolution_code: 'resolution_code', resolution_notes: 'resolution_notes', csat: 'csat',
  reopened_count: 'reopened_count', asset_id: 'asset_id', problem_id: 'problem_id', change_id: 'change_id',
};

/** Update whitelisted columns and bump updated_at. */
export async function update(id, fields, conn) {
  const sets = [], params = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!UPDATABLE[k]) throw new Error(`Column ${k} cannot be updated`);
    sets.push(`${UPDATABLE[k]} = ?`); params.push(v);
  }
  sets.push('updated_at = UTC_TIMESTAMP(3)');
  await query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, [...params, id], conn);
}

export const touch = (id, conn) => query('UPDATE tickets SET updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [id], conn);
export const softDelete = (id, conn) => query('UPDATE tickets SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?', [id], conn);

// ---------- timeline ----------
export const addActivity = (ticketId, userId, body, conn) => query(
  'INSERT INTO ticket_activities (ticket_id, user_id, body) VALUES (?, ?, ?)', [ticketId, userId || null, body], conn,
);

export async function addComment(ticketId, userId, type, body, conn) {
  const res = await query('INSERT INTO ticket_comments (ticket_id, user_id, type, body) VALUES (?, ?, ?, ?)', [ticketId, userId, type, body], conn);
  return res.insertId;
}

export async function addHistory(ticketId, userId, changes, conn) {
  const rows = Object.entries(changes).filter(([, v]) => String(v[0] ?? '') !== String(v[1] ?? ''));
  if (!rows.length) return;
  await query(
    'INSERT INTO ticket_history (ticket_id, field, old_value, new_value, changed_by) VALUES ?',
    [rows.map(([field, [o, n]]) => [ticketId, field, o == null ? null : String(o), n == null ? null : String(n), userId || null])],
    conn,
  );
}

export async function timeline(ticketId, { includeNotes }) {
  const comments = await query(
    `SELECT tc.id, tc.type, tc.body, tc.created_at, tc.user_id, u.name AS user_name
       FROM ticket_comments tc LEFT JOIN users u ON u.id = tc.user_id
      WHERE tc.ticket_id = ? ${includeNotes ? '' : "AND tc.type = 'comment'"}`,
    [ticketId],
  );
  const activities = await query(
    `SELECT a.id, 'system' AS type, a.body, a.created_at, a.user_id, u.name AS user_name
       FROM ticket_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.ticket_id = ?`,
    [ticketId],
  );
  return { comments, activities };
}

export const history = (ticketId) => query(
  `SELECT h.id, h.field, h.old_value, h.new_value, h.changed_at, u.name AS user_name
     FROM ticket_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.ticket_id = ? ORDER BY h.changed_at DESC, h.id DESC LIMIT 200`,
  [ticketId],
);

// ---------- tags ----------
export const tags = async (ticketId, conn) => (await query('SELECT tag FROM ticket_tags WHERE ticket_id = ? ORDER BY tag', [ticketId], conn)).map((r) => r.tag);
export async function setTags(ticketId, list, conn) {
  await query('DELETE FROM ticket_tags WHERE ticket_id = ?', [ticketId], conn);
  if (list.length) await query('INSERT INTO ticket_tags (ticket_id, tag) VALUES ?', [list.map((t) => [ticketId, t])], conn);
}

// ---------- related ----------
export const children = (ticketId) => query('SELECT id, ticket_number, title, status FROM tickets WHERE parent_ticket_id = ? AND deleted_at IS NULL ORDER BY id', [ticketId]);
export const numberById = async (id, conn) => (await queryOne('SELECT ticket_number FROM tickets WHERE id = ?', [id], conn))?.ticket_number || null;

export const formValues = (ticketId) => query(
  `SELECT v.field_key, v.label, v.value FROM request_items ri JOIN request_item_values v ON v.request_item_id = ri.id
    WHERE ri.ticket_id = ? ORDER BY v.sort_order, v.id`,
  [ticketId],
);

export const similarWithoutProblem = (title, excludeId) => query(
  "SELECT id, ticket_number FROM tickets WHERE title = ? AND id <> ? AND problem_id IS NULL AND kind = 'incident' AND deleted_at IS NULL",
  [title, excludeId],
);

/** Open incidents that could be declared a major incident or linked to a problem. */
export const candidates = ({ openOnly = true, withoutProblem = false, notMajor = false, notClosed = false, limit = 80 }) => query(
  `SELECT id, ticket_number, title, priority FROM tickets
    WHERE kind = 'incident' AND deleted_at IS NULL ${openOnly ? `AND status IN ('New','In Progress','On Hold','Awaiting approval')` : ''}
      ${withoutProblem ? 'AND problem_id IS NULL' : ''} ${notMajor ? 'AND is_major = 0' : ''} ${notClosed ? "AND status <> 'Closed'" : ''}
    ORDER BY ${notMajor ? 'priority ASC, created_at DESC' : 'created_at DESC'} LIMIT ?`,
  [limit],
);

export const resolvedOlderThan = (days, conn) => query(
  "SELECT id, ticket_number FROM tickets WHERE status = 'Resolved' AND resolved_at < UTC_TIMESTAMP(3) - INTERVAL ? DAY AND deleted_at IS NULL LIMIT 500",
  [days],
  conn,
);

export const breachedAssigned = () => query(
  `SELECT t.id, t.ticket_number, t.title, t.assigned_to ${TICKET_FROM} WHERE t.deleted_at IS NULL AND t.assigned_to IS NOT NULL AND ${SQL_BREACHED} LIMIT 500`,
);
export const riskAssigned = () => query(
  `SELECT t.id, t.ticket_number, t.title, t.assigned_to ${TICKET_FROM} WHERE t.deleted_at IS NULL AND t.assigned_to IS NOT NULL AND ${SQL_RISK} LIMIT 500`,
);
