// API v1 router. Each module has its own route file:
// route -> validation -> permission -> controller -> service -> repository -> MySQL.
import { Router } from 'express';
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

// ---------- public ----------
r.get('/health', async (req, res) => {
  try { await pingDatabase(); res.json({ success: true, message: 'OK', data: { status: 'ok', database: 'up' } }); }
  catch { res.status(503).json({ success: false, message: 'Database unavailable', errorCode: 'DB_DOWN' }); }
});
r.post('/auth/login', loginLimiter, validate({ body: S.auth.login }), authC.login);
r.post('/auth/logout', authC.logout);
r.post('/auth/forgot-password', passwordResetLimiter, validate({ body: S.auth.forgot }), authC.forgotPassword);
r.post('/auth/reset-password', passwordResetLimiter, validate({ body: S.auth.reset }), authC.resetPassword);

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
