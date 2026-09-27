import * as repo from '../repositories/notification.repository.js';
import * as settings from './settings.service.js';
import { query, queryOne } from '../config/database.js';
import { SQL_OPEN, SQL_BREACHED, SQL_RISK } from '../utils/sla.js';
import * as approvalRepo from '../repositories/approval.repository.js';
import * as miRepo from '../repositories/majorIncident.repository.js';
import { logger } from '../config/logger.js';

// Which settings toggle controls each notification type.
const PREF = { assigned: 'newAssigned', approval: 'approvals', major: 'majorIncident', sla: 'breachWarn' };

/** Store a notification for a user. Duplicate dedupeKeys are ignored. */
export async function notify(userId, n, conn = null) {
  if (!userId) return;
  const prefs = (await settings.get('notifications')) || {};
  const pref = PREF[n.type];
  if (pref && prefs[pref] === false) return;
  try {
    await repo.insert({ ...n, userId }, conn);
  } catch (err) {
    if (conn) throw err;
    logger.warn('Could not store notification', { error: err.message });
  }
}

export async function notifyMany(userIds, n, conn = null) {
  for (const id of [...new Set(userIds.filter(Boolean))]) await notify(id, n, conn);
}

/** Live alerts derived from the current state, as in the original bell menu. */
async function liveAlerts(user) {
  if (!user.isStaff) return [];
  const items = [];
  const row = await queryOne(
    `SELECT SUM(t.assigned_to = ? AND ${SQL_BREACHED}) AS br, SUM(t.assigned_to = ? AND ${SQL_RISK}) AS rk,
            SUM(${SQL_OPEN} AND t.assigned_to IS NULL AND t.status = 'New' AND t.priority <= 2) AS un
       FROM tickets t JOIN priorities pr ON pr.id = t.priority WHERE t.deleted_at IS NULL AND ${SQL_OPEN}`,
    [user.id, user.id],
  );
  const br = Number(row.br || 0), rk = Number(row.rk || 0), un = Number(row.un || 0);
  if (br) items.push({ key: 'breached', link: '/tickets?quick=breached', title: `${br} of your tickets have breached their SLA`, severity: 'bad' });
  if (rk) items.push({ key: 'risk', link: '/tickets?quick=risk', title: `${rk} of your tickets are close to breaching`, severity: 'warn' });
  if (un) items.push({ key: 'unassigned', link: '/tickets?quick=unassigned', title: `${un} high priority tickets are unassigned`, severity: 'warn' });
  const ap = (await approvalRepo.mine(user)).length;
  if (ap) items.push({ key: 'approvals', link: '/approvals', title: `${ap} approval${ap > 1 ? 's are' : ' is'} waiting for you`, severity: 'info' });
  const ot = (await queryOne(
    "SELECT COUNT(*) AS n FROM tasks WHERE assigned_to = ? AND state NOT IN ('Done','Not done','Not needed') AND due_at < UTC_TIMESTAMP(3)",
    [user.id],
  )).n;
  if (ot) items.push({ key: 'tasks', link: '/tasks?quick=overdue', title: `${ot} of your tasks are overdue`, severity: 'warn' });
  const mi = await miRepo.active();
  if (mi) items.push({ key: 'major', link: '/incidents', title: 'Major incident in progress: ' + mi.title, severity: 'bad' });
  return items;
}

export async function forUser(user) {
  const [alerts, stored, unread] = await Promise.all([liveAlerts(user), repo.listForUser(user.id, 15), repo.unreadCount(user.id)]);
  return {
    alerts,
    items: stored.map((n) => ({ id: n.id, type: n.type, severity: n.severity, title: n.title, link: n.link, isRead: !!n.is_read, createdAt: n.created_at })),
    unread,
    count: alerts.length + unread,
  };
}

export const markRead = (user, id) => repo.markRead(id, user.id);
export const markAllRead = (user) => repo.markAllRead(user.id);

export async function staffUserIds() {
  return (await query(
    "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.status = 'active' AND r.name IN ('Admin','Manager','Agent')",
  )).map((r) => r.id);
}

export async function approverUserIds() {
  return (await query(
    `SELECT DISTINCT u.id FROM users u JOIN role_permissions rp ON rp.role_id = u.role_id JOIN permissions p ON p.id = rp.permission_id
      WHERE u.status = 'active' AND p.code = 'request:approve'`,
  )).map((r) => r.id);
}
