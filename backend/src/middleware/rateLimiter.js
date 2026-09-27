import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const handler = (req, res, next, options) => {
  logger.warn('Rate limit reached', { requestId: req.requestId, path: req.originalUrl.split('?')[0], ip: req.ip, limit: options.limit });
  res.status(options.statusCode).json({
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
    errorCode: 'RATE_LIMITED',
    requestId: req.requestId,
  });
};

/**
 * Signed-in traffic is limited per session, so colleagues who share one office
 * IP address (NAT, proxy) do not use up each other's allowance. Requests
 * without a session are limited per IP address.
 */
function sessionOrIpKey(req) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (token) return 'session:' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  return 'ip:' + req.ip;
}

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: sessionOrIpKey,
  skip: () => env.isTest,
  handler,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  handler,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler,
});
