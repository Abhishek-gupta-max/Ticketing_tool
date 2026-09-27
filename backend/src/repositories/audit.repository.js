import { query, queryOne } from '../config/database.js';

export const insert = (row, conn) => query(
  `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, entity_ref, old_values, new_values, ip_address, user_agent, request_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [row.userId ?? null, row.action, row.entityType, row.entityId != null ? String(row.entityId) : null, row.entityRef ?? null,
    row.oldValues ? JSON.stringify(row.oldValues) : null, row.newValues ? JSON.stringify(row.newValues) : null,
    row.ip ?? null, row.userAgent ?? null, row.requestId ?? null],
  conn,
);

function where(f) {
  const w = [], p = [];
  if (f.userId) { w.push('a.user_id = ?'); p.push(f.userId); }
  if (f.entityType) { w.push('a.entity_type = ?'); p.push(f.entityType); }
  if (f.entityRef) { w.push('a.entity_ref = ?'); p.push(f.entityRef); }
  if (f.from) { w.push('a.created_at >= ?'); p.push(f.from); }
  if (f.to) { w.push('a.created_at < ?'); p.push(f.to); }
  if (f.search) { w.push('(a.action LIKE ? OR a.entity_ref LIKE ?)'); p.push(`%${f.search}%`, `%${f.search}%`); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

export async function list(f, { limit, offset }) {
  const { sql, params } = where(f);
  const rows = await query(
    `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity_type, a.entity_id, a.entity_ref,
            a.old_values, a.new_values, a.ip_address, a.user_agent, a.created_at
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${sql}
      ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const total = (await queryOne(`SELECT COUNT(*) AS n FROM audit_logs a ${sql}`, params)).n;
  return { rows, total };
}

export const recent = (limit = 7) => query(
  `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity_type, a.entity_ref, a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
  [limit],
);
