import { insertOne, find, findOne, updateOne, deleteMany, attach, collection } from '../config/database.js';

// Setting values are stored as JSON text, as before.
export async function getSetting(key, conn) {
  const row = await findOne('settings', { setting_key: key }, { projection: { value: 1 } }, conn);
  return row ? JSON.parse(row.value) : null;
}

export const setSetting = (key, value, userId, conn) => collection('settings').updateOne(
  { setting_key: key },
  { $set: { value: JSON.stringify(value), updated_by: userId || null, updated_at: new Date() }, $setOnInsert: { setting_key: key } },
  { upsert: true, ...(conn?.session && { session: conn.session }) },
);

export async function allSettings() {
  const rows = await find('settings', {}, { projection: { setting_key: 1, value: 1 } });
  return Object.fromEntries(rows.map((r) => [r.setting_key, JSON.parse(r.value)]));
}

export const priorities = (conn) => find('priorities', {}, { sort: { id: 1 }, projection: { id: 1, name: 1, response_minutes: 1, resolution_minutes: 1 } }, conn);
export const updatePriority = (id, resp, res, conn) => updateOne('priorities', { id }, { response_minutes: resp, resolution_minutes: res }, conn);

export async function categories(conn) {
  const rows = await find('ticket_categories', {}, { sort: { sort_order: 1, id: 1 }, projection: { id: 1, name: 1, default_team_id: 1, is_active: 1 } }, conn);
  return attach(rows, 'teams', 'default_team_id', { team_name: 'name', team_code: 'code', team_active: 'is_active' }, { conn });
}
export const categoryById = (id, conn) => findOne('ticket_categories', { id }, {}, conn);
export const categoryByName = (name, conn) => findOne('ticket_categories', { name }, {}, conn);
export const setCategoryTeam = (id, teamId, conn) => updateOne('ticket_categories', { id }, { default_team_id: teamId }, conn);

export const lookups = () => find('lookup_values', { is_active: 1 }, { sort: { list_key: 1, sort_order: 1, value: 1 }, projection: { list_key: 1, value: 1 } });
export const lookupExists = async (listKey, value, conn) => !!(await findOne('lookup_values', { list_key: listKey, value, is_active: 1 }, { projection: { id: 1 } }, conn));

export const rules = (conn) => find('automation_rules', {}, {
  sort: { sort_order: 1, id: 1 }, projection: { id: 1, code: 1, name: 1, description: 1, is_enabled: 1 },
}, conn);
export const setRule = (code, enabled) => updateOne('automation_rules', { code }, { is_enabled: enabled ? 1 : 0 });

export const canned = () => find('canned_responses', {}, { sort: { sort_order: 1, name: 1 }, projection: { id: 1, name: 1, body: 1 } });
export async function createCanned(name, body) {
  const last = await findOne('canned_responses', {}, { sort: { sort_order: -1 }, projection: { sort_order: 1 } });
  return insertOne('canned_responses', { name, body, sort_order: (last?.sort_order || 0) + 1 });
}
export const updateCanned = (id, name, body) => updateOne('canned_responses', { id }, { name, body });
export const deleteCanned = (id) => deleteMany('canned_responses', { id });

export const assetTypes = () => find('asset_types', {}, {
  sort: { sort_order: 1, name: 1 }, projection: { id: 1, name: 1, icon: 1, is_subscription: 1, is_personal_device: 1 },
});
export const kbCategories = () => find('knowledge_categories', {}, { sort: { sort_order: 1, name: 1 }, projection: { id: 1, name: 1 } });
