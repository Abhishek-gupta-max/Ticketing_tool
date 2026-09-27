import { query, queryOne } from '../config/database.js';

export const CHANGE_SELECT = `
  ch.id, ch.change_number, ch.title, ch.type, ch.status, ch.owner_id, u.name AS owner_name, ch.customer_id, c.name AS customer_name,
  ch.problem_id, pb.problem_number, ch.planned_start, ch.planned_end, ch.impact, ch.urgency, ch.risk, ch.risk_scope, ch.risk_downtime, ch.risk_tested,
  ch.risk_backout, ch.description, ch.implementation_plan, ch.backout_plan, ch.test_plan, ch.close_code, ch.close_notes, ch.created_at, ch.updated_at,
  (SELECT CASE
     WHEN SUM(a.status = 'Rejected') > 0 THEN 'Rejected'
     WHEN COUNT(*) > 0 AND SUM(a.status = 'Approved') = COUNT(*) THEN 'Approved'
     WHEN SUM(a.status <> 'Pending') > 0 OR ch.status = 'Approval' THEN 'Requested'
     ELSE 'Not yet requested' END
     FROM approvals a WHERE a.change_id = ch.id AND a.status <> 'Cancelled') AS approval_summary`;

export const CHANGE_FROM = `
  FROM changes ch LEFT JOIN users u ON u.id = ch.owner_id LEFT JOIN customers c ON c.id = ch.customer_id LEFT JOIN problems pb ON pb.id = ch.problem_id`;

const VIEWS = {
  active: "ch.status NOT IN ('Closed','Canceled')",
  Approval: "ch.status = 'Approval'",
  Closed: "ch.status = 'Closed'",
  all: '1=1',
};

export function list({ view = 'active', from, to, search, problemId }) {
  const w = ['ch.deleted_at IS NULL', VIEWS[view] || VIEWS.active], p = [];
  if (from) { w.push('ch.planned_start >= ?'); p.push(from); }
  if (to) { w.push('ch.planned_start < ?'); p.push(to); }
  if (problemId) { w.push('ch.problem_id = ?'); p.push(problemId); }
  if (search) { w.push('(ch.change_number LIKE ? OR ch.title LIKE ?)'); p.push(`%${search}%`, `%${search}%`); }
  const order = view === 'Closed' || view === 'all' ? 'ch.planned_start DESC' : 'ch.planned_start ASC';
  return query(`SELECT ${CHANGE_SELECT} ${CHANGE_FROM} WHERE ${w.join(' AND ')} ORDER BY ${order} LIMIT 500`, p);
}

export const kpis = () => queryOne(
  `SELECT SUM(status IN ('Scheduled','Doing','Approval') AND planned_start > UTC_TIMESTAMP(3) - INTERVAL 1 DAY AND planned_start < UTC_TIMESTAMP(3) + INTERVAL 7 DAY) AS next7,
          SUM(status = 'Approval') AS awaiting,
          SUM(status = 'Closed' AND close_code IS NOT NULL AND planned_end > UTC_TIMESTAMP(3) - INTERVAL 90 DAY) AS closed90,
          SUM(status = 'Closed' AND close_code IS NOT NULL AND close_code <> 'Did not work' AND planned_end > UTC_TIMESTAMP(3) - INTERVAL 90 DAY) AS ok90,
          SUM(type = 'Emergency') AS emergency
     FROM changes WHERE deleted_at IS NULL`,
);

/** Active changes that overlap in time and share at least one asset. */
export const conflictPairs = () => query(
  `SELECT DISTINCT a.id AS change_id, b.id AS other_id, b.change_number AS other_number
     FROM changes a
     JOIN changes b ON b.id <> a.id AND b.planned_start < a.planned_end AND a.planned_start < b.planned_end
     JOIN change_assets ca ON ca.change_id = a.id
     JOIN change_assets cb ON cb.change_id = b.id AND cb.asset_id = ca.asset_id
    WHERE a.status NOT IN ('Closed','Canceled') AND b.status NOT IN ('Closed','Canceled') AND a.deleted_at IS NULL AND b.deleted_at IS NULL`,
);

export const conflictsFor = (id, conn) => query(
  `SELECT DISTINCT b.id, b.change_number
     FROM changes a
     JOIN changes b ON b.id <> a.id AND b.planned_start < a.planned_end AND a.planned_start < b.planned_end
     JOIN change_assets ca ON ca.change_id = a.id
     JOIN change_assets cb ON cb.change_id = b.id AND cb.asset_id = ca.asset_id
    WHERE a.id = ? AND a.status NOT IN ('Closed','Canceled') AND b.status NOT IN ('Closed','Canceled') AND b.deleted_at IS NULL`,
  [id],
  conn,
);

export const findByNumber = (n, conn) => queryOne(`SELECT ${CHANGE_SELECT} ${CHANGE_FROM} WHERE ch.change_number = ? AND ch.deleted_at IS NULL`, [n], conn);
export const findById = (id, conn) => queryOne(`SELECT ${CHANGE_SELECT} ${CHANGE_FROM} WHERE ch.id = ? AND ch.deleted_at IS NULL`, [id], conn);
export const lockById = (id, conn) => queryOne('SELECT id FROM changes WHERE id = ? FOR UPDATE', [id], conn);

const COLS = ['title', 'type', 'owner_id', 'customer_id', 'problem_id', 'planned_start', 'planned_end', 'impact', 'urgency', 'risk', 'risk_scope',
  'risk_downtime', 'risk_tested', 'risk_backout', 'description', 'implementation_plan', 'backout_plan', 'test_plan'];

export async function insert(number, c, userId, conn) {
  const res = await query(
    `INSERT INTO changes (change_number, status, ${COLS.join(', ')}, created_by) VALUES (?, 'Draft', ${COLS.map(() => '?').join(', ')}, ?)`,
    [number, ...COLS.map((k) => c[k] ?? null), userId || null],
    conn,
  );
  return res.insertId;
}

const UPDATABLE = [...COLS, 'status', 'close_code', 'close_notes'];
export async function update(id, fields, conn) {
  const keys = Object.keys(fields);
  keys.forEach((k) => { if (!UPDATABLE.includes(k)) throw new Error(`Column ${k} cannot be updated`); });
  if (!keys.length) return;
  await query(`UPDATE changes SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id], conn);
}

export const touch = (id, conn) => query('UPDATE changes SET updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [id], conn);

export const assets = (id, conn) => query(
  `SELECT a.id, a.asset_tag, a.name, ty.name AS type_name FROM change_assets ca JOIN assets a ON a.id = ca.asset_id JOIN asset_types ty ON ty.id = a.asset_type_id
    WHERE ca.change_id = ? ORDER BY a.name`,
  [id],
  conn,
);

export async function setAssets(id, ids, conn) {
  await query('DELETE FROM change_assets WHERE change_id = ?', [id], conn);
  const clean = [...new Set(ids)];
  if (clean.length) await query('INSERT INTO change_assets (change_id, asset_id) VALUES ?', [clean.map((a) => [id, a])], conn);
}

export const linkedTickets = (id) => query('SELECT id, ticket_number, title, status FROM tickets WHERE change_id = ? AND deleted_at IS NULL ORDER BY id', [id]);

export const upcoming = (limit = 5) => query(
  `SELECT ch.id, ch.change_number, ch.title, ch.type, ch.status, ch.planned_start FROM changes ch
    WHERE ch.deleted_at IS NULL AND ch.status IN ('Scheduled','Approval','Doing','Verify') AND ch.planned_start < UTC_TIMESTAMP(3) + INTERVAL 7 DAY
    ORDER BY ch.planned_start ASC LIMIT ?`,
  [limit],
);

export const byProblem = (problemId) => query('SELECT id, change_number, title, status FROM changes WHERE problem_id = ? AND deleted_at IS NULL ORDER BY id', [problemId]);
