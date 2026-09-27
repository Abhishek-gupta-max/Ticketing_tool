#!/usr/bin/env node
// Usage: node scripts/migrate.js [up|status]
import { env } from '../src/config/env.js';
import { migrateUp, migrationStatus } from '../src/utils/migrator.js';

const cmd = process.argv[2] || 'up';

try {
  if (cmd === 'status') {
    const rows = await migrationStatus();
    console.log(`Database: ${env.dbName}`);
    for (const r of rows) console.log(`${r.applied ? '[x]' : '[ ]'} ${r.name}${r.modified ? '  (modified after apply!)' : ''}`);
  } else if (cmd === 'up') {
    console.log(`Migrating ${env.dbName} on ${env.DB_HOST}:${env.DB_PORT}`);
    const applied = await migrateUp({ log: (m) => console.log('  ' + m) });
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Nothing to apply. Schema is up to date.');
  } else {
    console.error('Unknown command. Use "up" or "status".');
    process.exit(1);
  }
} catch (err) {
  console.error('Migration failed:', err.code || '', err.sqlMessage || err.message);
  process.exit(1);
}
