import * as repo from '../repositories/notification.repository.js';
import * as settings from './settings.service.js';
import { OPEN_STATUSES } from '../constants/workflow.js';
import { find, count, distinct } from '../config/database.js';
import { isOpen, isBreached, isRisk } from '../utils/sla.js';
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
  const [open, priorities] = await Promise.all([
    find('tickets', { deleted_at: null, status: { $in: OPEN_STATUSES } }),
    find('priorities', {}, { projection: { id: 1, resolution_minutes: 1 } }),
  ]);
  const policy = new Map(priorities.map((p) => [p.id, p.resolution_minutes]));
  const tickets = open.filter((t) => policy.has(t.priority));
  const br = tickets.filter((t) => t.assigned_to === user.id && isBreached(t)).length;
  const rk = tickets.filter((t) => t.assigned_to === user.id && isRisk(t, policy.get(t.priority))).length;
  const un = tickets.filter((t) => isOpen(t) && t.assigned_to == null && t.status === 'New' && t.priority <= 2).length;
  if (br) items.push({ key: 'breached', link: '/tickets?quick=breached', title: `${br} of your tickets have breached their SLA`, severity: 'bad' });
  if (rk) items.push({ key: 'risk', link: '/tickets?quick=risk', title: `${rk} of your tickets are close to breaching`, severity: 'warn' });
  if (un) items.push({ key: 'unassigned', link: '/tickets?quick=unassigned', title: `${un} high priority tickets are unassigned`, severity: 'warn' });
  const ap = (await approvalRepo.mine(user)).length;
  if (ap) items.push({ key: 'approvals', link: '/approvals', title: `${ap} approval${ap > 1 ? 's are' : ' is'} waiting for you`, severity: 'info' });
  const ot = await count('tasks', { assigned_to: user.id, state: { $nin: ['Done', 'Not done', 'Not needed'] }, due_at: { $lt: new Date() } });
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
  const roles = await distinct('roles', 'id', { name: { $in: ['Admin', 'Manager', 'Agent'] } });
  return distinct('users', 'id', { status: 'active', role_id: { $in: roles } });
}

export async function approverUserIds() {
  const perms = await distinct('permissions', 'id', { code: 'request:approve' });
  const roles = await distinct('role_permissions', 'role_id', { permission_id: { $in: perms } });
  return distinct('users', 'id', { status: 'active', role_id: { $in: roles } });
}
