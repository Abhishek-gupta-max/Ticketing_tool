import { z } from 'zod';

export const id = z.coerce.number().int().positive();
export const optId = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.coerce.number().int().positive().optional());
export const nullableId = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable());
export const text = (min, max, label) => z.string({ required_error: `${label} is required.` }).trim()
  .min(min, min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`).max(max, `${label} is too long.`);
export const optText = (max) => z.string().trim().max(max).optional();
export const bool = z.preprocess((v) => (v === 'true' || v === '1' || v === 1 ? true : v === 'false' || v === '0' || v === 0 ? false : v), z.boolean());
export const priority = z.coerce.number().int().min(1).max(4);
export const level = z.coerce.number().int().min(1).max(3);
export const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date.');
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** "a,b" or ["a","b"] query values into an array. */
export const list = (item) => z.preprocess((v) => (v === undefined || v === '' ? undefined : Array.isArray(v) ? v : String(v).split(',')), z.array(item).optional());

export const paging = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
};

export const numberParam = (name) => z.object({ [name]: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9.-]+$/, 'Invalid number') });
export const idParam = z.object({ id });
