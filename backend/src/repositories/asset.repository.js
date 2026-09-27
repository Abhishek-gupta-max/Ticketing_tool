import { query, queryOne } from '../config/database.js';
import { orderBy } from '../utils/pagination.js';

export const ASSET_SELECT = `
  a.id, a.asset_tag, a.name, a.asset_type_id, ty.name AS type_name, ty.icon AS type_icon, ty.is_subscription, ty.is_personal_device,
  a.criticality, a.status, a.environment, a.customer_id, c.name AS customer_name, c.is_internal AS customer_internal, a.department, a.location,
  a.serial_number, a.platform, a.purchase_date, a.warranty_end, a.assigned_person_id, ap.name AS assigned_name, ap.job_title AS assigned_title,
  ap.department AS assigned_dept, a.owner_person_id, op.name AS owner_name, op.job_title AS owner_title, op.department AS owner_dept,
  a.managed_by, mu.name AS managed_by_name, a.support_team_id, st.name AS support_team_name, a.notes, a.created_at, a.updated_at,
  (SELECT COUNT(*) FROM tickets k WHERE k.asset_id = a.id AND k.deleted_at IS NULL AND k.status IN ('New','In Progress','On Hold','Awaiting approval')) AS open_tickets`;

export const ASSET_FROM = `
  FROM assets a
  JOIN asset_types ty ON ty.id = a.asset_type_id
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN people ap ON ap.id = a.assigned_person_id
  LEFT JOIN people op ON op.id = a.owner_person_id
  LEFT JOIN users mu ON mu.id = a.managed_by
  LEFT JOIN teams st ON st.id = a.support_team_id`;

// "Owner" follows the legacy rule: subscriptions -> owner, personal devices -> user then owner, others -> owner.
const OWNER_ID = 'CASE WHEN ty.is_subscription = 1 THEN a.owner_person_id WHEN ty.is_personal_device = 1 THEN COALESCE(a.assigned_person_id, a.owner_person_id) ELSE a.owner_person_id END';

function buildWhere(f) {
  const w = ['a.deleted_at IS NULL'], p = [];
  if (f.typeId) { w.push('a.asset_type_id = ?'); p.push(f.typeId); }
  if (f.criticality) { w.push('a.criticality = ?'); p.push(f.criticality); }
  if (f.status) { w.push('a.status = ?'); p.push(f.status); }
  if (f.customerId) { w.push('a.customer_id = ?'); p.push(f.customerId); }
  if (f.teamId) { w.push('a.support_team_id = ?'); p.push(f.teamId); }
  if (f.ownerId) { w.push('(a.assigned_person_id = ? OR a.owner_person_id = ?)'); p.push(f.ownerId, f.ownerId); }
  if (f.search) {
    const s = `%${f.search}%`;
    w.push('(a.asset_tag LIKE ? OR a.name LIKE ? OR a.serial_number LIKE ? OR a.location LIKE ? OR ap.name LIKE ? OR op.name LIKE ?)');
    p.push(s, s, s, s, s, s);
  }
  return { sql: 'WHERE ' + w.join(' AND '), params: p };
}

const SORTS = { tag: 'a.id', name: 'a.name', type: 'ty.name', criticality: "FIELD(a.criticality,'Low','Medium','High','Critical')", status: 'a.status', warranty: 'a.warranty_end', updated: 'a.updated_at' };

export async function list(f, { limit, offset }) {
  const { sql, params } = buildWhere(f);
  const rows = await query(`SELECT ${ASSET_SELECT} ${ASSET_FROM} ${sql} ORDER BY ${orderBy(f.sortBy, f.sortOrder || 'ASC', SORTS, 'tag')} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = (await queryOne(`SELECT COUNT(*) AS n ${ASSET_FROM} ${sql}`, params)).n;
  return { rows, total };
}
export async function listAll(f) {
  const { sql, params } = buildWhere(f);
  return query(`SELECT ${ASSET_SELECT} ${ASSET_FROM} ${sql} ORDER BY a.id LIMIT 20000`, params);
}

export const kpis = () => queryOne(
  `SELECT COUNT(*) AS total, SUM(a.status = 'Retired') AS retired,
          SUM(a.status <> 'Retired' AND a.criticality = 'Critical') AS critical,
          SUM(a.status <> 'Retired' AND (${OWNER_ID}) IS NULL) AS without_owner,
          SUM(a.status <> 'Retired' AND ty.is_subscription = 0 AND a.warranty_end IS NOT NULL AND a.warranty_end < CURDATE() + INTERVAL 90 DAY) AS warranty_expiring,
          SUM(a.status <> 'Retired' AND EXISTS (SELECT 1 FROM tickets k WHERE k.asset_id = a.id AND k.deleted_at IS NULL AND k.status IN ('New','In Progress','On Hold','Awaiting approval'))) AS with_open
     FROM assets a JOIN asset_types ty ON ty.id = a.asset_type_id WHERE a.deleted_at IS NULL`,
);

export const findByTag = (tag, conn) => queryOne(`SELECT ${ASSET_SELECT} ${ASSET_FROM} WHERE a.asset_tag = ? AND a.deleted_at IS NULL`, [tag], conn);
export const findById = (id, conn) => queryOne(`SELECT ${ASSET_SELECT} ${ASSET_FROM} WHERE a.id = ? AND a.deleted_at IS NULL`, [id], conn);
export const findByName = (name, conn) => queryOne('SELECT id FROM assets WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL', [name], conn);

export const options = () => query(
  `SELECT a.id, a.asset_tag, a.name, ty.name AS type_name, a.status, a.assigned_person_id
     FROM assets a JOIN asset_types ty ON ty.id = a.asset_type_id WHERE a.deleted_at IS NULL ORDER BY a.name`,
);

export const owners = () => query(
  `SELECT DISTINCT p.id, p.name FROM people p
    WHERE p.id IN (SELECT assigned_person_id FROM assets WHERE deleted_at IS NULL UNION SELECT owner_person_id FROM assets WHERE deleted_at IS NULL)
    ORDER BY p.name`,
);

const COLS = ['name', 'asset_type_id', 'criticality', 'status', 'environment', 'customer_id', 'department', 'location', 'serial_number', 'platform',
  'purchase_date', 'warranty_end', 'assigned_person_id', 'owner_person_id', 'managed_by', 'support_team_id', 'notes'];

export async function insert(tag, a, userId, conn) {
  const res = await query(
    `INSERT INTO assets (asset_tag, ${COLS.join(', ')}, created_by) VALUES (?, ${COLS.map(() => '?').join(', ')}, ?)`,
    [tag, ...COLS.map((c) => a[c] ?? null), userId || null],
    conn,
  );
  return res.insertId;
}

export const update = (id, a, conn) => query(
  `UPDATE assets SET ${COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
  [...COLS.map((c) => a[c] ?? null), id],
  conn,
);

export const softDelete = (id, conn) => query('UPDATE assets SET deleted_at = UTC_TIMESTAMP(3), name = CONCAT(name, \' (deleted \', id, \')\') WHERE id = ?', [id], conn);

export const dependsOn = (id) => query(
  `SELECT a.id, a.asset_tag, a.name, a.criticality FROM asset_dependencies d JOIN assets a ON a.id = d.depends_on_asset_id
    WHERE d.asset_id = ? AND a.deleted_at IS NULL ORDER BY a.name`,
  [id],
);
export const dependencyIds = async (id) => (await query('SELECT depends_on_asset_id AS id FROM asset_dependencies WHERE asset_id = ?', [id])).map((r) => r.id);

export async function setDependencies(id, ids, conn) {
  await query('DELETE FROM asset_dependencies WHERE asset_id = ?', [id], conn);
  const clean = [...new Set(ids)].filter((x) => x !== id);
  if (clean.length) await query('INSERT INTO asset_dependencies (asset_id, depends_on_asset_id) VALUES ?', [clean.map((d) => [id, d])], conn);
}

/** Everything that depends on this asset, directly or indirectly. */
export const dependents = (id) => query(
  `WITH RECURSIVE dep (id, depth) AS (
     SELECT asset_id, 1 FROM asset_dependencies WHERE depends_on_asset_id = ?
     UNION
     SELECT d.asset_id, dep.depth + 1 FROM asset_dependencies d JOIN dep ON d.depends_on_asset_id = dep.id WHERE dep.depth < 10
   )
   SELECT a.id, a.asset_tag, a.name, MIN(dep.depth) AS depth, ${OWNER_ID} AS owner_id, COALESCE(ap.name, op.name) AS owner_name
     FROM dep JOIN assets a ON a.id = dep.id JOIN asset_types ty ON ty.id = a.asset_type_id
     LEFT JOIN people ap ON ap.id = a.assigned_person_id LEFT JOIN people op ON op.id = a.owner_person_id
    WHERE a.deleted_at IS NULL AND a.id <> ?
    GROUP BY a.id ORDER BY a.name`,
  [id, id],
);

export const assignedToPerson = (personId) => query('SELECT id, asset_tag, name FROM assets WHERE assigned_person_id = ? AND deleted_at IS NULL', [personId]);

export const changesForAsset = (id) => query(
  `SELECT ch.id, ch.change_number, ch.title, ch.status, ch.close_code, ch.planned_start FROM change_assets ca JOIN changes ch ON ch.id = ca.change_id
    WHERE ca.asset_id = ? AND ch.deleted_at IS NULL ORDER BY ch.planned_start DESC`,
  [id],
);
