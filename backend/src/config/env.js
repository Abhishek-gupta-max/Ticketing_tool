import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '../..');

// .env.<NODE_ENV> wins over .env; real environment variables win over both.
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.join(BACKEND_ROOT, `.env.${nodeEnv}`), quiet: true });
dotenv.config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

// Hosted MySQL providers often name these MYSQL_*; DB_* wins when both are set.
for (const [alias, name] of [['MYSQL_HOST', 'DB_HOST'], ['MYSQL_PORT', 'DB_PORT'], ['MYSQL_USER', 'DB_USER'], ['MYSQL_PASSWORD', 'DB_PASSWORD'], ['MYSQL_DATABASE', 'DB_NAME']]) {
  if (process.env[name] === undefined && process.env[alias] !== undefined) process.env[name] = process.env[alias];
}

// Vercel runs the API as a serverless function: the file system is read-only
// except the temporary directory, and nothing written there is kept.
const onVercel = Boolean(process.env.VERCEL);

const bool = (def) => z.enum(['true', 'false', '1', '0']).default(def).transform((v) => v === 'true' || v === '1');
const int = (def) => z.coerce.number().int().default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(5000),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: int(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('tickenting_tools'),
  DB_NAME_TEST: z.string().default('tickenting_tools_test'),
  DB_CONNECTION_LIMIT: int(onVercel ? 3 : 10),
  DB_SSL: bool('false'),

  JWT_SECRET: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('1d'),
  COOKIE_NAME: z.string().default('vlx_session'),
  COOKIE_SECURE: bool('false'),
  // "none" is only needed when the browser calls the API on another site directly.
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  BCRYPT_ROUNDS: int(12),
  LOGIN_MAX_ATTEMPTS: int(5),
  LOGIN_LOCK_MINUTES: int(15),
  PASSWORD_RESET_TTL_MINUTES: int(30),

  FRONTEND_URL: z.string().default('http://localhost:5173'),

  RATE_LIMIT_WINDOW_MINUTES: int(15),
  RATE_LIMIT_MAX: int(1000),
  LOGIN_RATE_LIMIT_MAX: int(20),

  UPLOAD_DIR: z.string().default(onVercel ? path.join(os.tmpdir(), 'uploads') : 'src/uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(5),
  MAX_FILES_PER_UPLOAD: int(10),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),

  JOBS_ENABLED: bool('true'),
  // Bearer token Vercel Cron sends to /api/v1/internal/jobs.
  CRON_SECRET: z.string().default(''),
  SERVE_FRONTEND: bool('false'),

  SEED_ADMIN_EMAIL: z.string().default('admin@veltrixsecure.example'),
  SEED_ADMIN_PASSWORD: z.string().default(''),
  SEED_DEMO_PASSWORD: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Printed before the logger exists; never includes values, only names.
  console.error('Invalid environment configuration:', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
  process.exit(1);
}
const e = parsed.data;

if (e.NODE_ENV === 'test' && !e.JWT_SECRET) e.JWT_SECRET = 'test-only-secret-not-used-anywhere-else-0123456789';
if (e.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or shorter than 32 characters. Set it in backend/.env (see .env.example).');
  process.exit(1);
}
if (e.COOKIE_SAME_SITE === 'none' && !e.COOKIE_SECURE) {
  console.error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.');
  process.exit(1);
}
if (e.NODE_ENV === 'production' && !e.COOKIE_SECURE) {
  console.warn('COOKIE_SECURE is false in production. Session cookies will be sent over plain HTTP.');
}

export const env = Object.freeze({
  ...e,
  isProduction: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  onVercel,
  dbName: e.NODE_ENV === 'test' ? e.DB_NAME_TEST : e.DB_NAME,
  frontendOrigins: e.FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir: path.resolve(BACKEND_ROOT, e.UPLOAD_DIR),
  logDir: path.resolve(BACKEND_ROOT, e.LOG_DIR),
  maxFileBytes: Math.round(e.MAX_FILE_SIZE_MB * 1024 * 1024),
});
