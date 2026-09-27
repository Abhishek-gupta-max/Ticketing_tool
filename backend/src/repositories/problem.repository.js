import { query, queryOne } from '../config/database.js';

const OPEN = "('Logged','Investigating','Finding cause','Fix underway')";

export const PROBLEM_SELECT = `
  p.id, p.problem_number, p.title, p.status, p.priority, p.owner_id, u.name AS owner_name, p.team_id, p.customer_id, p.root_cause, p.workaround,
  p.is_known_error, p.resolution_code, p.fix_notes, p.resolved_at, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM tickets t WHERE t.problem_id = p.id AND t.deleted_at IS NULL) AS incident_count,
  (SELECT COUNT(*) FROM tickets t WHERE t.problem_id = p.id AND t.deleted_at IS NULL AND t.status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_incident_count`;

const FILTERS = {
  open: `p.status IN ${OPEN}`,
  known: `p.status IN ${OPEN} AND p.is_known_error = 1`,
  resolved: `p.status NOT IN ${OPEN}`,
  all: '1=1',
};

export function list({ view = 'open', search }) {
  const w = ['p.deleted_at IS NULL', FILTERS[view] || FILTERS.open], params = [];
  if (search) { w.push('(p.problem_number LIKE ? OR p.title LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  return query(`SELECT ${PROBLEM_SELECT} FROM problems p LEFT JOIN users u ON u.id = p.owner_id WHERE ${w.join(' AND ')} ORDER BY p.created_at DESC`, params);
}

export const kpis = () => queryOne(
  `SELECT SUM(status IN ${OPEN}) AS open_count, SUM(status IN ${OPEN} AND is_known_error = 1) AS known,
          AVG(CASE WHEN status IN ${OPEN} THEN TIMESTAMPDIFF(HOUR, created_at, UTC_TIMESTAMP(3)) / 24 END) AS avg_age_days,
          (SELECT COUNT(*) FROM tickets t WHERE t.problem_id IS NOT NULL AND t.deleted_at IS NULL AND t.status IN ('New','In Progress','On Hold','Awaiting approval')) AS linked_open
     FROM problems WHERE deleted_at IS NULL`,
);

export const findByNumber = (n, conn) => queryOne(`SELECT ${PROBLEM_SELECT} FROM problems p LEFT JOIN users u ON u.id = p.owner_id WHERE p.problem_number = ? AND p.deleted_at IS NULL`, [n], conn);
export const findById = (id, conn) => queryOne(`SELECT ${PROBLEM_SELECT} FROM problems p LEFT JOIN users u ON u.id = p.owner_id WHERE p.id = ? AND p.deleted_at IS NULL`, [id], conn);
export const lockById = (id, conn) => queryOne('SELECT id FROM problems WHERE id = ? FOR UPDATE', [id], conn);

export async function insert(p, conn) {
  const res = await query(
    'INSERT INTO problems (problem_number, title, status, priority, owner_id, team_id, customer_id, root_cause, workaround, created_by) VALUES (?, ?, \'Logged\', ?, ?, ?, ?, ?, ?, ?)',
    [p.number, p.title, p.priority, p.ownerId || null, p.teamId || null, p.customerId || null, p.rootCause || '', p.workaround || '', p.createdBy || null],
    conn,
  );
  return res.insertId;
}

const UPDATABLE = ['title', 'status', 'priority', 'owner_id', 'root_cause', 'workaround', 'is_known_error', 'resolution_code', 'fix_notes', 'resolved_at'];
export async function update(id, fields, conn) {
  const keys = Object.keys(fields);
  keys.forEach((k) => { if (!UPDATABLE.includes(k)) throw new Error(`Column ${k} cannot be updated`); });
  if (!keys.length) return;
  await query(`UPDATE problems SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id], conn);
}

export const openOptions = () => query(`SELECT id, problem_number, title FROM problems WHERE deleted_at IS NULL AND status IN ${OPEN} ORDER BY id DESC`);

/** The same incident title raised 4+ times in 30 days with no problem linked. */
export const suggestions = () => query(
  `SELECT title, COUNT(*) AS n, MIN(priority) AS priority, MAX(cat.name) AS category
     FROM tickets t JOIN ticket_categories cat ON cat.id = t.category_id
    WHERE t.kind = 'incident' AND t.problem_id IS NULL AND t.deleted_at IS NULL AND t.created_at > UTC_TIMESTAMP(3) - INTERVAL 30 DAY
    GROUP BY title HAVING COUNT(*) >= 4 ORDER BY n DESC LIMIT 4`,
);
