import { OPEN_STATUSES } from '../constants/workflow.js';
import { withTransaction, find, findOne, insertOne, updateOne, updateMany, mapBy, aggregate, collection } from '../config/database.js';
import * as userRepo from '../repositories/user.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as audit from './audit.service.js';
import { hashPassword, passwordProblem } from '../utils/password.js';
import { badRequest, notFound, unprocessable } from '../utils/AppError.js';
import { STAFF_ROLES, ROLE_DEFINITIONS } from '../constants/permissions.js';

/** Agents (staff users) with teams and workload. */
export async function listAgents({ includeInactive = true } = {}) {
  const users = await find('users', { deleted_at: null, ...(includeInactive ? {} : { status: 'active' }) }, {
    sort: { id: 1 }, projection: { id: 1, name: 1, email: 1, role_id: 1, status: 1, last_login_at: 1 },
  });
  const ids = users.map((u) => u.id);
  const [agents, roles, links, tickets, tasks] = await Promise.all([
    mapBy('agents', ids, { key: 'user_id', projection: { primary_team_id: 1 } }),
    mapBy('roles', users.map((u) => u.role_id), { projection: { name: 1 } }),
    find('team_members', { user_id: { $in: ids } }, { sort: { team_id: 1 }, projection: { user_id: 1, team_id: 1 } }),
    aggregate('tickets', [
      { $match: { assigned_to: { $in: ids }, deleted_at: null, status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$assigned_to', n: { $sum: 1 } } },
    ]),
    aggregate('tasks', [
      { $match: { assigned_to: { $in: ids }, state: { $nin: ['Done', 'Not done', 'Not needed'] } } },
      { $group: { _id: '$assigned_to', n: { $sum: 1 } } },
    ]),
  ]);
  const openTickets = new Map(tickets.map((r) => [r._id, r.n]));
  const openTasks = new Map(tasks.map((r) => [r._id, r.n]));
  return users.filter((u) => agents.has(u.id) && roles.has(u.role_id)).map((u) => ({
    id: u.id, name: u.name, email: u.email, role: roles.get(u.role_id).name, active: u.status === 'active', status: u.status, lastLoginAt: u.last_login_at,
    primaryTeamId: agents.get(u.id).primary_team_id, teamIds: links.filter((l) => l.user_id === u.id).map((l) => l.team_id),
    openTickets: openTickets.get(u.id) || 0, openTasks: openTasks.get(u.id) || 0,
  }));
}

async function setTeams(conn, userId, teamIds, primary) {
  const current = (await find('team_members', { user_id: userId }, { projection: { team_id: 1 } }, conn)).map((r) => r.team_id);
  for (const t of current) if (!teamIds.includes(t)) await teamRepo.removeMember(t, userId, conn);
  for (const t of teamIds) if (!current.includes(t)) await teamRepo.addMember(t, userId, conn);
  await updateOne('agents', { user_id: userId }, { primary_team_id: primary }, conn);
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
    const newId = await insertOne('users', {
      role_id: role.id, name: body.name.trim(), email: body.email.trim().toLowerCase(), password_hash: await hashPassword(body.password), password_changed_at: new Date(),
    }, conn);
    await insertOne('agents', { user_id: newId, primary_team_id: body.teamIds[0] }, conn);
    await setTeams(conn, newId, body.teamIds, body.teamIds[0]);
    await audit.log({ action: `Added agent ${body.name}`, entityType: 'user', entityId: newId, entityRef: body.email, newValues: { role: body.role, teams: body.teamIds } }, conn);
    return newId;
  });
  return (await listAgents()).find((a) => a.id === id);
}

/** body: { name, email, role, teamIds, password? } */
export async function updateAgent(id, body, user) {
  const u0 = await findOne('users', { id }, { projection: { id: 1, name: 1, email: 1, role_id: 1 } });
  const [r0, a0] = u0 ? await Promise.all([findOne('roles', { id: u0.role_id }), findOne('agents', { user_id: id })]) : [];
  if (!u0 || !r0 || !a0) throw notFound('Agent not found.');
  const old = { id: u0.id, name: u0.name, email: u0.email, role: r0.name, primary_team_id: a0.primary_team_id };
  if (body.role && !STAFF_ROLES.includes(body.role)) throw badRequest('Choose Agent, Manager or Admin.');
  if (id === user.id && body.role && body.role !== old.role) throw unprocessable('You cannot change your own role.');
  if (body.password) { const p = passwordProblem(body.password); if (p) throw badRequest(p, 'WEAK_PASSWORD'); }
  await withTransaction(async (conn) => {
    const role = body.role ? await userRepo.findRoleByName(body.role) : null;
    const changes = {};
    if (body.name?.trim()) changes.name = body.name.trim();
    if (body.email?.trim()) changes.email = body.email.trim().toLowerCase();
    if (role?.id) changes.role_id = role.id;
    await updateOne('users', { id }, changes, conn);
    if (body.teamIds) {
      await checkTeams(body.teamIds, conn);
      const primary = body.teamIds.includes(old.primary_team_id) ? old.primary_team_id : body.teamIds[0];
      await setTeams(conn, id, body.teamIds, primary);
    }
    if (body.password) await userRepo.setPassword(id, await hashPassword(body.password), conn);
    if (role && role.name !== old.role) await userRepo.bumpTokenVersion(id, conn);
    await audit.log({ action: `Updated ${body.name || old.name}`, entityType: 'user', entityId: id, entityRef: old.email, oldValues: { name: old.name, role: old.role }, newValues: { name: body.name, role: body.role, teams: body.teamIds, passwordReset: !!body.password } }, conn);
  });
  return (await listAgents()).find((a) => a.id === id);
}

/** Activate or deactivate. Deactivating signs the user out and removes on-call duty. */
export async function setActive(id, active, user) {
  if (id === user.id) throw unprocessable('You cannot deactivate yourself.');
  const u = await findOne('users', { id }, { projection: { id: 1, name: 1, email: 1 } });
  if (!u) throw notFound('User not found.');
  await withTransaction(async (conn) => {
    await collection('users').updateOne(
      { id },
      { $set: { status: active ? 'active' : 'inactive', updated_at: new Date() }, $inc: { token_version: active ? 0 : 1 } },
      conn.session ? { session: conn.session } : {},
    );
    if (!active) await updateMany('team_members', { user_id: id }, { is_on_call: 0 }, conn);
    await audit.log({ action: `${active ? 'Activated' : 'Deactivated'} ${u.name}`, entityType: 'user', entityId: id, entityRef: u.email }, conn);
  });
  return (await listAgents()).find((a) => a.id === id);
}

export async function roleMatrix() {
  const rows = await userRepo.rolePermissionMatrix();
  return ROLE_DEFINITIONS.map((r) => ({ role: r.name, description: r.description, permissions: rows.filter((x) => x.role === r.name).map((x) => x.code) }));
}
