// Builds a fresh test database from the migrations and seeds, so tests run
// against the real schema. Only databases whose name ends in _test are touched.
export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.SEED_ADMIN_PASSWORD = 'Admin-pass-2026';
  process.env.SEED_DEMO_PASSWORD = 'Demo-pass-2026';
  const { env } = await import('../src/config/env.js');
  const { dropDatabase, migrateUp } = await import('../src/utils/migrator.js');
  const { runSeeds } = await import('../src/utils/seeder.js');
  await dropDatabase(env.dbName);
  await migrateUp({ dbName: env.dbName });
  await runSeeds('demo', { dbName: env.dbName });
  return async () => { await dropDatabase(env.dbName); };
}
