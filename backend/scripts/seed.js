#!/usr/bin/env node
// Usage: node scripts/seed.js [reference|demo]
import { env } from '../src/config/env.js';
import { runSeeds } from '../src/utils/seeder.js';

const kind = process.argv[2] || 'reference';
if (!['reference', 'demo'].includes(kind)) {
  console.error('Use "reference" or "demo".');
  process.exit(1);
}
if (kind === 'demo' && env.isProduction) {
  console.error('Refusing to load demo data with NODE_ENV=production.');
  process.exit(1);
}

try {
  console.log(`Seeding ${kind} data into ${env.dbName}`);
  await runSeeds(kind, { log: (m) => console.log(m) });
  console.log('Seeding complete.');
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exit(1);
}
