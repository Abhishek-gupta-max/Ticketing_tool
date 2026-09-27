import { query, queryOne } from '../config/database.js';

const SELECT = `m.id, m.mi_number, m.ticket_id, t.ticket_number, m.title, m.status, m.commander_id, u.name AS commander_name, m.impact,
  m.started_at, m.resolved_at, t.asset_id`;
const FROM = 'FROM major_incidents m JOIN tickets t ON t.id = m.ticket_id LEFT JOIN users u ON u.id = m.commander_id';

export const active = (conn) => queryOne(`SELECT ${SELECT} ${FROM} WHERE m.status = 'Active' ORDER BY m.started_at DESC LIMIT 1`, [], conn);
export const activeForTicket = (ticketId) => queryOne(`SELECT ${SELECT} ${FROM} WHERE m.status = 'Active' AND m.ticket_id = ?`, [ticketId]);
export const past = (limit = 5) => query(`SELECT ${SELECT} ${FROM} WHERE m.status = 'Resolved' ORDER BY m.started_at DESC LIMIT ?`, [limit]);
export const total = async () => (await queryOne('SELECT COUNT(*) AS n FROM major_incidents')).n;
export const findById = (id, conn) => queryOne(`SELECT ${SELECT} ${FROM} WHERE m.id = ?`, [id], conn);
export const lockById = (id, conn) => queryOne('SELECT id FROM major_incidents WHERE id = ? FOR UPDATE', [id], conn);

export async function insert(mi, conn) {
  const res = await query(
    'INSERT INTO major_incidents (mi_number, ticket_id, title, status, commander_id, impact) VALUES (?, ?, ?, \'Active\', ?, ?)',
    [mi.number, mi.ticketId, mi.title, mi.commanderId, mi.impact],
    conn,
  );
  return res.insertId;
}

export const resolve = (id, conn) => query("UPDATE major_incidents SET status = 'Resolved', resolved_at = UTC_TIMESTAMP(3) WHERE id = ?", [id], conn);

export const addUpdate = (id, userId, body, conn) => query('INSERT INTO major_incident_updates (major_incident_id, user_id, body) VALUES (?, ?, ?)', [id, userId, body], conn);
export const updates = (id) => query(
  `SELECT x.id, x.body, x.created_at, x.user_id, u.name AS user_name FROM major_incident_updates x LEFT JOIN users u ON u.id = x.user_id
    WHERE x.major_incident_id = ? ORDER BY x.created_at DESC`,
  [id],
);
