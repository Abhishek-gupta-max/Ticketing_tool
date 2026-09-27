// Background jobs: auto-close resolved tickets (rule r3) and SLA / overdue
// notifications. Each run is guarded so overlapping runs cannot happen.
import { withTransaction } from '../config/database.js';
import { logger } from '../config/logger.js';
import * as settings from '../services/settings.service.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as taskRepo from '../repositories/task.repository.js';
import * as audit from '../services/audit.service.js';
import * as notifications from '../services/notification.service.js';

export async function autoCloseResolved() {
  const rules = await settings.rulesMap();
  if (!rules.r3) return 0;
  const days = (await settings.get('automation'))?.autoCloseDays || 3;
  let closed = 0;
  await withTransaction(async (conn) => {
    const due = await ticketRepo.resolvedOlderThan(days, conn);
    for (const t of due) {
      await ticketRepo.lockById(t.id, conn);
      await ticketRepo.update(t.id, { status: 'Closed', closed_at: new Date() }, conn);
      await ticketRepo.addHistory(t.id, null, { status: ['Resolved', 'Closed'] }, conn);
      await ticketRepo.addActivity(t.id, null, `Closed automatically after ${days} days`, conn);
      closed++;
    }
    if (closed) await audit.log({ userId: null, action: `Auto-closed ${closed} tickets`, entityType: 'automation', entityRef: 'Automation' }, conn);
  });
  if (closed) logger.info('Auto-closed resolved tickets', { closed });
  return closed;
}

export async function slaNotifications() {
  const hour = new Date().toISOString().slice(0, 13);
  for (const t of await ticketRepo.breachedAssigned()) {
    await notifications.notify(t.assigned_to, { type: 'sla', severity: 'bad', title: `${t.ticket_number} has breached its SLA: ${t.title}`, link: `/tickets/${t.ticket_number}`, dedupeKey: `breach:${t.ticket_number}` });
  }
  for (const t of await ticketRepo.riskAssigned()) {
    await notifications.notify(t.assigned_to, { type: 'sla', severity: 'warn', title: `${t.ticket_number} is close to breaching: ${t.title}`, link: `/tickets/${t.ticket_number}`, dedupeKey: `risk:${t.ticket_number}` });
  }
  for (const t of await taskRepo.overdueAssigned()) {
    await notifications.notify(t.assigned_to, { type: 'task', severity: 'warn', title: `Task ${t.task_number} is overdue`, link: `/tasks/${t.task_number}`, dedupeKey: `overdue:${t.task_number}:${hour.slice(0, 10)}` });
  }
}

const timers = [];
function every(name, ms, fn) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await fn(); } catch (err) { logger.error(`Job ${name} failed`, { error: err.message }); } finally { running = false; }
  };
  timers.push(setInterval(run, ms));
  setTimeout(run, 5000).unref();
}

export function startJobs() {
  every('auto-close', 10 * 60000, autoCloseResolved);
  every('sla-notifications', 5 * 60000, slaNotifications);
  timers.forEach((t) => t.unref());
  logger.info('Background jobs started');
}

export function stopJobs() {
  timers.splice(0).forEach(clearInterval);
}
