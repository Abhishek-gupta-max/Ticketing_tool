import { query, queryOne } from '../config/database.js';

export async function getSetting(key, conn) {
  const row = await queryOne('SELECT value FROM settings WHERE setting_key = ?', [key], conn);
  return row ? JSON.parse(row.value) : null;
}

export const setSetting = (key, value, userId, conn) => query(
  'INSERT INTO settings (setting_key, value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)',
  [key, JSON.stringify(value), userId || null],
  conn,
);

export async function allSettings() {
  const rows = await query('SELECT setting_key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.setting_key, JSON.parse(r.value)]));
}

export const priorities = (conn) => query('SELECT id, name, response_minutes, resolution_minutes FROM priorities ORDER BY id', [], conn);
export const updatePriority = (id, resp, res, conn) => query('UPDATE priorities SET response_minutes = ?, resolution_minutes = ? WHERE id = ?', [resp, res, id], conn);

export const categories = (conn) => query(
  `SELECT c.id, c.name, c.default_team_id, t.name AS team_name, t.code AS team_code, t.is_active AS team_active, c.is_active
     FROM ticket_categories c LEFT JOIN teams t ON t.id = c.default_team_id ORDER BY c.sort_order, c.id`,
  [],
  conn,
);
export const categoryById = (id, conn) => queryOne('SELECT * FROM ticket_categories WHERE id = ?', [id], conn);
export const categoryByName = (name, conn) => queryOne('SELECT * FROM ticket_categories WHERE name = ?', [name], conn);
export const setCategoryTeam = (id, teamId, conn) => query('UPDATE ticket_categories SET default_team_id = ? WHERE id = ?', [teamId, id], conn);

export const lookups = () => query('SELECT list_key, value FROM lookup_values WHERE is_active = 1 ORDER BY list_key, sort_order, value');
export const lookupExists = async (listKey, value, conn) => !!(await queryOne('SELECT 1 AS x FROM lookup_values WHERE list_key = ? AND value = ? AND is_active = 1', [listKey, value], conn));

export const rules = (conn) => query('SELECT id, code, name, description, is_enabled FROM automation_rules ORDER BY sort_order, id', [], conn);
export const setRule = (code, enabled) => query('UPDATE automation_rules SET is_enabled = ? WHERE code = ?', [enabled ? 1 : 0, code]);

export const canned = () => query('SELECT id, name, body FROM canned_responses ORDER BY sort_order, name');
export async function createCanned(name, body) {
  const res = await query('INSERT INTO canned_responses (name, body, sort_order) SELECT ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM canned_responses', [name, body]);
  return res.insertId;
}
export const updateCanned = (id, name, body) => query('UPDATE canned_responses SET name = ?, body = ? WHERE id = ?', [name, body, id]);
export const deleteCanned = (id) => query('DELETE FROM canned_responses WHERE id = ?', [id]);

export const assetTypes = () => query('SELECT id, name, icon, is_subscription, is_personal_device FROM asset_types ORDER BY sort_order, name');
export const kbCategories = () => query('SELECT id, name FROM knowledge_categories ORDER BY sort_order, name');
