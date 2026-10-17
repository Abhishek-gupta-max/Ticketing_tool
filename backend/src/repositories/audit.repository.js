import { insertOne, find, count, attach, like } from '../config/database.js';

// audit_logs is append-only: this module only inserts and reads.
export const insert = (row, conn) => insertOne('audit_logs', {
  user_id: row.userId ?? null, action: row.action, entity_type: row.entityType, entity_id: row.entityId != null ? String(row.entityId) : null,
  entity_ref: row.entityRef ?? null, old_values: row.oldValues ? JSON.stringify(row.oldValues) : null,
  new_values: row.newValues ? JSON.stringify(row.newValues) : null, ip_address: row.ip ?? null, user_agent: row.userAgent ?? null,
  request_id: row.requestId ?? null,
}, conn);

function where(f) {
  const w = {};
  if (f.userId) w.user_id = f.userId;
  if (f.entityType) w.entity_type = f.entityType;
  if (f.entityRef) w.entity_ref = f.entityRef;
  if (f.from || f.to) w.created_at = { ...(f.from && { $gte: new Date(f.from) }), ...(f.to && { $lt: new Date(f.to) }) };
  if (f.search) w.$or = [{ action: like(f.search) }, { entity_ref: like(f.search) }];
  return w;
}

const LIST_FIELDS = {
  id: 1, user_id: 1, action: 1, entity_type: 1, entity_id: 1, entity_ref: 1, old_values: 1, new_values: 1, ip_address: 1, user_agent: 1, created_at: 1,
};

export async function list(f, { limit, offset }) {
  const filter = where(f);
  const rows = await find('audit_logs', filter, { sort: { created_at: -1, id: -1 }, skip: offset, limit, projection: LIST_FIELDS });
  await attach(rows, 'users', 'user_id', { user_name: 'name' });
  return { rows, total: await count('audit_logs', filter) };
}

export async function recent(limit = 7) {
  const rows = await find('audit_logs', {}, {
    sort: { created_at: -1, id: -1 }, limit, projection: { id: 1, user_id: 1, action: 1, entity_type: 1, entity_ref: 1, created_at: 1 },
  });
  return attach(rows, 'users', 'user_id', { user_name: 'name' });
}
