import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, BACKEND_ROOT } from './config/env.js';
import { logger } from './config/logger.js';
import { requestContext } from './middleware/requestContext.js';
import { requireAjaxHeader } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.isProduction ? 1 : false);

  app.use(requestContext);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        frameSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.frontendOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Request-Id'],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
    maxAge: 600,
  }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (req.originalUrl.startsWith('/api/')) {
        logger.log(res.statusCode >= 500 ? 'error' : env.isProduction ? 'info' : 'debug', 'request', {
          requestId: req.requestId, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms), userId: req.user?.id,
        });
      }
    });
    next();
  });

  app.use('/api', apiLimiter, requireAjaxHeader);
  app.use('/api/v1', routes);
  app.use('/api', notFoundHandler);

  // Optional: serve the built React app from the same origin.
  const dist = path.resolve(BACKEND_ROOT, '../frontend/dist');
  if (env.SERVE_FRONTEND && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '7d', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // API-only host: say what this is instead of Express's "Cannot GET /".
  app.get('/', (req, res) => res.json({ success: true, message: 'Veltrixsecure Service Desk API', data: { api: '/api/v1', health: '/api/v1/health' } }));

  app.use(errorHandler);
  return app;
}
