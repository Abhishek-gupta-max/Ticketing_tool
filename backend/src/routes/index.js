// API v1 router. Each module has its own route file:
// route -> validation -> permission -> controller -> service -> repository -> MySQL.
import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { notFound, unauthorized } from '../utils/AppError.js';
import { autoCloseResolved, slaNotifications } from '../jobs/index.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';
import * as S from '../validators/schemas.js';
import * as authC from '../controllers/auth.controller.js';
import { pingDatabase } from '../config/database.js';
import dashboardRoutes from './dashboard.routes.js';
import ticketRoutes from './ticket.routes.js';
import incidentRoutes from './incident.routes.js';
import taskRoutes from './task.routes.js';
import requestRoutes from './request.routes.js';
import approvalRoutes from './approval.routes.js';
import problemRoutes from './problem.routes.js';
import changeRoutes from './change.routes.js';
import assetRoutes from './asset.routes.js';
import kbRoutes from './kb.routes.js';
import reportRoutes from './report.routes.js';
import peopleRoutes from './people.routes.js';
import settingsRoutes from './settings.routes.js';

const r = Router();

const DB_REASONS = {
  ECONNREFUSED: 'Connection refused: nothing is listening on DB_HOST:DB_PORT (localhost is not reachable from a hosting service).',
  ENOTFOUND: 'DB_HOST was not found. Check the host name.',
  EAI_AGAIN: 'DB_HOST could not be resolved. Check the host name.',
  ETIMEDOUT: 'Connection timed out. Check DB_HOST, DB_PORT and that the database accepts connections from the internet.',
  ER_ACCESS_DENIED_ERROR: 'The database rejected DB_USER / DB_PASSWORD.',
  ER_BAD_DB_ERROR: 'DB_NAME does not exist on the server.',
  HANDSHAKE_SSL_ERROR: 'TLS failed. Check DB_SSL.',
};
const dbReason = (err) => DB_REASONS[err?.code] || (err?.code ? `Database error ${err.code}` : 'Unknown database error');

// ---------- public ----------
r.get('/health', async (req, res) => {
  try { await pingDatabase(); res.json({ success: true, message: 'OK', data: { status: 'ok', database: 'up' } }); }
  catch (err) {
    // The driver's error code only (never host names or credentials), so a
    // failed deployment can be diagnosed from the browser.
    res.status(503).json({ success: false, message: 'Database unavailable', errorCode: 'DB_DOWN', reason: dbReason(err) });
  }
});
r.post('/auth/login', loginLimiter, validate({ body: S.auth.login }), authC.login);
r.post('/auth/logout', authC.logout);
r.post('/auth/forgot-password', passwordResetLimiter, validate({ body: S.auth.forgot }), authC.forgotPassword);
r.post('/auth/reset-password', passwordResetLimiter, validate({ body: S.auth.reset }), authC.resetPassword);

// Scheduled jobs for serverless hosting (Vercel Cron), where no long-running
// process runs them on timers. Disabled unless CRON_SECRET is set.
r.get('/internal/jobs', async (req, res, next) => {
  if (!env.CRON_SECRET) return next(notFound('The requested endpoint does not exist.', 'ROUTE_NOT_FOUND'));
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const given = Buffer.from(req.get('authorization') || '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return next(unauthorized());
  try {
    const autoClosed = await autoCloseResolved();
    await slaNotifications();
    res.json({ success: true, message: 'Jobs completed', data: { autoClosed } });
  } catch (err) { next(err); }
});

// ---------- everything below requires a session ----------
r.use(authenticate);
r.get('/auth/me', authC.me);
r.post('/auth/logout-all', authC.logoutAll);
r.post('/auth/change-password', validate({ body: S.auth.change }), authC.changePassword);

r.use(dashboardRoutes);
r.use(ticketRoutes);
r.use(incidentRoutes);
r.use(taskRoutes);
r.use(requestRoutes);
r.use(approvalRoutes);
r.use(problemRoutes);
r.use(changeRoutes);
r.use(assetRoutes);
r.use(kbRoutes);
r.use(reportRoutes);
r.use(peopleRoutes);
r.use(settingsRoutes);

export default r;
