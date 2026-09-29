// Vercel serverless entry point. backend/vercel.json routes every request here;
// Express then handles /api/v1/* exactly as src/server.js does on a normal host.
// The database pool is created on the first query and reused while the
// function instance stays warm. Background jobs run through Vercel Cron
// (GET /api/v1/internal/jobs) instead of timers.
let app;
let startupError;
try {
  const { createApp } = await import('../src/app.js');
  app = createApp();
} catch (err) {
  // Configuration errors (e.g. a missing environment variable) name the
  // setting only, never a value, so they are safe to return.
  startupError = err;
  console.error('API failed to start:', err.message);
}

export default function handler(req, res) {
  if (app) return app(req, res);
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    success: false,
    message: `Server configuration error: ${startupError.message}`,
    errorCode: 'SERVER_MISCONFIGURED',
  }));
}
