import { OPEN_STATUSES } from '../constants/workflow.js';
import { MIN, dur } from './time.js';

const ms = (v) => (v ? new Date(v).getTime() : null);

/** Resolution deadline including time spent paused (now included while paused). */
export function resolutionDue(t, now = Date.now()) {
  return ms(t.sla_resolution_due_at) + (t.paused_seconds || 0) * 1000 + (t.paused_at ? now - ms(t.paused_at) : 0);
}

export const slaMet = (t) => t.resolved_at != null && ms(t.resolved_at) <= ms(t.sla_resolution_due_at) + (t.paused_seconds || 0) * 1000;

/**
 * SLA state of a ticket row: ok | risk | breached | paused | met | missed.
 * resolutionMinutes is the priority policy target used for the "at risk" band.
 */
export function slaInfo(t, resolutionMinutes, now = Date.now()) {
  if (!OPEN_STATUSES.includes(t.status)) {
    const met = slaMet(t);
    return { state: met ? 'met' : 'missed', left: null, label: met ? 'Met' : 'Missed' };
  }
  if (t.status === 'Awaiting approval') return { state: 'paused', left: null, label: 'Awaiting approval' };
  if (t.paused_at) return { state: 'paused', left: null, label: 'Paused: awaiting requester' };
  const left = Math.round((resolutionDue(t, now) - now) / MIN);
  const respLate = !t.first_response_at && ms(t.sla_response_due_at) < now;
  const risk = Math.max(30, (resolutionMinutes || 1440) * 0.2);
  if (respLate) return { state: 'breached', left, label: 'Response overdue ' + dur((now - ms(t.sla_response_due_at)) / MIN) };
  if (left < 0) return { state: 'breached', left, label: 'Overdue ' + dur(-left) };
  if (left < risk) return { state: 'risk', left, label: 'Due in ' + dur(left) };
  return { state: 'ok', left, label: 'Due in ' + dur(left) };
}

/** Response and resolution progress rows for the ticket detail panel. */
export function slaRows(t, now = Date.now()) {
  const created = ms(t.created_at);
  const respT = (ms(t.sla_response_due_at) - created) / MIN, resT = (ms(t.sla_resolution_due_at) - created) / MIN;
  const respEl = ((ms(t.first_response_at) || now) - created) / MIN;
  const respStage = t.first_response_at ? (ms(t.first_response_at) <= ms(t.sla_response_due_at) ? 'Achieved' : 'Breached') : (now > ms(t.sla_response_due_at) ? 'Breached' : 'In progress');
  const end = ms(t.resolved_at) || now;
  const pausedNow = t.paused_at && !t.resolved_at ? now - ms(t.paused_at) : 0;
  const resEl = (end - created - (t.paused_seconds || 0) * 1000 - pausedNow) / MIN;
  const open = OPEN_STATUSES.includes(t.status);
  const resStage = !open ? (slaMet(t) ? 'Achieved' : 'Breached') : (t.paused_at || t.status === 'Awaiting approval') ? 'Paused' : resEl > resT ? 'Breached' : 'In progress';
  return [
    { name: 'Response', target: respT, elapsed: respEl, stage: respStage, pct: respT > 0 ? (respEl / respT) * 100 : 0 },
    { name: 'Resolution', target: resT, elapsed: resEl, stage: resStage, pct: resT > 0 ? (resEl / resT) * 100 : 0 },
  ];
}

// ---------- predicates used by queries and reports ----------
// They reproduce the former SQL conditions exactly (t = ticket document,
// resolutionMinutes = the priority's policy target).

export const isOpen = (t) => OPEN_STATUSES.includes(t.status);
const resDueMs = (t) => ms(t.sla_resolution_due_at) + (t.paused_seconds || 0) * 1000;
/** Open, not awaiting approval and not paused: the SLA clock is running. */
export const isRunning = (t) => isOpen(t) && t.status !== 'Awaiting approval' && t.paused_at == null;
const overdue = (t, now) => (t.first_response_at == null && ms(t.sla_response_due_at) < now) || resDueMs(t) < now;
export const isBreached = (t, now = Date.now()) => isRunning(t) && overdue(t, now);
export const isRisk = (t, resolutionMinutes, now = Date.now()) => isRunning(t) && !overdue(t, now)
  && Math.trunc((resDueMs(t) - now) / MIN) < Math.max(30, (resolutionMinutes || 0) * 0.2);
/** Seconds until the resolution deadline while running (sort key); far future otherwise. */
export const slaLeftSeconds = (t, now = Date.now()) => (isRunning(t) ? Math.trunc((resDueMs(t) - now) / 1000) : 999999999);
export const isMet = (t) => t.resolved_at != null && ms(t.resolved_at) <= resDueMs(t);
export const isPausedRequester = (t) => t.status === 'On Hold' && t.paused_at != null;
