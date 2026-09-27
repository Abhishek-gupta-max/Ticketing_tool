import { forbidden } from '../utils/AppError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: every state-changing call
 * must carry X-Requested-With. Browsers cannot add this header cross-origin
 * without a CORS preflight, and CORS only allows the configured frontend.
 */
export function requireAjaxHeader(req, res, next) {
  if (SAFE.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'XMLHttpRequest') return next(forbidden('Missing request header.', 'CSRF_CHECK_FAILED'));
  return next();
}
