import { withTransaction, query } from '../config/database.js';
import * as repo from '../repositories/team.repository.js';
import * as audit from './audit.service.js';
import * as settings from './settings.service.js';
import { badRequest, notFound, conflict, unprocessable } from '../utils/AppError.js';

const shape = (t) => ({
  id: t.id, code: t.code, name: t.name, type: t.type, description: t.description || '', email: t.email || '', isActive: !!t.is_active,
  manager: t.manager_id ? { id: t.manager_id, name: t.manager_name } : null, memberCount: Number(t.member_count || 0),
  openTickets: Number(t.open_tickets || 0), openTasks: Number(t.open_tasks || 0),
});

export async function list() {
  const teams = await repo.listTeams();
  const oncall = await query('SELECT tm.team_id, u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.is_on_call = 1 AND u.status = \'active\'');
  return teams.map((t) => ({ ...shape(t), onCall: oncall.filter((o) => o.team_id === t.id).map((o) => ({ id: o.id, name: o.name })) }));
}

export async function get(id) {
  const t = (await repo.listTeams()).find((x) => x.id === id);
  if (!t) throw notFound('Team not found.');
  const [members, cats, assets] = await Promise.all([repo.members(id), repo.routedCategories(id), repo.supportedAssetCount(id)]);
  return {
    ...shape(t),
    members: members.filter((m) => m.status === 'active').map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, isOnCall: !!m.is_on_call, otherTeams: m.other_teams || '' })),
    routedCategories: cats.map((c) => c.name),
    assetsSupported: assets,
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'team';

async function syncMembers(conn, teamId, memberIds, isEdit) {
  const current = (await repo.members(teamId, conn)).map((m) => m.id);
  for (const uid of current) {
    if (memberIds.includes(uid)) continue;
    if (isEdit && (await repo.countTeamsOfUser(uid, conn)) <= 1) {
      const u = (await query('SELECT name FROM users WHERE id = ?', [uid], conn))[0];
      throw unprocessable(`${u.name} would have no team. Add them to another team first.`);
    }
    await repo.removeMember(teamId, uid, conn);
    await query('UPDATE agents SET primary_team_id = (SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1) WHERE user_id = ? AND primary_team_id = ?', [uid, uid, teamId], conn);
  }
  for (const uid of memberIds) if (!current.includes(uid)) await repo.addMember(teamId, uid, conn);
}

/** body: { name, type, managerId, description, email, memberIds } */
export async function create(body, user) {
  const id = await withTransaction(async (conn) => {
    if (await repo.findByName(body.name)) throw conflict('A team with this name already exists.', 'DUPLICATE', { fields: { name: 'Already exists' } });
    const newId = await repo.create({ ...body, code: `${slug(body.name)}-${Math.random().toString(36).slice(2, 5)}` }, conn);
    await syncMembers(conn, newId, body.memberIds || [], false);
    await audit.log({ action: `Created team ${body.name}`, entityType: 'team', entityId: newId, entityRef: body.name }, conn);
    return newId;
  });
  settings.invalidate();
  return get(id);
}

export async function update(id, body, user) {
  await withTransaction(async (conn) => {
    const t = await repo.findById(id, conn);
    if (!t) throw notFound('Team not found.');
    const dup = await repo.findByName(body.name);
    if (dup && dup.id !== id) throw conflict('A team with this name already exists.');
    await repo.update(id, body, conn);
    if (body.memberIds) await syncMembers(conn, id, body.memberIds, true);
    await audit.log({ action: `Edited team ${body.name}`, entityType: 'team', entityId: id, entityRef: body.name, oldValues: { name: t.name, type: t.type }, newValues: { name: body.name, type: body.type } }, conn);
  });
  settings.invalidate();
  return get(id);
}

export async function toggle(id) {
  const t = await repo.findById(id);
  if (!t) throw notFound('Team not found.');
  await repo.setActive(id, !t.is_active);
  await audit.log({ action: `${t.is_active ? 'Deactivated' : 'Reactivated'} team ${t.name}`, entityType: 'team', entityId: id, entityRef: t.name });
  settings.invalidate();
  return get(id);
}

export async function remove(id) {
  const t = await repo.findById(id);
  if (!t) throw notFound('Team not found.');
  const refs = await repo.referenceCount(id);
  if (refs) throw unprocessable(`"${t.name}" is used by ${refs} records. Deactivate it instead.`, 'IN_USE');
  await withTransaction(async (conn) => {
    const members = await repo.members(id, conn);
    for (const m of members) {
      if ((await repo.countTeamsOfUser(m.id, conn)) <= 1) {
        const sd = await repo.findByCode('sd', conn);
        if (sd && sd.id !== id) await repo.addMember(sd.id, m.id, conn);
      }
      await repo.removeMember(id, m.id, conn);
      await query('UPDATE agents SET primary_team_id = (SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1) WHERE user_id = ?', [m.id, m.id], conn);
    }
    await repo.remove(id, conn);
    await audit.log({ action: `Deleted team ${t.name}`, entityType: 'team', entityId: id, entityRef: t.name }, conn);
  });
  settings.invalidate();
}

export async function addMember(id, userId) {
  const t = await repo.findById(id);
  if (!t) throw notFound('Team not found.');
  const u = (await query("SELECT u.name FROM users u JOIN agents a ON a.user_id = u.id WHERE u.id = ? AND u.status = 'active'", [userId]))[0];
  if (!u) throw badRequest('Choose an active agent.');
  await repo.addMember(id, userId);
  await audit.log({ action: `Added ${u.name} to ${t.name}`, entityType: 'team', entityId: id, entityRef: t.name });
  return get(id);
}

export async function removeMember(id, userId) {
  const t = await repo.findById(id);
  if (!t) throw notFound('Team not found.');
  const u = (await query('SELECT name FROM users WHERE id = ?', [userId]))[0];
  if ((await repo.countTeamsOfUser(userId)) <= 1) throw unprocessable(`${u?.name} must belong to at least one team.`);
  await withTransaction(async (conn) => {
    await repo.removeMember(id, userId, conn);
    await query('UPDATE agents SET primary_team_id = (SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1) WHERE user_id = ? AND primary_team_id = ?', [userId, userId, id], conn);
    if (t.manager_id === userId) await query('UPDATE teams SET manager_id = NULL WHERE id = ?', [id], conn);
    await audit.log({ action: `Removed ${u?.name} from ${t.name}`, entityType: 'team', entityId: id, entityRef: t.name }, conn);
  });
  return get(id);
}

export async function setOnCall(id, userId, on) {
  const t = await repo.findById(id);
  if (!t) throw notFound('Team not found.');
  if (t.type !== 'Support') throw unprocessable('Only support teams have an on-call rota.');
  if (!(await repo.isMember(id, userId))) throw badRequest('That agent is not in this team.');
  await repo.setOnCall(id, userId, on);
  const u = (await query('SELECT name FROM users WHERE id = ?', [userId]))[0];
  await audit.log({ action: `${on ? 'On call' : 'Removed from on call'}: ${u?.name} (${t.name})`, entityType: 'team', entityId: id, entityRef: t.name });
  return get(id);
}
