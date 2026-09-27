import { queryOne, query } from '../config/database.js';

/**
 * Next record number for a prefix, generated inside the caller's transaction.
 * INSERT ... ON DUPLICATE KEY UPDATE takes a row lock on the sequence row, so
 * concurrent transactions queue up and each receives a unique value. If the
 * caller rolls back, the number is released with it (no gaps, no duplicates).
 */
export async function nextValue(conn, prefix, year) {
  if (!conn) throw new Error('nextValue must run inside a transaction');
  await query(
    `INSERT INTO sequences (prefix, seq_year, last_value) VALUES (?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)`,
    [prefix, year],
    conn,
  );
  return (await queryOne('SELECT LAST_INSERT_ID() AS v', [], conn)).v;
}

/** INC-2026-0001 style numbers (yearly sequences). */
export async function nextNumber(conn, prefix) {
  const year = new Date().getUTCFullYear();
  const n = await nextValue(conn, prefix, year);
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

/** Numbers that do not reset each year: AST-001, MI-1. */
export async function nextAssetTag(conn) {
  return 'AST-' + String(await nextValue(conn, 'AST', 0)).padStart(3, '0');
}
export async function nextMajorNumber(conn) {
  return 'MI-' + (await nextValue(conn, 'MI', 0));
}
