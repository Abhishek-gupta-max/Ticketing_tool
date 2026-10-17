#!/usr/bin/env node
// Usage: node scripts/migrate.js [up|status]
import { env } from '../src/config/env.js';
import { migrateUp, migrationStatus } from '../src/utils/migrator.js';
import { closePool } from '../src/config/database.js';

const cmd = process.argv[2] || 'up';

try {
  if (cmd === 'status') {
    const rows = await migrationStatus();
    console.log(`Database: ${env.dbName}`);
    for (const r of rows) console.log(`${r.applied ? '[x]' : '[ ]'} ${r.name}`);
  } else if (cmd === 'up') {
    console.log(`Creating collections and indexes in ${env.dbName}`);
    const created = await migrateUp({ log: (m) => console.log('  ' + m) });
    console.log(created.length ? `Created ${created.length} collection(s); indexes are up to date.` : 'Nothing to create. Collections and indexes are up to date.');
  } else {
    console.error('Unknown command. Use "up" or "status".');
    process.exit(1);
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
