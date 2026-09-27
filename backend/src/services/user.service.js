import { withTransaction, query, queryOne } from '../config/database.js';
import * as userRepo from '../repositories/user.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as audit from './audit.service.js';
import { hashPassword, passwordProblem } from '../utils/password.js';
import { badRequest, notFound, unprocessable } from '../utils/AppError.js';
import { STAFF_ROLES, ROLE_DEFINITIONS } from '../constants/permissions.js';

/** Agents (staff users) with teams and workload. */
export async function listAgents({ includeInactive = true } = {}) {
  const rows = await query(
    `SELECT u.id, u.name, u.email, r.name AS role, u.status, u.last_login_at, a.primary_team_id,
            (SELECT GROUP_CONCAT(tm.team_id ORDER BY tm.team_id) FROM team_members tm WHERE tm.user_id = u.id) AS team_ids,
            (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.deleted_at IS NULL AND t.status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_tickets,
            (SELECT COUNT(*) FROM tasks s WHERE s.assigned_to = u.id AND s.state NOT IN ('Done','Not done','Not needed')) AS open_tasks
       FROM users u JOIN agents a ON a.user_id = u.id JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL ${includeInactive ? '' : "AND u.status = 'active'"} ORDER BY u.id`,
  );
  return rows.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.status === 'active', status: u.status, lastLoginAt: u.last_login_at,
    primaryTeamId: u.primary_team_id, teamIds: u.team_ids ? u.team_ids.split(',').map(Number) : [], openTickets: Number(u.open_tickets), openTasks: Number(u.open_tasks),
  }));
}

async function setTeams(conn, userId, teamIds, primary) {
  const current = (await query('SELECT team_id FROM team_members WHERE user_id = ?', [userId], conn)).map((r) => r.team_id);
  for (const t of current) if (!teamIds.includes(t)) await teamRepo.removeMember(t, userId, conn);
  for (const t of teamIds) if (!current.includes(t)) await teamRepo.addMember(t, userId, conn);
  await query('UPDATE agents SET primary_team_id = ? WHERE user_id = ?', [primary, userId], conn);
}

async function checkTeams(teamIds, conn) {
  if (!teamIds.length) throw badRequest('Choose at least one team.', 'VALIDATION_ERROR', { fields: { teamIds: 'Required' } });
  for (const id of teamIds) if (!(await teamRepo.findById(id, conn))) throw badRequest('A chosen team does not exist.');
}

/** body: { name, email, role, teamIds, password } */
export async function createAgent(body, user) {
  if (!STAFF_ROLES.includes(body.role)) throw badRequest('Choose Agent, Manager or Admin.');
  const problem = passwordProblem(body.password);
  if (problem) throw badRequest(problem, 'WEAK_PASSWORD', { fields: { password: problem } });
  const id = await withTransaction(async (conn) => {
    await checkTeams(body.teamIds, conn);
    const role = await userRepo.findRoleByName(body.role);
    const res = await query('INSERT INTO users (role_id, name, email, password_hash, password_changed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))',
      [role.id, body.name.trim(), body.email.trim().toLowerCase(), await hashPassword(body.password)], conn);
    await query('INSERT INTO agents (user_id, primary_team_id) VALUES (?, ?)', [res.insertId, body.teamIds[0]], conn);
    await setTeams(conn, res.insertId, body.teamIds, body.teamIds[0]);
    await audit.log({ action: `Added agent ${body.name}`, entityType: 'user', entityId: res.insertId, entityRef: body.email, newValues: { role: body.role, teams: body.teamIds } }, conn);
    return res.insertId;
  });
  return (await listAgents()).find((a) => a.id === id);
}

/** body: { name, email, role, teamIds, password? } */
export async function updateAgent(id, body, user) {
  const old = await queryOne('SELECT u.id, u.name, u.email, r.name AS role, a.primary_team_id FROM users u JOIN roles r ON r.id = u.role_id JOIN agents a ON a.user_id = u.id WHERE u.id = ?', [id]);
  if (!old) throw notFound('Agent not found.');
  if (body.role && !STAFF_ROLES.includes(body.role)) throw badRequest('Choose Agent, Manager or Admin.');
  if (id === user.id && body.role && body.role !== old.role) throw unprocessable('You cannot change your own role.');
  if (body.password) { const p = passwordProblem(body.password); if (p) throw badRequest(p, 'WEAK_PASSWORD'); }
  await withTransaction(async (conn) => {
    const role = body.role ? await userRepo.findRoleByName(body.role) : null;
    await query('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role_id = COALESCE(?, role_id) WHERE id = ?',
      [body.name?.trim() || null, body.email?.trim().toLowerCase() || null, role?.id || null, id], conn);
    if (body.teamIds) {
      await checkTeams(body.teamIds, conn);
      const primary = body.teamIds.includes(old.primary_team_id) ? old.primary_team_id : body.teamIds[0];
      await setTeams(conn, id, body.teamIds, primary);
    }
    if (body.password) await userRepo.setPassword(id, await hashPassword(body.password), conn);
    if (role && role.name !== old.role) await query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id], conn);
    await audit.log({ action: `Updated ${body.name || old.name}`, entityType: 'user', entityId: id, entityRef: old.email, oldValues: { name: old.name, role: old.role }, newValues: { name: body.name, role: body.role, teams: body.teamIds, passwordReset: !!body.password } }, conn);
  });
  return (await listAgents()).find((a) => a.id === id);
}

/** Activate or deactivate. Deactivating signs the user out and removes on-call duty. */
export async function setActive(id, active, user) {
  if (id === user.id) throw unprocessable('You cannot deactivate yourself.');
  const u = await queryOne('SELECT id, name, email FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('User not found.');
  await withTransaction(async (conn) => {
    await query(`UPDATE users SET status = ?, token_version = token_version + ${active ? 0 : 1} WHERE id = ?`, [active ? 'active' : 'inactive', id], conn);
    if (!active) await query('UPDATE team_members SET is_on_call = 0 WHERE user_id = ?', [id], conn);
    await audit.log({ action: `${active ? 'Activated' : 'Deactivated'} ${u.name}`, entityType: 'user', entityId: id, entityRef: u.email }, conn);
  });
  return (await listAgents()).find((a) => a.id === id);
}

export async function roleMatrix() {
  const rows = await userRepo.rolePermissionMatrix();
  return ROLE_DEFINITIONS.map((r) => ({ role: r.name, description: r.description, permissions: rows.filter((x) => x.role === r.name).map((x) => x.code) }));
}
