// Client-side mirror of the server SLA calculation so labels stay live
// between refreshes (the server value is authoritative on every load).
import { dur, MIN } from './format';

const OPEN = ['New', 'In Progress', 'On Hold', 'Awaiting approval'];
const ms = (v) => (v ? new Date(v).getTime() : null);

export function liveSla(ticket, now = Date.now()) {
  const s = ticket.sla || {};
  if (!OPEN.includes(ticket.status)) return { state: s.state, label: s.label };
  if (ticket.status === 'Awaiting approval') return { state: 'paused', label: 'Awaiting approval' };
  if (s.pausedAt) return { state: 'paused', label: 'Paused: awaiting requester' };
  const due = ms(s.resolutionDueAt) + (s.pausedSeconds || 0) * 1000;
  const left = Math.round((due - now) / MIN);
  const risk = Math.max(30, (s.policyResolutionMinutes || 1440) * 0.2);
  if (!ticket.firstResponseAt && ms(s.responseDueAt) < now) return { state: 'breached', label: `Response overdue ${dur((now - ms(s.responseDueAt)) / MIN)}` };
  if (left < 0) return { state: 'breached', label: `Overdue ${dur(-left)}` };
  if (left < risk) return { state: 'risk', label: `Due in ${dur(left)}` };
  return { state: 'ok', label: `Due in ${dur(left)}` };
}
