import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import { env } from './env.js';

// Keys whose values must never reach a log line.
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|jwt/i;

function redact(value, depth = 0) {
  if (depth > 4 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

const redactFormat = winston.format((info) => {
  for (const k of Object.keys(info)) {
    if (SENSITIVE.test(k)) info[k] = '[redacted]';
    else if (info[k] && typeof info[k] === 'object' && !(info[k] instanceof Error)) info[k] = redact(info[k]);
  }
  return info;
});

const transports = [];
if (!env.isTest) {
  transports.push(new winston.transports.Console({
    format: env.isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} ${level} ${message}${extra}`;
      })),
  }));
  // On Vercel the console output is the log (Deployments > Logs); files would not be kept.
  if (!env.onVercel) {
    fs.mkdirSync(env.logDir, { recursive: true });
    transports.push(new winston.transports.File({ filename: path.join(env.logDir, 'error.log'), level: 'error', maxsize: 10 * 1024 * 1024, maxFiles: 5 }));
    transports.push(new winston.transports.File({ filename: path.join(env.logDir, 'app.log'), maxsize: 20 * 1024 * 1024, maxFiles: 5 }));
  }
} else {
  transports.push(new winston.transports.Console({ silent: true }));
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(redactFormat(), winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
  defaultMeta: { service: 'servicedesk-api' },
  transports,
});
