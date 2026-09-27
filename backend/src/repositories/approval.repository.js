import { query, queryOne } from '../config/database.js';

export async function insertRequestApproval(ticketId, conn) {
  const res = await query(
    "INSERT INTO approvals (approval_type, ticket_id, approver_role, status) VALUES ('request', ?, 'Line manager', 'Pending')",
    [ticketId],
    conn,
  );
  return res.insertId;
}

export async function insertChangeApprovals(changeId, approvers, conn) {
  if (!approvers.length) return;
  await query(
    'INSERT INTO approvals (approval_type, change_id, approver_id, approver_role, status, is_requested, sort_order) VALUES ?',
    [approvers.map((a, i) => ['change', changeId, a.userId, a.role, 'Pending', 0, i])],
    conn,
  );
}

export const latestForTicket = (ticketId, conn) => queryOne(
  `SELECT a.*, u.name AS decided_by_name FROM approvals a LEFT JOIN users u ON u.id = a.decided_by
    WHERE a.ticket_id = ? ORDER BY a.id DESC LIMIT 1`,
  [ticketId],
  conn,
);

export const forChange = (changeId, conn) => query(
  `SELECT a.*, u.name AS approver_name, d.name AS decided_by_name FROM approvals a
     LEFT JOIN users u ON u.id = a.approver_id LEFT JOIN users d ON d.id = a.decided_by
    WHERE a.change_id = ? ORDER BY a.sort_order, a.id`,
  [changeId],
  conn,
);

export const findById = (id, conn) => queryOne('SELECT * FROM approvals WHERE id = ?', [id], conn);
export const lockById = (id, conn) => queryOne('SELECT * FROM approvals WHERE id = ? FOR UPDATE', [id], conn);

export const decide = (id, status, userId, comment, conn) => query(
  'UPDATE approvals SET status = ?, decided_by = ?, decided_at = UTC_TIMESTAMP(3), comment = ? WHERE id = ?',
  [status, userId, comment || null, id],
  conn,
);

/** Reset every approver of a change to pending and mark them as requested. */
export const requestChange = (changeId, conn) => query(
  "UPDATE approvals SET status = 'Pending', is_requested = 1, decided_by = NULL, decided_at = NULL, comment = NULL, requested_at = UTC_TIMESTAMP(3) WHERE change_id = ?",
  [changeId],
  conn,
);

/** Standard change: approved by policy. */
export const approveAllByPolicy = (changeId, conn) => query(
  "UPDATE approvals SET status = 'Approved', is_requested = 1, decided_at = UTC_TIMESTAMP(3), comment = 'Pre-approved by policy' WHERE change_id = ?",
  [changeId],
  conn,
);

export const cancelPendingForChange = (changeId, conn) => query(
  "UPDATE approvals SET status = 'Cancelled' WHERE change_id = ? AND status = 'Pending'",
  [changeId],
  conn,
);

// ---------- queues ----------
const REQUEST_PENDING = `SELECT 'request' AS kind, a.id AS approval_id, a.approver_role AS role, a.approver_id, NULL AS approver_name,
    a.requested_at AS waiting_since, t.ticket_number AS record_number, t.title, t.id AS record_id,
    rq.name AS requester_name, c.name AS customer_name
  FROM approvals a JOIN tickets t ON t.id = a.ticket_id JOIN people rq ON rq.id = t.requester_id JOIN customers c ON c.id = t.customer_id
  WHERE a.approval_type = 'request' AND a.status = 'Pending' AND t.status = 'Awaiting approval' AND t.deleted_at IS NULL`;

const CHANGE_PENDING = `SELECT 'change' AS kind, a.id AS approval_id, a.approver_role AS role, a.approver_id, u.name AS approver_name,
    ch.updated_at AS waiting_since, ch.change_number AS record_number, ch.title, ch.id AS record_id,
    NULL AS requester_name, c.name AS customer_name
  FROM approvals a JOIN changes ch ON ch.id = a.change_id LEFT JOIN users u ON u.id = a.approver_id LEFT JOIN customers c ON c.id = ch.customer_id
  WHERE a.approval_type = 'change' AND a.status = 'Pending' AND ch.status = 'Approval' AND ch.deleted_at IS NULL`;

/** Approvals the user may decide: request approvals (with request:approve) and their own CAB votes (or all, with override). */
export function mine(user) {
  const parts = [], params = [];
  if (user.can('request:approve')) parts.push(REQUEST_PENDING);
  if (user.can('approval:override')) parts.push(CHANGE_PENDING);
  else if (user.can('change:approve')) { parts.push(CHANGE_PENDING + ' AND a.approver_id = ?'); params.push(user.id); }
  if (!parts.length) return Promise.resolve([]);
  return query(`${parts.join(' UNION ALL ')} ORDER BY waiting_since ASC`, params);
}

export const allPending = () => query(`${REQUEST_PENDING} UNION ALL ${CHANGE_PENDING} ORDER BY waiting_since ASC`);

export const history = (days = 30) => query(
  `SELECT a.id, a.approval_type AS kind, a.status AS decision, a.decided_at, a.approver_role AS role, a.comment,
          COALESCE(t.ticket_number, ch.change_number) AS record_number, COALESCE(t.title, ch.title) AS title,
          d.name AS decided_by_name
     FROM approvals a
     LEFT JOIN tickets t ON t.id = a.ticket_id LEFT JOIN changes ch ON ch.id = a.change_id LEFT JOIN users d ON d.id = a.decided_by
    WHERE a.status IN ('Approved','Rejected') AND a.decided_at > UTC_TIMESTAMP(3) - INTERVAL ? DAY
    ORDER BY a.decided_at DESC LIMIT 200`,
  [days],
);

export const approvalHours = (from, to) => query(
  `SELECT TIMESTAMPDIFF(SECOND, t.created_at, a.decided_at) / 3600 AS hours
     FROM approvals a JOIN tickets t ON t.id = a.ticket_id
    WHERE a.approval_type = 'request' AND a.status = 'Approved' AND a.decided_at IS NOT NULL AND t.created_at >= ? AND t.created_at < ?`,
  [from, to],
);
