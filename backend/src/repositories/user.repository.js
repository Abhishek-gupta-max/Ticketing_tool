import { find, findOne, updateOne, mapBy, collection } from '../config/database.js';

const AUTH_FIELDS = {
  id: 1, name: 1, email: 1, role_id: 1, status: 1, token_version: 1, failed_login_count: 1, locked_until: 1, last_login_at: 1, deleted_at: 1,
};

async function withRole(u) {
  if (!u) return null;
  const role = await findOne('roles', { id: u.role_id }, { projection: { name: 1 } });
  return role ? { ...u, role: role.name } : null;
}

export const findByEmailForLogin = async (email) => withRole(await findOne('users', { email, deleted_at: null }, { projection: { ...AUTH_FIELDS, password_hash: 1 } }));

export async function findAuthById(id) {
  const u = await withRole(await findOne('users', { id }, { projection: AUTH_FIELDS }));
  if (!u) return null;
  const [person, agent] = await Promise.all([
    findOne('people', { user_id: id, deleted_at: null }, { projection: { id: 1, customer_id: 1 } }),
    findOne('agents', { user_id: id }, { projection: { primary_team_id: 1 } }),
  ]);
  return {
    ...u,
    person_id: person?.id ?? null,
    person_customer_id: person?.customer_id ?? null,
    primary_team_id: agent?.primary_team_id ?? null,
  };
}

export const findPasswordHash = async (id) => (await findOne('users', { id }, { projection: { password_hash: 1 } }))?.password_hash;

export async function permissionsForRole(roleId) {
  const links = await find('role_permissions', { role_id: roleId }, { projection: { permission_id: 1 } });
  const perms = await find('permissions', { id: { $in: links.map((l) => l.permission_id) } }, { projection: { code: 1 } });
  return perms.map((p) => p.code);
}

const session = (conn) => (conn?.session ? { session: conn.session } : {});

/** Clears the failure count; a locked account becomes active again. */
export const recordLoginSuccess = (id) => collection('users').updateOne({ id }, [
  { $set: { failed_login_count: 0, locked_until: null, last_login_at: '$$NOW', updated_at: '$$NOW', status: { $cond: [{ $eq: ['$status', 'locked'] }, 'active', '$status'] } } },
]);

export const recordLoginFailure = (id, lockUntil) => collection('users').updateOne(
  { id },
  { $inc: { failed_login_count: 1 }, $set: { updated_at: new Date(), ...(lockUntil != null && { locked_until: lockUntil }) } },
);

export const setResetToken = (id, tokenHash, expiresAt) => updateOne('users', { id }, { reset_token_hash: tokenHash, reset_token_expires_at: expiresAt });

export const findByResetTokenHash = (tokenHash) => findOne(
  'users',
  { reset_token_hash: tokenHash, reset_token_expires_at: { $gt: new Date() }, deleted_at: null },
  { projection: { id: 1, email: 1, status: 1 } },
);

/** Set a new password and invalidate every existing session. */
export const setPassword = (id, passwordHash, conn) => collection('users').updateOne(
  { id },
  {
    $set: {
      password_hash: passwordHash, password_changed_at: new Date(), reset_token_hash: null, reset_token_expires_at: null, failed_login_count: 0,
      locked_until: null, updated_at: new Date(),
    },
    $inc: { token_version: 1 },
  },
  session(conn),
);

export const bumpTokenVersion = (id, conn) => collection('users').updateOne({ id }, { $inc: { token_version: 1 }, $set: { updated_at: new Date() } }, session(conn));

export const findRoleByName = (name) => findOne('roles', { name }, { projection: { id: 1, name: 1 } });

export const listRoles = () => find('roles', {}, { sort: { id: 1 }, projection: { id: 1, name: 1, description: 1 } });

export async function rolePermissionMatrix() {
  const [links, roles, perms] = await Promise.all([
    find('role_permissions', {}),
    find('roles', {}, { projection: { id: 1, name: 1 } }),
    find('permissions', {}, { projection: { id: 1, code: 1 } }),
  ]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const permById = new Map(perms.map((p) => [p.id, p]));
  return links
    .filter((l) => roleById.has(l.role_id) && permById.has(l.permission_id))
    .map((l) => ({ role_id: l.role_id, role: roleById.get(l.role_id).name, code: permById.get(l.permission_id).code }))
    .sort((a, b) => a.role_id - b.role_id || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map(({ role, code }) => ({ role, code }));
}

/** Names of users by id (helper for services). */
export const namesById = (ids) => mapBy('users', ids, { projection: { name: 1 } });
