import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: 'The requested endpoint does not exist.', errorCode: 'ROUTE_NOT_FOUND' });
}

// Maps known low-level errors to safe messages. Raw database errors, SQL and
// stack traces are logged but never sent to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { success: false, message: 'Something went wrong. Please try again.', errorCode: 'INTERNAL_ERROR' };

  if (err instanceof AppError) {
    status = err.statusCode;
    body = { success: false, message: err.message, errorCode: err.errorCode };
    if (err.details) body.details = err.details;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    const msg = {
      LIMIT_FILE_SIZE: `A file is larger than ${env.MAX_FILE_SIZE_MB} MB.`,
      LIMIT_FILE_COUNT: `Attach at most ${env.MAX_FILES_PER_UPLOAD} files at a time.`,
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
    }[err.code] || 'The upload could not be processed.';
    body = { success: false, message: msg, errorCode: 'UPLOAD_REJECTED' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { success: false, message: 'The request is too large.', errorCode: 'PAYLOAD_TOO_LARGE' };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { success: false, message: 'The request body is not valid JSON.', errorCode: 'INVALID_JSON' };
  } else if (err?.code === 'ER_DUP_ENTRY') {
    status = 409;
    body = { success: false, message: 'A record with the same unique value already exists.', errorCode: 'DUPLICATE' };
  } else if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
    status = 409;
    body = { success: false, message: 'This record is still used by other records.', errorCode: 'IN_USE' };
  } else if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    body = { success: false, message: 'A referenced record does not exist.', errorCode: 'INVALID_REFERENCE' };
  }

  const meta = { requestId: req.requestId, method: req.method, path: req.originalUrl, userId: req.user?.id, status };
  if (status >= 500) {
    logger.error(err?.message || 'Unhandled error', { ...meta, code: err?.code, sqlState: err?.sqlState, stack: err?.stack });
    if (err?.sqlMessage) logger.error('Database error', { requestId: req.requestId, sqlMessage: err.sqlMessage });
  } else {
    logger.warn(body.message, { ...meta, errorCode: body.errorCode });
  }

  body.requestId = req.requestId;
  res.status(status).json(body);
}
