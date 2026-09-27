// Aggregate queries for the dashboard and reports. Day buckets use the
// organisation's UTC offset so "today" matches the desk's time zone.
import { query, queryOne } from '../config/database.js';
import { SQL_OPEN, SQL_BREACHED, SQL_RISK, SQL_MET, SQL_PAUSED_REQUESTER } from '../utils/sla.js';

function scope(f = {}) {
  const w = ['t.deleted_at IS NULL'], p = [];
  if (f.customerId) { w.push('t.customer_id = ?'); p.push(f.customerId); }
  if (f.teamId) { w.push('t.team_id = ?'); p.push(f.teamId); }
  return { sql: w.join(' AND '), params: p };
}

export async function deskTotals(userId, todayStart) {
  return queryOne(
    `SELECT COUNT(*) AS total, SUM(${SQL_OPEN}) AS open_count, SUM(${SQL_OPEN} AND t.priority = 1) AS critical,
            SUM(t.status = 'Awaiting approval') AS awaiting, SUM(t.status = 'Resolved') AS resolved, SUM(t.status = 'Closed') AS closed,
            SUM(${SQL_OPEN} AND t.assigned_to = ?) AS mine, SUM(${SQL_OPEN} AND t.assigned_to = ? AND ${SQL_BREACHED}) AS mine_breached,
            SUM(${SQL_OPEN} AND t.assigned_to IS NULL AND t.status <> 'Awaiting approval') AS unassigned,
            SUM(${SQL_OPEN} AND t.assigned_to IS NULL AND t.status <> 'Awaiting approval' AND t.priority <= 2) AS unassigned_high,
            SUM(${SQL_BREACHED}) AS breached, SUM(${SQL_RISK}) AS risk, SUM(t.status = 'On Hold') AS on_hold,
            SUM(${SQL_PAUSED_REQUESTER}) AS paused, SUM(t.resolved_at >= ?) AS resolved_today
       FROM tickets t JOIN priorities pr ON pr.id = t.priority WHERE t.deleted_at IS NULL`,
    [userId, userId, todayStart],
  );
}

export const byPriority = () => query(
  `SELECT t.priority, COUNT(*) AS n FROM tickets t WHERE t.deleted_at IS NULL AND ${SQL_OPEN} GROUP BY t.priority ORDER BY t.priority`,
);
export const byCategoryOpen = () => query(
  `SELECT c.name, COUNT(t.id) AS n FROM ticket_categories c LEFT JOIN tickets t ON t.category_id = c.id AND t.deleted_at IS NULL AND ${SQL_OPEN}
    GROUP BY c.id ORDER BY n DESC, c.sort_order`,
);

/** Per-day created / resolved / SLA met, in the org time zone. */
export async function daily(from, to, offset, f = {}) {
  const s = scope(f);
  const created = await query(
    `SELECT DATE(CONVERT_TZ(t.created_at, '+00:00', ?)) AS d, COUNT(*) AS n FROM tickets t WHERE ${s.sql} AND t.created_at >= ? AND t.created_at < ? GROUP BY d`,
    [offset, ...s.params, from, to],
  );
  const resolved = await query(
    `SELECT DATE(CONVERT_TZ(t.resolved_at, '+00:00', ?)) AS d, COUNT(*) AS n, SUM(${SQL_MET}) AS met FROM tickets t
      WHERE ${s.sql} AND t.resolved_at >= ? AND t.resolved_at < ? GROUP BY d`,
    [offset, ...s.params, from, to],
  );
  return { created, resolved };
}

/** Window statistics for reports (created, resolved, SLA, first response, MTTR, CSAT, reopen). */
export async function windowStats(from, to, f = {}) {
  const s = scope(f);
  const c = await queryOne(
    `SELECT COUNT(*) AS created FROM tickets t WHERE ${s.sql} AND t.created_at >= ? AND t.created_at < ?`,
    [...s.params, from, to],
  );
  const r = await queryOne(
    `SELECT COUNT(*) AS resolved, SUM(${SQL_MET}) AS met, AVG((TIMESTAMPDIFF(SECOND, t.created_at, t.resolved_at) - t.paused_seconds) / 3600) AS mttr,
            AVG(t.csat) AS csat, SUM(t.csat IS NOT NULL) AS csat_n, SUM(t.reopened_count > 0) AS reopened
       FROM tickets t WHERE ${s.sql} AND t.resolved_at >= ? AND t.resolved_at < ?`,
    [...s.params, from, to],
  );
  const frt = await query(
    `SELECT TIMESTAMPDIFF(SECOND, t.created_at, t.first_response_at) / 60 AS m FROM tickets t
      WHERE ${s.sql} AND t.created_at >= ? AND t.created_at < ? AND t.first_response_at IS NOT NULL ORDER BY m`,
    [...s.params, from, to],
  );
  const med = frt.length ? (frt.length % 2 ? Number(frt[(frt.length - 1) / 2].m) : (Number(frt[frt.length / 2 - 1].m) + Number(frt[frt.length / 2].m)) / 2) : null;
  const resolved = Number(r.resolved || 0);
  return {
    created: Number(c.created || 0),
    resolved,
    sla: resolved ? (Number(r.met) / resolved) * 100 : null,
    frt: med,
    mttr: r.mttr != null ? Number(r.mttr) : null,
    csat: r.csat != null ? Number(r.csat) : null,
    csatN: Number(r.csat_n || 0),
    reopenPct: resolved ? (Number(r.reopened) / resolved) * 100 : 0,
  };
}

export async function agingOpen(f = {}) {
  const s = scope(f);
  return query(
    `SELECT CASE WHEN age < 1 THEN 0 WHEN age < 3 THEN 1 WHEN age < 7 THEN 2 WHEN age < 14 THEN 3 ELSE 4 END AS bucket, priority, COUNT(*) AS n
       FROM (SELECT TIMESTAMPDIFF(SECOND, t.created_at, UTC_TIMESTAMP(3)) / 86400 AS age, t.priority FROM tickets t WHERE ${s.sql} AND ${SQL_OPEN}) x
      GROUP BY bucket, priority`,
    s.params,
  );
}

export async function categories(from, to, f = {}) {
  const s = scope(f);
  return query(
    `SELECT c.name,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.category_id = c.id AND t.created_at >= ? AND t.created_at < ?) AS n,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.category_id = c.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS res,
            (SELECT SUM(${SQL_MET}) FROM tickets t WHERE ${s.sql} AND t.category_id = c.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS met
       FROM ticket_categories c ORDER BY n DESC`,
    [...s.params, from, to, ...s.params, from, to, ...s.params, from, to],
  );
}

export async function agents(from, to, f = {}) {
  const s = scope(f);
  return query(
    `SELECT u.id, u.name, tm.name AS team_name,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.assigned_to = u.id AND ${SQL_OPEN}) AS open_count,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.assigned_to = u.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS resolved,
            (SELECT SUM(${SQL_MET}) FROM tickets t WHERE ${s.sql} AND t.assigned_to = u.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS met,
            (SELECT AVG(t.csat) FROM tickets t WHERE ${s.sql} AND t.assigned_to = u.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS csat,
            (SELECT COUNT(*) FROM tasks k WHERE k.assigned_to = u.id AND k.state NOT IN ('Done','Not done','Not needed')) AS open_tasks
       FROM users u JOIN agents a ON a.user_id = u.id LEFT JOIN teams tm ON tm.id = a.primary_team_id
      WHERE u.status = 'active' ORDER BY u.id`,
    [...s.params, ...s.params, from, to, ...s.params, from, to, ...s.params, from, to],
  );
}

export async function customers(from, to, f = {}) {
  const s = scope(f);
  return query(
    `SELECT c.id, c.name, c.plan,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.customer_id = c.id AND t.created_at >= ? AND t.created_at < ?) AS created,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.customer_id = c.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS resolved,
            (SELECT SUM(${SQL_MET}) FROM tickets t WHERE ${s.sql} AND t.customer_id = c.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS met,
            (SELECT AVG(t.csat) FROM tickets t WHERE ${s.sql} AND t.customer_id = c.id AND t.resolved_at >= ? AND t.resolved_at < ?) AS csat,
            (SELECT COUNT(*) FROM tickets t WHERE ${s.sql} AND t.customer_id = c.id AND ${SQL_OPEN}) AS open_now,
            (SELECT COUNT(*) FROM tickets t JOIN priorities pr ON pr.id = t.priority WHERE ${s.sql} AND t.customer_id = c.id AND ${SQL_BREACHED}) AS breached
       FROM customers c WHERE c.deleted_at IS NULL ${f.customerId ? 'AND c.id = ?' : ''} ORDER BY c.is_internal, c.id`,
    [...s.params, from, to, ...s.params, from, to, ...s.params, from, to, ...s.params, from, to, ...s.params, ...s.params, ...(f.customerId ? [f.customerId] : [])],
  );
}

export async function groupedTitles(from, to, f, where, limit = 6) {
  const s = scope(f);
  return query(
    `SELECT t.title AS k, COUNT(*) AS n, SUM(t.resolved_at IS NOT NULL) AS res, SUM(${SQL_MET}) AS met,
            AVG(CASE WHEN t.resolved_at IS NOT NULL THEN (TIMESTAMPDIFF(SECOND, t.created_at, t.resolved_at) - t.paused_seconds) / 3600 END) AS hours,
            AVG(CASE WHEN t.first_response_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, t.created_at, t.first_response_at) / 60 END) AS frt
       FROM tickets t WHERE ${s.sql} AND ${where} AND t.created_at >= ? AND t.created_at < ? GROUP BY t.title ORDER BY n DESC LIMIT ?`,
    [...s.params, from, to, limit],
  );
}

export async function catalogGroups(from, to, f) {
  const s = scope(f);
  return query(
    `SELECT ci.name AS k, COUNT(*) AS n, SUM(t.resolved_at IS NOT NULL) AS res, SUM(${SQL_MET}) AS met
       FROM tickets t JOIN catalog_items ci ON ci.id = t.catalog_item_id
      WHERE ${s.sql} AND t.kind = 'request' AND t.created_at >= ? AND t.created_at < ? GROUP BY ci.id ORDER BY n DESC LIMIT 6`,
    [...s.params, from, to],
  );
}

export async function kindWindow(from, to, f, kind) {
  const s = scope(f);
  return queryOne(
    `SELECT SUM(t.created_at >= ? AND t.created_at < ?) AS created,
            SUM(t.resolved_at >= ? AND t.resolved_at < ?) AS resolved,
            SUM(t.resolved_at >= ? AND t.resolved_at < ? AND ${SQL_MET}) AS met,
            AVG(CASE WHEN t.resolved_at >= ? AND t.resolved_at < ? THEN (TIMESTAMPDIFF(SECOND, t.created_at, t.resolved_at) - t.paused_seconds) / 3600 END) AS mttr,
            SUM(t.resolved_at >= ? AND t.resolved_at < ? AND t.reopened_count > 0) AS reopened
       FROM tickets t WHERE ${s.sql} AND t.kind = ?`,
    [from, to, from, to, from, to, from, to, from, to, ...s.params, kind],
  );
}

export async function security(from, to, f) {
  const s = scope(f);
  return queryOne(
    `SELECT SUM(t.created_at >= ? AND t.created_at < ?) AS created,
            SUM(${SQL_OPEN} AND t.priority <= 2) AS open_high
       FROM tickets t JOIN ticket_categories c ON c.id = t.category_id WHERE ${s.sql} AND c.name = 'Security alerts'`,
    [from, to, ...s.params],
  );
}

export const problemRows = () => query(
  `SELECT p.problem_number, p.title, p.status,
          (SELECT COUNT(*) FROM tickets t WHERE t.problem_id = p.id AND t.deleted_at IS NULL) AS n,
          (SELECT COUNT(*) FROM tickets t WHERE t.problem_id = p.id AND t.deleted_at IS NULL AND ${SQL_OPEN}) AS open_n
     FROM problems p WHERE p.deleted_at IS NULL ORDER BY n DESC`,
);

export const changeStatusRows = () => query(
  "SELECT status, COUNT(*) AS n, SUM(risk = 'High') AS high FROM changes WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC",
);
