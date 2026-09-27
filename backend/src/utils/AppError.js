/**
 * An error that is safe to show to the user. Anything that is not an AppError
 * is reported as a generic 500 without internal details.
 */
export class AppError extends Error {
  constructor(statusCode, message, errorCode = 'ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export const badRequest = (message, errorCode = 'BAD_REQUEST', details) => new AppError(400, message, errorCode, details);
export const unauthorized = (message = 'Please sign in to continue.', errorCode = 'UNAUTHORIZED') => new AppError(401, message, errorCode);
export const forbidden = (message = 'You do not have permission to do this.', errorCode = 'FORBIDDEN') => new AppError(403, message, errorCode);
export const notFound = (message = 'Not found.', errorCode = 'NOT_FOUND') => new AppError(404, message, errorCode);
export const conflict = (message, errorCode = 'CONFLICT', details) => new AppError(409, message, errorCode, details);
/** A business rule stopped the action (for example an illegal state change). */
export const unprocessable = (message, errorCode = 'RULE_VIOLATION', details) => new AppError(422, message, errorCode, details);
