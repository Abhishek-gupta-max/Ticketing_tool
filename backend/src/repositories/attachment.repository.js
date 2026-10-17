import { insertOne, find, findOne, count, updateOne, attach } from '../config/database.js';

export const insert = (a, conn) => insertOne('attachments', {
  entity_type: a.entityType, entity_id: a.entityId, comment_id: a.commentId || null, original_name: a.originalName, stored_name: a.storedName,
  mime_type: a.mimeType, extension: a.extension, size_bytes: a.size, sha256: a.sha256, uploaded_by: a.uploadedBy || null,
}, conn);

export async function forEntity(entityType, entityId) {
  const rows = await find(
    'attachments',
    { entity_type: entityType, entity_id: entityId, deleted_at: null },
    {
      sort: { created_at: 1, id: 1 },
      projection: { id: 1, comment_id: 1, original_name: 1, mime_type: 1, extension: 1, size_bytes: 1, created_at: 1, uploaded_by: 1 },
    },
  );
  await attach(rows, 'users', 'uploaded_by', { uploaded_by_name: 'name' });
  await attach(rows, 'ticket_comments', 'comment_id', { comment_type: 'type' });
  return rows;
}

export async function findById(id) {
  const row = await findOne('attachments', { id, deleted_at: null });
  if (row) await attach(row, 'ticket_comments', 'comment_id', { comment_type: 'type' });
  return row;
}

export const softDelete = (id, conn) => updateOne('attachments', { id }, { deleted_at: new Date() }, conn);

export const countForEntity = (entityType) => count('attachments', { entity_type: entityType, deleted_at: null });
