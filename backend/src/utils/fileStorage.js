import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const NAME = /^[0-9a-f-]{36}$/;

/** Store bytes under a random name. The original file name is never used on disk. */
export async function writeUpload(buffer) {
  await fs.mkdir(env.uploadDir, { recursive: true });
  const storedName = crypto.randomUUID();
  await fs.writeFile(path.join(env.uploadDir, storedName), buffer, { flag: 'wx', mode: 0o640 });
  return { storedName, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export function uploadPath(storedName) {
  if (!NAME.test(storedName)) throw new Error('Invalid stored file name');
  return path.join(env.uploadDir, storedName);
}

export async function removeUpload(storedName) {
  try { await fs.unlink(uploadPath(storedName)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
}
