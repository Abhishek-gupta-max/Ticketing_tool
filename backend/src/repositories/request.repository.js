import { query, queryOne } from '../config/database.js';

export async function insert(r, conn) {
  const res = await query(
    'INSERT INTO requests (request_number, requested_for_id, customer_id, opened_by) VALUES (?, ?, ?, ?)',
    [r.number, r.requestedForId, r.customerId, r.openedBy || null],
    conn,
  );
  return res.insertId;
}

export const findById = (id, conn) => queryOne('SELECT * FROM requests WHERE id = ?', [id], conn);
export const lockById = (id, conn) => queryOne('SELECT id, request_number FROM requests WHERE id = ? FOR UPDATE', [id], conn);

export async function nextLine(requestId, conn) {
  return (await queryOne('SELECT COALESCE(MAX(line_no), 0) + 1 AS n FROM request_items WHERE request_id = ?', [requestId], conn)).n;
}

export async function addItem(requestId, ticketId, catalogItemId, lineNo, conn) {
  const res = await query(
    'INSERT INTO request_items (request_id, ticket_id, catalog_item_id, line_no) VALUES (?, ?, ?, ?)',
    [requestId, ticketId, catalogItemId || null, lineNo],
    conn,
  );
  return res.insertId;
}

export async function addValues(requestItemId, values, conn) {
  if (!values.length) return;
  await query(
    'INSERT INTO request_item_values (request_item_id, field_key, label, value, sort_order) VALUES ?',
    [values.map((v, i) => [requestItemId, v.key, v.label, v.value ?? null, i + 1])],
    conn,
  );
}

function scope(user) {
  if (user.isStaff && user.can('ticket:view_all')) return { sql: '', params: [] };
  return { sql: 'AND r.requested_for_id = ?', params: [user.personId || -1] };
}

export async function list(user, { limit, offset, search }) {
  const s = scope(user);
  const w = search ? 'AND (r.request_number LIKE ? OR p.name LIKE ?)' : '';
  const sp = search ? [`%${search}%`, `%${search}%`] : [];
  const rows = await query(
    `SELECT r.id, r.request_number, r.requested_for_id, p.name AS requested_for_name, r.customer_id, c.name AS customer_name, c.is_internal AS customer_internal,
            r.created_at,
            (SELECT GROUP_CONCAT(t.title ORDER BY ri.line_no SEPARATOR '\n') FROM request_items ri JOIN tickets t ON t.id = ri.ticket_id WHERE ri.request_id = r.id) AS item_titles,
            (SELECT COUNT(*) FROM request_items ri JOIN tickets t ON t.id = ri.ticket_id WHERE ri.request_id = r.id AND t.status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_items,
            (SELECT COUNT(*) FROM request_items ri WHERE ri.request_id = r.id) AS item_count
       FROM requests r JOIN people p ON p.id = r.requested_for_id JOIN customers c ON c.id = r.customer_id
      WHERE 1=1 ${s.sql} ${w} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...s.params, ...sp, limit, offset],
  );
  const total = (await queryOne(`SELECT COUNT(*) AS n FROM requests r JOIN people p ON p.id = r.requested_for_id WHERE 1=1 ${s.sql} ${w}`, [...s.params, ...sp])).n;
  return { rows, total };
}

export const findByNumber = (number) => queryOne(
  `SELECT r.id, r.request_number, r.requested_for_id, p.name AS requested_for_name, r.customer_id, c.name AS customer_name, r.opened_by, r.created_at
     FROM requests r JOIN people p ON p.id = r.requested_for_id JOIN customers c ON c.id = r.customer_id WHERE r.request_number = ?`,
  [number],
);
