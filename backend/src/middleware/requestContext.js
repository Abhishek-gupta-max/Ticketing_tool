import crypto from 'node:crypto';
import { runWithContext } from '../utils/requestContext.js';

export function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  req.requestId = requestId;
  const ctx = { requestId, ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 255), user: null };
  req.ctx = ctx;
  runWithContext(ctx, () => next());
}
