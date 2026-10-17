// Creates the MongoDB collections and indexes described in config/collections.js.
// Idempotent: existing collections and indexes are left as they are, missing
// ones are added. This replaces the former SQL migrations.
import { getDb, getClient } from '../config/database.js';
import { COLLECTIONS, COLLATION } from '../config/collections.js';
import { env } from '../config/env.js';

const keyOf = (fields) => Object.fromEntries(fields.map((f) => [f, 1]));
const nameOf = (fields, unique) => `${unique ? 'uq' : 'ix'}_${fields.join('_')}`;

/** Index definitions of one collection. */
function indexesFor(def) {
  const out = [];
  for (const u of def.unique || []) {
    const fields = Array.isArray(u) ? u : u.keys;
    out.push({ key: keyOf(fields), name: nameOf(fields, true), unique: true, ...(u.partial && { partialFilterExpression: u.partial }) });
  }
  if (def.id) out.push({ key: { id: 1 }, name: 'uq_id', unique: true });
  for (const fields of def.indexes || []) out.push({ key: keyOf(fields), name: nameOf(fields, false) });
  return out;
}

/** Create missing collections (case-insensitive default collation) and indexes. */
export async function migrateUp({ dbName = env.dbName, log = () => {} } = {}) {
  const db = getDb(dbName);
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const created = [];
  for (const [name, def] of Object.entries(COLLECTIONS)) {
    if (!existing.has(name)) {
      await db.createCollection(name, { collation: COLLATION });
      created.push(name);
      log(`created ${name}`);
    }
    const indexes = indexesFor(def);
    if (indexes.length) await db.collection(name).createIndexes(indexes);
  }
  if (!existing.has('counters')) await db.createCollection('counters');
  return created;
}

/** Collections that exist / are missing. */
export async function migrationStatus({ dbName = env.dbName } = {}) {
  const db = getDb(dbName);
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  return Object.keys(COLLECTIONS).map((name) => ({ name, applied: existing.has(name) }));
}

/** Drop a test database. Refuses any name that does not end in _test. */
export async function dropDatabase(dbName) {
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to drop ${dbName}: only databases ending in _test can be dropped.`);
  await getClient().db(dbName).dropDatabase();
}
