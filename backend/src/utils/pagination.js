export const MAX_PAGE_SIZE = 100;

export function pageParams(q = {}, defaultLimit = 25) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function pageMeta({ page, limit }, total) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Pick a whitelisted ORDER BY column; never interpolate user input directly. */
export function orderBy(sortBy, sortOrder, allowed, fallback) {
  const col = allowed[sortBy] || allowed[fallback];
  const dir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return `${col} ${dir}`;
}
