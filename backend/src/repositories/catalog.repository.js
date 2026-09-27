import { query, queryOne } from '../config/database.js';

export async function listItems({ includeInactive = false } = {}) {
  const items = await query(
    `SELECT ci.id, ci.code, ci.name, ci.category_id, cat.name AS category_name, ci.icon, ci.description, ci.requires_approval,
            ci.fulfilment_hours, ci.is_active, ci.sort_order
       FROM catalog_items ci JOIN ticket_categories cat ON cat.id = ci.category_id
      ${includeInactive ? '' : 'WHERE ci.is_active = 1'} ORDER BY ci.sort_order, ci.id`,
  );
  if (!items.length) return [];
  const ids = items.map((i) => i.id);
  const fields = await query(`SELECT * FROM catalog_fields WHERE catalog_item_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`, ids);
  const tasks = await query(`SELECT * FROM catalog_tasks WHERE catalog_item_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`, ids);
  return items.map((i) => ({
    ...i,
    fields: fields.filter((f) => f.catalog_item_id === i.id),
    tasks: tasks.filter((t) => t.catalog_item_id === i.id),
  }));
}

export async function findItem(id, conn) {
  const item = await queryOne(
    `SELECT ci.*, cat.name AS category_name FROM catalog_items ci JOIN ticket_categories cat ON cat.id = ci.category_id WHERE ci.id = ?`,
    [id],
    conn,
  );
  if (!item) return null;
  item.fields = await query('SELECT * FROM catalog_fields WHERE catalog_item_id = ? ORDER BY sort_order, id', [id], conn);
  item.tasks = await query('SELECT * FROM catalog_tasks WHERE catalog_item_id = ? ORDER BY sort_order, id', [id], conn);
  return item;
}

export async function taskTitles(itemId, conn) {
  return (await query('SELECT title FROM catalog_tasks WHERE catalog_item_id = ? ORDER BY sort_order, id', [itemId], conn)).map((r) => r.title);
}

export async function insertItem(i, conn) {
  const res = await query(
    `INSERT INTO catalog_items (code, name, category_id, icon, description, requires_approval, fulfilment_hours, is_active, sort_order)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM catalog_items`,
    [i.code, i.name, i.categoryId, i.icon, i.description, i.requiresApproval ? 1 : 0, i.fulfilmentHours, i.isActive === false ? 0 : 1],
    conn,
  );
  return res.insertId;
}

export const updateItem = (id, i, conn) => query(
  'UPDATE catalog_items SET name = ?, category_id = ?, icon = ?, description = ?, requires_approval = ?, fulfilment_hours = ?, is_active = ? WHERE id = ?',
  [i.name, i.categoryId, i.icon, i.description, i.requiresApproval ? 1 : 0, i.fulfilmentHours, i.isActive === false ? 0 : 1, id],
  conn,
);

export async function replaceFields(itemId, fields, conn) {
  await query('DELETE FROM catalog_fields WHERE catalog_item_id = ?', [itemId], conn);
  if (fields.length) {
    await query(
      'INSERT INTO catalog_fields (catalog_item_id, field_key, label, field_type, is_required, options, sort_order) VALUES ?',
      [fields.map((f, i) => [itemId, f.key, f.label, f.type, f.required ? 1 : 0, f.options?.length ? JSON.stringify(f.options) : null, i + 1])],
      conn,
    );
  }
}

export async function replaceTasks(itemId, titles, conn) {
  await query('DELETE FROM catalog_tasks WHERE catalog_item_id = ?', [itemId], conn);
  if (titles.length) await query('INSERT INTO catalog_tasks (catalog_item_id, title, sort_order) VALUES ?', [titles.map((t, i) => [itemId, t, i + 1])], conn);
}

export const codeExists = async (code) => !!(await queryOne('SELECT 1 AS x FROM catalog_items WHERE code = ?', [code]));
