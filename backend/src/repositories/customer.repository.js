import { query, queryOne } from '../config/database.js';

export const listCustomers = () => query(
  `SELECT c.id, c.code, c.name, c.plan, c.is_internal,
          (SELECT COUNT(*) FROM people p WHERE p.customer_id = c.id AND p.deleted_at IS NULL) AS requesters,
          (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.deleted_at IS NULL AND t.status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_tickets,
          (SELECT COUNT(*) FROM assets a WHERE a.customer_id = c.id AND a.deleted_at IS NULL) AS assets
     FROM customers c WHERE c.deleted_at IS NULL ORDER BY c.is_internal, c.id`,
);

export const findCustomer = (id, conn) => queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id], conn);
export const findCustomerByName = (name) => queryOne('SELECT * FROM customers WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL', [name]);
export const internalCustomer = () => queryOne('SELECT * FROM customers WHERE is_internal = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1');

export async function createCustomer({ code, name, plan }) {
  const res = await query('INSERT INTO customers (code, name, plan) VALUES (?, ?, ?)', [code, name, plan]);
  return res.insertId;
}

export function listPeople({ customerId, search, limit = 500 } = {}) {
  const w = ['p.deleted_at IS NULL'], params = [];
  if (customerId) { w.push('p.customer_id = ?'); params.push(customerId); }
  if (search) { w.push('(p.name LIKE ? OR p.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  return query(
    `SELECT p.id, p.customer_id, c.name AS customer_name, c.is_internal AS customer_internal, p.name, p.email, p.is_vip, p.department, p.job_title,
            p.location, p.phone, p.user_id,
            (SELECT COUNT(*) FROM assets a WHERE a.assigned_person_id = p.id AND a.deleted_at IS NULL) AS devices,
            (SELECT COUNT(*) FROM assets a WHERE a.owner_person_id = p.id AND a.deleted_at IS NULL) AS owned
       FROM people p JOIN customers c ON c.id = p.customer_id
      WHERE ${w.join(' AND ')} ORDER BY c.is_internal, c.id, p.id LIMIT ?`,
    [...params, limit],
  );
}

export const findPerson = (id, conn) => queryOne(
  'SELECT p.*, c.name AS customer_name FROM people p JOIN customers c ON c.id = p.customer_id WHERE p.id = ? AND p.deleted_at IS NULL',
  [id],
  conn,
);
export const findPersonByEmail = (email) => queryOne('SELECT * FROM people WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL', [email]);

export async function createPerson(p) {
  const res = await query(
    'INSERT INTO people (customer_id, name, email, is_vip, department, job_title, location, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [p.customerId, p.name, p.email, p.vip ? 1 : 0, p.department || null, p.jobTitle || null, p.location || null, p.phone || null],
  );
  return res.insertId;
}

export const setVip = (id, vip) => query('UPDATE people SET is_vip = ? WHERE id = ?', [vip ? 1 : 0, id]);
