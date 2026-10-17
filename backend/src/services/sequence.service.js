import { collection, isDuplicateKey } from '../config/database.js';

/**
 * Next record number for a prefix, generated inside the caller's transaction.
 * The increment is a single atomic update of the sequence document, so
 * concurrent callers each receive a unique value. In a transaction (replica
 * set or MongoDB Atlas) a rollback releases the number with it.
 */
export async function nextValue(conn, prefix, year) {
  if (!conn) throw new Error('nextValue must run inside a transaction');
  const options = { upsert: true, returnDocument: 'after', ...(conn.session && { session: conn.session }) };
  const bump = () => collection('sequences').findOneAndUpdate(
    { prefix, seq_year: year },
    { $inc: { last_value: 1 }, $set: { updated_at: new Date() } },
    options,
  );
  try {
    return (await bump()).last_value;
  } catch (err) {
    // Two first-ever requests for a sequence can race on the upsert: retry once.
    if (isDuplicateKey(err)) return (await bump()).last_value;
    throw err;
  }
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
