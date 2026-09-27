import { withTransaction, queryOne, query } from '../config/database.js';
import * as repo from '../repositories/majorIncident.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as teamRepo from '../repositories/team.repository.js';
import * as assetRepo from '../repositories/asset.repository.js';
import * as audit from './audit.service.js';
import * as notifications from './notification.service.js';
import { setImpactUrgencyInConnection } from './ticket.service.js';
import { nextMajorNumber } from './sequence.service.js';
import * as map from '../models/mappers.js';
import { SQL_OPEN, SQL_BREACHED } from '../utils/sla.js';
import { badRequest, notFound, unprocessable } from '../utils/AppError.js';
import { OPEN_STATUSES } from '../constants/workflow.js';

const shape = (m) => (m ? {
  id: m.id, number: m.mi_number, ticketNumber: m.ticket_number, title: m.title, status: m.status, commander: m.commander_id ? { id: m.commander_id, name: m.commander_name } : null,
  impact: m.impact, startedAt: m.started_at, resolvedAt: m.resolved_at,
} : null);

/** Incidents page: KPIs, matrix, on-call list, incident room and past major incidents. */
export async function overview() {
  const active = await repo.active();
  const k = await queryOne(
    `SELECT SUM(${SQL_OPEN}) AS open_count, SUM(${SQL_OPEN} AND t.assigned_to IS NULL) AS unassigned,
            SUM(${SQL_OPEN} AND t.priority <= 2) AS high, SUM(${SQL_BREACHED}) AS breached,
            AVG(CASE WHEN t.resolved_at > UTC_TIMESTAMP(3) - INTERVAL 30 DAY THEN (TIMESTAMPDIFF(SECOND, t.created_at, t.resolved_at) - t.paused_seconds) / 3600 END) AS mttr
       FROM tickets t JOIN priorities pr ON pr.id = t.priority WHERE t.kind = 'incident' AND t.deleted_at IS NULL`,
  );
  const matrix = await query(
    `SELECT impact, urgency, COUNT(*) AS n FROM tickets t WHERE t.kind = 'incident' AND t.deleted_at IS NULL AND ${SQL_OPEN} GROUP BY impact, urgency`,
  );
  const grid = [1, 2, 3].map((i) => [1, 2, 3].map((u) => Number(matrix.find((m) => m.impact === i && m.urgency === u)?.n || 0)));
  let room = null;
  if (active) {
    const t = await ticketRepo.findById(active.ticket_id);
    const asset = t?.asset_id ? map.asset(await assetRepo.findById(t.asset_id)) : null;
    room = {
      ...shape(active),
      updates: (await repo.updates(active.id)).map((u) => ({ id: u.id, body: u.body, at: u.created_at, user: u.user_id ? { id: u.user_id, name: u.user_name } : null })),
      ticket: t ? map.ticket(t) : null,
      asset: asset ? { tag: asset.tag, name: asset.name, environment: asset.environment, ownerLabel: asset.ownerLabel, owner: asset.owner, supportTeam: asset.supportTeam } : null,
    };
  }
  return {
    kpis: { open: Number(k.open_count || 0), unassigned: Number(k.unassigned || 0), high: Number(k.high || 0), breached: Number(k.breached || 0), mttrHours: Number(k.mttr || 0), majorTotal: await repo.total() },
    matrix: grid,
    onCall: (await teamRepo.onCallList()).map((o) => ({ id: o.id, name: o.name, email: o.email, team: { id: o.team_id, name: o.team_name } })),
    active: room,
    past: (await repo.past(5)).map(shape),
    candidates: (await ticketRepo.candidates({ notMajor: true, limit: 40 })).map((t) => ({ number: t.ticket_number, title: t.title, priority: t.priority })),
  };
}

export async function declare({ ticketNumber, impact, commanderId }, user) {
  const number = await withTransaction(async (conn) => {
    if (await repo.active(conn)) throw unprocessable('A major incident is already active.', 'MAJOR_ACTIVE');
    const t = await ticketRepo.findByNumber(ticketNumber, conn);
    if (!t) throw badRequest('Choose an incident.');
    await ticketRepo.lockById(t.id, conn);
    if (t.kind !== 'incident' || !OPEN_STATUSES.includes(t.status) || t.is_major) throw unprocessable('Only an open incident that is not already major can be declared.');
    const cmd = await queryOne("SELECT id, name FROM users WHERE id = ? AND status = 'active'", [commanderId], conn);
    if (!cmd) throw badRequest('Choose an incident commander.');
    const mi = await nextMajorNumber(conn);
    const id = await repo.insert({ number: mi, ticketId: t.id, title: t.title, commanderId: cmd.id, impact }, conn);
    await repo.addUpdate(id, cmd.id, `Major incident declared. ${impact}`, conn);
    await ticketRepo.update(t.id, { is_major: 1 }, conn);
    if (t.impact !== 1 || t.urgency !== 1) await setImpactUrgencyInConnection(conn, await ticketRepo.findById(t.id, conn), 1, 1, user);
    await ticketRepo.addActivity(t.id, user.id, `Declared as a major incident (${mi})`, conn);
    await audit.log({ action: `Declared major incident ${mi}`, entityType: 'ticket', entityId: t.id, entityRef: t.ticket_number, newValues: { impact, commander: cmd.name } }, conn);
    await notifications.notifyMany(await notifications.staffUserIds(), { type: 'major', severity: 'bad', title: `Major incident declared: ${t.title}`, link: '/incidents', dedupeKey: `major:${mi}` }, conn);
    return mi;
  });
  return { number };
}

async function lockActive(conn, id) {
  const m = await repo.findById(id, conn);
  if (!m) throw notFound('Major incident not found.');
  await repo.lockById(id, conn);
  if (m.status !== 'Active') throw unprocessable('This major incident is already resolved.');
  return m;
}

export async function postUpdate(id, body, user) {
  await withTransaction(async (conn) => {
    const m = await lockActive(conn, id);
    await repo.addUpdate(id, user.id, body, conn);
    await ticketRepo.addComment(m.ticket_id, user.id, 'comment', `Major incident update: ${body}`, conn);
    await ticketRepo.touch(m.ticket_id, conn);
    await audit.log({ action: 'Posted major incident update', entityType: 'ticket', entityId: m.ticket_id, entityRef: m.ticket_number }, conn);
  });
  return overview();
}

export async function resolve(id, summary, user) {
  await withTransaction(async (conn) => {
    const m = await lockActive(conn, id);
    await repo.addUpdate(id, user.id, `Resolved. ${summary}`, conn);
    await repo.resolve(id, conn);
    await ticketRepo.addActivity(m.ticket_id, user.id, `Major incident ${m.mi_number} resolved`, conn);
    await ticketRepo.touch(m.ticket_id, conn);
    await audit.log({ action: `Resolved major incident ${m.mi_number}`, entityType: 'ticket', entityId: m.ticket_id, entityRef: m.ticket_number, newValues: { summary } }, conn);
  });
  return overview();
}

export const activeBanner = async () => shape(await repo.active());
