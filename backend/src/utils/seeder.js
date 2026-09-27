import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { env, BACKEND_ROOT } from '../config/env.js';
import { splitSql } from './migrator.js';
import { hashPassword, randomPassword } from './password.js';
import { writeUpload } from './fileStorage.js';
import * as permissions from '../constants/permissions.js';

export const SEEDS_DIR = path.resolve(BACKEND_ROOT, '../database/seeds');

async function runDir(conn, dir, log) {
  let files = [];
  try { files = (await fs.readdir(dir)).filter((f) => /^\d+_.+\.(sql|js)$/.test(f)).sort(); } catch { return; }
  const ctx = { conn, env, hashPassword, randomPassword, writeUpload, constants: permissions };
  for (const file of files) {
    const full = path.join(dir, file);
    const prefix = `  ${file}: `;
    await conn.beginTransaction();
    try {
      if (file.endsWith('.sql')) {
        for (const stmt of splitSql(await fs.readFile(full, 'utf8'))) await conn.query(stmt);
        log(prefix + 'done');
      } else {
        const mod = await import(pathToFileURL(full).href);
        await mod.default({ ...ctx, log: (m) => log(prefix + m) });
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw new Error(`${file}: ${err.sqlMessage || err.message}`);
    }
  }
}

/**
 * kind 'reference' loads the data the application needs to run.
 * kind 'demo' loads reference data and then the sample workspace.
 */
export async function runSeeds(kind = 'reference', { dbName = env.dbName, log = () => {} } = {}) {
  const conn = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: dbName, timezone: 'Z' });
  try {
    await conn.query("SET SESSION time_zone = '+00:00'");
    await runDir(conn, SEEDS_DIR, log);
    if (kind === 'demo') await runDir(conn, path.join(SEEDS_DIR, 'demo'), log);
  } finally {
    await conn.end();
  }
}
