import { env } from '../config/env.js';
import { userFromToken } from '../services/auth.service.js';
import { unauthorized, forbidden } from '../utils/AppError.js';
import { getContext } from '../utils/requestContext.js';

/** Require a valid session cookie. Sets req.user. */
export async function authenticate(req, res, next) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return next(unauthorized());
  try {
    req.user = await userFromToken(token);
    getContext().user = req.user.id;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require every listed permission. */
export const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  const missing = perms.filter((p) => !req.user.permissions.has(p));
  if (missing.length) return next(forbidden('You do not have permission to do this.', 'PERMISSION_DENIED'));
  next();
};

/** Require at least one of the listed permissions. */
export const requireAnyPermission = (...perms) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!perms.some((p) => req.user.permissions.has(p))) return next(forbidden('You do not have permission to do this.', 'PERMISSION_DENIED'));
  next();
};

/** Staff only (Admin, Manager, Agent). */
export function requireStaff(req, res, next) {
  if (!req.user?.isStaff) return next(forbidden('This area is for service desk staff.', 'STAFF_ONLY'));
  next();
}
