import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as users from '../repositories/user.repository.js';
import { hashPassword, verifyPassword, passwordProblem, randomToken, sha256 } from '../utils/password.js';
import { unauthorized, badRequest, AppError } from '../utils/AppError.js';
import { STAFF_ROLES } from '../constants/permissions.js';
import * as audit from './audit.service.js';
import * as teamRepo from '../repositories/team.repository.js';

// A bcrypt hash of a random string, compared against when the email is unknown
// so response times do not reveal which accounts exist.
let dummyHash = null;
const getDummyHash = async () => (dummyHash ||= await hashPassword(randomToken(16)));

const permissionCache = new Map();
async function permissionsFor(roleId) {
  const hit = permissionCache.get(roleId);
  if (hit && hit.at > Date.now() - 60000) return hit.set;
  const set = new Set(await users.permissionsForRole(roleId));
  permissionCache.set(roleId, { set, at: Date.now() });
  return set;
}

export function signSession(user) {
  return jwt.sign({ sub: String(user.id), tv: user.token_version }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' });
}

/** Resolve a session token into the request user, or throw 401. */
export async function userFromToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }
  const row = await users.findAuthById(Number(payload.sub));
  if (!row || row.deleted_at || row.status !== 'active' || row.token_version !== payload.tv) {
    throw unauthorized('Your session is no longer valid. Please sign in again.', 'SESSION_INVALID');
  }
  return buildUser(row, await permissionsFor(row.role_id));
}

function buildUser(row, permissions) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    roleId: row.role_id,
    isStaff: STAFF_ROLES.includes(row.role),
    personId: row.person_id || null,
    customerId: row.person_customer_id || null,
    primaryTeamId: row.primary_team_id || null,
    permissions,
    can: (p) => permissions.has(p),
  };
}

export async function login(email, password) {
  const row = await users.findByEmailForLogin(String(email).trim().toLowerCase());
  const valid = await verifyPassword(password, row?.password_hash || await getDummyHash());

  if (!row) {
    logger.info('Sign-in failed: unknown account');
    throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(row.locked_until) - Date.now()) / 60000);
    logger.warn('Sign-in blocked: account locked', { userId: row.id });
    throw new AppError(423, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'ACCOUNT_LOCKED');
  }
  if (!valid) {
    const attempts = row.failed_login_count + 1;
    const lock = attempts >= env.LOGIN_MAX_ATTEMPTS ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60000) : null;
    await users.recordLoginFailure(row.id, lock);
    logger.warn('Sign-in failed: wrong password', { userId: row.id, attempts, locked: !!lock });
    if (lock) await audit.log({ userId: row.id, action: 'Account locked after failed sign-ins', entityType: 'user', entityId: row.id, entityRef: row.email });
    throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }
  if (row.status !== 'active' && row.status !== 'locked') {
    logger.warn('Sign-in blocked: account disabled', { userId: row.id });
    throw new AppError(403, 'This account is disabled. Contact your administrator.', 'ACCOUNT_DISABLED');
  }

  await users.recordLoginSuccess(row.id);
  await audit.log({ userId: row.id, action: 'Signed in', entityType: 'user', entityId: row.id, entityRef: row.email });
  logger.info('User signed in', { userId: row.id, role: row.role });
  const fresh = await users.findAuthById(row.id);
  return { token: signSession(fresh), user: await profile(buildUser(fresh, await permissionsFor(fresh.role_id))) };
}

/** Profile returned to the frontend (no secrets). */
export async function profile(user) {
  const teams = user.isStaff ? await teamRepo.teamsOfUser(user.id) : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isStaff: user.isStaff,
    personId: user.personId,
    customerId: user.customerId,
    primaryTeamId: user.primaryTeamId,
    teams,
    permissions: [...user.permissions].sort(),
  };
}

export async function logoutEverywhere(user) {
  await users.bumpTokenVersion(user.id);
  await audit.log({ userId: user.id, action: 'Signed out of all sessions', entityType: 'user', entityId: user.id, entityRef: user.email });
}

export async function requestPasswordReset(email) {
  const row = await users.findByEmailForLogin(String(email).trim().toLowerCase());
  if (!row || row.status === 'inactive') return; // same response either way
  const token = randomToken(32);
  await users.setResetToken(row.id, sha256(token), new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60000));
  await audit.log({ userId: row.id, action: 'Requested a password reset', entityType: 'user', entityId: row.id, entityRef: row.email });
  // No mail transport is configured. In development the link is printed to the
  // console so the flow can be tested; in production connect an email service
  // here (see docs/DEPLOYMENT.md) and never log the token.
  if (!env.isProduction && !env.isTest) console.info(`[dev] Password reset link for ${row.email}: ${env.frontendOrigins[0]}/reset-password?token=${token}`);
}

export async function resetPassword(token, newPassword) {
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
  const row = await users.findByResetTokenHash(sha256(String(token)));
  if (!row) throw badRequest('This reset link is invalid or has expired. Request a new one.', 'RESET_TOKEN_INVALID');
  await users.setPassword(row.id, await hashPassword(newPassword));
  await audit.log({ userId: row.id, action: 'Reset password', entityType: 'user', entityId: row.id, entityRef: row.email });
}

export async function changePassword(user, currentPassword, newPassword) {
  const hash = await users.findPasswordHash(user.id);
  if (!(await verifyPassword(currentPassword, hash))) throw badRequest('Your current password is incorrect.', 'INVALID_PASSWORD');
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
  await users.setPassword(user.id, await hashPassword(newPassword));
  await audit.log({ userId: user.id, action: 'Changed password', entityType: 'user', entityId: user.id, entityRef: user.email });
  const fresh = await users.findAuthById(user.id);
  return signSession(fresh);
}

export const clearPermissionCache = () => permissionCache.clear();
