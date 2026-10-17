import { OPEN_STATUSES } from '../constants/workflow.js';
import {
  insertOne, insertIgnore, find, findOne, updateOne, updateMany, deleteMany, count, aggregate, mapBy, attach, equalsCi,
} from '../config/database.js';

const TASK_CLOSED = ['Done', 'Not done', 'Not needed'];

/** Active members of team(s): team_members joined to active users. */
async function activeMembers(filter, conn) {
  const links = await find('team_members', filter, {}, conn);
  const users = await mapBy('users', links.map((l) => l.user_id), { projection: { status: 1 }, conn });
  return links.filter((l) => users.get(l.user_id)?.status === 'active');
}

async function countBy(name, field, filter, conn) {
  const rows = await aggregate(name, [{ $match: filter }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }], conn);
  return new Map(rows.map((r) => [r._id, r.n]));
}

export async function teamsOfUser(userId) {
  const links = await find('team_members', { user_id: userId });
  const teams = await mapBy('teams', links.map((l) => l.team_id), { projection: { code: 1, name: 1, type: 1 } });
  return links
    .filter((l) => teams.has(l.team_id))
    .map((l) => { const t = teams.get(l.team_id); return { id: t.id, code: t.code, name: t.name, type: t.type, isOnCall: l.is_on_call }; })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export async function listTeams() {
  const teams = await find('teams', {}, { sort: { id: 1 }, projection: { id: 1, code: 1, name: 1, type: 1, description: 1, email: 1, manager_id: 1, is_active: 1 } });
  await attach(teams, 'users', 'manager_id', { manager_name: 'name' });
  const [members, tickets, tasks] = await Promise.all([
    activeMembers({}),
    countBy('tickets', 'team_id', { deleted_at: null, status: { $in: OPEN_STATUSES } }),
    countBy('tasks', 'team_id', { state: { $nin: TASK_CLOSED } }),
  ]);
  return teams.map((t) => ({
    ...t,
    member_count: members.filter((m) => m.team_id === t.id).length,
    open_tickets: tickets.get(t.id) || 0,
    open_tasks: tasks.get(t.id) || 0,
  }));
}

export const findById = (id, conn) => findOne('teams', { id }, {}, conn);
export const findByCode = (code, conn) => findOne('teams', { code }, {}, conn);
export const findByName = (name) => findOne('teams', { name: equalsCi(name) });

export async function members(teamId, conn) {
  const links = await find('team_members', { team_id: teamId }, {}, conn);
  const users = await mapBy('users', links.map((l) => l.user_id), { projection: { name: 1, email: 1, role_id: 1, status: 1 }, conn });
  const roles = await mapBy('roles', [...users.values()].map((u) => u.role_id), { projection: { name: 1 }, conn });
  const others = await find('team_members', { user_id: { $in: links.map((l) => l.user_id) }, team_id: { $ne: teamId } }, {}, conn);
  const otherTeams = await mapBy('teams', others.map((o) => o.team_id), { projection: { name: 1 }, conn });
  return links
    .filter((l) => users.has(l.user_id) && roles.has(users.get(l.user_id).role_id))
    .map((l) => {
      const u = users.get(l.user_id);
      const names = others.filter((o) => o.user_id === u.id).map((o) => otherTeams.get(o.team_id)?.name).filter(Boolean).sort();
      return {
        id: u.id, name: u.name, email: u.email, role: roles.get(u.role_id).name, status: u.status, is_on_call: l.is_on_call,
        other_teams: names.length ? names.join(', ') : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export const activeMemberIds = async (teamId, conn) => (await activeMembers({ team_id: teamId }, conn)).map((l) => l.user_id);

export const isMember = async (teamId, userId, conn) => !!(await findOne('team_members', { team_id: teamId, user_id: userId }, {}, conn));

/** First active on-call member of a team. */
export async function onCallFor(teamId, conn) {
  const rows = (await activeMembers({ team_id: teamId, is_on_call: 1 }, conn)).sort((a, b) => a.created_at - b.created_at);
  return rows[0]?.user_id || null;
}

export async function anyOnCall(conn) {
  const rows = await activeMembers({ is_on_call: 1 }, conn);
  const teams = await mapBy('teams', rows.map((r) => r.team_id), { projection: { is_active: 1 }, conn });
  const hit = rows.filter((r) => teams.get(r.team_id)?.is_active === 1).sort((a, b) => a.team_id - b.team_id)[0];
  return hit?.user_id || null;
}

export async function onCallList() {
  const rows = await activeMembers({ is_on_call: 1 });
  const [teams, users] = await Promise.all([
    mapBy('teams', rows.map((r) => r.team_id), { projection: { name: 1, is_active: 1, type: 1 } }),
    mapBy('users', rows.map((r) => r.user_id), { projection: { name: 1, email: 1 } }),
  ]);
  return rows
    .filter((r) => { const t = teams.get(r.team_id); return t && t.is_active === 1 && t.type === 'Support'; })
    .sort((a, b) => a.team_id - b.team_id)
    .map((r) => { const u = users.get(r.user_id), t = teams.get(r.team_id); return { id: u.id, name: u.name, email: u.email, team_id: t.id, team_name: t.name }; });
}

/** Least busy active member: open tickets plus open tasks. */
export async function leastBusyMember(teamId, conn) {
  const ids = (await activeMembers({ team_id: teamId }, conn)).map((l) => l.user_id);
  if (!ids.length) return null;
  const [tickets, tasks] = await Promise.all([
    countBy('tickets', 'assigned_to', { assigned_to: { $in: ids }, deleted_at: null, status: { $in: OPEN_STATUSES } }, conn),
    countBy('tasks', 'assigned_to', { assigned_to: { $in: ids }, state: { $nin: TASK_CLOSED } }, conn),
  ]);
  const load = (id) => (tickets.get(id) || 0) + (tasks.get(id) || 0);
  return ids.sort((a, b) => load(a) - load(b) || a - b)[0];
}

export const create = (t, conn) => insertOne('teams', {
  code: t.code, name: t.name, type: t.type, description: t.description || null, email: t.email || null, manager_id: t.managerId || null,
}, conn);

export const update = (id, t, conn) => updateOne('teams', { id }, {
  name: t.name, type: t.type, description: t.description || null, email: t.email || null, manager_id: t.managerId || null,
}, conn);

export const setActive = (id, active) => updateOne('teams', { id }, { is_active: active ? 1 : 0 });

/** Delete a team. Like the former foreign keys: memberships go, references become empty. */
export async function remove(id, conn) {
  await deleteMany('team_members', { team_id: id }, conn);
  await updateMany('agents', { primary_team_id: id }, { primary_team_id: null }, conn);
  await updateMany('ticket_categories', { default_team_id: id }, { default_team_id: null }, conn);
  await updateMany('tickets', { team_id: id }, { $set: { team_id: null } }, conn);
  await updateMany('tasks', { team_id: id }, { team_id: null }, conn);
  await updateMany('assets', { support_team_id: id }, { support_team_id: null }, conn);
  await updateMany('problems', { team_id: id }, { team_id: null }, conn);
  return deleteMany('teams', { id }, conn);
}

export const addMember = (teamId, userId, conn) => insertIgnore('team_members', { team_id: teamId, user_id: userId }, conn);
export const removeMember = (teamId, userId, conn) => deleteMany('team_members', { team_id: teamId, user_id: userId }, conn);
export const setOnCall = (teamId, userId, on) => updateOne('team_members', { team_id: teamId, user_id: userId }, { is_on_call: on ? 1 : 0 });
export const countTeamsOfUser = (userId, conn) => count('team_members', { user_id: userId }, conn);

export async function referenceCount(teamId) {
  const counts = await Promise.all([
    count('tickets', { team_id: teamId }), count('tasks', { team_id: teamId }),
    count('assets', { support_team_id: teamId }), count('ticket_categories', { default_team_id: teamId }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

export const routedCategories = (teamId) => find('ticket_categories', { default_team_id: teamId }, { sort: { sort_order: 1 }, projection: { name: 1 } });
export const supportedAssetCount = (teamId) => count('assets', { support_team_id: teamId, deleted_at: null });

/** The first remaining team of a user, or null (used to repair primary_team_id). */
export const firstTeamOf = async (userId, conn) => (await findOne('team_members', { user_id: userId }, { projection: { team_id: 1 } }, conn))?.team_id ?? null;
