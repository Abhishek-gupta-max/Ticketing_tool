import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env, BACKEND_ROOT } from '../config/env.js';
import * as db from '../config/database.js';
import { migrateUp } from './migrator.js';
import { hashPassword, randomPassword } from './password.js';
import { writeUpload } from './fileStorage.js';
import * as permissions from '../constants/permissions.js';

export const SEEDS_DIR = path.resolve(BACKEND_ROOT, '../database/seeds');

async function runDir(dir, log) {
  let files = [];
  try { files = (await fs.readdir(dir)).filter((f) => /^\d+_.+\.js$/.test(f)).sort(); } catch { return; }
  const ctx = { db, env, hashPassword, randomPassword, writeUpload, constants: permissions };
  for (const file of files) {
    const prefix = `  ${file}: `;
    try {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      await mod.default({ ...ctx, log: (m) => log(prefix + m) });
    } catch (err) {
      throw new Error(`${file}: ${err.message}`);
    }
  }
}

/**
 * kind 'reference' loads the data the application needs to run.
 * kind 'demo' loads reference data and then the sample workspace.
 * Seeds are idempotent: existing records are not duplicated.
 */
export async function runSeeds(kind = 'reference', { log = () => {} } = {}) {
  await migrateUp(); // unique indexes make the seeds idempotent
  await runDir(SEEDS_DIR, log);
  if (kind === 'demo') await runDir(path.join(SEEDS_DIR, 'demo'), log);
}
