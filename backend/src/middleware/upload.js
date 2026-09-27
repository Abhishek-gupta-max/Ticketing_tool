import multer from 'multer';
import { env } from '../config/env.js';

// Files are held in memory (max MAX_FILE_SIZE_MB each) so their content can be
// inspected before anything is written to disk.
export const uploadFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileBytes, files: env.MAX_FILES_PER_UPLOAD, fields: 30, fieldSize: 200 * 1024 },
}).array('files', env.MAX_FILES_PER_UPLOAD);

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileBytes, files: 1 },
}).single('file');

/**
 * Multipart forms send structured data as a JSON string in the "payload"
 * field. Expand it into req.body so the normal validators apply.
 */
export function jsonPayload(req, res, next) {
  if (typeof req.body?.payload === 'string') {
    try { req.body = JSON.parse(req.body.payload); } catch { return next(Object.assign(new Error('bad payload'), { type: 'entity.parse.failed' })); }
  }
  next();
}
