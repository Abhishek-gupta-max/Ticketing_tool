import { env } from '../config/env.js';
import * as auth from '../services/auth.service.js';
import { ok } from '../utils/response.js';

function maxAgeMs(expr) {
  const m = String(expr).match(/^(\d+)\s*([smhd])?$/);
  if (!m) return 86400000;
  return Number(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] || 's'];
}

const cookieOptions = () => ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: '/', maxAge: maxAgeMs(env.JWT_EXPIRES_IN) });
const setSession = (res, token) => res.cookie(env.COOKIE_NAME, token, cookieOptions());
const clearSession = (res) => res.clearCookie(env.COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const { token, user } = await auth.login(email, password);
  setSession(res, token);
  ok(res, user, 'Signed in');
}

export async function logout(req, res) {
  clearSession(res);
  ok(res, null, 'Signed out');
}

export async function logoutAll(req, res) {
  await auth.logoutEverywhere(req.user);
  clearSession(res);
  ok(res, null, 'Signed out of every session');
}

export async function me(req, res) {
  ok(res, await auth.profile(req.user));
}

export async function forgotPassword(req, res) {
  await auth.requestPasswordReset(req.valid.body.email);
  ok(res, null, 'If that email belongs to an account, a reset link has been sent.');
}

export async function resetPassword(req, res) {
  await auth.resetPassword(req.valid.body.token, req.valid.body.password);
  ok(res, null, 'Your password has been changed. You can sign in now.');
}

export async function changePassword(req, res) {
  const token = await auth.changePassword(req.user, req.valid.body.currentPassword, req.valid.body.newPassword);
  setSession(res, token);
  ok(res, null, 'Password changed. Other sessions have been signed out.');
}
