import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.js',
    env: { NODE_ENV: 'test', JOBS_ENABLED: 'false', SEED_ADMIN_PASSWORD: 'Admin-pass-2026', SEED_DEMO_PASSWORD: 'Demo-pass-2026' },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
