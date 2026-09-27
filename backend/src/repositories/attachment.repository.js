import { query, queryOne } from '../config/database.js';

export async function insert(a, conn) {
  const res = await query(
    `INSERT INTO attachments (entity_type, entity_id, comment_id, original_name, stored_name, mime_type, extension, size_bytes, sha256, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.entityType, a.entityId, a.commentId || null, a.originalName, a.storedName, a.mimeType, a.extension, a.size, a.sha256, a.uploadedBy || null],
    conn,
  );
  return res.insertId;
}

export const forEntity = (entityType, entityId) => query(
  `SELECT a.id, a.comment_id, a.original_name, a.mime_type, a.extension, a.size_bytes, a.created_at, a.uploaded_by, u.name AS uploaded_by_name,
          c.type AS comment_type
     FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by LEFT JOIN ticket_comments c ON c.id = a.comment_id
    WHERE a.entity_type = ? AND a.entity_id = ? AND a.deleted_at IS NULL ORDER BY a.created_at, a.id`,
  [entityType, entityId],
);

export const findById = (id) => queryOne(
  `SELECT a.*, c.type AS comment_type FROM attachments a LEFT JOIN ticket_comments c ON c.id = a.comment_id WHERE a.id = ? AND a.deleted_at IS NULL`,
  [id],
);

export const softDelete = (id, conn) => query('UPDATE attachments SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?', [id], conn);

export const countForEntity = async (entityType) => (await queryOne('SELECT COUNT(*) AS n FROM attachments WHERE entity_type = ? AND deleted_at IS NULL', [entityType])).n;
