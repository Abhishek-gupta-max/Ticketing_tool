import { query, queryOne } from '../config/database.js';

const SELECT = `k.id, k.article_number, k.title, k.category_id, kc.name AS category_name, k.audience, k.status, k.body, k.view_count,
  k.helpful_count, k.not_helpful_count, k.author_id, u.name AS author_name, k.published_at, k.created_at, k.updated_at,
  (SELECT GROUP_CONCAT(tag ORDER BY tag SEPARATOR ',') FROM knowledge_article_tags t WHERE t.article_id = k.id) AS tags`;
const FROM = 'FROM knowledge_articles k JOIN knowledge_categories kc ON kc.id = k.category_id LEFT JOIN users u ON u.id = k.author_id';

export function list({ search, categoryId, audience, status, internal }) {
  const w = ['k.deleted_at IS NULL'], p = [];
  if (!internal) { w.push("k.audience = 'Public' AND k.status = 'Published'"); }
  if (status && status !== 'all') { w.push('k.status = ?'); p.push(status); }
  if (categoryId) { w.push('k.category_id = ?'); p.push(categoryId); }
  if (audience) { w.push('k.audience = ?'); p.push(audience); }
  if (search) {
    const s = `%${search}%`;
    w.push('(k.title LIKE ? OR k.body LIKE ? OR EXISTS (SELECT 1 FROM knowledge_article_tags t WHERE t.article_id = k.id AND t.tag LIKE ?))');
    p.push(s, s, s);
  }
  return query(`SELECT ${SELECT} ${FROM} WHERE ${w.join(' AND ')} ORDER BY k.view_count DESC, k.id DESC LIMIT 500`, p);
}

export const kpis = () => queryOne(
  `SELECT SUM(status = 'Published') AS published, SUM(status = 'Draft') AS drafts, COUNT(*) AS total, SUM(view_count) AS views,
          SUM(helpful_count) AS helpful, SUM(not_helpful_count) AS not_helpful, SUM(status = 'Published' AND audience = 'Internal') AS internal
     FROM knowledge_articles WHERE deleted_at IS NULL`,
);

export const findByNumber = (n, conn) => queryOne(`SELECT ${SELECT} ${FROM} WHERE k.article_number = ? AND k.deleted_at IS NULL`, [n], conn);
export const findById = (id, conn) => queryOne(`SELECT ${SELECT} ${FROM} WHERE k.id = ? AND k.deleted_at IS NULL`, [id], conn);

export async function insert(a, conn) {
  const res = await query(
    `INSERT INTO knowledge_articles (article_number, title, category_id, audience, status, body, author_id, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${a.status === 'Published' ? 'UTC_TIMESTAMP(3)' : 'NULL'})`,
    [a.number, a.title, a.categoryId, a.audience, a.status, a.body, a.authorId],
    conn,
  );
  return res.insertId;
}

export const update = (id, a, conn) => query(
  `UPDATE knowledge_articles SET title = ?, category_id = ?, audience = ?, status = ?, body = ?,
          published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, UTC_TIMESTAMP(3)) ELSE published_at END
    WHERE id = ?`,
  [a.title, a.categoryId, a.audience, a.status, a.body, a.status, id],
  conn,
);

export const setStatus = (id, status, conn) => query(
  `UPDATE knowledge_articles SET status = ?, published_at = CASE WHEN ? = 'Published' THEN UTC_TIMESTAMP(3) ELSE published_at END WHERE id = ?`,
  [status, status, id],
  conn,
);

export const softDelete = (id, conn) => query('UPDATE knowledge_articles SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?', [id], conn);

export async function setTags(id, tags, conn) {
  await query('DELETE FROM knowledge_article_tags WHERE article_id = ?', [id], conn);
  if (tags.length) await query('INSERT INTO knowledge_article_tags (article_id, tag) VALUES ?', [tags.map((t) => [id, t])], conn);
}

/** Count a view once per user per day. */
export async function recordView(id, userId) {
  const res = await query('INSERT IGNORE INTO knowledge_article_views (article_id, user_id, view_date) VALUES (?, ?, UTC_DATE())', [id, userId]);
  if (res.affectedRows) await query('UPDATE knowledge_articles SET view_count = view_count + 1 WHERE id = ?', [id]);
}

/** One vote per user; changing the vote moves it between the counters. */
export async function vote(id, userId, helpful, conn) {
  const prev = await queryOne('SELECT is_helpful FROM knowledge_article_votes WHERE article_id = ? AND user_id = ? FOR UPDATE', [id, userId], conn);
  if (prev && !!prev.is_helpful === helpful) return;
  await query('INSERT INTO knowledge_article_votes (article_id, user_id, is_helpful) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_helpful = VALUES(is_helpful), voted_at = UTC_TIMESTAMP(3)', [id, userId, helpful ? 1 : 0], conn);
  const col = helpful ? 'helpful_count' : 'not_helpful_count';
  const other = helpful ? 'not_helpful_count' : 'helpful_count';
  await query(`UPDATE knowledge_articles SET ${col} = ${col} + 1${prev ? `, ${other} = GREATEST(${other} - 1, 0)` : ''} WHERE id = ?`, [id], conn);
}

export const myVote = async (id, userId) => {
  const r = await queryOne('SELECT is_helpful FROM knowledge_article_votes WHERE article_id = ? AND user_id = ?', [id, userId]);
  return r ? !!r.is_helpful : null;
};

export const publishedForMatching = () => query(
  `SELECT k.id, k.article_number, k.title, kc.name AS category_name,
          (SELECT GROUP_CONCAT(tag SEPARATOR ' ') FROM knowledge_article_tags t WHERE t.article_id = k.id) AS tags
     FROM knowledge_articles k JOIN knowledge_categories kc ON kc.id = k.category_id WHERE k.status = 'Published' AND k.deleted_at IS NULL`,
);

export const related = (id, categoryId, internal) => query(
  `SELECT DISTINCT k.id, k.article_number, k.title FROM knowledge_articles k
    WHERE k.id <> ? AND k.status = 'Published' AND k.deleted_at IS NULL ${internal ? '' : "AND k.audience = 'Public'"}
      AND (k.category_id = ? OR EXISTS (SELECT 1 FROM knowledge_article_tags a JOIN knowledge_article_tags b ON b.tag = a.tag
            WHERE a.article_id = k.id AND b.article_id = ?))
    LIMIT 4`,
  [id, categoryId, id],
);

export const referencedIn = async (number) => (await queryOne(
  'SELECT COUNT(DISTINCT ticket_id) AS n FROM ticket_comments WHERE body LIKE ?', [`%${number}%`],
)).n;
