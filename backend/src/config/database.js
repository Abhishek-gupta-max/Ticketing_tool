import { MongoClient } from 'mongodb';
import { env } from './env.js';
import { logger } from './logger.js';
import { COLLECTIONS, NOW, REQUIRED } from './collections.js';

// One client per process (and per warm serverless instance). The driver
// connects lazily on the first operation and keeps its own pool.
let client = null;
let supportsTransactions = null;

export function getClient() {
  if (!client) {
    client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: env.DB_CONNECTION_LIMIT,
      serverSelectionTimeoutMS: 8000,
      appName: 'servicedesk-api',
    });
  }
  return client;
}

export const getDb = (name = env.dbName) => getClient().db(name);
export const collection = (name) => getDb().collection(name);

const opts = (conn, extra = {}) => (conn?.session ? { ...extra, session: conn.session } : extra);
const strip = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc; // eslint-disable-line no-unused-vars
  return rest;
};

/** Next numeric id of a collection (atomic, safe under concurrency). */
export async function nextId(name, conn, count = 1) {
  const res = await collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: count } },
    opts(conn, { upsert: true, returnDocument: 'after' }),
  );
  return res.seq - count + 1;
}

// Date fields: values given as text are stored as dates. Text without a zone
// is UTC, as the MySQL session time zone was.
const DATE_FIELDS = new Set(['planned_start', 'planned_end', 'purchase_date', 'warranty_end', 'view_date']);
const isDateField = (f) => f.endsWith('_at') || DATE_FIELDS.has(f);
export function toDateValue(v) {
  if (typeof v !== 'string' || !v) return v;
  const local = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v);
  const d = new Date(local ? `${v.replace(' ', 'T')}Z` : v);
  return Number.isNaN(d.getTime()) ? v : d;
}
const normaliseDates = (obj) => {
  for (const k of Object.keys(obj)) if (isDateField(k)) obj[k] = toDateValue(obj[k]);
  return obj;
};

/** Apply the collection's defaults (MySQL column defaults) to a new document. */
function withDefaults(name, doc, now) {
  const def = COLLECTIONS[name];
  if (!def) throw new Error(`Unknown collection ${name}`);
  const out = {};
  for (const [field, d] of Object.entries(def.fields)) {
    if (doc[field] !== undefined) out[field] = doc[field];
    else if (d === NOW) out[field] = now;
    else if (d === REQUIRED) throw new Error(`${name}.${field} is required`);
    else out[field] = d;
  }
  for (const [k, v] of Object.entries(doc)) if (!(k in out)) out[k] = v;
  return normaliseDates(out);
}

/** Insert one document; returns its numeric id (or null for collections without one). */
export async function insertOne(name, doc, conn) {
  const now = new Date();
  const full = withDefaults(name, doc, now);
  if (COLLECTIONS[name].id && full.id == null) full.id = await nextId(name, conn);
  await collection(name).insertOne(full, opts(conn));
  return full.id ?? null;
}

/** Insert many documents; returns their ids in order. */
export async function insertMany(name, docs, conn) {
  if (!docs.length) return [];
  const now = new Date();
  const full = docs.map((d) => withDefaults(name, d, now));
  if (COLLECTIONS[name].id) {
    const missing = full.filter((d) => d.id == null);
    if (missing.length) {
      let id = await nextId(name, conn, missing.length);
      for (const d of missing) d.id = id++;
    }
  }
  await collection(name).insertMany(full, opts(conn, { ordered: true }));
  return full.map((d) => d.id ?? null);
}

export const isDuplicateKey = (err) => err?.code === 11000;

/** Insert unless a unique key already exists (MySQL INSERT IGNORE). Returns true when inserted. */
export async function insertIgnore(name, doc, conn) {
  try {
    await insertOne(name, doc, conn);
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/** Plain field object or an update document; updated_at is maintained where the table had ON UPDATE. */
function toUpdate(name, update) {
  const isOperator = Object.keys(update).some((k) => k.startsWith('$'));
  const u = isOperator ? { ...update } : { $set: { ...update } };
  if (COLLECTIONS[name]?.touch) u.$set = { updated_at: new Date(), ...(u.$set || {}) };
  if (u.$set) normaliseDates(u.$set);
  return u;
}

/** Update matching documents; returns the number matched (MySQL affectedRows for our purposes). */
export async function updateMany(name, filter, update, conn) {
  const res = await collection(name).updateMany(filter, toUpdate(name, update), opts(conn));
  return res.matchedCount;
}

export async function updateOne(name, filter, update, conn) {
  const res = await collection(name).updateOne(filter, toUpdate(name, update), opts(conn));
  return res.matchedCount;
}

export async function deleteMany(name, filter, conn) {
  const res = await collection(name).deleteMany(filter, opts(conn));
  return res.deletedCount;
}

/** Find documents (without _id). options: sort, limit, skip, projection. */
export async function find(name, filter = {}, { sort, limit, skip, projection } = {}, conn) {
  let cur = collection(name).find(filter, opts(conn, projection ? { projection: { _id: 0, ...projection } } : { projection: { _id: 0 } }));
  if (sort) cur = cur.sort(sort);
  if (skip) cur = cur.skip(skip);
  if (limit) cur = cur.limit(limit);
  return cur.toArray();
}

export async function findOne(name, filter, { sort, projection } = {}, conn) {
  return strip(await collection(name).findOne(filter, opts(conn, { sort, projection: projection ? { _id: 0, ...projection } : undefined })));
}

export const count = (name, filter = {}, conn) => collection(name).countDocuments(filter, opts(conn));

export const aggregate = (name, pipeline, conn) => collection(name).aggregate(pipeline, opts(conn)).toArray();

export const distinct = (name, field, filter = {}, conn) => collection(name).distinct(field, filter, opts(conn));

/** Documents of a collection keyed by a field (used to join related rows). */
export async function mapBy(name, values, { key = 'id', projection, conn } = {}) {
  const ids = [...new Set(values.filter((v) => v != null))];
  if (!ids.length) return new Map();
  const docs = await find(name, { [key]: { $in: ids } }, { projection: projection ? { [key]: 1, ...projection } : undefined }, conn);
  return new Map(docs.map((d) => [d[key], d]));
}

/**
 * LEFT JOIN: for each row, copy fields of the related document.
 * fields maps the output name to the related field, e.g. { assignee_name: 'name' }.
 */
export async function attach(rows, name, localField, fields, { key = 'id', conn } = {}) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  if (!list.length) return rows;
  const projection = Object.fromEntries(Object.values(fields).map((f) => [f, 1]));
  const map = await mapBy(name, list.map((r) => r[localField]), { key, projection, conn });
  for (const r of list) {
    const doc = map.get(r[localField]);
    for (const [as, field] of Object.entries(fields)) r[as] = doc ? doc[field] ?? null : null;
  }
  return rows;
}

/** Case-insensitive "contains" match (MySQL LIKE '%text%'). */
export const like = (text) => new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
/** Case-insensitive exact match. */
export const equalsCi = (text) => new RegExp(`^${String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/**
 * Run fn inside a transaction. fn receives a connection object to pass to
 * every repository call. Replica sets and MongoDB Atlas run a real
 * transaction; a standalone server (local development) runs fn directly,
 * relying on atomic single-document updates.
 */
export async function withTransaction(fn) {
  if (supportsTransactions === null) {
    const hello = await getDb('admin').command({ hello: 1 });
    supportsTransactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
  }
  if (!supportsTransactions) return fn({ session: null });
  const session = getClient().startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await fn({ session }); });
    return result;
  } catch (err) {
    if (err?.errorLabels?.length) logger.error('Transaction failed', { error: err.message });
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function pingDatabase() {
  const db = getDb();
  await db.command({ ping: 1 });
  const info = await db.admin().command({ buildInfo: 1 });
  return { db: db.databaseName, version: info.version };
}

export async function closePool() {
  if (client) {
    await client.close();
    client = null;
  }
}
