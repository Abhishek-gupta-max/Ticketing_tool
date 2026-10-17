import {
  insertOne, insertMany, insertIgnore, find, findOne, updateOne, deleteMany, distinct, attach, like, collection,
} from '../config/database.js';

const FIELDS = {
  id: 1, article_number: 1, title: 1, category_id: 1, audience: 1, status: 1, body: 1, view_count: 1, helpful_count: 1, not_helpful_count: 1,
  author_id: 1, published_at: 1, created_at: 1, updated_at: 1,
};

const byTag = (a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);

/** Category, author and comma-separated tags (former JOINs and GROUP_CONCAT). */
async function enrich(rows, conn) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  if (!list.length) return rows;
  await attach(list, 'knowledge_categories', 'category_id', { category_name: 'name' }, { conn });
  await attach(list, 'users', 'author_id', { author_name: 'name' }, { conn });
  const tags = await find('knowledge_article_tags', { article_id: { $in: list.map((k) => k.id) } }, {}, conn);
  for (const k of list) {
    const mine = tags.filter((t) => t.article_id === k.id).map((t) => t.tag).sort(byTag);
    k.tags = mine.length ? mine.join(',') : null;
  }
  return Array.isArray(rows) ? list.filter((k) => k.category_name != null) : (list[0]?.category_name != null ? rows : null);
}

export async function list({ search, categoryId, audience, status, internal }) {
  const w = { deleted_at: null };
  const and = [];
  if (!internal) { w.audience = 'Public'; w.status = 'Published'; }
  if (status && status !== 'all') and.push({ status });
  if (categoryId) w.category_id = categoryId;
  if (audience) and.push({ audience });
  if (search) {
    const tagged = await distinct('knowledge_article_tags', 'article_id', { tag: like(search) });
    and.push({ $or: [{ title: like(search) }, { body: like(search) }, { id: { $in: tagged } }] });
  }
  if (and.length) w.$and = and;
  return enrich(await find('knowledge_articles', w, { sort: { view_count: -1, id: -1 }, limit: 500, projection: FIELDS }));
}

export async function kpis() {
  const rows = await find('knowledge_articles', { deleted_at: null }, {
    projection: { status: 1, audience: 1, view_count: 1, helpful_count: 1, not_helpful_count: 1 },
  });
  const sum = (f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  return {
    published: sum((r) => r.status === 'Published'),
    drafts: sum((r) => r.status === 'Draft'),
    total: rows.length,
    views: sum((r) => r.view_count),
    helpful: sum((r) => r.helpful_count),
    not_helpful: sum((r) => r.not_helpful_count),
    internal: sum((r) => r.status === 'Published' && r.audience === 'Internal'),
  };
}

export const findByNumber = async (n, conn) => enrich(await findOne('knowledge_articles', { article_number: n, deleted_at: null }, { projection: FIELDS }, conn), conn);
export const findById = async (id, conn) => enrich(await findOne('knowledge_articles', { id, deleted_at: null }, { projection: FIELDS }, conn), conn);

export const insert = (a, conn) => insertOne('knowledge_articles', {
  article_number: a.number, title: a.title, category_id: a.categoryId, audience: a.audience, status: a.status, body: a.body, author_id: a.authorId,
  published_at: a.status === 'Published' ? new Date() : null,
}, conn);

export async function update(id, a, conn) {
  const current = await findOne('knowledge_articles', { id }, { projection: { published_at: 1 } }, conn);
  const fields = { title: a.title, category_id: a.categoryId, audience: a.audience, status: a.status, body: a.body };
  if (a.status === 'Published' && !current?.published_at) fields.published_at = new Date();
  return updateOne('knowledge_articles', { id }, fields, conn);
}

export const setStatus = (id, status, conn) => updateOne('knowledge_articles', { id }, { status, ...(status === 'Published' && { published_at: new Date() }) }, conn);

export const softDelete = (id, conn) => updateOne('knowledge_articles', { id }, { deleted_at: new Date() }, conn);

export async function setTags(id, tags, conn) {
  await deleteMany('knowledge_article_tags', { article_id: id }, conn);
  await insertMany('knowledge_article_tags', tags.map((t) => ({ article_id: id, tag: t })), conn);
}

const utcDate = () => new Date(new Date().toISOString().slice(0, 10));

/** Count a view once per user per day. */
export async function recordView(id, userId) {
  if (await insertIgnore('knowledge_article_views', { article_id: id, user_id: userId, view_date: utcDate() })) {
    await collection('knowledge_articles').updateOne({ id }, { $inc: { view_count: 1 } });
  }
}

/** One vote per user; changing the vote moves it between the counters. */
export async function vote(id, userId, helpful, conn) {
  const prev = await findOne('knowledge_article_votes', { article_id: id, user_id: userId }, { projection: { is_helpful: 1 } }, conn);
  if (prev && !!prev.is_helpful === helpful) return;
  const s = conn?.session ? { session: conn.session } : {};
  await collection('knowledge_article_votes').updateOne(
    { article_id: id, user_id: userId },
    { $set: { is_helpful: helpful ? 1 : 0, voted_at: new Date() } },
    { upsert: true, ...s },
  );
  const col = helpful ? 'helpful_count' : 'not_helpful_count';
  const other = helpful ? 'not_helpful_count' : 'helpful_count';
  if (!prev) {
    await collection('knowledge_articles').updateOne({ id }, { $inc: { [col]: 1 } }, s);
  } else {
    await collection('knowledge_articles').updateOne({ id }, [
      { $set: { [col]: { $add: [`$${col}`, 1] }, [other]: { $max: [{ $subtract: [`$${other}`, 1] }, 0] } } },
    ], s);
  }
}

export const myVote = async (id, userId) => {
  const r = await findOne('knowledge_article_votes', { article_id: id, user_id: userId }, { projection: { is_helpful: 1 } });
  return r ? !!r.is_helpful : null;
};

export async function publishedForMatching() {
  const rows = await find('knowledge_articles', { status: 'Published', deleted_at: null }, { projection: { id: 1, article_number: 1, title: 1, category_id: 1 } });
  await attach(rows, 'knowledge_categories', 'category_id', { category_name: 'name' });
  const tags = await find('knowledge_article_tags', { article_id: { $in: rows.map((r) => r.id) } });
  return rows.filter((r) => r.category_name != null).map((r) => {
    const mine = tags.filter((t) => t.article_id === r.id).map((t) => t.tag);
    return { id: r.id, article_number: r.article_number, title: r.title, category_name: r.category_name, tags: mine.length ? mine.join(' ') : null };
  });
}

export async function related(id, categoryId, internal) {
  const myTags = await distinct('knowledge_article_tags', 'tag', { article_id: id });
  const sharing = myTags.length ? await distinct('knowledge_article_tags', 'article_id', { tag: { $in: myTags } }) : [];
  return find('knowledge_articles', {
    id: { $ne: id }, status: 'Published', deleted_at: null, ...(internal ? {} : { audience: 'Public' }),
    $or: [{ category_id: categoryId }, { id: { $in: sharing } }],
  }, { limit: 4, projection: { id: 1, article_number: 1, title: 1 } });
}

export const referencedIn = async (number) => (await distinct('ticket_comments', 'ticket_id', { body: like(number) })).length;
