import { insertOne, insertMany, find, findOne, updateOne, deleteMany, attach } from '../config/database.js';

export async function listItems({ includeInactive = false } = {}) {
  const items = await find('catalog_items', includeInactive ? {} : { is_active: 1 }, {
    sort: { sort_order: 1, id: 1 },
    projection: {
      id: 1, code: 1, name: 1, category_id: 1, icon: 1, description: 1, requires_approval: 1, fulfilment_hours: 1, is_active: 1, sort_order: 1,
    },
  });
  if (!items.length) return [];
  await attach(items, 'ticket_categories', 'category_id', { category_name: 'name' });
  const ids = items.map((i) => i.id);
  const fields = await find('catalog_fields', { catalog_item_id: { $in: ids } }, { sort: { sort_order: 1, id: 1 } });
  const tasks = await find('catalog_tasks', { catalog_item_id: { $in: ids } }, { sort: { sort_order: 1, id: 1 } });
  return items
    .filter((i) => i.category_name != null)
    .map((i) => ({
      ...i,
      fields: fields.filter((f) => f.catalog_item_id === i.id),
      tasks: tasks.filter((t) => t.catalog_item_id === i.id),
    }));
}

export async function findItem(id, conn) {
  const item = await findOne('catalog_items', { id }, {}, conn);
  if (!item) return null;
  await attach(item, 'ticket_categories', 'category_id', { category_name: 'name' }, { conn });
  item.fields = await find('catalog_fields', { catalog_item_id: id }, { sort: { sort_order: 1, id: 1 } }, conn);
  item.tasks = await find('catalog_tasks', { catalog_item_id: id }, { sort: { sort_order: 1, id: 1 } }, conn);
  return item;
}

export async function taskTitles(itemId, conn) {
  return (await find('catalog_tasks', { catalog_item_id: itemId }, { sort: { sort_order: 1, id: 1 }, projection: { title: 1 } }, conn)).map((r) => r.title);
}

export async function insertItem(i, conn) {
  const last = await findOne('catalog_items', {}, { sort: { sort_order: -1 }, projection: { sort_order: 1 } }, conn);
  return insertOne('catalog_items', {
    code: i.code, name: i.name, category_id: i.categoryId, icon: i.icon, description: i.description, requires_approval: i.requiresApproval ? 1 : 0,
    fulfilment_hours: i.fulfilmentHours, is_active: i.isActive === false ? 0 : 1, sort_order: (last?.sort_order || 0) + 1,
  }, conn);
}

export const updateItem = (id, i, conn) => updateOne('catalog_items', { id }, {
  name: i.name, category_id: i.categoryId, icon: i.icon, description: i.description, requires_approval: i.requiresApproval ? 1 : 0,
  fulfilment_hours: i.fulfilmentHours, is_active: i.isActive === false ? 0 : 1,
}, conn);

export async function replaceFields(itemId, fields, conn) {
  await deleteMany('catalog_fields', { catalog_item_id: itemId }, conn);
  await insertMany('catalog_fields', fields.map((f, i) => ({
    catalog_item_id: itemId, field_key: f.key, label: f.label, field_type: f.type, is_required: f.required ? 1 : 0,
    options: f.options?.length ? JSON.stringify(f.options) : null, sort_order: i + 1,
  })), conn);
}

export async function replaceTasks(itemId, titles, conn) {
  await deleteMany('catalog_tasks', { catalog_item_id: itemId }, conn);
  await insertMany('catalog_tasks', titles.map((t, i) => ({ catalog_item_id: itemId, title: t, sort_order: i + 1 })), conn);
}

export const codeExists = async (code) => !!(await findOne('catalog_items', { code }, { projection: { id: 1 } }));
