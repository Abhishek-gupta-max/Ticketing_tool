import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { env, BACKEND_ROOT } from '../config/env.js';

export const MIGRATIONS_DIR = path.resolve(BACKEND_ROOT, '../database/migrations');

/**
 * Split a .sql file into statements. Understands the DELIMITER command used
 * by the mysql client and phpMyAdmin, so trigger bodies stay intact.
 */
export function splitSql(sql) {
  const out = [];
  let delimiter = ';';
  let buf = '';
  for (const rawLine of sql.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      delimiter = m[1];
      continue;
    }
    if (!buf && /^\s*--/.test(line)) continue;
    buf += rawLine + '\n';
    if (line.endsWith(delimiter)) {
      const stmt = buf.trimEnd().slice(0, -delimiter.length).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s.replace(/--.*$/gm, '').trim());
}

async function connect(database) {
  return mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
    database, multipleStatements: false, timezone: 'Z',
  });
}

export async function ensureDatabase(dbName = env.dbName) {
  const conn = await connect(undefined);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

export async function listMigrationFiles() {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  return Promise.all(files.map(async (name) => {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  }));
}

async function appliedMigrations(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [rows] = await conn.query('SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name');
  return new Map(rows.map((r) => [r.name, r]));
}

/** Apply every migration that has not run yet. Never drops or rewrites data. */
export async function migrateUp({ dbName = env.dbName, log = () => {} } = {}) {
  await ensureDatabase(dbName);
  const conn = await connect(dbName);
  const applied = [];
  try {
    await conn.query("SET SESSION time_zone = '+00:00'");
    const done = await appliedMigrations(conn);
    for (const file of await listMigrationFiles()) {
      const prev = done.get(file.name);
      if (prev) {
        if (prev.checksum !== file.checksum) log(`warning: ${file.name} changed after it was applied. Create a new migration instead of editing it.`);
        continue;
      }
      log(`applying ${file.name}`);
      for (const stmt of splitSql(file.sql)) await conn.query(stmt);
      await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file.name, file.checksum]);
      applied.push(file.name);
    }
  } finally {
    await conn.end();
  }
  return applied;
}

export async function migrationStatus({ dbName = env.dbName } = {}) {
  await ensureDatabase(dbName);
  const conn = await connect(dbName);
  try {
    const done = await appliedMigrations(conn);
    return (await listMigrationFiles()).map((f) => ({
      name: f.name,
      applied: done.has(f.name),
      appliedAt: done.get(f.name)?.applied_at || null,
      modified: done.has(f.name) && done.get(f.name).checksum !== f.checksum,
    }));
  } finally {
    await conn.end();
  }
}

export async function dropDatabase(dbName) {
  if (!/_test$/.test(dbName)) throw new Error('Refusing to drop a database whose name does not end in _test');
  const conn = await connect(undefined);
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  } finally {
    await conn.end();
  }
}
