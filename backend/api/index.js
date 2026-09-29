// Vercel serverless entry point. backend/vercel.json routes every request here;
// Express then handles /api/v1/* exactly as src/server.js does on a normal host.
// The database pool is created on the first query and reused while the
// function instance stays warm. Background jobs run through Vercel Cron
// (GET /api/v1/internal/jobs) instead of timers.
import { createApp } from '../src/app.js';

export default createApp();
