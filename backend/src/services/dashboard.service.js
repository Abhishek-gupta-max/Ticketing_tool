import { queryOne } from '../config/database.js';
import * as stats from '../repositories/stats.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import * as taskRepo from '../repositories/task.repository.js';
import * as changeRepo from '../repositories/change.repository.js';
import * as approvalRepo from '../repositories/approval.repository.js';
import * as miRepo from '../repositories/majorIncident.repository.js';
import * as audit from './audit.service.js';
import * as settings from './settings.service.js';
import { dailySeries } from './report.service.js';
import * as map from '../models/mappers.js';
import { tzOffset, startOfDayUtc } from '../utils/time.js';

const n = (v) => Number(v || 0);

export async function overview(user) {
  const offset = tzOffset(await settings.timezone());
  const todayStart = startOfDayUtc(offset);
  const [k, mine, team, myTasks, approvals, daily, upcoming, recent, active, byPriority, byCategory, workload] = await Promise.all([
    stats.deskTotals(user.id, todayStart),
    ticketRepo.list({ quick: 'mine', sortBy: 'sla', sortOrder: 'ASC' }, user, { limit: 7, offset: 0 }),
    ticketRepo.list({ quick: 'unassigned', sortBy: 'priority', sortOrder: 'ASC' }, user, { limit: 7, offset: 0 }),
    taskRepo.myOpen(user.id, 6),
    approvalRepo.mine(user),
    dailySeries(30),
    changeRepo.upcoming(5),
    audit.recent(7),
    miRepo.active(),
    stats.byPriority(),
    stats.byCategoryOpen(),
    stats.agents(new Date(0), new Date(), {}),
  ]);
  const withSla = daily.series.filter((d) => d.sla != null);
  const resolved = daily.series.reduce((a, d) => a + d.resolved, 0);
  const met = daily.series.reduce((a, d) => a + (d.sla != null ? (d.sla / 100) * d.resolved : 0), 0);
  return {
    kpis: {
      mine: n(k.mine), mineBreached: n(k.mine_breached), unassigned: n(k.unassigned), unassignedHigh: n(k.unassigned_high), breached: n(k.breached),
      risk: n(k.risk), onHold: n(k.on_hold), paused: n(k.paused), resolvedToday: n(k.resolved_today),
    },
    totals: { total: n(k.total), open: n(k.open_count), critical: n(k.critical), awaitingApproval: n(k.awaiting), resolved: n(k.resolved), closed: n(k.closed) },
    myQueue: mine.rows.map((r) => map.ticket(r)),
    teamQueue: team.rows.map((r) => map.ticket(r)),
    myTasks: myTasks.map(map.task),
    approvals: approvals.slice(0, 5).map((a) => ({ kind: a.kind, role: a.role, waitingSince: a.waiting_since, record: { number: a.record_number, title: a.title, route: a.kind === 'change' ? 'changes' : 'tickets' } })),
    approvalCount: approvals.length,
    sla: { compliance: resolved ? (met / resolved) * 100 : null, lowDays: withSla.filter((d) => d.sla < 90).length, daily: daily.series },
    upcomingChanges: upcoming.map((c) => ({ number: c.change_number, title: c.title, type: c.type, status: c.status, plannedStart: c.planned_start })),
    recentActivity: recent,
    majorIncident: active ? { number: active.mi_number, title: active.title, startedAt: active.started_at, commander: active.commander_name, ticketNumber: active.ticket_number } : null,
    byPriority: [1, 2, 3, 4].map((p) => ({ priority: p, count: n(byPriority.find((x) => x.priority === p)?.n) })),
    byCategory: byCategory.map((c) => ({ name: c.name, count: n(c.n) })),
    workload: workload.map((a) => ({ id: a.id, name: a.name, team: a.team_name, openTickets: n(a.open_count), openTasks: n(a.open_tasks) })),
  };
}

/** Counts shown next to the sidebar links. */
export async function navCounts(user) {

  if (!user.isStaff) {
    const r = await queryOne("SELECT COUNT(*) AS n FROM tickets WHERE requester_id = ? AND deleted_at IS NULL AND status IN ('New','In Progress','On Hold','Awaiting approval')", [user.personId || -1]);
    return { tickets: n(r.n) };
  }
  const r = await queryOne(
    `SELECT (SELECT COUNT(*) FROM tickets WHERE deleted_at IS NULL AND status IN ('New','In Progress','On Hold','Awaiting approval')) AS tickets,
            (SELECT COUNT(*) FROM tickets WHERE deleted_at IS NULL AND kind = 'incident' AND status IN ('New','In Progress','On Hold','Awaiting approval')) AS incidents,
            (SELECT COUNT(*) FROM tickets WHERE deleted_at IS NULL AND status = 'Awaiting approval') AS requests,
            (SELECT COUNT(*) FROM problems WHERE deleted_at IS NULL AND status NOT IN ('Fixed','Closed')) AS problems,
            (SELECT COUNT(*) FROM changes WHERE deleted_at IS NULL AND status = 'Approval') AS changes,
            (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND state NOT IN ('Done','Not done','Not needed','Waiting')) AS tasks,
            (SELECT COUNT(*) FROM major_incidents WHERE status = 'Active') AS major`,
    [user.id],
  );
  const approvals = (await approvalRepo.mine(user)).length;
  return { tickets: n(r.tickets), incidents: n(r.incidents), requests: n(r.requests), problems: n(r.problems), changes: n(r.changes), tasks: n(r.tasks), approvals, majorActive: n(r.major) > 0 };
}
