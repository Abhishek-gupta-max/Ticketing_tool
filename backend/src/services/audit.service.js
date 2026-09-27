import * as repo from '../repositories/audit.repository.js';
import { getContext } from '../utils/requestContext.js';
import { logger } from '../config/logger.js';
import { pageParams, pageMeta } from '../utils/pagination.js';

/**
 * Append an audit entry. Pass conn to write inside the caller's transaction so
 * the entry is rolled back together with the change it describes.
 */
export async function log(entry, conn = null) {
  const ctx = getContext();
  try {
    await repo.insert({
      userId: entry.userId !== undefined ? entry.userId : ctx.user ?? null,
      action: String(entry.action).slice(0, 160),
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityRef: entry.entityRef,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    }, conn);
  } catch (err) {
    if (conn) throw err; // inside a transaction the whole operation must fail
    logger.error('Could not write audit entry', { action: entry.action, error: err.message });
  }
}

export async function list(q) {
  const pg = pageParams(q, 50);
  const { rows, total } = await repo.list(q, pg);
  return { items: rows.map(format), meta: pageMeta(pg, total) };
}

export async function exportRows(q) {
  const { rows } = await repo.list(q, { limit: 50000, offset: 0 });
  return rows;
}

export const recent = async (limit) => (await repo.recent(limit)).map(format);

const parse = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return v; } };
function format(r) {
  return {
    id: r.id, userId: r.user_id, userName: r.user_name || 'System', action: r.action, entityType: r.entity_type,
    entityId: r.entity_id, entityRef: r.entity_ref, oldValues: parse(r.old_values), newValues: parse(r.new_values),
    ipAddress: r.ip_address, userAgent: r.user_agent, createdAt: r.created_at,
  };
}
