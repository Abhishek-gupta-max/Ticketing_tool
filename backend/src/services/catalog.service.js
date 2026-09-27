import { withTransaction } from '../config/database.js';
import * as repo from '../repositories/catalog.repository.js';
import * as settingsRepo from '../repositories/settings.repository.js';
import * as audit from './audit.service.js';
import { mapCatalogItem } from './request.service.js';
import { badRequest, notFound } from '../utils/AppError.js';

async function validate(body, conn) {
  if (!(await settingsRepo.categoryById(body.categoryId, conn))) throw badRequest('Choose a category.');
  const keys = new Set();
  for (const f of body.fields) {
    if (keys.has(f.key)) throw badRequest(`Field key "${f.key}" is used twice.`);
    keys.add(f.key);
    if (f.type === 'select' && !f.options?.length) throw badRequest(`${f.label}: a select field needs options.`);
  }
}

export async function create(body, user) {
  const id = await withTransaction(async (conn) => {
    await validate(body, conn);
    let n = 1;
    while (await repo.codeExists(`c${n}`)) n++;
    const newId = await repo.insertItem({ ...body, code: `c${n}` }, conn);
    await repo.replaceFields(newId, body.fields, conn);
    await repo.replaceTasks(newId, body.tasks, conn);
    await audit.log({ action: 'Created catalog item ' + body.name, entityType: 'catalog', entityId: newId, entityRef: body.name }, conn);
    return newId;
  });
  return mapCatalogItem(await repo.findItem(id));
}

export async function update(id, body, user) {
  await withTransaction(async (conn) => {
    const old = await repo.findItem(id, conn);
    if (!old) throw notFound('Catalog item not found.');
    await validate(body, conn);
    await repo.updateItem(id, body, conn);
    await repo.replaceFields(id, body.fields, conn);
    await repo.replaceTasks(id, body.tasks, conn);
    await audit.log({ action: 'Edited catalog item ' + body.name, entityType: 'catalog', entityId: id, entityRef: body.name, oldValues: { name: old.name, active: !!old.is_active }, newValues: { name: body.name, active: body.isActive } }, conn);
  });
  return mapCatalogItem(await repo.findItem(id));
}
