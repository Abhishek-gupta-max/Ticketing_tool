import { query, queryOne } from '../config/database.js';

const AUTH_COLUMNS = `u.id, u.name, u.email, u.role_id, r.name AS role, u.status, u.token_version,
  u.failed_login_count, u.locked_until, u.last_login_at, u.deleted_at`;

export const findByEmailForLogin = (email) => queryOne(
  `SELECT ${AUTH_COLUMNS}, u.password_hash FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? AND u.deleted_at IS NULL`,
  [email],
);

export const findAuthById = (id) => queryOne(
  `SELECT ${AUTH_COLUMNS}, p.id AS person_id, p.customer_id AS person_customer_id, a.primary_team_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN people p ON p.user_id = u.id AND p.deleted_at IS NULL
     LEFT JOIN agents a ON a.user_id = u.id
    WHERE u.id = ?`,
  [id],
);

export const findPasswordHash = async (id) => (await queryOne('SELECT password_hash FROM users WHERE id = ?', [id]))?.password_hash;

export async function permissionsForRole(roleId) {
  const rows = await query(
    'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?',
    [roleId],
  );
  return rows.map((r) => r.code);
}

export const recordLoginSuccess = (id) => query(
  'UPDATE users SET failed_login_count = 0, locked_until = NULL, status = IF(status = \'locked\', \'active\', status), last_login_at = UTC_TIMESTAMP(3) WHERE id = ?',
  [id],
);

export const recordLoginFailure = (id, lockUntil) => query(
  'UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = COALESCE(?, locked_until) WHERE id = ?',
  [lockUntil, id],
);

export const setResetToken = (id, tokenHash, expiresAt) => query(
  'UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?',
  [tokenHash, expiresAt, id],
);

export const findByResetTokenHash = (tokenHash) => queryOne(
  `SELECT id, email, status FROM users
    WHERE reset_token_hash = ? AND reset_token_expires_at > UTC_TIMESTAMP(3) AND deleted_at IS NULL`,
  [tokenHash],
);

/** Set a new password and invalidate every existing session. */
export const setPassword = (id, passwordHash, conn) => query(
  `UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), reset_token_hash = NULL,
          reset_token_expires_at = NULL, failed_login_count = 0, locked_until = NULL, token_version = token_version + 1
    WHERE id = ?`,
  [passwordHash, id],
  conn,
);

export const bumpTokenVersion = (id) => query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id]);

export const findRoleByName = (name) => queryOne('SELECT id, name FROM roles WHERE name = ?', [name]);

export const listRoles = () => query('SELECT id, name, description FROM roles ORDER BY id');

export async function rolePermissionMatrix() {
  return query(
    `SELECT r.name AS role, p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id ORDER BY r.id, p.code`,
  );
}
