#!/usr/bin/env node
// Writes database/schema.sql: every migration in order, for reference and for
// one-shot imports (for example through phpMyAdmin). The migrations remain the
// source of truth; regenerate this file after adding one.
import fs from 'node:fs/promises';
import path from 'node:path';
import { listMigrationFiles, MIGRATIONS_DIR } from '../src/utils/migrator.js';

const files = await listMigrationFiles();
const header = `-- Veltrixsecure Service Desk: full schema generated from database/migrations.
-- Generated file. Do not edit; run "npm run db:schema" after adding a migration.
-- Target: MySQL 8 / MariaDB 10.4+ (utf8mb4).

SET NAMES utf8mb4;
SET time_zone = '+00:00';
`;
const body = files.map((f) => `\n-- ===================== ${f.name} =====================\n${f.sql.trim()}\n`).join('');
const out = path.resolve(MIGRATIONS_DIR, '..', 'schema.sql');
await fs.writeFile(out, header + body, 'utf8');
console.log(`Wrote ${out} from ${files.length} migrations.`);
