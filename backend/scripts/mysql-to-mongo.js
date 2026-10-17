#!/usr/bin/env node
// One-time import of the former MySQL database into MongoDB.
// Usage: node scripts/mysql-to-mongo.js [--replace]
//
// Source (MySQL): MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//   (falls back to the old DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, then
//   localhost:3306, root, no password, tickenting_tools).
// Target (MongoDB): MONGODB_URI and MONGODB_DB, as for the API.
//
// Every table is copied to the collection of the same name with the same ids,
// and the id counters are set so new records continue after the imported ones.
// Without --replace the import stops if the MongoDB database already has data.
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';
import { getDb, closePool } from '../src/config/database.js';
import { COLLECTIONS } from '../src/config/collections.js';
import { migrateUp } from '../src/utils/migrator.js';

const source = {
  host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'tickenting_tools',
};
const replace = process.argv.includes('--replace');

async function main() {
  console.log(`Importing MySQL ${source.database} on ${source.host}:${source.port} into MongoDB ${env.dbName}`);
  const conn = await mysql.createConnection({ ...source, timezone: 'Z', dateStrings: false, decimalNumbers: true, supportBigNumbers: true });
  try {
    await conn.query("SET SESSION time_zone = '+00:00'");
    const [tables] = await conn.query('SHOW TABLES');
    const present = new Set(tables.map((t) => Object.values(t)[0]));
    const db = getDb();
    await migrateUp();

    if (!replace) {
      for (const name of Object.keys(COLLECTIONS)) {
        if (await db.collection(name).estimatedDocumentCount()) {
          throw new Error(`MongoDB collection ${name} already has data. Run with --replace to overwrite the MongoDB data.`);
        }
      }
    }

    for (const [name, def] of Object.entries(COLLECTIONS)) {
      if (!present.has(name)) { console.log(`  ${name}: no such MySQL table, skipped`); continue; }
      const [rows] = await conn.query(`SELECT * FROM \`${name}\``);
      const col = db.collection(name);
      if (replace) await col.deleteMany({});
      for (let i = 0; i < rows.length; i += 1000) await col.insertMany(rows.slice(i, i + 1000).map((r) => ({ ...r })), { ordered: true });
      if (def.id) {
        const max = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
        await db.collection('counters').updateOne({ _id: name }, { $set: { seq: max } }, { upsert: true });
      }
      console.log(`  ${name}: ${rows.length}`);
    }
    console.log('Import complete.');
  } finally {
    await conn.end();
  }
}

try {
  await main();
} catch (err) {
  console.error('Import failed:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
