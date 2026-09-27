import { ZodError } from 'zod';
import { badRequest } from '../utils/AppError.js';

/**
 * Validate and coerce request parts with zod schemas. Parsed values are put on
 * req.valid.{body,query,params}; controllers read only from there.
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      req.valid = req.valid || {};
      for (const part of ['params', 'query', 'body']) {
        if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fields = {};
        for (const issue of err.issues) {
          const key = issue.path.join('.') || '_';
          if (!fields[key]) fields[key] = issue.message;
        }
        const first = Object.values(fields)[0] || 'Some fields are not valid.';
        return next(badRequest(first, 'VALIDATION_ERROR', { fields }));
      }
      next(err);
    }
  };
}
